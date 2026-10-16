import test from 'node:test';
import assert from 'node:assert/strict';
import type { Node, Edge } from '@xyflow/react';
import { sqsWalkthrough, pipelineWalkthrough, codeDeployWalkthrough, networkPathWalkthrough } from '../src/engine/explain/walkthrough.ts';
import { buildRole } from '../src/engine/iam/roleBuilder.ts';
import { CONSUMER_ACTIONS } from '../src/engine/messaging/sqs.ts';
import { REFERENCE_ARCHITECTURES } from '../src/data/referenceArchitectures.ts';

// Walkthroughs explain engine decisions step by step; they must follow the documented AWS
// sequence and never modify the architecture.
const svc = (id: string, serviceId: string, extra: Record<string, unknown> = {}): Node<any> =>
  ({ id, type: 'serviceNode', position: { x: 0, y: 0 }, data: { serviceId, label: id, health: 'healthy', subnet: 'global', ...extra } });
const edge = (source: string, target: string): Edge<any> => ({ id: `${source}-${target}`, source, target, data: { protocol: 'Message' } });
const scenario = { id: 's', name: 's', method: 'GET' as const, path: '/', trafficLevel: 'normal' as const, startNodeId: '' };

function queueDiagram(dlq: boolean) {
  const queue = svc('queue', 'sqs', { customConfig: { visibilityTimeoutSeconds: 30, ...(dlq ? { redrivePolicy: { deadLetterTargetId: 'dlq', maxReceiveCount: 3 } } : {}) } });
  const worker = svc('worker', 'lambda', { customConfig: { timeoutSeconds: 5 } });
  worker.data.iamRole = buildRole('lambda', 'W', [{ target: queue, actions: CONSUMER_ACTIONS }]);
  return { nodes: [svc('api', 'lambda'), queue, worker, ...(dlq ? [svc('dlq', 'sqs_dlq')] : [])], edges: [edge('api', 'queue'), edge('queue', 'worker')] };
}

test('WALK-SQS-001: a failing message is received maxReceiveCount times, each after the visibility timeout, then moved to the DLQ', () => {
  const d = queueDiagram(true);
  const before = JSON.stringify(d.nodes);
  const w = sqsWalkthrough(d.nodes[1] as any, d.nodes as any, d.edges, { consumerFails: true });
  assert.equal(w.frames.filter(f => f.title.startsWith('ReceiveMessage')).length, 3);
  assert.deepEqual(w.frames.filter(f => f.title === 'Visible again').map(f => f.clock), ['t = 30s', 't = 60s', 't = 90s']);
  assert.equal(w.frames.at(-1)!.lane, 'dlq');
  assert.equal(JSON.stringify(d.nodes), before, 'what-if must not modify the diagram');
  const ok = sqsWalkthrough(d.nodes[1] as any, d.nodes as any, d.edges);
  assert.deepEqual(ok.frames.slice(-2).map(f => f.title), ['Processed', 'DeleteMessage']);
  const noDlq = queueDiagram(false);
  assert.match(sqsWalkthrough(noDlq.nodes[1] as any, noDlq.nodes as any, noDlq.edges, { consumerFails: true }).frames.at(-1)!.title, /retention/);
});

test('WALK-SQS-002: a rejected event source mapping is explained instead of a receive', () => {
  const d = queueDiagram(true);
  d.nodes[2].data.customConfig.timeoutSeconds = 60;
  const w = sqsWalkthrough(d.nodes[1] as any, d.nodes as any, d.edges);
  assert.ok(w.frames.some(f => f.status === 'fail' && /rejects this event source mapping/.test(f.detail)));
  assert.ok(!w.frames.some(f => f.title.startsWith('ReceiveMessage')));
});

test('WALK-CICD-001: the pipeline walkthrough mirrors the execution, and a failed build leaves Deploy not run', () => {
  const ref: any = REFERENCE_ARCHITECTURES.find(r => r.id === 'cicd-codepipeline-ec2');
  const pipeline = ref.nodes.find((n: any) => n.id === 'node-pipeline');
  const ok = pipelineWalkthrough(pipeline, ref.nodes, ref.edges, scenario);
  assert.deepEqual(ok.lanes.map(l => l.id), ['Pipeline', 'Source', 'Build', 'Deploy']);
  assert.ok(ok.frames.every(f => f.status !== 'fail'));
  const failed = pipelineWalkthrough(pipeline, ref.nodes, ref.edges, scenario, { buildFails: true });
  assert.ok(failed.frames.some(f => f.lane === 'Build' && f.status === 'fail'));
  assert.ok(failed.frames.some(f => f.lane === 'Deploy' && /Not run/.test(f.detail)));
});

test('WALK-CD-001: deployment batches follow the configuration; OneAtATime stops at the first failure', () => {
  const ref: any = REFERENCE_ARCHITECTURES.find(r => r.id === 'cicd-codepipeline-ec2');
  const deploy = ref.nodes.find((n: any) => n.id === 'node-deploy');
  const all = codeDeployWalkthrough(deploy, ref.nodes, ref.edges, { config: 'CodeDeployDefault.AllAtOnce' });
  assert.equal(all.frames.filter(f => /Batch 1 of 1/.test(f.detail)).length, 2);
  const one = codeDeployWalkthrough(deploy, ref.nodes, ref.edges, { failInstanceId: 'node-web-1' });
  assert.equal(one.frames.at(-1)!.title, 'Deployment failed');
  assert.ok(!one.frames.some(f => f.lane === 'node-web-2'), 'OneAtATime never reaches the second instance');
  const ecs = codeDeployWalkthrough(svc('d', 'codedeploy', { customConfig: { deploymentConfig: 'CodeDeployDefault.ECSCanary10Percent5Minutes' } }), [svc('d', 'codedeploy'), svc('svc', 'ecs')] as any, [edge('d', 'svc')]);
  assert.deepEqual(ecs.frames.map(f => f.title).slice(1, 3), ['Shift 10% of traffic', 'Shift remaining 90%']);
});

test('WALK-NET-001: internet paths come from the route engine (NAT for private subnets; strict mode has no route)', () => {
  const ref: any = REFERENCE_ARCHITECTURES.find(r => r.id === 'cicd-codepipeline-ec2');
  const assumed = networkPathWalkthrough(ref.nodes);
  assert.ok(assumed.frames.some(f => f.lane === 'nat' && /SNAT/.test(f.title)));
  const strict = networkPathWalkthrough(ref.nodes, { assumeRouteTables: false });
  assert.ok(strict.frames.some(f => f.lane === 'table' && f.status === 'fail'));
});
