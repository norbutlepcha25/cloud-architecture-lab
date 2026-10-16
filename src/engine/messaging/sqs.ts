import type { Node, Edge } from '@xyflow/react';
import type { ServiceNodeData } from '../../types/index.ts';
import { authorizeApplicationHop } from '../iam/applicationHop.ts';
import { evaluateInternetEgress } from '../network/subnetRouting.ts';
import { findContainingSubnetBoundary } from '../layout/containment.ts';

/**
 * Amazon SQS standard-queue behavior beyond SendMessage acceptance (services/operations.ts):
 * configuration limits, producer network path, and consumer polling with retries and redrive.
 * Spec: docs/behavior/sqs.md. Sources verified 2026-10-17:
 *  quotas      https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/quotas-messages.html
 *  DLQ         https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html
 *  Lambda ESM  https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html
 *  VPC access  https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-internetwork-traffic-privacy.html
 */

type N = Node<ServiceNodeData>;
type E = Edge<any>;

export const SQS_LIMITS = {
  maxMessageBytes: 1_048_576,
  retention: { min: 60, max: 1_209_600, default: 345_600 },
  visibility: { min: 0, max: 43_200, default: 30 },
  delay: { min: 0, max: 900, default: 0 }
} as const;
export const LAMBDA_DEFAULT_TIMEOUT_SECONDS = 3;
/** Simulator default when a dead-letter queue is connected but maxReceiveCount is not set
 *  (Lambda's documented recommendation is at least 5). */
export const DEFAULT_MAX_RECEIVE_COUNT = 5;
/** AWSLambdaSQSQueueExecutionRole data-plane actions needed by any polling consumer. */
export const CONSUMER_ACTIONS = ['sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes'];
const QUEUE_IDS = ['sqs', 'sqs_dlq'];
const CONSUMER_IDS = ['lambda', 'ec2', 'ecs', 'fargate'];

const cfg = (n: N | undefined) => (n?.data.customConfig ?? {}) as Record<string, any>;
const label = (n: N | undefined) => String(n?.data.label ?? n?.id);
const num = (value: unknown, fallback: number) => value === undefined || value === '' ? fallback : Number(value);

export interface QueueSettings {
  visibility: number; retention: number; delay: number; messageBytes: number;
  dlq?: N; maxReceiveCount?: number; fifo: boolean; kmsKey?: N; kmsKeyId?: string;
}

export function queueSettings(queue: N, nodes: N[], edges: E[]): QueueSettings {
  const c = cfg(queue);
  // Redrive target: explicit policy, else a queue → queue/DLQ relationship drawn on the canvas.
  const dlqId = c.redrivePolicy?.deadLetterTargetId ?? edges.filter(e => e.source === queue.id)
    .map(e => nodes.find(n => n.id === e.target)).find(n => n && QUEUE_IDS.includes(n.data.serviceId))?.id;
  const dlq = dlqId ? nodes.find(n => n.id === dlqId) : undefined;
  return {
    visibility: num(c.visibilityTimeoutSeconds, SQS_LIMITS.visibility.default),
    retention: num(c.messageRetentionSeconds, SQS_LIMITS.retention.default),
    delay: num(c.delaySeconds, SQS_LIMITS.delay.default),
    messageBytes: num(c.messageSizeBytes, 1024),
    dlq, maxReceiveCount: dlq ? num(c.redrivePolicy?.maxReceiveCount, DEFAULT_MAX_RECEIVE_COUNT) : undefined,
    fifo: c.queueType === 'fifo', kmsKeyId: c.kmsKeyId, kmsKey: c.kmsKeyId ? nodes.find(n => n.id === c.kmsKeyId && n.data.serviceId === 'kms') : undefined
  };
}

export interface QueueIssue { nodeId: string; label: string; problem: string; rule: string }

/** Settings AWS rejects. */
export function sqsConfigurationIssues(nodes: N[], edges: E[]): QueueIssue[] {
  const issues: QueueIssue[] = [];
  for (const queue of nodes.filter(n => QUEUE_IDS.includes(n.data.serviceId))) {
    const s = queueSettings(queue, nodes, edges);
    const add = (problem: string, rule: string) => issues.push({ nodeId: queue.id, label: label(queue), problem, rule });
    const range = (name: string, value: number, r: { min: number; max: number }) => {
      if (!Number.isInteger(value) || value < r.min || value > r.max) add(`${name} is ${value}.`, `${name} must be ${r.min}–${r.max} seconds.`);
    };
    range('Visibility timeout', s.visibility, SQS_LIMITS.visibility);
    range('Message retention', s.retention, SQS_LIMITS.retention);
    range('Delivery delay', s.delay, SQS_LIMITS.delay);
    if (cfg(queue).redrivePolicy?.deadLetterTargetId && !s.dlq) add('The redrive policy names a dead-letter queue that does not exist.', 'A dead-letter queue must be an existing queue.');
    if (s.dlq) {
      if (!QUEUE_IDS.includes(s.dlq.data.serviceId)) add(`${label(s.dlq)} is not a queue.`, 'A dead-letter queue must be an SQS queue.');
      if ((cfg(s.dlq).queueType === 'fifo') !== s.fifo) add(`${label(s.dlq)} is a ${s.fifo ? 'standard' : 'FIFO'} queue.`, 'A dead-letter queue must be the same type as its source queue.');
      if (cfg(s.dlq).region && cfg(queue).region && cfg(s.dlq).region !== cfg(queue).region) add(`${label(s.dlq)} is in ${cfg(s.dlq).region}.`, 'A dead-letter queue must be in the same account and Region as the source queue.');
      if (!Number.isInteger(s.maxReceiveCount) || (s.maxReceiveCount ?? 0) < 1) add(`maxReceiveCount is ${s.maxReceiveCount}.`, 'maxReceiveCount must be a positive integer.');
      if (s.dlq.id === queue.id) add('The queue is its own dead-letter queue.', 'A dead-letter queue must be a different queue.');
    }
  }
  return issues;
}

/** One trace line produced by SQS producer/consumer evaluation. */
export interface SqsStep { targetId: string; action: string; ok: boolean; explanation: string; awsRule?: string }

/** Producer-side checks before SendMessage is accepted. */
export function evaluateProducer(producer: N, queue: N, nodes: N[], edges: E[], options: { assumeRouteTables?: boolean }): SqsStep[] {
  const steps: SqsStep[] = [];
  const s = queueSettings(queue, nodes, edges);
  if (s.messageBytes > SQS_LIMITS.maxMessageBytes) {
    steps.push({ targetId: queue.id, action: 'SQS: message size', ok: false,
      explanation: `The message is ${s.messageBytes} bytes; SQS accepts at most 1,048,576 bytes (1 MiB). Larger payloads go to S3 with the SQS Extended Client Library.`,
      awsRule: 'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/quotas-messages.html' });
    return steps;
  }
  if (findContainingSubnetBoundary(producer, nodes)) {
    const egress = evaluateInternetEgress(producer, 'sqs', nodes, { assume: options.assumeRouteTables });
    if (egress.outcome !== 'legacy') {
      const ok = egress.outcome === 'allowed';
      steps.push({ targetId: queue.id, action: ok ? `SQS endpoint via ${egress.via}` : 'SQS endpoint: no route', ok, explanation: ok ? egress.reason
        : `${egress.reason} ${label(producer)} needs a NAT gateway route or an SQS interface VPC endpoint (SQS has no gateway endpoint).`,
        awsRule: 'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-internetwork-traffic-privacy.html' });
      if (!ok) return steps;
    }
  }
  return steps;
}

export interface ConsumerResult { steps: SqsStep[]; outcome: 'processed' | 'dead-lettered' | 'retrying' | 'not-polled' }

/** One consumer polling the queue for the message just sent. Deterministic retry/redrive. */
export function evaluateConsumer(consumer: N, queue: N, nodes: N[], edges: E[], options: { assumeRouteTables?: boolean }): ConsumerResult {
  const steps: SqsStep[] = [];
  const s = queueSettings(queue, nodes, edges);
  const name = label(consumer);
  if (consumer.data.serviceId === 'lambda') {
    const timeout = num(cfg(consumer).timeoutSeconds, LAMBDA_DEFAULT_TIMEOUT_SECONDS);
    if (timeout > s.visibility) {
      steps.push({ targetId: consumer.id, action: 'Lambda event source mapping', ok: false,
        explanation: `${name} timeout (${timeout}s) exceeds the queue visibility timeout (${s.visibility}s). Lambda rejects this event source mapping, so the queue is not polled.`,
        awsRule: 'https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html' });
      return { steps, outcome: 'not-polled' };
    }
    steps.push({ targetId: consumer.id, action: 'Lambda event source mapping', ok: true,
      explanation: `Lambda polls ${label(queue)} and invokes ${name} with batches.${s.visibility < timeout * 6 ? ` AWS recommends a visibility timeout of at least 6× the function timeout (${timeout * 6}s).` : ''}` });
  }
  const checks: [N, string][] = [...CONSUMER_ACTIONS.map(a => [queue, a] as [N, string]), ...(s.kmsKey ? [[s.kmsKey, 'kms:Decrypt'] as [N, string]] : [])];
  for (const [resource, action] of checks) {
    if (authorizeApplicationHop(consumer, resource, 'HTTPS', action).decision !== 'ALLOW') {
      steps.push({ targetId: queue.id, action: `${name}: ${action}`, ok: false,
        explanation: `${name}'s role does not allow ${action} on ${label(resource)}, so it cannot consume the message. Grant sqs:ReceiveMessage, sqs:DeleteMessage and sqs:GetQueueAttributes${s.kmsKey ? ' plus kms:Decrypt on the queue key' : ''}.`,
        awsRule: 'https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html' });
      return { steps, outcome: 'not-polled' };
    }
  }
  if (s.kmsKeyId && !s.kmsKey) steps.push({ targetId: queue.id, action: 'SSE-KMS key', ok: true, explanation: 'The queue uses a KMS key that is not on the canvas; kms:Decrypt was not evaluated.' });
  if (consumer.data.serviceId !== 'lambda' && findContainingSubnetBoundary(consumer, nodes)) {
    const egress = evaluateInternetEgress(consumer, 'sqs', nodes, { assume: options.assumeRouteTables });
    if (egress.outcome === 'denied' || egress.outcome === 'invalid') {
      steps.push({ targetId: queue.id, action: `${name}: ReceiveMessage network path`, ok: false, explanation: `${egress.reason} The consumer cannot reach the SQS endpoint.` });
      return { steps, outcome: 'not-polled' };
    }
  }
  const fails = consumer.data.health === 'failed' || cfg(consumer).processingResult === 'FAILED';
  const why = consumer.data.health === 'failed' ? `${name} is unavailable` : `${name} returns an error (simulated processing input)`;
  if (!fails) {
    steps.push({ targetId: consumer.id, action: `${name}: process and delete`, ok: true,
      explanation: `${name} received the message (receive count 1), processed it and deleted it with the receipt handle.` });
    return { steps, outcome: 'processed' };
  }
  if (s.dlq) {
    const max = s.maxReceiveCount ?? DEFAULT_MAX_RECEIVE_COUNT;
    steps.push({ targetId: consumer.id, action: `${name}: processing failed`, ok: false,
      explanation: `${why}. The message is not deleted and becomes visible again after ${s.visibility}s; it is received ${max} time(s) in total (${max * s.visibility}s of visibility timeouts).` });
    steps.push({ targetId: s.dlq.id, action: 'SQS redrive to dead-letter queue', ok: true,
      explanation: `Receive count exceeded maxReceiveCount (${max}), so SQS moved the message to ${label(s.dlq)}. Its original enqueue timestamp is kept, so the DLQ's retention should be longer than the source queue's.`,
      awsRule: 'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html' });
    return { steps, outcome: 'dead-lettered' };
  }
  steps.push({ targetId: consumer.id, action: `${name}: processing failed`, ok: false,
    explanation: `${why}. Without a dead-letter queue the message is received again every ${s.visibility}s until the retention period (${s.retention}s) expires and SQS deletes it.` });
  return { steps, outcome: 'retrying' };
}

/** Consumers drawn as queue → consumer relationships. */
export function queueConsumers(queue: N, nodes: N[], edges: E[]): N[] {
  return edges.filter(e => e.source === queue.id).map(e => nodes.find(n => n.id === e.target))
    .filter((n): n is N => Boolean(n) && CONSUMER_IDS.includes(n!.data.serviceId));
}
