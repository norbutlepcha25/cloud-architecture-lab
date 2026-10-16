import { track } from '../../analytics/analytics.ts';
import React, { useState } from 'react';
import { ExternalLink, Download } from 'lucide-react';
import { COURSE_LABS } from '../../data/courseLabs.ts';
import { useArchitecture } from '../../context/ArchitectureContext.tsx';
import { saveJsonFile } from '../../utils/saveJson.ts';
import { Modal, modalButton } from '../ui/Modal.tsx';

export function LabsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [selected, setSelected] = useState(COURSE_LABS[0].id);
  const [message, setMessage] = useState('');
  const { openLabReference } = useArchitecture();
  const lab = COURSE_LABS.find(item => item.id === selected)!;
  return <Modal isOpen={isOpen} onClose={onClose} title="DSO303 Labs" size="xl" closeLabel="Close labs" flush>
    <div className="flex flex-col md:flex-row min-h-full">
      <nav aria-label="Course labs" className="md:w-60 shrink-0 p-2 border-b md:border-b-0 md:border-r border-slate-200 space-y-0.5">
        {COURSE_LABS.map(item => <button key={item.id} aria-current={selected === item.id ? 'page' : undefined} onClick={() => setSelected(item.id)}
          className={`w-full text-left rounded-md px-3 py-2 text-xs ${selected === item.id ? 'bg-slate-100 text-slate-900 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>Lab {item.number} · {item.title}</button>)}
      </nav>
      <section className="p-5 flex-1 min-w-0 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-base font-semibold">Lab {lab.number}: {lab.title}</h3>
          <a href={lab.sourceUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900">Instructions <ExternalLink size={12}/></a>
        </div>
        <ul className="list-disc pl-5 text-sm text-slate-600 space-y-1">{lab.objectives.map(text => <li key={text}>{text}</li>)}</ul>
        <p className="text-xs text-slate-500"><span className="font-medium text-slate-700">Scope:</span> {lab.limitations}</p>
        <div className="divide-y divide-slate-200 border-y border-slate-200">{lab.references.map(reference => <article key={reference.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium">{reference.title}</h4>
            <p className="text-xs text-slate-500 mt-0.5">{reference.description}</p>
            <p className="text-xs text-slate-500 mt-0.5">Expected: {reference.expected}</p>
          </div>
          <div className="flex gap-2 items-center shrink-0">
            <button className={modalButton.secondary} title="Replaces the current canvas" onClick={() => { openLabReference(reference); onClose(); }}>Load reference</button>
            <button className={modalButton.primary} onClick={() => { openLabReference(reference, true); onClose(); }}>{reference.configurationChecks ? 'Check reference configuration' : 'Run reference simulation'}</button>
            <button className="p-1.5 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100" aria-label={`Download lab reference ${reference.title}`} title="Download JSON"
              onClick={async () => { try { if (await saveJsonFile(JSON.stringify(reference, null, 2), `${String(lab.number).padStart(2, '0')}-${reference.id}.json`, true)) track('diagram_saved', { format: 'lab', lab_id: reference.id, reference_id: undefined }); } catch (error) { setMessage(String(error)); } }}>
              <Download size={14} />
            </button>
          </div>
        </article>)}</div>
        {message && <p role="status" className="text-xs text-slate-600">{message}</p>}
      </section>
    </div>
  </Modal>;
}
