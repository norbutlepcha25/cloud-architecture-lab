import type { Node, Edge } from '@xyflow/react';
import type { ServiceNodeData, ConnectionData, SimulationScenario, SimulationResult } from '../../types/index.ts';
import type { Policy } from '../iam/types.ts';
import { carriesRequest } from '../architecture/relationships.ts';
import { deriveSubnetForNode, findContainingSubnetBoundary, findContainingVpc } from '../layout/containment.ts';
import { evaluateInternetEgress, routingOptions } from '../network/subnetRouting.ts';
import { evaluateApplicationHop } from '../simulation/applicationHop.ts';
import { authorizeApplicationHop } from '../iam/applicationHop.ts';
import { evaluateAuthorization } from '../iam/evaluate.ts';
import { initialRuntime } from '../services/operations.ts';
import { SimulationTrace } from '../simulation/adapters/types.ts';
import { SERVICE_OPERATIONS, OPERATION_CALLERS } from './definitions.ts';
import { OPERATION_HANDLERS } from './handlers.ts';
import { parseObject, OperationError, type OperationSettings } from './types.ts';

export function operationSettings(node: Node<any>): OperationSettings {
  const config = node.data.customConfig?.operationLab;
  if (!config || typeof config.action !== 'string') throw new OperationError(400, 'Configure this service operation in its Service operation lab panel. Load an example, choose a connected caller, and author resource/request settings.');
  if (!SERVICE_OPERATIONS[node.data.serviceId]?.actions.includes(config.action)) throw new OperationError(501, `Operation ${config.action} is outside this service slice.`);
  return { action: config.action, callerId: config.callerId, resource: parseObject(config.resource, 'Resource settings'), request: parseObject(config.request, 'Request settings') };
}
export function operationConfigurationIssues(node: Node<any>): string[] {
  if (node.data.customConfig?.operationLab === undefined) return [];
  try { operationSettings(node); return []; } catch (e) { return [e instanceof Error ? e.message : String(e)]; }
}
export function operationCallers(target: Node<any>, nodes: Node<any>[], edges: Edge<any>[]) {
  const d = SERVICE_OPERATIONS[target.data.serviceId];
  if (!d) return [];
  return nodes.filter(n => OPERATION_CALLERS.includes(n.data.serviceId) && edges.some(e => e.source === n.id && e.target === target.id && carriesRequest(e.data) && !e.data?.referenceAnnotation && [d.protocol, ...(d.protocol === 'SQL' ? ['TCP'] : [])].includes(e.data?.protocol)))
    .sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Authoritative bounded operations; caller/role, network and handlers are shared across UI, labs and traversal. */
export function runServiceOperation(target: Node<ServiceNodeData>, nodes: Node<ServiceNodeData>[], edges: Edge<ConnectionData>[], scenario: SimulationScenario, caller?: Node<ServiceNodeData>): SimulationResult {
  nodes = [...nodes].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  edges = edges.filter(e => !e.data?.referenceAnnotation && e.data?.signalType !== 'outbound_response');
  const trace = new SimulationTrace();
  const d = SERVICE_OPERATIONS[target.data.serviceId];
  let source: Node<ServiceNodeData> | undefined;
  const record = (action: string, ok: boolean, reason: string, metadata: Record<string, unknown> = {}, component: 'Service'|'IAM'|'Route' = 'Service') => trace.pushStep({ sourceNodeId: source?.id ?? target.id, targetNodeId: target.id, sourceNodeName: source?.data.label ?? target.data.label, targetNodeName: target.data.label,
    protocol: d.protocol, action, status: ok ? 'success' : 'failed', explanation: reason, targetHealth: target.data.health, latencyMs: 0,
    details: { decision: { order: trace.steps.length + 1, component, resource: target.data.label, operation: action, input: { caller: source?.id }, decision: ok ? 'ALLOW' : 'DENY', reason, simpleExplanation: reason, awsRule: d.source, metadata } } });
  const finish = (code: number, summary: string): SimulationResult => ({ kind: 'request', outcome: code >= 200 && code < 300 ? 'success' : code === 501 ? 'unsupported' : code === 403 ? 'denied' : 'failure', scenario,
    success: code >= 200 && code < 300, statusCode: code, summary, steps: trace.steps, serviceStates: trace.serviceStates, path: source ? [source.id,target.id] : [target.id], totalLatencyMs: trace.currentTimestamp, bottlenecksDetected: [], cascadeOccurred: false });
  try {
    const settings = operationSettings(target);
    const candidates = operationCallers(target,nodes,edges);
    source = caller ? candidates.find(n => n.id === caller.id) : settings.callerId ? candidates.find(n => n.id === settings.callerId) : candidates.length === 1 ? candidates[0] : undefined;
    if (!source) throw new OperationError(400, 'Connect a supported caller using the service protocol; select a caller when more than one is connected. Annotation and dependency lines do not execute this operation.');
    const link = edges.find(e => e.source === source!.id && e.target === target.id && carriesRequest(e.data))!;
    if (link.data?.action && link.data.action !== settings.action) throw new OperationError(400, 'The connection operation differs from the selected service operation. Update the connection or operation selection.');
    if (source.data.health === 'failed' || target.data.health === 'failed') throw new OperationError(503, 'Caller or target is unavailable (injected simulator state). No operation was executed.');
    if (deriveSubnetForNode(source,nodes) === 'unassigned') throw new OperationError(400, 'Place the caller inside its required subnet.');
    const port = d.iam ? d.port : settings.resource.port;
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new OperationError(400, 'Configure an integer resource port from 1 to 65535.');
    if (link.data?.destinationPort !== undefined && link.data.destinationPort !== port) throw new OperationError(400, `Connection port ${link.data.destinationPort} does not match the configured endpoint port ${port}.`);
    if (!d.iam) {
      const a = findContainingSubnetBoundary(source,nodes), b = findContainingSubnetBoundary(target,nodes);
      if (!a || !b) throw new OperationError(400, 'This private data-plane slice requires caller and target subnet placement.');
      const av = findContainingVpc(a,nodes), bv = findContainingVpc(b,nodes);
      if (!av || !bv || av.id !== bv.id) throw new OperationError(501, 'Cross-VPC/public database connectivity is outside this private local-VPC operation slice.');
      record('Private endpoint path',true,'Caller and endpoint belong to the same VPC; routes and inbound firewalls are evaluated separately.',{ port },'Route');
    } else {
      const route = evaluateInternetEgress(source,target.data.serviceId,nodes,routingOptions(scenario));
      if (route.outcome !== 'allowed' && route.outcome !== 'legacy') throw new OperationError(route.outcome === 'invalid' ? 400 : 504,route.reason);
      if (source.data.serviceId === 'lambda' && route.outcome === 'allowed' && route.via === 'igw') throw new OperationError(504,'VPC Lambda cannot use an IGW alone; use NAT or a matching interface endpoint.');
      record('Regional API route',true,route.reason || 'Managed/public endpoint reachability assumed outside modeled VPC routing.',{ route, coverage: 'route only; egress/return packet controls remain partial' },'Route');
    }
    const evaluatedLink = { ...link, data: { ...link.data, destinationPort: port } } as Edge<ConnectionData>;
    if (evaluateApplicationHop({ source,target,protocol:d.protocol,nodes,path:[source],enforceIam:false,trace,connection:evaluatedLink })) return finish(trace.finalStatusCode,trace.finalSummary);
    if (d.iam) {
      const auth = authorizeApplicationHop(source,target,d.protocol,settings.action);
      record('Operation IAM authorization',auth.decision === 'ALLOW',auth.reason,auth.metadata,'IAM');
      if (auth.decision !== 'ALLOW') return finish(403,auth.reason);
    }
    const authorizeKey = (id: string, action: string) => {
      const key = nodes.find(n => n.id === id && n.data.serviceId === 'kms');
      if (!key || key.data.health === 'failed') throw new OperationError(503,'Configured KMS key is missing or unavailable.');
      const keyConfig = operationSettings(key).resource;
      if (action === 'kms:Decrypt' && keyConfig.KeyState !== 'Enabled') throw new OperationError(400,'KMS key must be Enabled for the modeled decrypt prerequisite.');
      const auth = authorizeApplicationHop(source!,key,'HTTPS',action);
      record('KMS identity authorization',auth.decision === 'ALLOW',auth.reason,auth.metadata,'IAM');
      if (auth.decision !== 'ALLOW') throw new OperationError(403,auth.reason);
      const policy = keyConfig.keyPolicy as Policy | undefined;
      if (!policy || !Array.isArray(policy.statements)) throw new OperationError(403,'Configure a direct-grant KMS key policy; identity permission alone is not sufficient for this KMS slice.');
      const decision = evaluateAuthorization({ principal: { id: source!.data.iamRole!.id, kind:'role', accountId:'000000000000', identityPolicies:[] }, action,
        resource: { arn: String(key.data.customConfig?.resourceArn ?? `arn:aws:kms:us-east-1:000000000000:key/${key.id}`), accountId:'000000000000',resourcePolicy:policy } });
      record('KMS key policy',decision.effect === 'Allow',decision.finalReason,{ coverage:'direct role grants only' },'IAM');
      if (decision.effect !== 'Allow') throw new OperationError(403,`KMS key policy denied ${action}. ${decision.finalReason}`);
    };
    if (target.data.serviceId === 'kms') authorizeKey(target.id,settings.action);
    const runtime = structuredClone(target.data.customConfig?.serviceRuntime ?? initialRuntime());
    const output = OPERATION_HANDLERS[target.data.serviceId]({ ...settings,id:target.id,runtime,nodes,edges,authorizeKey });
    const response = { ...output.response };
    // SNS delivery uses the existing messaging evaluator and returns only touched delivery states.
    const subscriptions = response.subscriptionStates as Record<string, any> | undefined;
    delete response.subscriptionStates;
    if (subscriptions) Object.assign(trace.serviceStates,subscriptions);
    if (output.runtime) { output.runtime.trace = output.notes ?? [`${settings.action} completed.`]; trace.serviceStates[target.id] = output.runtime; }
    for (const note of output.notes ?? []) record('Operation scope',true,note);
    const summary = `${d.name} ${settings.action} completed. ${d.scope}`;
    record(settings.action,true,summary,{ response });
    Object.assign(trace.steps[trace.steps.length-1].details!,{ operationResponse:response });
    return finish(output.code ?? 200,summary);
  } catch (error) {
    const code = error instanceof OperationError ? error.code : 400;
    const reason = error instanceof Error ? error.message : String(error);
    record('Service operation failed',false,reason,{ code });
    return finish(code,reason);
  }
}
