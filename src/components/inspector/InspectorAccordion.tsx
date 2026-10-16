import React, { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/** Keep local form/experiment state while collapsed; hidden content is removed from tab order. */
export function InspectorAccordion({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
    <h4>
      <button type="button" aria-expanded={open} aria-controls={`${id}-content`} id={`${id}-heading`}
        onClick={() => setOpen(value => !value)}
        className="w-full min-h-11 flex items-center justify-between gap-3 px-3 py-2 text-left text-xs font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-circuit-600 focus-visible:outline-offset-[-2px]">
        {title}<ChevronDown size={16} aria-hidden="true" className={`shrink-0 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
      </button>
    </h4>
    <div id={`${id}-content`} aria-labelledby={`${id}-heading`} hidden={!open} className="p-3 border-t border-slate-200 space-y-3">
      {children}
    </div>
  </section>;
}
