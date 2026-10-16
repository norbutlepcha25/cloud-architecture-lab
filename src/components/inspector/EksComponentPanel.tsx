import { InspectorAccordion } from './InspectorAccordion.tsx';
import React from 'react';
import type { Node } from '@xyflow/react';
import { EKS_COMPONENTS, eksComponent } from '../../data/eksComponents.ts';
export function EksComponentPanel({ node, onLabel, onClose }: { node: Node<any>; onLabel: (label: string) => void; onClose: () => void }) {
  const info = EKS_COMPONENTS[eksComponent(node)!];
  return <aside aria-label="EKS control-plane component details" className="w-80 bg-white border-l border-slate-200 h-full shrink-0 overflow-y-auto p-4 space-y-4">
    <header className="flex justify-between gap-3"><h2 className="font-semibold">{info.title}</h2><button onClick={onClose} aria-label="Close component details">✕</button></header>
    <p className="text-xs rounded bg-circuit-50 p-2 text-circuit-800">{['cross-account-eni', 'kubelet', 'kube-proxy'].includes(eksComponent(node)!) ? 'Customer VPC · EKS networking / worker component' : 'Regional service · AWS-managed control plane'}</p>
    <InspectorAccordion key={`${node.id}-label`} title="Component label"><label className="block text-sm">Component label<input className="mt-2 block w-full border rounded p-2" value={node.data.label ?? info.title} onChange={e => onLabel(e.target.value)} /></label></InspectorAccordion>
    <InspectorAccordion key={`${node.id}-details`} title="Component behavior">
    <p className="text-sm">{info.description}</p>
    {info.notes.map(note => <p key={note} className="text-sm bg-slate-50 rounded p-3">{note}</p>)}
    <p className="text-xs text-slate-600">Use the side handles to draw supported management relationships. These lines do not carry application requests. Kubernetes API operations, consensus, scheduling and reconciliation are not executed by this simulator.</p>
    <a href="https://docs.aws.amazon.com/eks/latest/userguide/eks-architecture.html" className="text-sm underline text-circuit-700" target="_blank" rel="noreferrer">AWS EKS architecture</a>
    </InspectorAccordion>
  </aside>;
}
