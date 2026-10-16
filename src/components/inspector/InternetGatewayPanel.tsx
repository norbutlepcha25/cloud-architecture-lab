import React from 'react';
import type { Node } from '@xyflow/react';
import type { ServiceNodeData } from '../../types/index.ts';
import { igwAttachedVpc, isIgwDetached, routingConfigurationIssues } from '../../engine/network/subnetRouting.ts';

/** Internet gateway attachment and the routes that use it. Decisions live in engine/network/subnetRouting.ts. */
export function InternetGatewayPanel({ node, nodes, onChange }: {
  node: Node<ServiceNodeData>;
  nodes: Node<any>[];
  onChange: (patch: Partial<ServiceNodeData>) => void;
}) {
  const vpcs = nodes.filter(n => n.type === 'boundaryNode' && n.data.boundaryType === 'vpc');
  const explicit = node.data.networkIdentity?.vpcId;
  const detached = isIgwDetached(node);
  const value = detached ? 'detached' : explicit ?? '';
  const inferred = igwAttachedVpc({ ...node, data: { ...node.data, networkIdentity: { ...node.data.networkIdentity, vpcId: undefined }, customConfig: { ...node.data.customConfig, attachment: undefined } } }, nodes);
  const attached = igwAttachedVpc(node, nodes);
  const routeTables = nodes.filter(n => n.data?.serviceId === 'route_tables' && (n.data.customConfig?.routeTable?.routes ?? [])
    .some((r: any) => r?.target?.type === 'igw' && (r.target.targetId === node.id || !r.target.targetId)));

  const issues = routingConfigurationIssues(nodes).filter(i => i.field === 'igw-per-vpc' && i.problem.includes(String(node.data.label ?? node.id)));

  const select = (next: string) => {
    const identity = { ...node.data.networkIdentity };
    const config = { ...node.data.customConfig };
    delete identity.vpcId; delete config.attachment;
    if (next === 'detached') config.attachment = 'detached';
    else if (next) identity.vpcId = next;
    onChange({ networkIdentity: identity, customConfig: config });
  };

  return <section className="space-y-3 text-xs">
    <label className="block font-semibold text-slate-700">VPC attachment
      <select aria-label="Internet gateway VPC attachment" className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs" value={value} onChange={e => select(e.target.value)}>
        <option value="">From placement ({inferred?.data.label ?? 'no VPC found'})</option>
        {vpcs.map(v => <option key={v.id} value={v.id}>{v.data.label ?? v.id}</option>)}
        <option value="detached">Not attached</option>
      </select>
    </label>
    <p className={attached ? 'text-emerald-700' : 'text-rose-700'}>
      {attached ? `Attached to ${attached.data.label ?? attached.id}.` : 'Not attached: no traffic can use this gateway.'}
    </p>
    {issues.map(i => <p key={i.problem} role="alert" className="text-rose-700">{i.problem} {i.awsRule}</p>)}
    <div className="space-y-1">
      <span className="font-semibold text-slate-700">Route tables using it</span>
      {routeTables.length
        ? <ul className="list-disc pl-4 text-slate-600">{routeTables.map(t => <li key={t.id}>{t.data.label ?? t.id}</li>)}</ul>
        : <p className="text-slate-500">None. Add a 0.0.0.0/0 route to this gateway in a route table, then associate that table with your public subnets.</p>}
    </div>
    <p className="text-slate-500">An internet gateway has no other settings in AWS. One gateway per VPC; it needs a route in the subnet route table, and resources need a public IP. Placement on the VPC border counts as attached.</p>
  </section>;
}
