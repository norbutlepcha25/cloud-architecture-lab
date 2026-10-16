import React, { useState } from 'react';
import { PanelRightClose, PanelRightOpen, Maximize2, Minimize2 } from 'lucide-react';

type Mode = 'normal' | 'wide' | 'collapsed';
const KEY = 'cal:right-panel-mode';

function initialMode(): Mode {
  try { const v = localStorage.getItem(KEY); return v === 'wide' || v === 'collapsed' ? v : 'normal'; } catch { return 'normal'; }
}

/** Collapsible, widenable shell for the right-hand inspector column. Layout only. */
export function RightPanel({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<Mode>(initialMode);
  const setMode = (next: Mode) => { setModeState(next); try { localStorage.setItem(KEY, next); } catch { /* storage unavailable */ } };
  const collapsed = mode === 'collapsed';
  const button = 'w-8 h-8 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-circuit-600';
  return <div className="flex h-full shrink-0 border-l border-slate-200 bg-white">
    <div className="w-10 shrink-0 flex flex-col items-center gap-1 py-2 border-r border-slate-100">
      <button type="button" className={button} aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand details panel' : 'Collapse details panel'} title={collapsed ? 'Expand details panel' : 'Collapse details panel'}
        onClick={() => setMode(collapsed ? 'normal' : 'collapsed')}>
        {collapsed ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
      </button>
      {!collapsed && <button type="button" className={button}
        aria-label={mode === 'wide' ? 'Narrow details panel' : 'Widen details panel'} title={mode === 'wide' ? 'Narrow details panel' : 'Widen details panel'}
        onClick={() => setMode(mode === 'wide' ? 'normal' : 'wide')}>
        {mode === 'wide' ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
      </button>}
    </div>
    <div hidden={collapsed} className={`${collapsed ? 'hidden' : 'flex'} h-full [&>aside]:border-l-0 [&>aside]:shadow-none ${mode === 'wide' ? '[&>aside]:w-[520px]' : ''}`}>
      {children}
    </div>
  </div>;
}
