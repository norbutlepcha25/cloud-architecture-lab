import React from 'react';
import type { Node } from '@xyflow/react';
import type { ServiceNodeData, NetworkIdentity } from '../../types/index.ts';

export function NetworkIdentityPanel({ data, nodes, onChange }: {
  data: ServiceNodeData; nodes: Node<any>[]; onChange: (identity: NetworkIdentity) => void;
}) {
  const subnets = nodes.filter(node => node.type === 'boundaryNode' && ['public_subnet', 'private_subnet'].includes(node.data.boundaryType));
  const selected = data.networkIdentity?.subnetId;
  return <section className="space-y-3"><label className="block text-xs font-semibold text-slate-700">
    Network subnet assignment
    <select className="block w-full border rounded p-2 mt-1" value={selected ?? ''}
      onChange={event => {
        const identity = { ...data.networkIdentity };
        if (event.target.value) identity.subnetId = event.target.value;
        else delete identity.subnetId;
        onChange(identity);
      }}>
      <option value="">Automatic from canvas placement (legacy)</option>
      {selected && !subnets.some(node => node.id === selected) && <option value={selected}>Missing subnet: {selected}</option>}
      {subnets.map(node => <option key={node.id} value={node.id}>{node.data.label ?? node.id}</option>)}
    </select>
    <span className="block font-normal text-slate-500 mt-1">An explicit assignment stays attached when this component moves. It does not configure routes or allocate an IP address.</span>
  </label>
    <label className="block text-xs font-semibold">Private IPv4 address
      <input className="block w-full border rounded p-2" value={data.networkIdentity?.privateIp ?? ''}
        placeholder="10.0.1.20" onChange={e => onChange({ ...data.networkIdentity, privateIp: e.target.value || undefined })} />
    </label>
    <label className="block text-xs font-semibold">Explicit route table (simulation override)
      <select className="block w-full border rounded p-2" value={data.networkIdentity?.routeTableId ?? ''}
        onChange={e => onChange({ ...data.networkIdentity, routeTableId: e.target.value || undefined })}>
        <option value="">Inherit subnet association / legacy behavior</option>
        {nodes.filter(node => node.data.serviceId === 'route_tables').map(node => <option key={node.id} value={node.id}>{node.data.label ?? node.id}</option>)}
      </select>
    </label>
    <p className="text-xs text-slate-500">Internet, NAT and gateway endpoint routes follow the subnet route table. Route lookups between private IPv4 addresses use local routes only. AWS associates route tables with subnets; this resource override is a simulator convenience.</p>
  </section>;
}
