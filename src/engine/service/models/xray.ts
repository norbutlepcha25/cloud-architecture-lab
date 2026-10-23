import type { ServiceModel } from '../types.ts';
import { XRAY_API, parseXrayBatch, processXrayDocuments } from '../../observability/xrayDocuments.ts';

export const xrayModel: ServiceModel = {
  id: 'xray', tier: 2, description: 'Bounded PutTraceSegments root-segment ingestion; no automatic instrumentation, sampling or trace queries.',
  validateConfiguration: node => {
    const raw = node.customConfig?.segmentDocuments;
    if (raw === undefined) return []; // no authored workload is not an invalid X-Ray resource
    const { error } = parseXrayBatch(raw);
    return error ? [{ field: 'segmentDocuments', message: `${error} ${XRAY_API}` }] : [];
  },
  resolveEndpoints: () => ({ requiresEni: false, isIngressProxy: false, isManagedEventTarget: false, isVpcEndpoint: null }),
  canReceive: (_node, action) => ({ ok: action === 'xray:PutTraceSegments', reason: 'Only PutTraceSegments is modeled.' }),
  canSend: () => ({ ok: false, reason: 'X-Ray is not an application forwarding hop.' }),
  processRequest: ({ target, action }) => {
    if (action !== 'xray:PutTraceSegments') return { status: 'failure', statusCode: 501, reason: 'Only PutTraceSegments is modeled.' };
    if (target.health === 'failed') return { status: 'failure', statusCode: 503, reason: 'X-Ray endpoint unavailable.' };
    const parsed = parseXrayBatch(target.customConfig?.segmentDocuments);
    if (parsed.error) return { status: 'failure', statusCode: 400, reason: parsed.error };
    const batch = processXrayDocuments(parsed.documents);
    if (batch.unsupported) return { status: 'failure', statusCode: 501, reason: batch.unsupported };
    return { status: 'success', detail: `${batch.accepted.length} accepted, ${batch.unprocessed.length} unprocessed; caller IAM and routing are evaluated by the live submission engine.` };
  },
  getDependencies: () => [],
  getFailureModes: () => [{ id: 'endpoint-unavailable', description: 'Injected ingestion endpoint failure prevents submissions.', detectionSystem: 'manual' }]
};
