import React from 'react';
import type { Node } from '@xyflow/react';
import type { ServiceNodeData } from '../../types/index.ts';
import { endpointService, validateEndpoint } from '../../engine/network/vpcEndpoint.ts';

export function EndpointConfigurationPanel({ data, nodes = [], onChange }: {
  data: ServiceNodeData;
  nodes?: Node<any>[];
  onChange: (config: Record<string, unknown>) => void;
}) {
  const value = endpointService(data) ?? '';
  const update = (endpointService: string) => onChange({ ...data.customConfig, endpointService });
  return <section className="space-y-2">
    <label className="block text-sm font-semibold">Endpoint destination service
      {data.serviceId === 's3_gateway_endpoint'
        ? <select className="block w-full border rounded p-2" value={value} onChange={e => update(e.target.value)}>
            <option value="s3">Amazon S3</option><option value="dynamodb">Amazon DynamoDB</option>
          </select>
        : <input className="block w-full border rounded p-2" value={value} placeholder="Service ID, e.g. sqs" onChange={e => update(e.target.value)} />}
    </label>
    {data.serviceId === 's3_gateway_endpoint' && <fieldset className="space-y-1">
      <legend className="text-sm font-semibold">Route table associations</legend>
      {nodes.filter(n => n.data?.serviceId === 'route_tables').map(n => {
        const ids: string[] = Array.isArray(data.customConfig?.routeTableIds) ? data.customConfig!.routeTableIds : [];
        return <label key={n.id} className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={ids.includes(n.id)} onChange={e => onChange({ ...data.customConfig, routeTableIds: e.target.checked ? [...ids, n.id] : ids.filter(id => id !== n.id) })} />
          {n.data.label ?? n.id}
        </label>;
      })}
      {!nodes.some(n => n.data?.serviceId === 'route_tables') && <p className="text-xs text-slate-500">Add a route table to the canvas to associate it.</p>}
      <p className="text-xs text-slate-500">Each associated route table gets the prefix-list route to this endpoint.</p>
    </fieldset>}
    <p className="text-xs text-slate-500">One endpoint targets one service. Regional availability, DNS and endpoint policies are not simulated.</p>
    {validateEndpoint(data).map(message => <p key={message} className="text-xs text-amber-700">{message}</p>)}
  </section>;
}
