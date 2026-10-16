import React, { useEffect, useRef, useState } from 'react';
import { Layers } from 'lucide-react';
import type { Node } from '@xyflow/react';
import { SERVICE_MAP } from '../../data/serviceCatalog.ts';

export function canvasLayerKey(node: Node): string {
  return node.type === 'boundaryNode' || node.type === 'asgMembershipFrame'
    ? `boundary:${node.data.boundaryType || 'vpc'}`
    : `service:${node.data.serviceId || node.type || 'other'}`;
}

export function CanvasLayers({ nodes, hidden, onChange }: {
  nodes: Node[];
  hidden: Set<string>;
  onChange: (hidden: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof globalThis.Node && !containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOutside, true);
    return () => document.removeEventListener('pointerdown', closeOutside, true);
  }, [open]);
  const layers = new Map<string, { name: string; count: number }>();
  for (const node of nodes) {
    const key = canvasLayerKey(node);
    const name = node.type === 'asgMembershipFrame' ? 'ASG membership' : node.type === 'boundaryNode'
      ? String(node.data.boundaryType || 'vpc').replace(/_/g, ' ').replace(/\b(vpc|az)\b/g, s => s.toUpperCase())
      : SERVICE_MAP[String(node.data.serviceId)]?.name || String(node.data.serviceId || 'Other');
    layers.set(key, { name, count: (layers.get(key)?.count || 0) + 1 });
  }
  return <div ref={containerRef} className="relative" onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}>
    <button type="button" aria-expanded={open} aria-controls="canvas-layers" onClick={() => setOpen(!open)}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200">
      <Layers className="w-3.5 h-3.5" /> Layers
      {hidden.size > 0 && <span className="text-slate-400">· {hidden.size} hidden</span>}
    </button>
    {open && <div id="canvas-layers" className="absolute top-full right-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 nowheel nodrag nopan">
      <div className="flex justify-between items-center mb-2">
        <strong className="text-sm font-semibold" title="Visibility only. Hidden boundaries keep their resources and behavior.">Layers</strong>
        <button type="button" onClick={() => onChange(new Set())} className="text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400">Show all</button>
      </div>
      <div className="max-h-72 overflow-y-auto">
        {Array.from(layers).map(([key, layer]) => <label key={key} className="flex items-center gap-2 py-1.5 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
          <input type="checkbox" checked={!hidden.has(key)} onChange={() => {
            const next = new Set(hidden);
            if (next.has(key)) next.delete(key); else next.add(key);
            onChange(next);
          }} />
          <span className="capitalize flex-1">{layer.name}</span><span className="text-xs text-slate-400">{layer.count}</span>
        </label>)}
        {layers.size === 0 && <p className="text-xs text-slate-500">Add components to see their layers.</p>}
      </div>
    </div>}
  </div>;
}
