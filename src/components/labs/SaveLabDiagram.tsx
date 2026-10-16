import { track } from '../../analytics/analytics.ts';
import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { useArchitecture } from '../../context/ArchitectureContext.tsx';
import { COURSE_LABS } from '../../data/courseLabs.ts';
import { labSnapshot } from '../../engine/persistence/labs.ts';
import { draftFilename } from '../../engine/persistence/draft.ts';
import { saveJsonFile } from '../../utils/saveJson.ts';

export function SaveLabDiagram() {
  const { activeLabReference, nodes, edges, scenario } = useArchitecture();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!message || busy) return;
    const timer = window.setTimeout(() => setMessage(''), 6000);
    return () => window.clearTimeout(timer);
  }, [message, busy]);
  if (!activeLabReference) return null;
  return <div className="relative">
    <button disabled={busy} onClick={async () => {
      setMessage('');
      setBusy(true);
      try {
        const snapshot = labSnapshot(activeLabReference, nodes, edges, scenario);
        const course = COURSE_LABS.find(lab => lab.references.some(ref => ref.id === snapshot.id));
        const filename = draftFilename(`${course ? `${String(course.number).padStart(2, '0')}-` : ''}${snapshot.id}`);
        const saved = await saveJsonFile(JSON.stringify(snapshot, null, 2), filename, true);
        if (saved) track('diagram_saved', { format: 'lab' });
        setMessage(saved ? `Lab diagram exported as ${filename}. Replace the matching file in src/data/labs/ and run npm run labs:sync.`
          + (scenario.startNodeId && !snapshot.scenario.startNodeId ? ' The removed request start node was cleared; choose a start component before simulating.' : '')
          : 'File save cancelled. Your canvas edits are still available.');
      } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
      finally { setBusy(false); }
    }} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200">
      <Save size={14} />{busy ? 'Saving…' : 'Save lab diagram'}
    </button>
    {message && <p role="status" className="absolute top-full left-0 mt-2 w-80 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-lg dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200">{message}</p>}
  </div>;
}
