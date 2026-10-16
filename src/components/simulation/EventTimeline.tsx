import React, { useRef, useEffect, useState, useId } from 'react';
import { useArchitecture } from '../../context/ArchitectureContext.tsx';
import {
  CheckCircle2,
  XCircle,
  ChevronRight,
  ChevronUp,
  ChevronDown
} from 'lucide-react';

export const EventTimeline: React.FC = () => {
  const {
    simulationResult,
    activeStepIndex,
    setActiveStepIndex,
    setHoveredStepIndex,
    setSelectedNodeId
  } = useArchitecture();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const timelineId = useId();
  const timelineContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll timeline to active step
  useEffect(() => {
    if (!isCollapsed && activeStepIndex !== null && timelineContainerRef.current) {
      const activeEl = timelineContainerRef.current.children[activeStepIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activeStepIndex, isCollapsed]);

  if (!simulationResult || simulationResult.steps.length === 0) {
    return null;
  }

  const activeStep = activeStepIndex !== null ? simulationResult.steps[activeStepIndex] : null;

  return (
    <div className="bg-white border-t border-slate-200 flex flex-col shrink-0 max-h-52 select-none z-10 shadow-xs">
      {/* Header: title only while minimized; step count and active step once expanded */}
      <div
        className={`px-4 py-1.5 bg-white flex items-center justify-between ${isCollapsed ? 'cursor-pointer hover:bg-slate-50' : 'border-b border-slate-100'}`}
        onClick={isCollapsed ? () => setIsCollapsed(false) : undefined}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-slate-800">Timeline</span>
          {!isCollapsed && <span className="text-[10px] text-slate-400 font-mono">{simulationResult.steps.length} steps</span>}
        </div>

        {!isCollapsed && activeStep && (
          <div className="text-xs text-slate-600 font-mono flex items-center gap-2 min-w-0">
            <span className="text-slate-900 font-semibold">{activeStep.targetNodeName}</span>
            <span className="text-slate-400">:</span>
            <span className="text-slate-700 truncate max-w-md">{activeStep.action}</span>
          </div>
        )}
        <button
          type="button"
          aria-expanded={!isCollapsed}
          aria-controls={timelineId}
          aria-label={isCollapsed ? 'Expand timeline' : 'Minimize timeline'}
          title={isCollapsed ? 'Expand timeline' : 'Minimize timeline'}
          className="ml-3 shrink-0 rounded p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-circuit-600"
          onClick={event => {
            event.stopPropagation();
            setHoveredStepIndex(null);
            setIsCollapsed(value => !value);
          }}
        >
          {isCollapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Timeline Steps Horizontal Scroll */}
      <div
        id={timelineId}
        ref={timelineContainerRef}
        className={`${isCollapsed ? 'hidden' : 'flex'} flex-1 overflow-x-auto p-3 items-stretch gap-3 custom-scrollbar bg-white`}
      >
        {simulationResult.steps.map((step, idx) => {
          const isActive = activeStepIndex === idx;
          const isFailed = step.status === 'failed';

          return (
            <div
              key={step.id}
              onClick={() => {
                setActiveStepIndex(idx);
                setSelectedNodeId(step.targetNodeId);
              }}
              onMouseEnter={() => setHoveredStepIndex(idx)}
              onMouseLeave={() => setHoveredStepIndex(null)}
              className={`min-w-[250px] max-w-[280px] flex-shrink-0 p-2.5 rounded-lg border transition-colors cursor-pointer ${
                isActive
                  ? 'bg-white border-circuit-600 ring-1 ring-circuit-600'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              {/* Event Top Bar */}
              <div className="flex items-center justify-between gap-1 mb-1">
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500">
                  <span className="font-bold text-slate-900">{idx + 1}</span>
                  <span>+{step.timestampMs}ms</span>
                  <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-semibold">
                    {step.protocol}
                  </span>
                </div>

                {isFailed ? (
                  <span className="flex items-center gap-1 text-[10px] text-rose-600 font-bold">
                    <XCircle className="w-3.5 h-3.5" /> Failed
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> OK
                  </span>
                )}
              </div>

              {/* Action Title */}
              <div className="text-xs font-bold text-slate-900 truncate mb-0.5">
                {step.action}
              </div>

              {/* Node Source -> Target */}
              <div className="flex items-center gap-1 text-[11px] text-slate-600 mb-1 truncate">
                <span className="truncate">{step.sourceNodeName}</span>
                <ChevronRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
                <span className="text-slate-900 font-semibold truncate">{step.targetNodeName}</span>
              </div>

              {/* Educational Explanation */}
              <p className="text-[10px] text-slate-600 leading-snug line-clamp-2">
                {step.explanation}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
