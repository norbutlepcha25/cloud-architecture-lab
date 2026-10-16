import React from 'react';
import type { Node } from '@xyflow/react';
import { Plus, Trash2 } from 'lucide-react';
import type { ServiceNodeData } from '../../types/index.ts';
import type { Route, RouteTargetType } from '../../engine/network/routeTable.ts';
import { parseCidr } from '../../engine/network/cidr.ts';
import { routingConfigurationIssues } from '../../engine/network/subnetRouting.ts';

const TARGETS: { type: RouteTargetType; label: string; serviceId?: string }[] = [
  { type: 'local', label: 'local (VPC)' },
  { type: 'igw', label: 'Internet gateway', serviceId: 'internet_gateway' },
  { type: 'nat', label: 'NAT gateway', serviceId: 'nat_gateway' }
];

const input = 'w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:outline-none focus:border-slate-500';

/** Route table routes and subnet associations. Routing decisions live in engine/network/subnetRouting.ts. */
export function RouteTablePanel({ node, nodes, onRoutes, onAssociate }: {
  node: Node<ServiceNodeData>;
  nodes: Node<any>[];
  onRoutes: (routes: Route[]) => void;
  onAssociate: (subnetId: string, routeTableId: string | undefined) => void;
}) {
  const routes: Route[] = Array.isArray(node.data.customConfig?.routeTable?.routes) ? node.data.customConfig!.routeTable.routes : [];
  const subnets = nodes.filter(n => n.type === 'boundaryNode' && ['public_subnet', 'private_subnet'].includes(n.data.boundaryType));
  const vpcCidr = nodes.find(n => n.type === 'boundaryNode' && n.data.boundaryType === 'vpc' && n.data.cidr)?.data.cidr ?? '10.0.0.0/16';
  const byService = (serviceId?: string) => serviceId ? nodes.filter(n => n.data?.serviceId === serviceId) : [];
  const first = (serviceId: string) => byService(serviceId)[0]?.id;
  const update = (index: number, route: Route) => onRoutes(routes.map((r, i) => i === index ? route : r));
  const preset = (kind: 'igw' | 'nat') => onRoutes([
    { destinationCidr: vpcCidr, target: { type: 'local' } },
    { destinationCidr: '0.0.0.0/0', target: { type: kind, targetId: first(kind === 'igw' ? 'internet_gateway' : 'nat_gateway') } }
  ]);

  const issues = routingConfigurationIssues(nodes).filter(i => i.nodeId === node.id);

  return <section className="space-y-4 text-xs">
    {issues.length > 0 && <div role="alert" className="space-y-1">
      {issues.map(i => <p key={i.problem} className="text-rose-700">{i.problem} {i.awsRule}</p>)}
    </div>}
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-700">Routes</span>
        <div className="flex gap-1">
          <button type="button" className="px-2 py-1 rounded border border-slate-200 hover:bg-slate-50" onClick={() => preset('igw')}>Public preset</button>
          <button type="button" className="px-2 py-1 rounded border border-slate-200 hover:bg-slate-50" onClick={() => preset('nat')}>Private preset</button>
        </div>
      </div>
      {routes.length === 0 && <p className="text-slate-500">No routes. Traffic from associated subnets has nowhere to go.</p>}
      {routes.map((route, index) => {
        const target = TARGETS.find(t => t.type === route.target?.type);
        const candidates = byService(target?.serviceId);
        const cidrInvalid = !parseCidr(route.destinationCidr ?? '');
        return <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-start">
          <input aria-label={`Route ${index + 1} destination`} className={`${input} font-mono ${cidrInvalid ? 'border-rose-400' : ''}`} value={route.destinationCidr ?? ''}
            onChange={e => update(index, { ...route, destinationCidr: e.target.value.trim() })} placeholder="0.0.0.0/0" />
          <div className="space-y-1">
            <select aria-label={`Route ${index + 1} target`} className={input} value={route.target?.type ?? 'local'}
              onChange={e => {
                const type = e.target.value as RouteTargetType;
                const serviceId = TARGETS.find(t => t.type === type)?.serviceId;
                update(index, { ...route, target: { type, ...(serviceId ? { targetId: first(serviceId) } : {}) } });
              }}>
              {TARGETS.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
              {!target && <option value={route.target?.type}>{route.target?.type} (not simulated)</option>}
            </select>
            {target?.serviceId && <select aria-label={`Route ${index + 1} target resource`} className={input} value={route.target.targetId ?? ''}
              onChange={e => update(index, { ...route, target: { ...route.target, targetId: e.target.value || undefined } })}>
              <option value="">{candidates.length ? 'Select…' : `No ${target.label.toLowerCase()} on canvas`}</option>
              {candidates.map(c => <option key={c.id} value={c.id}>{c.data.label ?? c.id}</option>)}
            </select>}
          </div>
          <button type="button" aria-label={`Remove route ${index + 1}`} className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-slate-100"
            onClick={() => onRoutes(routes.filter((_, i) => i !== index))}><Trash2 className="w-3.5 h-3.5" /></button>
        </div>;
      })}
      <button type="button" className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 hover:bg-slate-50"
        onClick={() => onRoutes([...routes, { destinationCidr: '0.0.0.0/0', target: { type: 'local' } }])}><Plus className="w-3.5 h-3.5" />Add route</button>
      <p className="text-slate-500">The most specific matching route wins.</p>
    </div>

    <div className="space-y-1.5">
      <span className="font-semibold text-slate-700">Subnet associations</span>
      {subnets.length === 0 && <p className="text-slate-500">No subnets on the canvas.</p>}
      {subnets.map(subnet => {
        const current = subnet.data.networkIdentity?.routeTableId;
        const other = current && current !== node.id ? nodes.find(n => n.id === current)?.data.label ?? current : undefined;
        return <label key={subnet.id} className="flex items-center gap-2">
          <input type="checkbox" checked={current === node.id} onChange={e => onAssociate(subnet.id, e.target.checked ? node.id : undefined)} />
          <span className="flex-1">{subnet.data.label ?? subnet.id}</span>
          {other && <span className="text-slate-400">uses {other}</span>}
        </label>;
      })}
      <p className="text-slate-500">A subnet uses one route table. Subnets with no association follow the "Assume route tables" setting.</p>
    </div>
  </section>;
}
