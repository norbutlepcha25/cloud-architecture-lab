import { track } from '../../analytics/analytics.ts';
import React, { useEffect, useRef, useState } from 'react';
import { FolderOpen, Download, Save } from 'lucide-react';
import { useArchitecture } from '../../context/ArchitectureContext.tsx';
import { REFERENCE_ARCHITECTURES, type ReferenceArchitecture } from '../../data/referenceArchitectures.ts';
import { referenceSnapshot, readReferenceLibrary, saveReference } from '../../engine/persistence/references.ts';
import { draftFilename } from '../../engine/persistence/draft.ts';
import { saveJsonFile } from '../../utils/saveJson.ts';

export function ReferenceLibrary() {
  const { nodes, edges, scenario, draftName, loadTemplate } = useArchitecture();
  const panel = useRef<HTMLDetailsElement>(null);
  const [saved, setSaved] = useState<ReferenceArchitecture[]>([]);
  const [name, setName] = useState(''); const [search, setSearch] = useState('');
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!message || busy) return;
    const timer = window.setTimeout(() => setMessage(''), 6000);
    return () => window.clearTimeout(timer);
  }, [message, busy]);
  const button = 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-circuit-600';
  const iconButton = 'p-1.5 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 focus-visible:outline-circuit-600';
  const references = [...REFERENCE_ARCHITECTURES.map(ref => saved.find(item => item.id === ref.id) ?? ref),
    ...saved.filter(ref => !REFERENCE_ARCHITECTURES.some(item => item.id === ref.id))];
  const load = (ref: ReferenceArchitecture) => {
    if (!window.confirm(`Load “${ref.name}” and replace the canvas? Save current work first if needed.`)) return;
    loadTemplate(ref.id, ref); if (panel.current) panel.current.open = false;
  };
  return <details ref={panel} className="relative" onToggle={() => { if (panel.current?.open) { try { setSaved(readReferenceLibrary(localStorage)); setName(draftName || 'My architecture'); } catch (error) { setMessage(String(error)); } } }}>
    <summary className="list-none cursor-pointer flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"><FolderOpen size={14} />References</summary>
    <section aria-label="Reference diagram library" className="absolute top-full left-0 mt-2 w-[min(420px,85vw)] max-h-[75dvh] overflow-y-auto rounded-xl bg-white border border-slate-200 shadow-xl p-3 text-slate-900 space-y-3" onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape' && panel.current) panel.current.open = false; }}>
      <h3 className="text-sm font-semibold">Reference diagrams</h3>
      <input aria-label="Search reference diagrams" className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:border-slate-400" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
      <div className="max-h-64 overflow-auto divide-y divide-slate-100">{references.filter(r => `${r.name} ${r.category}`.toLowerCase().includes(search.toLowerCase())).map(ref => <div key={ref.id} className="flex items-center gap-2 py-2">
        <button className="flex-1 text-left rounded hover:bg-slate-50 p-1" onClick={() => load(ref)}><span className="block text-xs font-semibold">{ref.name}</span><span className="block text-[11px] text-slate-500">{ref.category}{saved.some(r => r.id === ref.id) ? ' · Saved in this browser' : ''}</span></button>
        <button className={iconButton} title="Download JSON" aria-label={`Download reference ${ref.name}`} onClick={async () => { try { if (await saveJsonFile(JSON.stringify(ref, null, 2), draftFilename(ref.name), true)) track('diagram_saved', { format: 'reference', reference_id: REFERENCE_ARCHITECTURES.some(item => item.id === ref.id) ? ref.id : 'custom', lab_id: undefined }); } catch (error) { setMessage(String(error)); } }}><Download size={14} /></button>
      </div>)}</div>
      <div className="border-t border-slate-200 pt-3 space-y-2"><label className="block text-xs font-medium text-slate-600">Reference name<input className="block w-full border border-slate-200 rounded-md px-2.5 py-1.5 mt-1 text-xs focus:outline-none focus:border-slate-400" maxLength={120} value={name} onChange={e => setName(e.target.value)} /></label>
        <div className="flex gap-2"><button disabled={busy || !name.trim()} className={button} onClick={async () => {
          setMessage('');
          setBusy(true);
          try {
            // Saving under the loaded reference's name preserves its repository identity
            // and teaching metadata. A new name creates a separate reference.
            const existing = name.trim() === draftName ? references.find(ref => ref.name === draftName) : undefined;
            const clearedStart = Boolean(scenario.startNodeId && !nodes.some(node => node.id === scenario.startNodeId));
            const ref = referenceSnapshot({ id: `custom-${crypto.randomUUID()}`, category: 'My references', difficulty: 'Beginner', description: 'User-created architecture snapshot.', learningOutcome: '', ...existing, name: name.trim(), nodes, edges, scenario });
            let stored = true;
            try { setSaved(saveReference(localStorage, ref)); } catch { stored = false; }
            setMessage('Saving reference file…');
            const downloaded = await saveJsonFile(JSON.stringify(ref, null, 2), draftFilename(ref.name), true);
            if (downloaded) track('diagram_saved', { format: 'reference' });
            setMessage((downloaded ? `Reference JSON exported.${stored ? ' A copy is also saved in this browser.' : ' Browser storage was unavailable.'}` : stored ? 'Saved in this browser. File save cancelled; use the download button later.' : 'File save cancelled. Browser storage was unavailable; no reference was saved.')
              + (clearedStart ? ' The removed request start node was cleared; choose a start component before simulating.' : ''));
          } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); }
        }}><Save size={14} />{busy ? 'Saving…' : 'Save as reference'}</button></div>
      </div>
      {message && <p role="status" className="text-xs text-slate-600">{message}</p>}
    </section>
  </details>;
}
