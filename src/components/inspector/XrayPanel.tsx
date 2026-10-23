import React from 'react';
import type { Node, Edge } from '@xyflow/react';
import type { ServiceNodeData, ConnectionData } from '../../types/index.ts';
import { xrayPublishers } from '../../engine/observability/xray.ts';
import { XRAY_EXAMPLE_DOCUMENTS } from '../../engine/observability/xrayDocuments.ts';
import { xrayModel } from '../../engine/service/models/xray.ts';

/** Input and stored evidence only; ingestion, network and IAM decisions belong to the engine. */
export function XrayPanel({ node, nodes, edges, onConfig, onRun }: {
  node: Node<ServiceNodeData>; nodes: Node<ServiceNodeData>[]; edges: Edge<ConnectionData>[];
  onConfig: (patch: Record<string, unknown>) => void; onRun: () => void;
}) {
  const config = node.data.customConfig ?? {};
  const publishers = xrayPublishers(node, nodes, edges);
  const runtime = config.serviceRuntime;
  const records: Record<string, unknown>[] = runtime?.records ?? [];
  return <section className="space-y-3 text-xs">
    <p>Submit explicit root-segment documents to the X-Ray API. A connection does not automatically instrument the publisher or trace its application traffic.</p>
    <label className="block font-semibold">Publisher credentials
      <select aria-label="X-Ray publisher" className="mt-1 block w-full rounded border p-2" value={config.publisherNodeId ?? ''} onChange={e => onConfig({ publisherNodeId: e.target.value || undefined })}>
        <option value="">Use single connected publisher</option>
        {publishers.map(p => <option key={p.id} value={p.id}>{p.data.label}</option>)}
      </select>
    </label>
    <p className="text-slate-500">Connect EC2, Lambda, ECS or Fargate → X-Ray over HTTPS. Configure the publisher’s role to allow xray:PutTraceSegments on Resource *. This operation uses the publisher’s credentials.</p>
    <label className="block font-semibold">Segment documents (JSON array)
      <textarea aria-label="X-Ray segment documents" rows={10} className="mt-1 block w-full rounded border p-2 font-mono" value={typeof config.segmentDocuments === 'string' ? config.segmentDocuments : JSON.stringify(config.segmentDocuments ?? [], null, 2)} onChange={e => onConfig({ segmentDocuments: e.target.value })} />
    </label>
    <button type="button" className="rounded border px-2 py-1" onClick={() => onConfig({ segmentDocuments: XRAY_EXAMPLE_DOCUMENTS })}>Load sample segment</button>
    {xrayModel.validateConfiguration(node.data).map(issue => <p key={issue.field} role="alert" className="text-rose-700">{issue.message}</p>)}
    <button type="button" className="block rounded bg-slate-800 px-3 py-2 text-white" onClick={onRun}>Submit trace segments</button>
    <p className="text-slate-500">HTTP 200 can include unprocessed segments. The simulation trace reports each rejection. Completed documents replace in-progress documents with the same trace/id.</p>
    <div aria-label="X-Ray ingestion state" className="space-y-1">
      <p className="font-semibold">Stored segments: {records.length}</p>
      {runtime?.trace?.map((text: string, i: number) => <p key={i}>{text}</p>)}
      <ul className="max-h-40 overflow-auto">{records.map((record, i) => <li key={i} className="break-all">{String(record.name)} · {String(record.id)} · {record.in_progress === true ? 'in progress' : 'complete'}</li>)}</ul>
    </div>
    <p className="text-slate-500">Partial model: root segments only. Sampling, automatic instrumentation, subsegments, trace queries and service maps are not simulated. Publisher egress uses the shared route model; endpoint policies and egress firewall details remain outside coverage.</p>
  </section>;
}
