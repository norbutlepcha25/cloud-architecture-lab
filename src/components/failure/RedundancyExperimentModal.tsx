import React, { useMemo, useState } from 'react';
import { runLiveSimulation as runSimulation } from '../../engine/simulation/liveSimulation.ts';
import type { Node, Edge } from '@xyflow/react';
import { Modal, modalButton } from '../ui/Modal.tsx';

interface RedundancyExperimentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Two fixed, self-contained topologies matching the mini-diagrams this modal renders -
// Architecture A (single ECS task) and Architecture B (two ECS tasks across AZ-A/AZ-B), both
// behind an ALB with an RDS backend. Neither reads the user's own canvas: this modal has always
// presented itself as a generic "Architecture A vs Architecture B" comparison, not a report on
// the user's own build - what changed is that the outcome shown for each is now the REAL output
// of `runSimulation` against these topologies, not fixed copy (see docs/audit/FAILURE_GAPS.md
// finding 2 and docs/audit/PRIORITIZED_REFACTOR_PLAN.md item 7).
function buildExperimentNodes(multiInstance: boolean, task1Failed: boolean): { nodes: Node<any>[]; edges: Edge<any>[] } {
  const igw: Node<any> = { id: 'exp-igw', position: { x: 0, y: -100 }, data: { serviceId: 'internet_gateway', label: 'IGW', health: 'healthy' } };
  const client: Node<any> = { id: 'exp-client', position: { x: 0, y: -200 }, data: { serviceId: 'user', label: 'User' } };
  const alb: Node<any> = { id: 'exp-alb', position: { x: 0, y: 0 }, data: { serviceId: 'alb', label: 'ALB', subnet: 'public', health: 'healthy' } };
  const task1: Node<any> = { id: 'exp-task-1', position: { x: -60, y: 100 }, data: { serviceId: 'ecs', label: 'ECS Task #1', subnet: 'public', az: 'AZ-A', health: task1Failed ? 'failed' : 'healthy', failureReason: task1Failed ? 'Simulated crash' : undefined } };
  const rds: Node<any> = { id: 'exp-rds', position: { x: 0, y: 200 }, data: { serviceId: 'rds', label: 'RDS Database', subnet: 'private', health: 'healthy' } };

  const nodes: Node<any>[] = [igw, client, alb, task1, rds];
  const edges: Edge<any>[] = [
    { id: 'exp-e1', source: 'exp-client', target: 'exp-alb', data: { protocol: 'HTTP' } } as Edge<any>,
    { id: 'exp-e2', source: 'exp-alb', target: 'exp-task-1', data: { protocol: 'HTTP' } } as Edge<any>,
    { id: 'exp-e3', source: 'exp-task-1', target: 'exp-rds', data: { protocol: 'SQL' } } as Edge<any>
  ];

  if (multiInstance) {
    const task2: Node<any> = { id: 'exp-task-2', position: { x: 60, y: 100 }, data: { serviceId: 'ecs', label: 'ECS Task #2 (AZ-B)', subnet: 'public', az: 'AZ-B', health: 'healthy' } };
    nodes.push(task2);
    edges.push({ id: 'exp-e4', source: 'exp-alb', target: 'exp-task-2', data: { protocol: 'HTTP' } } as Edge<any>);
  }

  return { nodes, edges };
}

const EXPERIMENT_SCENARIO = {
  id: 'redundancy-experiment',
  name: 'Redundancy Experiment',
  method: 'GET' as const,
  path: '/orders',
  startNodeId: 'exp-client',
  trafficLevel: 'normal' as const
};

export const RedundancyExperimentModal: React.FC<RedundancyExperimentModalProps> = ({
  isOpen,
  onClose
}) => {
  const [ecs1Failed, setEcs1Failed] = useState(false);

  const resultA = useMemo(() => {
    const { nodes, edges } = buildExperimentNodes(false, ecs1Failed);
    return runSimulation(nodes, edges, EXPERIMENT_SCENARIO);
  }, [ecs1Failed]);

  const resultB = useMemo(() => {
    const { nodes, edges } = buildExperimentNodes(true, ecs1Failed);
    return runSimulation(nodes, edges, EXPERIMENT_SCENARIO);
  }, [ecs1Failed]);

  if (!isOpen) return null;

  const box = 'inline-block px-2 py-1 rounded border border-slate-200 text-slate-700';
  const taskBox = (failed: boolean) =>
    `inline-block px-2 py-1 rounded border ${failed ? 'border-rose-300 text-rose-700' : 'border-slate-200 text-slate-700'}`;
  const arrow = <div className="text-slate-400">↓</div>;

  const outcome = (result: typeof resultA, successNote: string) => (
    <div className="border-t border-slate-200 pt-3 space-y-1">
      <div className={`text-sm font-semibold ${result.success ? 'text-emerald-700' : 'text-rose-700'}`}>
        HTTP {result.statusCode}{result.success ? ` (${successNote})` : ''}
      </div>
      <p className="text-xs text-slate-600 leading-relaxed">{result.summary}</p>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Redundancy Resilience Experiment"
      size="lg"
      closeLabel="Close experiment"
      flush
    >
      <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500">Primary compute instance</span>
        <button
          onClick={() => setEcs1Failed(!ecs1Failed)}
          className={ecs1Failed ? modalButton.secondary : modalButton.primary}
        >
          {ecs1Failed ? 'Restore Compute #1' : 'Simulate: Crash Compute #1'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200">
        {/* Architecture A: Single Instance */}
        <section className="p-5 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-900">Architecture A (Baseline)</h3>
              <span className="text-xs text-slate-500">Single Instance</span>
            </div>
            <div className="font-mono text-xs space-y-1.5 text-center">
              <div className={box}>User</div>
              {arrow}
              <div className={box}>ALB</div>
              {arrow}
              <div className={taskBox(ecs1Failed)}>
                {ecs1Failed ? 'ECS Task #1 (CRASHED)' : 'ECS Task #1 (Healthy)'}
              </div>
              {arrow}
              <div className={box}>RDS Database</div>
            </div>
          </div>
          {/* Request outcome - the real output of runSimulation against this topology */}
          {outcome(resultA, 'Request Succeeds')}
        </section>

        {/* Architecture B: Redundant Multi-Instance */}
        <section className="p-5 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-900">Architecture B (Resilient)</h3>
              <span className="text-xs text-slate-500">Redundant Tiers</span>
            </div>
            <div className="font-mono text-xs space-y-1.5 text-center">
              <div className={box}>User</div>
              {arrow}
              <div className={box}>ALB</div>
              {arrow}
              <div className="flex items-center justify-center gap-2">
                <div className={taskBox(ecs1Failed)}>{ecs1Failed ? 'Task #1 (CRASHED)' : 'Task #1'}</div>
                <div className={taskBox(false)}>Task #2 (AZ-B)</div>
              </div>
              {arrow}
              <div className={box}>RDS Database</div>
            </div>
          </div>
          {/* Request outcome - the real output of runSimulation against this topology */}
          {outcome(resultB, 'Traffic Rerouted Successfully')}
        </section>
      </div>

      <p className="px-5 py-3 border-t border-slate-200 text-[11px] text-slate-500">
        Fixed example topologies, not your architecture. Outcomes are live simulator results.
      </p>
    </Modal>
  );
};
