import type { Node, Edge } from '@xyflow/react';
import { carriesRequest } from '../architecture/relationships.ts';
export const OPERATION_SERVICES = ['sqs', 'sns', 'cloudwatch', 'cloudtrail'];
export interface Message { id: string; body: string; visibleAt: number; receives: number; receipt?: string; sentAt?: number }
export interface Runtime { now: number; sequence: number; messages: Message[]; records: Record<string, unknown>[]; alarm: 'OK' | 'ALARM' | 'INSUFFICIENT_DATA'; trace: string[] }
export type Operation = 'send' | 'receive' | 'delete' | 'advance' | 'publish' | 'metric' | 'audit';
export interface Input { body?: string; value?: number; seconds?: number; receipt?: string; action?: string; category?: 'management' | 'data'; attributes?: Record<string, string> }
export function initialRuntime(): Runtime { return { now: 0, sequence: 0, messages: [], records: [], alarm: 'INSUFFICIENT_DATA', trace: [] }; }
/** Pure bounded educational operation. Clock advancement is explicit; no wall-clock/random behavior. */
export function operate(nodes: Node<any>[], edges: Edge<any>[], nodeId: string, operation: Operation, input: Input = {}) {
  const updated = structuredClone(nodes);
  const node = updated.find(n => n.id === nodeId);
  if (!node || !OPERATION_SERVICES.includes(node.data.serviceId)) throw new Error('Select a supported service.');
  if (node.data.health === 'failed') throw new Error(`${node.data.label} is unavailable.`);
  const config = node.data.customConfig ??= {};
  const state = config.serviceRuntime ??= initialRuntime() as Runtime;
  const trace: string[] = [];
  const note = (text: string) => trace.push(text);
  const outgoing = (id: string) => edges.filter(e => e.source === id && carriesRequest(e.data));
  const enqueue = (queue: Node<any>, body: string) => {
    const cfg = queue.data.customConfig ??= {};
    if (cfg.queueType === 'fifo') throw new Error('FIFO ordering/deduplication is not supported yet; use a standard queue.');
    const runtime: Runtime = cfg.serviceRuntime ??= initialRuntime();
    // DelaySeconds hides a new message until the delay passes (0–900 s).
    const delay = Number(cfg.delaySeconds ?? 0);
    runtime.messages.push({ id: `${queue.id}-${++runtime.sequence}`, body, visibleAt: runtime.now + (Number.isFinite(delay) ? delay : 0), receives: 0, sentAt: runtime.now });
  };
  const publish = (topic: Node<any>, body: string) => {
    if (topic.data.health === 'failed') { note(`SNS ${topic.data.label}: delivery unavailable.`); return; }
    note(`SNS ${topic.data.label}: publish accepted; subscriber delivery is separate from publisher success.`);
    for (const edge of outgoing(topic.id)) {
      const target = updated.find(n => n.id === edge.target);
      if (!target) continue;
      const filter = edge.data?.filterPolicy;
      if (filter && (!Object.values(filter).every(v => Array.isArray(v) && v.every(x => typeof x === 'string')))) {
        note(`${target.data.label}: unsupported filter operator; delivery not simulated.`); continue;
      }
      if (filter && !Object.entries(filter).every(([key, values]) => (values as string[]).includes(input.attributes?.[key] ?? ''))) {
        note(`${target.data.label}: filtered out by subscription attributes.`); continue;
      }
      if (target.data.serviceId !== 'sqs') { note(`${target.data.label}: subscription protocol not supported (SQS only).`); continue; }
      if (target.data.health === 'failed') { note(`${target.data.label}: delivery failed; retry scheduling not modeled.`); continue; }
      // Explicit educational allow-list represents the queue resource-policy requirement, not a complete IAM evaluator.
      if (!target.data.customConfig?.allowedTopicIds?.includes(topic.id)) { note(`${target.data.label}: queue policy does not allow topic ${topic.id}.`); continue; }
      if (target.data.customConfig?.queueType === 'fifo') { note(`${target.data.label}: FIFO delivery unsupported.`); continue; }
      enqueue(target, body); note(`${target.data.label}: one message enqueued.`);
    }
  };
  if (node.data.serviceId === 'sqs') {
    if (config.queueType === 'fifo') throw new Error('FIFO behavior is not supported yet.');
    if (operation === 'send') { enqueue(node, input.body ?? 'Simulated message'); note('SendMessage accepted. Consumer processing has not occurred. Standard queues permit duplicate delivery.'); }
    else if (operation === 'receive') {
      const timeout = Number(config.visibilityTimeoutSeconds ?? 30);
      if (!Number.isFinite(timeout) || timeout < 0 || timeout > 43200) throw new Error('Visibility timeout must be 0–43200 seconds.');
      const message = state.messages.find((m: Message) => m.visibleAt <= state.now);
      if (!message) note('ReceiveMessage returned no visible message.');
      else { message.receives++; message.receipt = `${message.id}:receipt:${message.receives}`; message.visibleAt = state.now + timeout; note(`Received ${message.id}; receipt ${message.receipt}; hidden until ${message.visibleAt}s. Receive does not delete.`); }
    } else if (operation === 'delete') {
      const index = state.messages.findIndex((m: Message) => !!input.receipt && m.receipt === input.receipt);
      if (index < 0) throw new Error('Provide the receipt handle from the most recent receive.');
      state.messages.splice(index, 1); note('DeleteMessage acknowledged using the receipt handle.');
    } else if (operation === 'advance') {
      const seconds = input.seconds ?? 30;
      if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Clock advance must be a nonnegative number.');
      state.now += seconds; note(`Simulation clock: ${state.now}s. Undeleted messages reappear after visibility timeout.`);
      // Messages older than the retention period are deleted by SQS (60 s – 14 days, default 4 days).
      const retention = Number(config.messageRetentionSeconds ?? 345600);
      const before = state.messages.length;
      state.messages = state.messages.filter((m: Message) => state.now - (m.sentAt ?? 0) < retention);
      if (state.messages.length < before) note(`${before - state.messages.length} message(s) expired after the ${retention}s retention period.`);
    } else throw new Error('Unsupported SQS operation.');
  } else if (node.data.serviceId === 'sns') {
    if (operation !== 'publish') throw new Error('Use Publish for SNS.');
    publish(node, input.body ?? 'Simulated notification');
  } else if (node.data.serviceId === 'cloudwatch') {
    if (operation !== 'metric') throw new Error('Use metric evaluation for CloudWatch.');
    const threshold = Number(config.threshold ?? 80);
    if (!Number.isFinite(threshold) || (input.value !== undefined && !Number.isFinite(input.value))) throw new Error('Metric and threshold must be finite numbers.');
    const old = state.alarm;
    const missing = config.treatMissingData ?? 'missing';
    if (!['missing', 'ignore', 'breaching', 'notBreaching'].includes(missing)) throw new Error('Invalid missing-data treatment.');
    state.alarm = input.value === undefined ? missing === 'ignore' ? old : missing === 'breaching' ? 'ALARM' : missing === 'notBreaching' ? 'OK' : 'INSUFFICIENT_DATA' : input.value >= threshold ? 'ALARM' : 'OK';
    state.records.push({ metric: config.metricName ?? 'CustomMetric', value: input.value ?? null, state: state.alarm });
    note(`Single-period alarm: ${old} → ${state.alarm}; threshold >= ${threshold}.`);
    if (old !== 'ALARM' && state.alarm === 'ALARM') {
      for (const edge of outgoing(node.id)) {
        const topic = updated.find(n => n.id === edge.target && n.data.serviceId === 'sns');
        if (topic) publish(topic, `ALARM: ${node.data.label}`);
      }
    }
  } else {
    if (operation !== 'audit') throw new Error('Use audit event for CloudTrail.');
    const category = input.category ?? 'management';
    if (config.loggingEnabled === false || (category === 'data' && config.includeDataEvents !== true)) note('Event excluded by trail logging selectors.');
    else { state.records.push({ eventName: input.action ?? 'DescribeInstances', eventCategory: category, source: node.id }); note(`CloudTrail recorded ${category} event. This is an API audit record, not application logs.`); }
  }
  // Connected trails observe this API operation, never forward the application request.
  if (['sqs', 'sns'].includes(node.data.serviceId) && operation !== 'advance') {
    for (const edge of outgoing(node.id)) {
      const trail = updated.find(n => n.id === edge.target && n.data.serviceId === 'cloudtrail');
      if (!trail) continue;
      const cfg = trail.data.customConfig ??= {};
      const category = 'data';
      if (trail.data.health === 'failed' || cfg.loggingEnabled === false || (category === 'data' && !cfg.includeDataEvents)) { note(`${trail.data.label}: audit excluded or logging unavailable.`); continue; }
      const rt: Runtime = cfg.serviceRuntime ??= initialRuntime();
      rt.records.push({ eventName: operation, eventCategory: category, source: node.id });
      note(`${trail.data.label}: API audit recorded.`);
    }
  }
  state.trace = trace;
  return { nodes: updated, trace };
}
