import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import { STRAY_REASON_TEXT, type StrayComponent } from '../../engine/analysis/strayComponents.ts';

/** Compact canvas notice listing components that take no part in the architecture. */
export function StrayNotice({ items, onFocus }: { items: StrayComponent[]; onFocus: (nodeId: string) => void }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (event.target instanceof globalThis.Node && !container.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close, true);
    return () => document.removeEventListener('pointerdown', close, true);
  }, [open]);
  const count = items.length;
  return <div ref={container} className="relative nowheel nodrag nopan" onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}>
    <button type="button" aria-expanded={open} aria-controls="stray-components" onClick={() => setOpen(!open)}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-300 bg-white text-xs font-medium text-amber-800 shadow-xs hover:bg-amber-50 dark:bg-slate-900 dark:border-amber-700 dark:text-amber-300">
      <AlertTriangle className="w-3.5 h-3.5" />
      {count} stray component{count === 1 ? '' : 's'}
      <ChevronDown className="w-3.5 h-3.5 opacity-60" />
    </button>
    {open && <div id="stray-components" role="region" aria-label="Stray components"
      className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:bg-slate-900 dark:border-slate-700">
      <p className="px-2.5 pt-1.5 pb-1 text-[11px] text-slate-500 dark:text-slate-400">Not used by any request or dependency.</p>
      <ul className="max-h-64 overflow-y-auto">
        {items.map(item => <li key={item.nodeId}>
          <button type="button" onClick={() => { onFocus(item.nodeId); setOpen(false); }}
            className="w-full text-left rounded-md px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
            <span className="block text-xs font-medium text-slate-900 dark:text-slate-100 truncate">{item.label}</span>
            <span className="block text-[11px] text-amber-700 dark:text-amber-300">{item.reasons.map(reason => STRAY_REASON_TEXT[reason]).join(' · ')}</span>
          </button>
        </li>)}
      </ul>
    </div>}
  </div>;
}
