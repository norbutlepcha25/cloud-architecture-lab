import React, { useState } from 'react';
import { useArchitecture } from '../../context/ArchitectureContext.tsx';
import { CASCADING_FAILURE_STAGES } from '../../engine/failure/cascadingFailure.ts';
import {
  RotateCcw,
  Activity,
  ArrowRight
} from 'lucide-react';
import { Modal, modalButton } from '../ui/Modal.tsx';

export const FailureControls: React.FC = () => {
  const {
    nodes,
    effectiveNodes,
    injectFailure,
    restoreAllNodes,
    failureImpacts
  } = useArchitecture();

  const [showCascadingModal, setShowCascadingModal] = useState(false);
  const [currentCascadeStage, setCurrentCascadeStage] = useState(0);

  const azANodes = nodes.filter(n => n.data.az === 'AZ-A');
  const azBNodes = nodes.filter(n => n.data.az === 'AZ-B');
  // Reflects the REAL propagated consequence of every active failure (Phase 9's failure engine),
  // not just the directly-targeted nodes - a node can end up failed here purely as a cascade.
  const failedNodes = effectiveNodes.filter(n => n.data.health === 'failed');

  const injectAzFailure = (az: 'AZ-A' | 'AZ-B') => {
    injectFailure({
      targetResourceId: az,
      failureType: 'az_failure',
      severity: 'critical',
      trigger: 'manual',
      reason: `Zone Outage (${az} Hardware Failure)`
    });
  };

  return (
    <>
      <div className="bg-white border-b border-slate-200 px-4 py-1.5 flex flex-wrap items-center justify-between gap-3 text-xs select-none">
        {/* Left: Fault Simulation Actions */}
        <div className="flex items-center gap-3">
          <span className="font-medium text-slate-500">Inject failure</span>

          {/* Fail AZ-A */}
          <button
            onClick={() => injectAzFailure('AZ-A')}
            disabled={azANodes.length === 0}
            className="px-2.5 py-1 rounded bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 hover:border-rose-300 font-medium disabled:opacity-40 transition-colors"
            title="Inject a structured AZ failure through the failure propagation engine"
          >
            AZ-A outage ({azANodes.length})
          </button>

          {/* Fail AZ-B */}
          <button
            onClick={() => injectAzFailure('AZ-B')}
            disabled={azBNodes.length === 0}
            className="px-2.5 py-1 rounded bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 hover:border-rose-300 font-medium disabled:opacity-40 transition-colors"
            title="Inject a structured AZ failure through the failure propagation engine"
          >
            AZ-B outage ({azBNodes.length})
          </button>

          {/* Restore All */}
          <button
            onClick={restoreAllNodes}
            disabled={failedNodes.length === 0}
            className="px-2.5 py-1 rounded bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-medium flex items-center gap-1.5 disabled:opacity-40 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>Restore all{failedNodes.length > 0 ? ` (${failedNodes.length})` : ''}</span>
          </button>

          {/* Failure Impact Summary - the real propagation result from engine/failure/, not a
              guess: which dependents cascaded, which survived via redundancy. */}
          {failureImpacts.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-50 border border-amber-200 text-amber-800 font-medium max-w-xl truncate" title={failureImpacts.map(i => i.summary).join(' ')}>
              <span className="font-bold">Impact:</span>
              <span className="truncate">{failureImpacts[failureImpacts.length - 1].summary}</span>
            </div>
          )}
        </div>

        {/* Right: Cascading Outage */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setShowCascadingModal(true);
              setCurrentCascadeStage(0);
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-white hover:bg-slate-50 text-slate-700 font-medium border border-slate-200 transition-colors"
          >
            <Activity className="w-3.5 h-3.5 text-slate-500" />
            <span>Cascade case study</span>
          </button>
        </div>
      </div>

      {/* Cascading Failure Walkthrough Modal - a fixed illustrative case study, independent of
          the user's own canvas. It does not read `nodes`/`edges` and is not a simulation of the
          architecture currently on screen; see docs/audit/FAILURE_GAPS.md finding 1. */}
      <Modal
        isOpen={showCascadingModal}
        onClose={() => setShowCascadingModal(false)}
        title="Case Study: Cascading Outage"
        meta={`Phase ${currentCascadeStage + 1} of ${CASCADING_FAILURE_STAGES.length}`}
        size="lg"
        closeLabel="Close case study"
        flush
        footer={
          <>
            <button
              onClick={() => setCurrentCascadeStage(prev => Math.max(0, prev - 1))}
              disabled={currentCascadeStage === 0}
              className={modalButton.secondary}
            >
              Previous Phase
            </button>
            {currentCascadeStage < CASCADING_FAILURE_STAGES.length - 1 && (
              <button
                onClick={() => setCurrentCascadeStage(prev => prev + 1)}
                className={modalButton.primary}
              >
                <span>Next Phase</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        }
      >
        {/* Stages */}
        <div className="px-5 border-b border-slate-200 flex gap-5 overflow-x-auto">
          {CASCADING_FAILURE_STAGES.map((stg, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentCascadeStage(idx)}
              className={`py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
                currentCascadeStage === idx
                  ? 'border-slate-900 text-slate-900'
                  : idx < currentCascadeStage
                  ? 'border-transparent text-slate-600 hover:text-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              {stg.stageNumber}. {stg.phase}
            </button>
          ))}
        </div>

        {(() => {
          const stage = CASCADING_FAILURE_STAGES[currentCascadeStage];
          return (
            <div className="p-5 space-y-4">
              <div className="space-y-1">
                <div className="text-xs text-slate-500">
                  Component: <span className="font-mono text-slate-700">{stage.component}</span>
                </div>
                <div className="text-sm font-semibold text-slate-900">{stage.event}</div>
                <p className="text-sm text-slate-600 leading-relaxed">{stage.systemImpact}</p>
              </div>

              <div className="grid grid-cols-3 gap-4 border-y border-slate-200 py-3">
                <div>
                  <div className="text-xs text-slate-500">Latency</div>
                  <div className="text-sm font-mono font-medium text-amber-600 mt-0.5">{stage.metricChange.latency}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">5xx error rate</div>
                  <div className="text-sm font-mono font-medium text-rose-600 mt-0.5">{stage.metricChange.errorRate}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Thread saturation</div>
                  <div className="text-sm font-mono font-medium text-slate-900 mt-0.5">{stage.metricChange.activeThreads}</div>
                </div>
              </div>

              <p className="text-sm text-slate-600 leading-relaxed">
                <span className="font-medium text-slate-900">Principle: </span>
                {stage.teachingTakeaway}
              </p>

              <p className="text-[11px] text-slate-500">Fixed illustrative example, not your architecture.</p>
            </div>
          );
        })()}
      </Modal>
    </>
  );
};
