import { runConformanceCases, type ConformanceCase } from '../harness.ts';
import type { Node, Edge } from '@xyflow/react';
import { runLiveSimulation } from '../../../src/engine/simulation/liveSimulation.ts';
import { sqsConfigurationIssues, CONSUMER_ACTIONS } from '../../../src/engine/messaging/sqs.ts';
import { operate } from '../../../src/engine/services/operations.ts';
import { buildRole } from '../../../src/engine/iam/roleBuilder.ts';
import { checkConnection } from '../../../src/engine/architecture/connectionContracts.ts';

// Sources (verified 2026-10-17):
//  quotas      https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/quotas-messages.html
//  DLQ         https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html
//  Lambda ESM  https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html
//  VPC access  https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-internetwork-traffic-privacy.html

interface Result { outcome: string }

const svc = (id: string, serviceId: string, x = 2000, y = 0, extra: Record<string, unknown> = {}): Node<any> =>
  ({ id, type: 'serviceNode', position: { x, y }, width: 100, height: 90, data: { serviceId, label: id, health: 'healthy', subnet: 'global', ...extra } } as any);
const box = (id: string, boundaryType: string, x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}): Node<any> =>
  ({ id, type: 'boundaryNode', position: { x, y }, width: w, height: h, data: { boundaryType, label: id, ...extra } } as any);
const edge = (source: string, target: string, protocol = 'Message'): Edge<any> =>
  ({ id: `${source}-${target}`, source, target, data: { protocol, interactionType: 'asynchronous', isCriticalDependency: true, timeoutMs: 1000 } });

/** Producer Lambda (outside a VPC) -> queue -> consumer Lambda. */
function flow(o: { queue?: Record<string, unknown>; consumer?: Record<string, unknown>; consumerRole?: string[] | null; dlq?: boolean } = {}) {
  const queue = svc('queue', 'sqs', 300, 0, { customConfig: { visibilityTimeoutSeconds: 60, ...(o.queue ?? {}) } });
  const producer = svc('api', 'lambda', 0, 0);
  producer.data.iamRole = buildRole('lambda', 'ApiRole', [{ target: queue, actions: ['sqs:SendMessage'] }]);
  const consumer = svc('worker', 'lambda', 600, 0, { customConfig: { timeoutSeconds: 10, ...(o.consumer ?? {}) } });
  if (o.consumerRole !== null) consumer.data.iamRole = buildRole('lambda', 'WorkerRole', [{ target: queue, actions: o.consumerRole ?? CONSUMER_ACTIONS }]);
  const nodes = [producer, queue, consumer, ...(o.dlq ? [svc('dlq', 'sqs_dlq', 300, 300)] : [])];
  const edges = [edge('api', 'queue', 'HTTPS'), edge('queue', 'worker'), ...(o.dlq ? [edge('queue', 'dlq')] : [])];
  return { nodes, edges };
}
const run = ({ nodes, edges }: { nodes: Node<any>[]; edges: Edge<any>[] }, start = 'api', extra: Record<string, unknown> = {}) => {
  const r: any = runLiveSimulation(nodes as any, edges as any, { id: 's', name: 's', method: 'POST', path: '/orders', trafficLevel: 'normal', startNodeId: start, ...extra } as any);
  return { outcome: `${r.outcome}:${r.statusCode}`, summary: r.summary as string, steps: r.steps as any[] };
};
const consumerOutcome = (r: ReturnType<typeof run>) => (r.summary.match(/Consumers: (.*)\./)?.[1] ?? 'none');

/** Private producer in a VPC with no NAT; optional SQS interface endpoint or NAT path. */
function vpcFlow(path: 'none' | 'endpoint' | 'nat') {
  const queue = svc('queue', 'sqs', 3000, 0);
  const app = svc('app', 'ec2', 800, 150, { subnet: 'private' });
  app.data.iamRole = buildRole('ec2', 'AppRole', [{ target: queue, actions: ['sqs:SendMessage'] }]);
  const nodes: Node<any>[] = [
    box('vpc', 'vpc', 0, 0, 1200, 600, { cidr: '10.0.0.0/16' }),
    box('pub', 'public_subnet', 20, 50, 500, 400, { cidr: '10.0.1.0/24' }),
    box('priv', 'private_subnet', 620, 50, 500, 400, { cidr: '10.0.2.0/24' }),
    svc('igw', 'internet_gateway', 560, 520), app, queue,
    ...(path === 'endpoint' ? [svc('sqs-ep', 'privatelink', 900, 300, { customConfig: { endpointService: 'sqs' } })] : []),
    ...(path === 'nat' ? [svc('nat', 'nat_gateway', 100, 150, { subnet: 'public' })] : [])
  ];
  return { nodes, edges: [edge('app', 'queue', 'HTTPS')] };
}

const CASES: ConformanceCase<Result>[] = [
  { id: 'SQS-SEND-001', awsBehavior: 'SendMessage returns once the message is stored; the producer is decoupled from consumer processing.',
    reference: 'SQS Developer Guide - how SQS works', scenario: 'Lambda producer -> queue -> Lambda consumer (processes)',
    configuration: {}, request: { action: 'sqs:SendMessage' }, expected: { outcome: 'success:202 / worker: processed' },
    run: () => { const r = run(flow()); return { outcome: `${r.outcome} / ${consumerOutcome(r)}` }; }, explain: a => a.outcome },
  { id: 'SQS-SIZE-001', awsBehavior: 'Maximum message size is 1,048,576 bytes (1 MiB).',
    reference: 'SQS message quotas', scenario: 'Message of 1,048,577 bytes', configuration: { messageSizeBytes: 1048577 }, request: {},
    expected: { outcome: 'failure:400' }, run: () => ({ outcome: run(flow({ queue: { messageSizeBytes: 1_048_577 } })).outcome }), explain: a => a.outcome },
  { id: 'SQS-CONFIG-001', awsBehavior: 'Visibility timeout 0-43,200 s, retention 60-1,209,600 s, delay 0-900 s; a DLQ must be the same queue type.',
    reference: 'SQS message quotas; dead-letter queues', scenario: 'Out-of-range attributes and a FIFO DLQ for a standard queue',
    configuration: {}, request: {}, expected: { outcome: '4' },
    run: () => {
      const q = svc('q', 'sqs', 0, 0, { customConfig: { visibilityTimeoutSeconds: 50000, messageRetentionSeconds: 30, delaySeconds: 901, redrivePolicy: { deadLetterTargetId: 'd', maxReceiveCount: 3 } } });
      const d = svc('d', 'sqs', 0, 0, { customConfig: { queueType: 'fifo' } });
      return { outcome: String(sqsConfigurationIssues([q, d] as any, []).filter(i => i.nodeId === 'q').length) };
    }, explain: a => a.outcome },
  { id: 'SQS-VPC-001', awsBehavior: 'A VPC resource reaches SQS through an SQS interface VPC endpoint or a NAT gateway; SQS has no gateway endpoint.',
    reference: 'SQS internetwork traffic privacy', scenario: 'Private EC2 producer with no path, with an interface endpoint, with NAT',
    configuration: {}, request: { action: 'sqs:SendMessage' }, expected: { outcome: 'failure:504|success:202|success:202' },
    run: () => ({ outcome: [run(vpcFlow('none'), 'app').outcome, run(vpcFlow('endpoint'), 'app').outcome, run(vpcFlow('nat'), 'app').outcome].join('|') }),
    explain: a => a.outcome },
  { id: 'SQS-ESM-001', awsBehavior: "Lambda rejects an SQS event source mapping when the function timeout exceeds the queue's visibility timeout.",
    reference: 'Lambda: creating and configuring an SQS event source mapping', scenario: 'Function timeout 120 s, visibility 60 s',
    configuration: {}, request: {}, expected: { outcome: 'success:202 / worker: not polling' },
    run: () => { const r = run(flow({ consumer: { timeoutSeconds: 120 } })); return { outcome: `${r.outcome} / ${consumerOutcome(r)}` }; }, explain: a => a.outcome },
  { id: 'SQS-ESM-002', awsBehavior: 'The consumer execution role needs sqs:ReceiveMessage, sqs:DeleteMessage and sqs:GetQueueAttributes.',
    reference: 'Lambda: AWSLambdaSQSQueueExecutionRole', scenario: 'Consumer role missing DeleteMessage',
    configuration: {}, request: {}, expected: { outcome: 'success:202 / worker: not polling' },
    run: () => { const r = run(flow({ consumerRole: ['sqs:ReceiveMessage', 'sqs:GetQueueAttributes'] })); return { outcome: `${r.outcome} / ${consumerOutcome(r)}` }; }, explain: a => a.outcome },
  { id: 'SQS-DLQ-001', awsBehavior: 'A message received more than maxReceiveCount times without being deleted moves to the dead-letter queue; without one it is retried until retention expires.',
    reference: 'SQS dead-letter queues; Lambda SQS error handling', scenario: 'Consumer returns an error, with and without a DLQ',
    configuration: {}, request: {}, expected: { outcome: 'worker: moved to the dead-letter queue|worker: failing and retrying' },
    run: () => ({ outcome: [consumerOutcome(run(flow({ consumer: { processingResult: 'FAILED' }, dlq: true }))), consumerOutcome(run(flow({ consumer: { processingResult: 'FAILED' } })))].join('|') }),
    explain: a => a.outcome },
  { id: 'SQS-DELAY-001', awsBehavior: 'DelaySeconds keeps a new message invisible until the delay passes; messages older than the retention period are deleted.',
    reference: 'SQS message quotas (message timer, retention)', scenario: 'Delay 60 s: receive at 0 s, 30 s, 60 s; then retention 60 s expires the message',
    configuration: { delaySeconds: 60 }, request: {}, expected: { outcome: 'empty,empty,received,expired' },
    run: () => {
      let nodes: any[] = [svc('q', 'sqs', 0, 0, { customConfig: { delaySeconds: 60, messageRetentionSeconds: 90 } })];
      const step = (op: any) => { const r = operate(nodes, [], 'q', op); nodes = r.nodes; return r.trace.join(' '); };
      step('send');
      const a = /no visible/.test(step('receive')) ? 'empty' : 'received';
      step('advance');
      const b = /no visible/.test(step('receive')) ? 'empty' : 'received';
      step('advance');
      const c = /no visible/.test(step('receive')) ? 'empty' : 'received';
      const d = /expired/.test(step('advance')) ? 'expired' : 'kept';
      return { outcome: [a, b, c, d].join(',') };
    }, explain: a => a.outcome },
  { id: 'SQS-CONNECT-001', awsBehavior: 'Queues connect to producers, polling consumers and a dead-letter queue.',
    reference: 'docs/behavior/sqs.md', scenario: 'Contract checks', configuration: {}, request: {},
    expected: { outcome: 'valid,valid,valid,valid' },
    run: () => {
      const n = (s: string) => svc(s, s);
      return { outcome: [checkConnection(n('ec2'), n('sqs'), { protocol: 'HTTPS' } as any).status, checkConnection(n('sqs'), n('lambda'), { protocol: 'Message' } as any).status,
        checkConnection(n('sqs'), n('ecs'), { protocol: 'Message' } as any).status, checkConnection(n('sqs'), n('sqs_dlq'), { protocol: 'Message' } as any).status].join(',') };
    }, explain: a => a.outcome }
];

runConformanceCases(CASES);
