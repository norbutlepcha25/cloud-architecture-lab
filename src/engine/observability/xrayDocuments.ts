/** Bounded root-segment ingestion schema, verified 2026-10-18 against the X-Ray API/segment guide. */
export const XRAY_API = 'https://docs.aws.amazon.com/xray/latest/api/API_PutTraceSegments.html';
export const XRAY_SEGMENTS = 'https://docs.aws.amazon.com/xray/latest/devguide/xray-api-segmentdocuments.html';
export const XRAY_PUBLISHERS = ['ec2', 'lambda', 'ecs', 'fargate'];
export const XRAY_EXAMPLE_DOCUMENTS = JSON.stringify([{
  name: 'orders', id: '0123456789abcdef', trace_id: '1-abcdef01-0123456789abcdef01234567',
  start_time: 1800000000, end_time: 1800000001
}], null, 2);

export function parseXrayBatch(raw: unknown): { documents: unknown[]; error?: string } {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(value)) return { documents: [], error: 'Configure segmentDocuments as a JSON array of segment objects or JSON document strings.' };
    return { documents: value };
  } catch { return { documents: [], error: 'Segment batch is not valid JSON.' }; }
}

export interface XrayBatch {
  accepted: Record<string, unknown>[];
  unprocessed: { Id?: string; ErrorCode: string; Message: string }[];
  unsupported?: string;
}
export function processXrayDocuments(documents: unknown[]): XrayBatch {
  const result: XrayBatch = { accepted: [], unprocessed: [] };
  for (const item of documents) {
    let doc: any;
    let problem = '';
    const text = typeof item === 'string' ? item : JSON.stringify(item);
    try { doc = typeof item === 'string' ? JSON.parse(item) : item; }
    catch { problem = 'Segment is not valid JSON.'; }
    if (!problem && (!doc || typeof doc !== 'object' || Array.isArray(doc))) problem = 'A root segment must be an object.';
    if (!problem && (doc.type === 'subsegment' || doc.subsegments !== undefined)) {
      result.unsupported = 'Subsegments and nested segment documents are outside this root-segment ingestion slice; no batch was submitted.';
      return result;
    }
    if (!problem && new TextEncoder().encode(text).byteLength > 64 * 1024) problem = 'Segment document exceeds 64 KiB in UTF-8.';
    if (!problem && (typeof doc.name !== 'string' || !doc.name.length || [...doc.name].length > 200)) problem = 'Segment name must contain 1–200 characters.';
    if (!problem && !/^[\p{L}\p{N}\s_.:\/%&#=+\\@-]+$/u.test(doc.name)) problem = 'Segment name contains characters outside the documented X-Ray service-name set.';
    if (!problem && (typeof doc.id !== 'string' || !/^[0-9a-f]{16}$/.test(doc.id))) problem = 'Segment id must contain 16 hexadecimal digits.';
    if (!problem && (typeof doc.trace_id !== 'string' || !/^1-[0-9a-f]{8}-[0-9a-f]{24}$/.test(doc.trace_id))) problem = 'trace_id must use X-Ray format 1-8hex-24hex; no timestamp freshness check is inferred.';
    if (!problem && (typeof doc.start_time !== 'number' || !Number.isFinite(doc.start_time))) problem = 'start_time must be a finite epoch-seconds number.';
    if (!problem && doc.in_progress !== undefined && typeof doc.in_progress !== 'boolean') problem = 'in_progress must be a boolean.';
    if (!problem && (doc.in_progress === true ? doc.end_time !== undefined : typeof doc.end_time !== 'number' || !Number.isFinite(doc.end_time))) problem = 'Specify a finite end_time or in_progress: true without end_time.';
    if (problem) result.unprocessed.push({ ...(typeof doc?.id === 'string' ? { Id: doc.id } : {}), ErrorCode: 'InvalidSegment', Message: problem });
    else result.accepted.push(structuredClone(doc));
  }
  return result;
}
