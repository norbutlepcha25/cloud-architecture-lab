import React from 'react';
import type { ServiceNodeData } from '../../types/index.ts';
import { eksConfiguration, validateEks, type EksConfiguration } from '../../engine/service/models/eks.ts';

/** Edit the existing EKS snapshot contract; model validation owns the actual rules. */
export function EksConfigurationPanel({ data, onChange }: {
  data: ServiceNodeData;
  onChange: (config: NonNullable<ServiceNodeData['customConfig']>) => void;
}) {
  const config = eksConfiguration(data);
  const update = (patch: Partial<EksConfiguration>) => onChange({ ...data.customConfig, eks: { ...data.customConfig?.eks, ...patch } });
  const input = 'block w-full border border-slate-300 rounded p-2 mt-1 bg-white';
  const text = (label: string, field: 'clusterName' | 'namespace' | 'serviceSelector' | 'podLabel') => <label className="block text-xs">{label}
    <input aria-label={label} className={input} value={config[field]} onChange={e => update({ [field]: e.target.value })} />
  </label>;
  const number = (label: string, field: 'desiredReplicas' | 'runningPods' | 'readyPods' | 'servicePort' | 'containerPort') => <label className="block text-xs">{label}
    <input aria-label={label} className={input} type="number" min={0} step={1} value={config[field]} onChange={e => update({ [field]: Number(e.target.value) })} />
  </label>;
  const issues = validateEks(data);
  return <div className="space-y-3 text-xs">
    <label className="block">EKS resource role<select aria-label="EKS resource role" className={input} value={config.kind} onChange={e => update({ kind: e.target.value as EksConfiguration['kind'] })}>
      <option value="workload">Workload Service snapshot</option><option value="control-plane">AWS-managed control-plane reference</option>
    </select></label>
    {text('Cluster name', 'clusterName')}
    <label className="flex items-center gap-2"><input type="checkbox" checked={config.controlPlaneAvailable} onChange={e => update({ controlPlaneAvailable: e.target.checked })} />Control plane available for reconciliation</label>
    {config.kind === 'workload' ? <>
      {text('Namespace', 'namespace')}
      {number('Desired replicas', 'desiredReplicas')}{number('Observed running pods', 'runningPods')}{number('Observed Ready pods', 'readyPods')}
      {text('Service selector', 'serviceSelector')}{text('Pod label', 'podLabel')}
      {number('Service port', 'servicePort')}{number('Container target port', 'containerPort')}
      <p className="text-slate-500">Observed workload snapshot. Desired replicas do not schedule pods. Use More information for the full EKS explorer and scaling estimates.</p>
    </> : <p className="text-slate-500">AWS-managed regional control plane. This reference is separate from application traffic; its internal machines, API authentication and reconciliation are not simulated.</p>}
    {issues.length > 0 && <ul role="status" className="text-rose-700 list-disc pl-4">{issues.map(issue => <li key={issue.field}>{issue.message}</li>)}</ul>}
  </div>;
}
