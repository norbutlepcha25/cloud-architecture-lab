import { operate, OPERATION_SERVICES, type Operation } from '../../services/operations.ts';
import { CONTINUE, TERMINATE, type Adapter } from './types.ts';
import { evaluateConsumer, evaluateProducer, queueConsumers, type SqsStep } from '../../messaging/sqs.ts';
export const managedServicesAdapter: Adapter = ctx => {
  const self = OPERATION_SERVICES.includes(ctx.node.data.serviceId);
  const target = self ? ctx.node : ctx.downstreamNodes.find(n => OPERATION_SERVICES.includes(n.data.serviceId));
  if (!target || (!self && ctx.orderedConnections && target.id !== ctx.downstreamNodes[0]?.id)) return CONTINUE;
  const isQueue = target.data.serviceId === 'sqs';
  const record = (step: SqsStep) => ctx.trace.pushStep({ sourceNodeId: ctx.node.id, targetNodeId: step.targetId,
    sourceNodeName: ctx.node.data.label, targetNodeName: ctx.nodes.find(n => n.id === step.targetId)?.data.label ?? target.data.label,
    protocol: 'Message', action: step.action, status: step.ok ? 'success' : 'failed', explanation: step.explanation,
    targetHealth: target.data.health, latencyMs: 0,
    details: step.awsRule ? { decision: { order: 1, component: 'Service', resource: target.data.label, operation: step.action, input: {},
      decision: step.ok ? 'ALLOW' : 'DENY', reason: step.explanation, simpleExplanation: step.explanation, awsRule: step.awsRule, metadata: {} } } : undefined });
  // SQS producer: network path to the regional endpoint and message limits (engine/messaging/sqs.ts).
  if (isQueue && !self) {
    const steps = evaluateProducer(ctx.node, target, ctx.nodes, ctx.allEdges, ctx.scenario);
    steps.forEach(record);
    const failed = steps.find(step => !step.ok);
    if (failed) { ctx.trace.fail(failed.action === 'SQS: message size' ? 400 : 504, failed.explanation); return TERMINATE; }
  }
  if (!self && ctx.pushFirewallBlockIfAny(ctx.node, target, 'HTTPS')) return TERMINATE;
  const operations: Record<string, Operation> = { sqs: 'send', sns: 'publish', cloudwatch: 'metric', cloudtrail: 'audit' };
  try {
    const result = operate(ctx.nodes, ctx.allEdges, target.id, operations[target.data.serviceId], {
      body: ctx.scenario.path, value: target.data.customConfig?.metricValue === '' ? undefined : target.data.customConfig?.metricValue,
      action: target.data.customConfig?.eventName, category: target.data.customConfig?.eventCategory
    });
    for (const text of result.trace) ctx.trace.pushStep({ sourceNodeId: ctx.node.id, targetNodeId: target.id,
      sourceNodeName: ctx.node.data.label, targetNodeName: target.data.label, protocol: 'Message',
      action: `${target.data.serviceId}: ${operations[target.data.serviceId]}`, status: 'success', explanation: text,
      targetHealth: target.data.health, latencyMs: 0 });
    for (const n of result.nodes) if (n.data.customConfig?.serviceRuntime) ctx.trace.serviceStates[n.id] = n.data.customConfig.serviceRuntime;
    // Consumers poll asynchronously; their outcome never changes the producer's 202.
    const consumerNotes: string[] = [];
    if (isQueue) for (const consumer of queueConsumers(target, ctx.nodes, ctx.allEdges)) {
      const result = evaluateConsumer(consumer, target, ctx.nodes, ctx.allEdges, ctx.scenario);
      result.steps.forEach(record);
      consumerNotes.push(`${consumer.data.label}: ${result.outcome === 'processed' ? 'processed' : result.outcome === 'dead-lettered' ? 'moved to the dead-letter queue' : result.outcome === 'retrying' ? 'failing and retrying' : 'not polling'}`);
    }
    ctx.trace.succeed(isQueue ? 202 : 200, `${target.data.label}: operation accepted.${consumerNotes.length ? ` Consumers: ${consumerNotes.join('; ')}.` : ' See trace for delivery, alarm or audit outcomes.'}`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Operation failed.';
    ctx.trace.pushStep({ sourceNodeId: ctx.node.id, targetNodeId: target.id, sourceNodeName: ctx.node.data.label,
      targetNodeName: target.data.label, protocol: 'Message', action: 'Managed service operation', status: 'failed',
      explanation: reason, targetHealth: target.data.health, latencyMs: 0 });
    ctx.trace.fail(400, reason);
  }
  return TERMINATE;
};
