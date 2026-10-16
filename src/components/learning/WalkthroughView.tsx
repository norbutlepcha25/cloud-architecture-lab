import React, { useEffect, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, RotateCcw } from 'lucide-react';
import type { Walkthrough } from '../../engine/explain/walkthrough.ts';

const STATUS_COLOR = { ok: 'text-emerald-700', fail: 'text-rose-700', wait: 'text-amber-700', info: 'text-slate-500' } as const;
const TOKEN_COLOR = { ok: 'bg-emerald-500', fail: 'bg-rose-500', wait: 'bg-amber-400', info: 'bg-slate-400' } as const;

/** Renders an engine-built walkthrough: lanes, a token on the current lane, and step details. */
export function WalkthroughView({ walkthrough, ariaLabel }: { walkthrough: Walkthrough; ariaLabel: string }) {
  const { lanes, frames } = walkthrough;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => { setIndex(0); setPlaying(false); }, [walkthrough]);
  useEffect(() => {
    if (!playing) return;
    if (index >= frames.length - 1) { setPlaying(false); return; }
    const timer = window.setTimeout(() => setIndex(i => i + 1), 1100);
    return () => window.clearTimeout(timer);
  }, [playing, index, frames.length]);
  const frame = frames[Math.min(index, frames.length - 1)];
  const control = 'inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-40';

  return <section aria-label={ariaLabel} className="space-y-4">
    <div className="flex items-baseline justify-between gap-3">
      <h3 className="text-sm font-semibold text-slate-900">{walkthrough.title}</h3>
      <span className="text-xs text-slate-500">{walkthrough.summary}</span>
    </div>

    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${lanes.length}, minmax(0, 1fr))` }}>
      {lanes.map(lane => {
        const active = frame?.lane === lane.id;
        return <div key={lane.id} className={`relative rounded-lg border px-3 py-3 min-h-20 transition-colors ${active ? 'border-slate-900 bg-white' : 'border-slate-200 bg-slate-50'}`}>
          <p className="text-xs font-medium text-slate-700 break-words">{lane.label}</p>
          {active && <span aria-hidden="true" className={`absolute right-2 top-2 h-3 w-3 rounded-full ${TOKEN_COLOR[frame.status]} motion-safe:animate-pulse`} />}
          {active && <p className={`mt-2 text-xs font-semibold ${STATUS_COLOR[frame.status]}`}>{frame.title}</p>}
        </div>;
      })}
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={control} onClick={() => { setPlaying(false); setIndex(i => Math.max(0, i - 1)); }} disabled={index === 0}><SkipBack className="w-3.5 h-3.5" />Previous step</button>
      <button type="button" className={control} onClick={() => { if (index >= frames.length - 1) setIndex(0); setPlaying(p => !p); }}>
        {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}{playing ? 'Stop' : 'Play'}
      </button>
      <button type="button" className={control} onClick={() => { setPlaying(false); setIndex(i => Math.min(frames.length - 1, i + 1)); }} disabled={index >= frames.length - 1}><SkipForward className="w-3.5 h-3.5" />Next step</button>
      <button type="button" className={control} onClick={() => { setPlaying(false); setIndex(0); }}><RotateCcw className="w-3.5 h-3.5" />Restart</button>
      <span className="text-xs text-slate-500 tabular-nums">Step {index + 1} of {frames.length}</span>
    </div>

    {frame && <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <p className={`text-sm font-semibold ${STATUS_COLOR[frame.status]}`}>{frame.title}</p>
        {frame.clock && <span className="text-xs font-mono text-slate-500">{frame.clock}</span>}
      </div>
      <p className="text-sm text-slate-700">{frame.detail}</p>
      {frame.source && <a className="text-xs text-slate-500 underline hover:text-slate-900" href={frame.source} target="_blank" rel="noreferrer">AWS documentation</a>}
    </div>}

    <ol className="space-y-1">
      {frames.map((f, i) => <li key={i}>
        <button type="button" onClick={() => { setPlaying(false); setIndex(i); }}
          className={`w-full text-left flex gap-2 rounded px-2 py-1 text-xs ${i === index ? 'bg-slate-100' : 'hover:bg-slate-50'}`}>
          <span className="tabular-nums text-slate-400 w-5">{i + 1}</span>
          <span className={`flex-1 ${STATUS_COLOR[f.status]}`}>{f.title}</span>
          <span className="text-slate-400">{lanes.find(l => l.id === f.lane)?.label}</span>
        </button>
      </li>)}
    </ol>
  </section>;
}
