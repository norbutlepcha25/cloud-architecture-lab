import { checkConnection } from '../../architecture/connectionContracts.ts';
import { resolveServiceModel } from '../../service/registry.ts';
import type { AdapterContext, AdapterSignal } from './types.ts';
import { CONTINUE, TERMINATE, SimulationTrace } from './types.ts';

/** Bounded synchronous DynamoDB calls. Other dependency annotations do not execute.
 * The child owns its verdict; required/optional application handling owns the parent verdict.
 * Logical return evidence does not claim packet-level return-path conformance.
 */
export const dependencyCallsAdapter = (ctx: AdapterContext): AdapterSignal => {
  const { node, nodes, dependencyEdges, trace } = ctx;
  if (!['ecs', 'ec2', 'lambda', 'fargate'].includes(node.data.serviceId)) return CONTINUE;

  for (const edge of dependencyEdges) {
    const target = nodes.find(candidate => candidate.id === edge.target);
    if (target && target.data.serviceId !== 'dynamodb') continue;
    const required = edge.data?.dependencyRequired !== false;
    const callId = `${ctx.scenario.id}:${node.id}:${edge.id}:${trace.steps.length}`;
    const child = new SimulationTrace();
    const protocol = edge.data?.protocol ?? 'HTTPS';
    const targetLabel = target?.data.label ?? edge.target;
    const action = edge.data?.action ?? 'dynamodb:GetItem';
    const fields = { sourceNodeId: node.id, targetNodeId: edge.target,
      sourceNodeName: node.data.label, targetNodeName: targetLabel, protocol,
      targetHealth: target?.data.health ?? 'failed' as const };
    child.pushStep({ ...fields, action: `Call ${action}`, status: 'processing', latencyMs: 0,
      explanation: `${node.data.label} starts a ${required ? 'required' : 'optional'} application dependency call.`,
      details: { phase: 'call' } });
    const contract = checkConnection(node, target, edge.data);
    if (!target || contract.status !== 'valid') {
      child.fail(contract.status === 'unknown' ? 501 : 400, target ? contract.reason : `Dependency target ${edge.target} is missing.`);
    } else if (target.data.health === 'failed') {
      child.fail(503, `Dependency ${targetLabel} is unavailable.`);
    } else if (!ctx.pushFirewallBlockIfAny(node, target, protocol, child, edge)) {
      const model = resolveServiceModel(target.data.serviceId)!;
      const issues = model.validateConfiguration(target.data);
      if (issues.length) child.fail(400, issues.map(issue => issue.message).join(' '));
      else {
        const result = model.processRequest({ target: target.data, caller: node.data, action });
        if (result.status === 'failure') child.fail(result.statusCode, result.reason);
        else child.succeed(200, `${targetLabel} completed the modeled ${action} availability/authorization check. Item data, keys and persistence are not simulated.`);
      }
    }
    // A fixed teaching latency is not an AWS timing prediction. Preserve a configured timeout
    // only for unavailable dependencies; never let malformed values corrupt simulated time.
    const timeout = edge.data?.timeoutMs;
    const latency = child.finalStatusCode === 503
      ? typeof timeout === 'number' && Number.isFinite(timeout) && timeout >= 0 ? timeout : 1500
      : child.overallSuccess ? 12 : 0;
    if (!child.overallSuccess && !child.steps.some(step => step.status === 'failed' && step.targetNodeId === edge.target)) {
      child.pushStep({ ...fields, action: 'Dependency operation failed', status: 'failed',
        latencyMs: 0, explanation: child.finalSummary,
        details: { statusCode: child.finalStatusCode, failureReason: child.finalSummary } });
    }
    child.advanceTime(latency);
    child.pushStep({ ...fields, sourceNodeId: edge.target, targetNodeId: node.id,
      sourceNodeName: targetLabel, targetNodeName: node.data.label,
      action: child.overallSuccess ? 'Dependency application response' : 'Dependency call failed',
      status: child.overallSuccess ? 'success' : 'failed', latencyMs: latency,
      explanation: `${child.finalSummary} ${child.overallSuccess ? 'Application control returns to the caller.' : required ? 'The required call stops the parent operation.' : 'The application handles this optional failure and continues.'} Reverse packet evaluation is outside this child-call coverage.`,
      details: { phase: 'response', statusCode: child.finalStatusCode,
        returnsToNodeId: node.id, returnPathEvaluated: false } });

    const offset = trace.currentTimestamp;
    for (const step of child.steps) {
      const { id: _id, stepNumber: _number, ...evidence } = step;
      trace.pushStep({ ...evidence, timestampMs: offset + step.timestampMs,
        status: !required && step.status === 'failed' ? 'bypassed' : step.status,
        details: { ...step.details, dependencyCall: true, callId, parentCallId: ctx.scenario.id } });
    }
    trace.advanceTime(child.currentTimestamp);
    if (!child.overallSuccess && required) {
      trace.fail(child.finalStatusCode, child.finalSummary);
      return TERMINATE;
    }
  }
  return CONTINUE;
};
