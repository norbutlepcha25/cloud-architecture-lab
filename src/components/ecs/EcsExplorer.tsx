import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2 } from 'lucide-react';
import type { Node, Edge } from '@xyflow/react';
import type { ServiceNodeData } from '../../types/index.ts';
import { ecsConfiguration } from '../../engine/service/models/ecs.ts';
import { EcsTopology, type EcsSection } from './EcsTopology.tsx';
import { EcsConnectivityMap } from './EcsConnectivityMap.tsx';
import { EcsConfigurationPanel } from '../inspector/EcsConfigurationPanel.tsx';

interface ContainerDefinition { name: string; image: string; port: string; essential: boolean }
export interface EcsWorkspace {
  instanceProfile?: string;
  repository?: string;
  clusterName?: string;
  serviceName?: string;
  family?: string;
  cpu?: string;
  memory?: string;
  executionRole?: string;
  taskRole?: string;
  logGroup?: string;
  instanceType?: string;
  instanceCount?: string;
  containers?: ContainerDefinition[];
}
const control = 'w-full mt-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus-visible:outline-circuit-600';
const button = 'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium focus-visible:outline-circuit-600';
const iconButton = 'p-1.5 -mr-1.5 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100';
const note = 'text-xs text-slate-500';

export function EcsExplorer({ nodeId, nodes, edges, onUpdate, onClose }: {
  nodeId: string; nodes: Node<ServiceNodeData>[]; edges: Edge[];
  onUpdate: (id: string, data: Partial<ServiceNodeData>) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const [serviceId, setServiceId] = useState(nodeId);
  const [section, setSection] = useState<EcsSection | null>(null);
  const [containerIndex, setContainerIndex] = useState<number | null>(null);
  const origin = nodes.find(n => n.id === nodeId)!;
  const originWorkspace: EcsWorkspace = origin.data.customConfig?.ecsWorkspace ?? {};
  const services = nodes.filter(n => n.data.serviceId === 'ecs' && (n.id === nodeId || (originWorkspace.clusterName && n.data.customConfig?.ecsWorkspace?.clusterName === originWorkspace.clusterName)));
  const node = services.find(n => n.id === serviceId) ?? origin;
  const data = node.data;
  const workspace: EcsWorkspace = data.customConfig?.ecsWorkspace ?? {};
  const config = ecsConfiguration(data);
  const containers = workspace.containers ?? [];
  const running = config.runningCount ?? data.replicas ?? 1;
  const desired = config.desiredCount ?? data.replicas ?? 1;
  const launchType = config.launchType ?? 'EC2';
  const update = (patch: Partial<EcsWorkspace>) => onUpdate(node.id, { customConfig: { ...data.customConfig, ecsWorkspace: { ...workspace, ...patch } } });
  const connections = edges.filter(e => e.source === node.id || e.target === node.id);
  const parent = nodes.find(n => n.id === node.parentId);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  const field = (label: string, key: keyof Omit<EcsWorkspace, 'containers'>, placeholder = '') => <label className="block text-xs font-medium text-slate-600">{label}
    <input className={control} value={workspace[key] ?? ''} placeholder={placeholder} onChange={e => update({ [key]: e.target.value })} />
  </label>;
  const titles: Record<EcsSection, string> = { cluster: 'Cluster', service: 'Service configuration', definition: 'Task definition', tasks: 'Task snapshot', compute: 'Compute capacity', network: 'Networking & connections', container: 'Container configuration' };
  return createPortal(<div className="fixed inset-0 z-[11000] bg-slate-950/40 p-2 sm:p-4 flex items-center justify-center" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="ecs-explorer-title" tabIndex={-1}
      className="w-full max-w-7xl h-[92dvh] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-xl outline-none"
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        if (e.key === 'Tab') {
          const items = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], textarea:not(:disabled)');
          if (!items?.length) return;
          const first = items[0], last = items[items.length - 1];
          if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { e.preventDefault(); first.focus(); }
        }
      }}>
      <header className="flex items-center justify-between gap-4 px-5 h-12 shrink-0 border-b border-slate-200">
        <div className="flex items-baseline gap-2 min-w-0"><h2 id="ecs-explorer-title" className="text-sm font-semibold text-slate-900 truncate">{origin.data.label}</h2><span className="text-xs text-slate-500 truncate">Amazon ECS</span></div>
        <button type="button" className={iconButton} onClick={onClose} aria-label="Close ECS explorer"><X className="w-4 h-4" /></button>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden grid lg:grid-cols-[minmax(0,1fr)_360px]">
        <main className="min-w-0 p-5 lg:overflow-y-auto bg-slate-50">
          <EcsTopology services={services} originId={nodeId} selectedId={node.id} section={section} containerIndex={containerIndex} onSelect={(id, part, index) => { setServiceId(id); setSection(part); setContainerIndex(index ?? null); }} />
        </main>
        <aside aria-label="ECS component details" className="border-t lg:border-t-0 lg:border-l border-slate-200 p-5 space-y-4 lg:overflow-y-auto">
          <EcsConnectivityMap services={services} nodes={nodes} edges={edges} clusterName={originWorkspace.clusterName || 'unnamed'} onSelectService={id => { setServiceId(id); setSection('network'); setContainerIndex(null); }} />
          <div className="flex items-center justify-between gap-2 pt-4 border-t border-slate-200"><h3 className="text-sm font-semibold">{section ? titles[section] : 'Details'}</h3>{section && <button type="button" className={iconButton} onClick={() => setSection(null)} aria-label="Close component details"><X className="w-4 h-4" /></button>}</div>
          {!section && <p className="text-sm text-slate-500">Select a cluster, service, task, or container in the diagram.</p>}
          {section && <p className="text-xs text-slate-500 break-words">{workspace.clusterName || 'Unnamed cluster'} / {workspace.serviceName || data.label}{section === 'container' ? ` / ${containers[containerIndex ?? -1]?.name || 'Container'}` : ''}</p>}
          {section === 'cluster' && <>{field('Cluster name', 'clusterName', 'e.g. production')}<p className={note}>ECS nodes with the same cluster name are grouped here.</p></>}
          {section === 'service' && <>{field('Service name', 'serviceName', data.label)}<EcsConfigurationPanel data={data} onChange={customConfig => onUpdate(node.id, { customConfig })} /><p className={note}>Desired count does not change the observed running count.</p></>}
          {(section === 'definition' || section === 'container') && <>
            <p className={note}>Configuration only. Startup, revisions, placement, roles and logs are not simulated.</p>
            {section === 'definition' && <>{field('Task definition family', 'family', 'e.g. web-task')}
            <div className="grid grid-cols-2 gap-3">{field('CPU units', 'cpu', '256')}{field('Memory (MiB)', 'memory', '512')}</div>
            <p className={note}>Network mode: {config.networkMode || 'awsvpc'} (only awsvpc is modeled).</p>
            {field('Task role ARN', 'taskRole')}{field('Task execution role ARN', 'executionRole')}{field('CloudWatch log group', 'logGroup')}</>}
            <h4 className="font-semibold text-xs text-slate-600 pt-1">{section === 'container' ? 'Edit shared container definition' : 'Container definitions'}</h4>
            {section === 'container' && <p className={note}>Applies to every task in this service.</p>}
            {containers.length === 0 && <p className="text-sm text-slate-500">No containers.</p>}
            {containers.map((c, i) => (section === 'definition' || i === containerIndex) && <fieldset key={i} className="border border-slate-200 rounded-md p-3 space-y-3"><legend className="text-xs font-medium text-slate-600 px-1">Container {i + 1}</legend>
              {(['name', 'image', 'port'] as const).map(key => <label key={key} className="block text-xs font-medium text-slate-600">{{ name: 'Container name', image: 'Image URI', port: 'Container port' }[key]}<input className={control} value={c[key]} onChange={e => update({ containers: containers.map((item, j) => j === i ? { ...item, [key]: e.target.value } : item) })} /></label>)}
              <label className="flex gap-2 text-sm"><input type="checkbox" checked={c.essential} onChange={e => update({ containers: containers.map((item, j) => j === i ? { ...item, essential: e.target.checked } : item) })} />Essential container</label>
              <button className={button} onClick={() => { update({ containers: containers.filter((_, j) => j !== i) }); setSection('definition'); setContainerIndex(null); }}><Trash2 size={14} />Remove container {i + 1}</button>
            </fieldset>)}
            <button className={button} onClick={() => { update({ containers: [...containers, { name: `container-${containers.length + 1}`, image: '', port: '', essential: true }] }); setSection('container'); setContainerIndex(containers.length); }}><Plus size={14} />Add container</button>
            <a className="block text-xs text-slate-500 underline hover:text-slate-900" href="https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html" target="_blank" rel="noreferrer">AWS task definition requirements</a>
          </>}
          {section === 'tasks' && <><p className="text-sm">{running} observed running tasks; {desired} desired.</p><p className={note}>Aggregate snapshot; task IDs, placement and scheduling are not modeled.</p><p className="text-sm">Service health: <strong>{data.health}</strong></p><button className={button} onClick={() => setSection('service')}>Configure task counts</button></>}
          {section === 'compute' && <><EcsConfigurationPanel data={data} onChange={customConfig => onUpdate(node.id, { customConfig })} />{launchType === 'EC2' ? <>{field('EC2 instance type', 'instanceType', 'e.g. t3.medium')}{field('Container instance count', 'instanceCount', 'e.g. 2')}<p className={note}>Design metadata only; hosts, placement and capacity are not modeled.</p></> : <p className={note}>Fargate provides managed compute; size tasks in the task definition.</p>}</>}
          {section === 'network' && <>
            <dl className="text-sm space-y-3"><div><dt className="text-xs text-slate-500">Canvas placement</dt><dd>{parent?.data.label || 'No parent boundary'} · {data.subnet} · {data.az}</dd></div><div><dt className="text-xs text-slate-500">Attached security groups</dt><dd>{(data.securityGroupIds ?? []).map(id => nodes.find(n => n.id === id)?.data.label || id).join(', ') || 'None attached'}</dd></div></dl>
            <p className={note}>Canvas links do not prove reachability. Edit placement in the inspector.</p>
            <h4 className="font-semibold text-xs text-slate-600 pt-1">Connections</h4>
            {connections.length === 0 && <p className="text-sm text-slate-500">No connected components.</p>}
            {connections.map(e => { const incoming = e.target === node.id; const other = nodes.find(n => n.id === (incoming ? e.source : e.target)); return <div key={e.id} className="flex items-baseline justify-between gap-3 py-2 border-b border-slate-100 text-sm"><span className="min-w-0 break-words"><span className="text-xs text-slate-500">{incoming ? 'Incoming from' : 'Outgoing to'} </span>{other?.data.label || 'Missing component'}</span><span className="text-xs text-slate-500 shrink-0">{String(e.data?.protocol || 'Unspecified protocol')}</span></div>; })}
          </>}
        </aside>
      </div>
    </div>
  </div>, document.body);
}
