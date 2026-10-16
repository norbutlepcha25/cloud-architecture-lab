import React from 'react';
import { useArchitecture } from '../../context/ArchitectureContext.tsx';
import { STUDENT_CHALLENGES } from '../../data/studentChallenges.ts';
import { Play, RotateCcw } from 'lucide-react';
import { Modal, modalButton } from '../ui/Modal.tsx';

interface ChallengeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChallengeModal: React.FC<ChallengeModalProps> = ({ isOpen, onClose }) => {
  const {
    activeChallenge,
    setActiveChallenge,
    challengeResult,
    runChallengeTest,
    loadTemplate
  } = useArchitecture();

  if (!isOpen) return null;

  const currentChallenge = activeChallenge || STUDENT_CHALLENGES[0];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Challenges"
      size="lg"
      closeLabel="Close challenges"
      flush
      footer={
        <button type="button" onClick={runChallengeTest} className={modalButton.primary}>
          <Play className="w-3.5 h-3.5" />
          Test architecture
        </button>
      }
    >
      <nav className="flex gap-5 px-5 border-b border-slate-200 overflow-x-auto custom-scrollbar">
        {STUDENT_CHALLENGES.map(ch => (
          <button
            key={ch.id}
            type="button"
            onClick={() => setActiveChallenge(ch)}
            className={`py-2.5 text-xs whitespace-nowrap border-b-2 -mb-px transition-colors ${
              currentChallenge.id === ch.id
                ? 'border-slate-900 text-slate-900 font-medium'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {ch.title}
          </button>
        ))}
      </nav>

      <div className="p-5 space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500">
              {currentChallenge.level} · {currentChallenge.trafficScale} traffic
            </span>
            {currentChallenge.initialTemplateId && (
              <button
                type="button"
                onClick={() => loadTemplate(currentChallenge.initialTemplateId!)}
                className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Load starter canvas
              </button>
            )}
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">{currentChallenge.scenario}</p>
        </div>

        <div>
          <h3 className="text-xs text-slate-500 mb-1">Requirements</h3>
          <ol className="divide-y divide-slate-200 text-sm text-slate-700">
            {currentChallenge.requirements.map((req, idx) => (
              <li key={idx} className="flex gap-3 py-2">
                <span className="w-4 shrink-0 text-xs font-mono text-slate-400 pt-0.5">{idx + 1}</span>
                <span>{req}</span>
              </li>
            ))}
          </ol>
        </div>

        {challengeResult && (
          <div className="pt-4 border-t border-slate-200 space-y-2">
            <div className="flex items-baseline justify-between">
              <span className={`text-sm font-semibold ${challengeResult.passed ? 'text-emerald-700' : 'text-rose-700'}`}>
                {challengeResult.passed ? 'Passed' : 'Incomplete'}
              </span>
              <span className="text-sm font-mono text-slate-900">{challengeResult.score} / 100</span>
            </div>
            <ul className="space-y-1 text-xs text-slate-600 leading-relaxed">
              {challengeResult.feedback.map((fb, idx) => (
                <li key={idx} className="flex gap-2">
                  <span className={fb.startsWith('Passed') ? 'text-emerald-700' : 'text-rose-700'}>
                    {fb.startsWith('Passed') ? '✓' : '×'}
                  </span>
                  <span>{fb}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
};
