import { track } from '../../analytics/analytics.ts';
import { Download, Upload, HardDrive } from 'lucide-react';
import { saveJsonFile } from '../../utils/saveJson.ts';
import React, { useRef, useState } from 'react';
import { useArchitecture } from '../../context/ArchitectureContext.tsx';
import { DRAFT_KEY, draftFilename } from '../../engine/persistence/draft.ts';

export function DraftControls() {
  const { exportDraft, importDraft, draftName, setDraftName } = useArchitecture();
  const file = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const canChooseLocation = typeof (window as any).showSaveFilePicker === 'function';
  const [location, setLocation] = useState(canChooseLocation ? 'choose' : 'downloads');
  const [saving, setSaving] = useState(false);
  const download = async () => {
    setSaving(true);
    try {
      const filename = draftFilename(draftName);
      const text = exportDraft();
      if (await saveJsonFile(text, filename, location === 'choose')) { track('diagram_saved', { format: 'draft' }); setMessage(`Saved ${filename}.`); }
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') setMessage(error instanceof Error ? error.message : 'Could not save draft.');
    } finally { setSaving(false); }
  };
  const attempt = (action: () => void) => {
    try { action(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Draft operation failed.'); }
  };
  const restore = (text: string) => {
    if (!window.confirm('Replace the current workspace with this draft? Save or download current work first if needed.')) return;
    importDraft(text); setMessage('Draft restored. Simulation playback is paused.');
  };
  const buttonStyle = 'inline-flex justify-center items-center gap-2 min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-circuit-600';
  const field = 'mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-circuit-600 focus:outline-circuit-600';
  return <div className="space-y-6 text-sm text-slate-700">
    <section className="space-y-4" aria-label="JSON workspace file">
      <label className="block font-medium text-slate-900">Draft name<input className={field} value={draftName} maxLength={120} placeholder="Untitled draft" onChange={event => setDraftName(event.target.value)} /></label>
      <p className="text-xs text-slate-500 -mt-2">File: {draftFilename(draftName)}</p>
      <label className="block font-medium text-slate-900">Save location<select className={field} value={location} onChange={e => setLocation(e.target.value)}>
        {canChooseLocation && <option value="choose">Choose folder and filename…</option>}
        <option value="downloads">Browser download location</option>
      </select></label>
      {!canChooseLocation && <p className="text-xs leading-relaxed text-slate-500">Your browser controls the folder. Enable “Ask where to save” in browser settings to choose a location each time.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button className="inline-flex justify-center items-center gap-2 min-h-11 rounded-lg bg-circuit-600 hover:bg-circuit-700 px-4 py-2 text-white font-semibold disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-circuit-600" disabled={saving} onClick={download}><Download size={17} />{saving ? 'Saving…' : 'Download JSON'}</button>
        <button className={buttonStyle} onClick={() => file.current?.click()}><Upload size={17} />Upload JSON</button>
      </div>
    </section>
    <section className="border-t border-slate-200 pt-5 space-y-3" aria-label="Browser draft">
      <div className="flex gap-2 items-center font-medium text-slate-900"><HardDrive size={17} />Keep a draft on this device</div>
      <p className="text-xs text-slate-500">One saved draft in this browser. Download a JSON copy to share it or keep a backup.</p>
      <div className="flex gap-3">
        <button className={buttonStyle} onClick={() => attempt(() => {
          const text = exportDraft();
          if (localStorage.getItem(DRAFT_KEY) && !window.confirm('Replace the previously saved browser draft?')) return;
          localStorage.setItem(DRAFT_KEY, text); setMessage('Draft saved in this browser.');
        })}>Save draft</button>
        <button className={buttonStyle} onClick={() => attempt(() => {
          const text = localStorage.getItem(DRAFT_KEY);
          if (!text) throw new Error('No draft saved in this browser yet.');
          restore(text);
        })}>Resume draft</button>
      </div>
    </section>
    <input ref={file} hidden type="file" accept=".json,application/json" aria-label="Upload draft JSON file" onChange={async event => {
      const selected = event.target.files?.[0]; event.target.value = '';
      if (!selected) return;
      if (selected.size > 20_000_000) { setMessage('Draft exceeds the 20 MB import limit.'); return; }
      try { const text = await selected.text(); attempt(() => restore(text)); }
      catch { setMessage('Could not read the selected file.'); }
    }} />
    {message && <p role="status" className="rounded-lg bg-slate-100 border border-slate-200 p-3 text-sm text-slate-700">{message}</p>}
  </div>;
}
