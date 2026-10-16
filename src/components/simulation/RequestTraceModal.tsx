import React from 'react';
import { useArchitecture } from '../../context/ArchitectureContext.tsx';
import { Modal } from '../ui/Modal.tsx';

interface RequestTraceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DECISION_COLOR: Record<string, string> = {
  ALLOW: 'text-emerald-700',
  SUCCESS: 'text-emerald-700',
  DENY: 'text-rose-700',
  FAILURE: 'text-rose-700'
};

/**
 * Renders the Phase 11 explainable AWS decision trace (`engine/trace/`) for the current
 * `simulationResult` - request path, decision points, and the AWS rule/reason behind each one.
 * Purely a display of the `RequestTrace` data the engine already computed; no AWS semantics are
 * decided here.
 */
export const RequestTraceModal: React.FC<RequestTraceModalProps> = ({ isOpen, onClose }) => {
  const { requestTrace, simulationResult } = useArchitecture();
  const ready = Boolean(requestTrace && simulationResult);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Decision trace"
      meta={ready ? <span className={DECISION_COLOR[requestTrace!.final] || ''}>{requestTrace!.final}</span> : undefined}
    >
      {!ready ? (
        <p className="py-8 text-center text-xs text-slate-500">No request yet.</p>
      ) : (
        <>
          <ol className="divide-y divide-slate-100">
            {requestTrace!.entries.map(entry => (
              <li key={entry.order} className="py-2.5 grid grid-cols-[1.5rem_1fr_auto] gap-x-2">
                <span className="text-xs font-mono text-slate-400">{entry.order}</span>
                <div className="min-w-0 space-y-0.5">
                  <div className="text-xs font-medium text-slate-900">
                    {entry.component}
                    {entry.resource !== 'N/A' && <span className="text-slate-500 font-normal"> · {entry.resource}</span>}
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{entry.reason}</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{entry.awsRule}</p>
                </div>
                <span className={`text-[11px] font-mono font-semibold ${DECISION_COLOR[entry.decision] || 'text-slate-500'}`}>{entry.decision}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 pt-3 border-t border-slate-200 text-xs">
            <span className={`font-semibold ${DECISION_COLOR[requestTrace!.final] || ''}`}>{requestTrace!.final}</span>
            <span className="text-slate-600"> · {requestTrace!.why}</span>
          </p>
        </>
      )}
    </Modal>
  );
};
