import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowDown } from 'lucide-react';
import type { Node, Edge } from '@xyflow/react';
import type { ServiceNodeData } from '../../types/index.ts';
import { eksConfiguration, eksReadyEndpoints, recommendEksReplicas, validateEks, type EksConfiguration } from '../../engine/service/models/eks.ts';
const button = 'rounded-md border border-slate-200 px-3 py-2 text-sm bg-white hover:bg-slate-50 text-slate-800 focus-visible:outline-circuit-600';
const action = 'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium focus-visible:outline-circuit-600';
const input = 'w-full block mt-1 border border-slate-200 rounded-md px-2.5 py-1.5 bg-white text-sm';
const note = 'text-xs text-slate-500';
const docLink = 'block text-xs text-slate-500 underline hover:text-slate-900';
type Section = 'cluster' | 'workload' | 'service' | 'compute' | 'hpa' | 'container';
export function EksExplorer({ nodeId, nodes, edges, onUpdate, onClose }: {
  nodeId: string; nodes: Node<ServiceNodeData>[]; edges: Edge[];
  onUpdate: (id: string, patch: Partial<ServiceNodeData>) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState(nodeId);
  const [section, setSection] = useState<Section>('workload');
  const origin = nodes.find(n => n.id === nodeId)!;
  const originConfig = eksConfiguration(origin.data);
  const members = nodes.filter(n => n.data.serviceId === 'eks' && (n.id === nodeId || (originConfig.clusterName && eksConfiguration(n.data).clusterName === originConfig.clusterName)));
  const selected = members.find(n => n.id === selectedId) ?? origin;
  const c = eksConfiguration(selected.data);
  const update = (patch: Partial<EksConfiguration>) => onUpdate(selected.id, { customConfig: { ...selected.data.customConfig, eks: { ...selected.data.customConfig?.eks, ...patch } } });
  const choose = (id: string, part: Section) => { setSelectedId(id); setSection(part); };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; dialog.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  const text = (label: string, key: 'clusterName' | 'namespace' | 'workloadName' | 'serviceSelector' | 'podLabel' | 'image') => <label className="block text-xs font-medium text-slate-600">{label}<input className={input} value={c[key]} onChange={e => update({ [key]: e.target.value })} /></label>;
  const number = (label: string, key: 'desiredReplicas' | 'runningPods' | 'readyPods' | 'servicePort' | 'containerPort' | 'nodeCount' | 'cpuRequestMilli' | 'observedCpuPercent' | 'targetCpuPercent' | 'minReplicas' | 'maxReplicas') => <label className="block text-xs font-medium text-slate-600">{label}<input className={input} type="number" min="0" value={c[key]} onChange={e => update({ [key]: Number(e.target.value) })} /></label>;
  const check = (label: string, key: 'controlPlaneAvailable' | 'fargateProfileMatches' | 'hpaEnabled' | 'metricsAvailable') => <label className="flex gap-2 text-sm text-slate-700"><input type="checkbox" checked={c[key]} onChange={e => update({ [key]: e.target.checked })} />{label}</label>;
  const recommendation = recommendEksReplicas(selected.data);
  const titles = { cluster: 'Cluster & control plane', workload: 'Deployment & pod snapshot', service: 'Kubernetes Service', compute: 'Compute capacity', hpa: 'Horizontal Pod Autoscaler', container: 'Container blueprint' };
  const links = edges.filter(e => e.source === selected.id || e.target === selected.id);
  return createPortal(<div className="fixed inset-0 z-[11000] bg-slate-950/40 p-2 sm:p-4 flex justify-center items-center" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="eks-title" tabIndex={-1} className="overlay-text w-full max-w-7xl h-[92dvh] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-xl outline-none" onKeyDown={e => {
      e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'Tab') {
        const items = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]');
        if (!items?.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { e.preventDefault(); first.focus(); }
      }
    }}>
      <header className="flex items-center justify-between gap-4 px-5 h-12 shrink-0 border-b border-slate-200"><div className="flex items-baseline gap-2 min-w-0"><h2 id="eks-title" className="text-sm font-semibold text-slate-900 truncate">{origin.data.label}</h2><span className="text-xs text-slate-500 truncate">Amazon EKS</span></div><button type="button" className="p-1.5 -mr-1.5 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100" aria-label="Close EKS explorer" onClick={onClose}><X className="w-4 h-4" /></button></header>
      <div className="flex-1 min-h-0 grid lg:grid-cols-[minmax(0,1fr)_360px] overflow-y-auto lg:overflow-hidden">
        <main className="min-w-0 p-5 bg-slate-50 lg:overflow-y-auto space-y-3">
          <section aria-label="EKS cluster boundary" className="border border-slate-300 rounded-lg overflow-hidden bg-white">
            <button className="w-full px-4 py-2.5 border-b border-slate-200 text-left text-sm font-semibold hover:bg-slate-50 focus-visible:outline-circuit-600" onClick={() => choose(origin.id, 'cluster')}>{originConfig.clusterName || 'Cluster · unnamed'}</button>
            <div className="p-4 space-y-3">
              <button className={`${button} w-full text-left`} onClick={() => choose(selected.id, 'cluster')}>AWS-managed control plane<span className="block text-xs text-slate-500 mt-0.5">API server · scheduler · controllers · management only</span></button>
              {members.filter(n => eksConfiguration(n.data).kind === 'workload').map(n => {
                const w = eksConfiguration(n.data); const ready = eksReadyEndpoints(n.data);
                const shown = Number.isFinite(w.runningPods) ? Math.min(8, Math.max(0, Math.floor(w.runningPods))) : 0;
                return <section key={n.id} aria-label={`EKS namespace boundary: ${w.namespace}`} className={`border rounded-md p-3 space-y-3 ${selected.id === n.id ? 'border-slate-500' : 'border-slate-200'}`}>
                  <p className="text-xs font-medium text-slate-500">Namespace: {w.namespace}</p>
                  <button className={`${button} w-full text-left`} onClick={() => choose(n.id, 'workload')}>Deployment: {w.workloadName}<span className="block text-xs text-slate-500 mt-0.5">{w.desiredReplicas} desired · {w.runningPods} observed running · {w.readyPods} observed Ready</span></button>
                  <button className={`${button} w-full text-left`} onClick={() => choose(n.id, 'service')}>Service ({w.serviceType}) · {ready} eligible endpoints<span className="block text-xs text-slate-500 mt-0.5">Selector {w.serviceSelector || '(empty)'} → pod label {w.podLabel || '(empty)'} · port {w.servicePort} → targetPort {w.containerPort}</span></button>
                  <ArrowDown size={16} className="mx-auto text-slate-400" aria-hidden="true" />
                  <div className="grid sm:grid-cols-2 gap-3">{Array.from({ length: shown }, (_, i) => <section key={i} aria-label={`EKS pod snapshot ${i + 1}`} className="border border-slate-200 rounded-md p-2 space-y-2"><button onClick={() => choose(n.id, 'workload')} className={`${button} w-full text-left`}>Pod {i + 1} · {i < w.readyPods ? 'Ready' : 'Not Ready'}</button><button className={`${button} w-full text-left border-dashed`} onClick={() => choose(n.id, 'container')}>Container<span className="block mt-0.5 text-xs break-all text-slate-500">{w.image || 'Image not specified'}</span></button></section>)}</div>
                  {shown === 0 && <p className="text-sm text-slate-500">No observed running pods. Desired replicas do not prove pods have started.</p>}
                  {w.runningPods > 8 && <p className={note}>Showing 8 of {w.runningPods} pod snapshots.</p>}
                  <div><button className={`${button} text-left`} onClick={() => choose(n.id, 'hpa')}>HPA · {w.hpaEnabled ? 'Configured' : 'Not configured'}</button></div>
                </section>;
              })}
              <section aria-label="EKS compute references" className="border border-slate-200 rounded-md p-3 space-y-2">
                <p className="text-xs font-medium text-slate-500">Cluster compute · not namespace resources</p>
                {members.filter(n => eksConfiguration(n.data).kind === 'workload').map(n => {
                  const w = eksConfiguration(n.data);
                  return <button key={n.id} className={`${button} w-full text-left`} onClick={() => choose(n.id, 'compute')}>{w.compute === 'FARGATE' ? 'Fargate pod compute' : `EC2 node group · ${w.nodeCount} nodes`}<span className="block text-xs text-slate-500 mt-0.5">{w.workloadName} · annotation only</span></button>;
                })}
              </section>
              {c.kind === 'control-plane' && !members.some(n => eksConfiguration(n.data).kind === 'workload') && <p className="text-sm text-slate-500">Control-plane reference. Workloads with the same cluster name appear here.</p>}
            </div>
          </section>
          <p className={note}>Partial simulation: only Service selectors and Ready endpoints affect requests. Pods are aggregate illustrations; cluster names do not create a real cluster.</p>
        </main>
        <aside aria-label="EKS component details" className="p-5 border-t lg:border-t-0 lg:border-l border-slate-200 lg:overflow-y-auto space-y-4">
          <h3 className="font-semibold text-sm">{titles[section]}</h3>
          {section === 'cluster' && <>{text('Cluster name', 'clusterName')}<label className="block text-xs font-medium text-slate-600">Canvas representation<select className={input} value={c.kind} onChange={e => update({ kind: e.target.value as EksConfiguration['kind'] })}><option value="workload">Workload Service snapshot</option><option value="control-plane">Control-plane reference</option></select></label>{check('Control plane available for reconciliation', 'controlPlaneAvailable')}<p className={note}>Ready pods may keep serving while the API is unavailable; desired-state changes need reconciliation.</p><a className={docLink} href="https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-concepts.html" target="_blank" rel="noreferrer">AWS: EKS components</a></>}
          {section === 'workload' && <>{text('Cluster name', 'clusterName')}{text('Namespace', 'namespace')}{text('Deployment name', 'workloadName')}{number('Desired replicas', 'desiredReplicas')}{number('Observed running pods', 'runningPods')}{number('Observed Ready pods', 'readyPods')}<p className={note}>Desired state does not change observed state. Running does not imply Ready.</p><button className={action} onClick={() => update({ readyPods: 0 })}>Make all pods Not Ready</button></>}
          {section === 'service' && <>{text('Service selector (single label value)', 'serviceSelector')}{text('Pod label (single label value)', 'podLabel')}{number('Service port', 'servicePort')}{number('Container / target port', 'containerPort')}<label className="block text-xs font-medium text-slate-600">Service type<select className={input} value={c.serviceType} onChange={e => update({ serviceType: e.target.value as EksConfiguration['serviceType'] })}><option>ClusterIP</option><option>NodePort</option><option>LoadBalancer</option></select></label><p className={note}>Matches one label value and counts Ready endpoints. LoadBalancer does not provision an ALB/NLB; DNS, kube-proxy and NetworkPolicy are not modeled.</p><a className={docLink} href="https://kubernetes.io/docs/concepts/services-networking/service/" target="_blank" rel="noreferrer">Kubernetes: Services and endpoints</a></>}
          {section === 'compute' && <><label className="block text-xs font-medium text-slate-600">Compute<select className={input} value={c.compute} onChange={e => update({ compute: e.target.value as EksConfiguration['compute'] })}><option value="EC2">EC2 managed node group</option><option value="FARGATE">Fargate</option></select></label>{c.compute === 'EC2' ? <>{number('Observed node count (annotation)', 'nodeCount')}<label className="block text-xs font-medium text-slate-600">Node autoscaler (annotation)<select className={input} value={c.nodeAutoscaler} onChange={e => update({ nodeAutoscaler: e.target.value as EksConfiguration['nodeAutoscaler'] })}><option value="NONE">None</option><option value="CLUSTER_AUTOSCALER">Cluster Autoscaler</option><option value="KARPENTER">Karpenter</option><option value="AUTO_MODE">EKS Auto Mode</option></select></label></> : <>{check('Fargate profile matches namespace / labels (annotation)', 'fargateProfileMatches')}<p className={note}>New pods need a matching Fargate profile; profiles are not evaluated.</p></>}<p className={note}>Descriptive only; scheduling, taints, node health and placement are not modeled.</p><a className={docLink} href="https://docs.aws.amazon.com/eks/latest/userguide/autoscaling.html" target="_blank" rel="noreferrer">AWS: compute scaling</a></>}
          {section === 'container' && <>{text('Container image URI', 'image')}{number('CPU request (millicores)', 'cpuRequestMilli')}<p className={note}>Blueprint only; image pulls, secrets, volumes and startup are not executed.</p></>}
          {section === 'hpa' && <>{check('HPA configured', 'hpaEnabled')}{check('Pod CPU metrics available', 'metricsAvailable')}{number('Observed CPU utilization (% of CPU requests)', 'observedCpuPercent')}{number('CPU request (millicores)', 'cpuRequestMilli')}{number('Target CPU utilization (%)', 'targetCpuPercent')}{number('Minimum replicas', 'minReplicas')}{number('Maximum replicas', 'maxReplicas')}<p role="status" className="text-sm text-slate-700">{recommendation.reason}</p><button className={`${action} disabled:opacity-40`} disabled={recommendation.replicas === null || c.kind !== 'workload'} onClick={() => { if (recommendation.replicas !== null) update({ desiredReplicas: recommendation.replicas }); }}>Apply estimate to desired replicas</button><p className={note}>Basic estimate; real HPA tolerance and stabilization are not modeled.</p><a className={docLink} href="https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/" target="_blank" rel="noreferrer">Kubernetes: HPA algorithm</a></>}
          {validateEks(selected.data).length > 0 && <div role="alert" className="text-sm text-rose-700 space-y-1">{validateEks(selected.data).map(i => <p key={i.field}>{i.message}</p>)}</div>}
          <section className="border-t border-slate-200 pt-3 space-y-1"><h4 className="text-xs font-semibold text-slate-600">Connections</h4>{links.length === 0 && <p className="text-xs text-slate-500">No connections.</p>}{links.map(e => <p key={e.id} className="text-sm py-1.5 border-b border-slate-100">{e.source === selected.id ? 'To ' : 'From '}{nodes.find(n => n.id === (e.source === selected.id ? e.target : e.source))?.data.label || 'Missing resource'}</p>)}</section>
        </aside>
      </div>
    </div>
  </div>, document.body);
}
