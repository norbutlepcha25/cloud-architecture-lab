import type { Node, Edge } from '@xyflow/react';
import type { ServiceNodeData, ConnectionData, SimulationScenario, SimulationResult } from '../../types/index.ts';
import { carriesRequest } from '../architecture/relationships.ts';
import { authorizeApplicationHop } from '../iam/applicationHop.ts';
import { evaluateInternetEgress, routingOptions } from '../network/subnetRouting.ts';
import { deriveSubnetForNode } from '../layout/containment.ts';
import { initialRuntime, type Runtime } from '../services/operations.ts';
import { SimulationTrace } from '../simulation/adapters/types.ts';
import { XRAY_API, XRAY_SEGMENTS, XRAY_PUBLISHERS, parseXrayBatch, processXrayDocuments } from './xrayDocuments.ts';

/** Explicit API submission, not automatic instrumentation or an application-forwarding service. */
export function xrayPublishers(target: Node<ServiceNodeData>, nodes: Node<ServiceNodeData>[], edges: Edge<ConnectionData>[]) {
  return nodes.filter(n => XRAY_PUBLISHERS.includes(n.data.serviceId) && edges.some(e => e.source === n.id && e.target === target.id
    && carriesRequest(e.data) && !e.data?.referenceAnnotation && e.data?.protocol === 'HTTPS'
    && (!e.data.action || e.data.action === 'xray:PutTraceSegments')
    && (!e.data.transport || e.data.transport === 'HTTPS') && (e.data.destinationPort === undefined || e.data.destinationPort === 443)))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function runXraySubmission(target: Node<ServiceNodeData>, nodes: Node<ServiceNodeData>[], edges: Edge<ConnectionData>[], scenario: SimulationScenario, publisher?: Node<ServiceNodeData>): SimulationResult {
  nodes = [...nodes].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const trace = new SimulationTrace();
  const candidates = xrayPublishers(target, nodes, edges);
  const requested = target.data.customConfig?.publisherNodeId;
  const source = publisher ? candidates.find(n => n.id === publisher.id) : requested ? candidates.find(n => n.id === requested) : candidates.length === 1 ? candidates[0] : undefined;
  const record = (action: string, ok: boolean, reason: string, rule = XRAY_API, metadata: Record<string, unknown> = {}, component: 'Service' | 'IAM' | 'Route' = 'Service') => trace.pushStep({
    sourceNodeId: source?.id ?? target.id, targetNodeId: target.id, sourceNodeName: source?.data.label ?? target.data.label, targetNodeName: target.data.label,
    protocol: 'HTTPS', action, status: ok ? 'success' : 'failed', explanation: reason, targetHealth: target.data.health, latencyMs: 0,
    details: { decision: { order: trace.steps.length + 1, component, resource: target.data.label, operation: action, input: { publisher: source?.id },
      decision: ok ? 'ALLOW' : 'DENY', reason, simpleExplanation: reason, awsRule: rule, metadata } }
  });
  const finish = (code: number, summary: string): SimulationResult => ({ kind: 'request', outcome: code === 200 ? 'success' : code === 403 ? 'denied' : code === 501 ? 'unsupported' : 'failure',
    scenario, success: code === 200, statusCode: code, summary, steps: trace.steps, serviceStates: trace.serviceStates,
    path: source ? [source.id, target.id] : [target.id], totalLatencyMs: 0, bottlenecksDetected: [], cascadeOccurred: false });
  const fail = (code: number, operation: string, reason: string, rule = XRAY_API) => { record(operation, false, reason, rule); return finish(code, reason); };
  if (!source) return fail(400, 'X-Ray: publisher configuration', 'Connect a supported publisher to X-Ray over HTTPS and select one when multiple publishers exist. The connected publisher supplies credentials; X-Ray does not assume an application execution role.');
  if (source.data.health === 'failed' || target.data.health === 'failed') return fail(503, 'X-Ray: availability', 'The publisher or X-Ray endpoint is unavailable (injected simulator failure).');
  if (deriveSubnetForNode(source, nodes) === 'unassigned') return fail(400, 'X-Ray: publisher placement', 'Place this publisher inside its required subnet before sending trace data.');
  const batch = parseXrayBatch(target.data.customConfig?.segmentDocuments);
  if (batch.error) return fail(400, 'X-Ray: batch configuration', batch.error);
  const route = evaluateInternetEgress(source, 'xray', nodes, routingOptions(scenario));
  if (source.data.serviceId === 'lambda' && route.outcome === 'allowed' && route.via === 'igw') return fail(504, 'X-Ray: endpoint route', 'A VPC-connected Lambda function cannot gain internet access from an internet gateway route alone. Use NAT or an X-Ray interface endpoint.', 'https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc-internet.html');
  record('X-Ray: endpoint route', route.outcome === 'allowed' || route.outcome === 'legacy', route.reason || 'Publisher is outside modeled VPC routing; managed public endpoint access is assumed.',
    'https://docs.aws.amazon.com/xray/latest/devguide/xray-security-vpc-endpoint.html', { coverage: 'route reachability only; endpoint policy, DNS and egress firewalls unmodeled', route }, 'Route');
  if (route.outcome !== 'allowed' && route.outcome !== 'legacy') return finish(route.outcome === 'invalid' ? 400 : 504, route.reason);
  const auth = authorizeApplicationHop(source, target, 'HTTPS', 'xray:PutTraceSegments');
  record('X-Ray: IAM authorization', auth.decision === 'ALLOW', auth.reason, 'https://docs.aws.amazon.com/service-authorization/latest/reference/list_xray.html', { ...auth.metadata, action: 'xray:PutTraceSegments', resource: '*' }, 'IAM');
  if (auth.decision !== 'ALLOW') return finish(403, auth.reason);
  const result = processXrayDocuments(batch.documents);
  if (result.unsupported) return fail(501, 'X-Ray: unsupported document scope', result.unsupported, XRAY_SEGMENTS);
  const runtime: Runtime = structuredClone(target.data.customConfig?.serviceRuntime ?? initialRuntime());
  for (const doc of result.accepted) {
    const index = runtime.records.findIndex(old => old.trace_id === doc.trace_id && old.id === doc.id);
    if (index < 0) runtime.records.push(doc); else runtime.records[index] = doc;
    record('X-Ray: segment stored', true, `${String(doc.name)} · ${String(doc.id)}: ${doc.in_progress === true ? 'in progress' : 'complete'}${index < 0 ? '' : '; replaced the previously stored segment with this trace/id'}.`, XRAY_API);
  }
  for (const issue of result.unprocessed) {
    record('X-Ray: unprocessed segment', true, `${issue.Id ?? 'Unknown id'}: ${issue.Message} This item was not ingested; the API batch still returns HTTP 200.`, XRAY_SEGMENTS);
    const step = trace.steps[trace.steps.length - 1];
    step.status = 'bypassed';
    step.details!.decision!.decision = 'INFO';
  }
  runtime.sequence += 1;
  const summary = `PutTraceSegments returned HTTP 200: ${result.accepted.length} accepted, ${result.unprocessed.length} unprocessed. HTTP success does not guarantee every segment was ingested.`;
  runtime.trace = [summary];
  trace.serviceStates[target.id] = runtime;
  record('X-Ray: PutTraceSegments', true, summary, XRAY_API, { accepted: result.accepted.length, unprocessed: result.unprocessed.length, schemaCoverage: 'root required fields and UTF-8 size only' });
  Object.assign(trace.steps[trace.steps.length - 1].details!, { xrayResponse: { accepted: result.accepted.length, UnprocessedTraceSegments: result.unprocessed } });
  return finish(200, summary);
}
