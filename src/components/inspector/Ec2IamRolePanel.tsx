import React, { useMemo, useState } from 'react';
import type { Node, Edge } from '@xyflow/react';
import type { ServiceNodeData } from '../../types/index.ts';
import { servicePrincipalFor } from '../../engine/iam/servicePrincipals.ts';
import { buildRole, calledServices, grantedActions, SERVICE_ACTIONS } from '../../engine/iam/roleBuilder.ts';
import { authorizeApplicationHop } from '../../engine/iam/applicationHop.ts';
import { IAM_AUTHENTICATED_ACTIONS } from '../../engine/capability/iamCoverage.ts';

const ROLE_KIND: Record<string, { title: string; defaultName: string }> = {
  ec2: { title: 'Instance profile role', defaultName: 'EC2-App-Role' },
  lambda: { title: 'Execution role', defaultName: 'Lambda-Execution-Role' },
  ecs: { title: 'Task role', defaultName: 'ECS-Task-Role' },
  fargate: { title: 'Task role', defaultName: 'Fargate-Task-Role' }
};

/** Services whose attached role the inspector can create. */
export const ROLE_PANEL_SERVICE_IDS = Object.keys(ROLE_KIND);

/** Role for a compute caller, with permissions derived from the AWS APIs it calls. */
export function Ec2IamRolePanel({ node, nodes, edges, onChange }: {
  node: Node<ServiceNodeData>; nodes: Node<ServiceNodeData>[]; edges: Edge<any>[];
  onChange: (role: ServiceNodeData['iamRole']) => void;
}) {
  const data = node.data;
  const kind = ROLE_KIND[data.serviceId] ?? ROLE_KIND.ec2;
  const called = useMemo(() => calledServices(node, nodes, edges), [node, nodes, edges]);
  const others = nodes.filter(n => IAM_AUTHENTICATED_ACTIONS[n.data.serviceId] && !called.some(c => c.target.id === n.id));
  const [extraIds, setExtraIds] = useState<string[]>(() => others.filter(o => grantedActions(data.iamRole, o).length).map(o => o.id));
  const targets = [...called.map(c => c.target), ...others.filter(o => extraIds.includes(o.id))];
  const [name, setName] = useState(data.iamRole?.id ?? kind.defaultName);
  const [selected, setSelected] = useState<Record<string, string[]>>(() => Object.fromEntries(targets.map(t => {
    const granted = grantedActions(data.iamRole, t);
    return [t.id, data.iamRole ? granted : called.find(c => c.target.id === t.id)?.used ?? []];
  })));
  const [error, setError] = useState('');
  const toggle = (id: string, action: string) => setSelected(prev => {
    const current = prev[id] ?? [];
    return { ...prev, [id]: current.includes(action) ? current.filter(a => a !== action) : [...current, action] };
  });
  const save = () => {
    try {
      onChange(buildRole(data.serviceId, name, targets.map(t => ({ target: t, actions: selected[t.id] ?? [] })).filter(g => g.actions.length)));
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not build the role.'); }
  };

  return <section className="space-y-3 text-xs">
    <div>
      <p className="font-semibold text-slate-700">{kind.title}</p>
      <p className="text-slate-500">{data.iamRole ? `Attached: ${data.iamRole.id}` : 'No role attached'} · trusted by {servicePrincipalFor(data.serviceId)}</p>
    </div>

    {called.length === 0 && <p className="text-slate-500">This component calls no IAM-governed AWS API. Connections to databases, load balancers or instances are authorized by security groups, not IAM.</p>}

    {targets.map(target => {
      const usedBy = called.find(c => c.target.id === target.id)?.used ?? [];
      return <div key={target.id} className="space-y-1 rounded border border-slate-200 p-2">
        <div className="flex items-center justify-between">
          <span className="font-medium text-slate-800">{target.data.label}</span>
          <span className="text-slate-400">{usedBy.length ? 'called' : 'extra'}</span>
        </div>
        {(SERVICE_ACTIONS[target.data.serviceId] ?? []).map(action => {
          const used = usedBy.includes(action);
          const decision = used ? authorizeApplicationHop(node, target, 'HTTPS', action).decision : undefined;
          return <label key={action} className="flex items-center gap-2">
            <input type="checkbox" checked={(selected[target.id] ?? []).includes(action)} onChange={() => toggle(target.id, action)} />
            <span className="flex-1 font-mono">{action}</span>
            {decision && <span className={decision === 'ALLOW' ? 'text-emerald-700' : 'text-rose-700'}>{decision === 'ALLOW' ? 'allowed now' : 'denied now'}</span>}
          </label>;
        })}
      </div>;
    })}

    {others.length > 0 && <label className="block text-slate-600">Grant access to another resource
      <select className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1.5" value="" onChange={e => { if (e.target.value) setExtraIds(ids => [...ids, e.target.value]); }}>
        <option value="">Select…</option>
        {others.filter(o => !extraIds.includes(o.id)).map(o => <option key={o.id} value={o.id}>{o.data.label}</option>)}
      </select>
    </label>}

    <label className="block font-semibold text-slate-700">Role name
      <input className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1.5" value={name} onChange={e => setName(e.target.value)} />
    </label>
    <div className="flex gap-2">
      <button type="button" className="rounded bg-[#232F3E] px-3 py-1.5 text-white disabled:opacity-40" disabled={!targets.length} onClick={save}>{data.iamRole ? 'Update role' : 'Create role'}</button>
      {data.iamRole && <button type="button" className="rounded border border-slate-300 px-3 py-1.5" onClick={() => onChange(undefined)}>Detach</button>}
    </div>
    {data.iamRole && <details><summary className="cursor-pointer text-slate-500">View policy</summary><pre className="overflow-auto max-h-48 whitespace-pre-wrap">{JSON.stringify(data.iamRole, null, 2)}</pre></details>}
    {error && <p role="alert" className="text-rose-700">{error}</p>}
    <p className="text-slate-500">Each statement is scoped to one resource. A role allows only what you tick; anything else is an implicit deny.</p>
  </section>;
}
