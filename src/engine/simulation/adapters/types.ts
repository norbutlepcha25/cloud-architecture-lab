import type { Node, Edge } from '@xyflow/react';
import type { ServiceNodeData, ConnectionData, SimulationScenario, SimulationStep } from '../../../types/index.ts';

/**
 * Owns the accumulating simulation trace (steps, running clock, and the final outcome fields)
 * so every adapter mutates the same shared state through one small, explicit surface rather than
 * each behavior block reaching into a pile of loose closured `let`s. `pushStep` auto-fills
 * `id`/`stepNumber`/`timestampMs` from the trace's own counters, exactly matching every call site
 * this replaces (all of which pushed `timestampMs: currentTimestamp` with no per-call offset -
 * the only offsets in the original file were in the post-loop stateless-NACL-return check, which
 * stays in the orchestrator, not in any adapter).
 */
export class SimulationTrace {
  readonly serviceStates: Record<string, import('../../services/operations.ts').Runtime> = {};
  readonly steps: SimulationStep[] = [];
  private stepNumber = 1;
  currentTimestamp = 0;
  overallSuccess = true;
  finalStatusCode = 200;
  finalSummary = 'Request successfully processed across all architectural tiers.';
  readonly bottlenecksDetected: string[] = [];
  cascadeOccurred = false;

  pushStep(fields: Omit<SimulationStep, 'id' | 'stepNumber' | 'timestampMs'> & { timestampMs?: number }): void {
    this.steps.push({
      id: `step-${this.stepNumber++}`,
      stepNumber: this.steps.length + 1,
      timestampMs: this.currentTimestamp,
      ...fields
    });
  }

  advanceTime(ms: number): void {
    this.currentTimestamp += ms;
  }

  fail(statusCode: number, summary: string): void {
    this.overallSuccess = false;
    this.finalStatusCode = statusCode;
    this.finalSummary = summary;
  }

  succeed(statusCode: number, summary: string): void {
    this.overallSuccess = true;
    this.finalStatusCode = statusCode;
    this.finalSummary = summary;
  }

  /** Marks success without touching `finalStatusCode` - matches the original DB-failover and
   *  cache-fallback branches, which set `overallSuccess`/`finalSummary` only and deliberately
   *  leave the status code at whatever it already was (200, since nothing failed beforehand). */
  markSuccess(summary: string): void {
    this.overallSuccess = true;
    this.finalSummary = summary;
  }

  addBottleneck(message: string): void {
    this.bottlenecksDetected.push(message);
  }
}

/**
 * Everything one adapter needs to evaluate a single hop. Recreated fresh each hop iteration
 * (cheap - a handful of already-computed references), sharing one `SimulationTrace` instance
 * across the whole traversal.
 */
export interface AdapterContext {
  trace: SimulationTrace;
  /** All nodes on the canvas - needed by checks that scan for a specific node type anywhere
   *  (e.g. "does a healthy Internet Gateway exist"), as opposed to `node`/`downstreamNodes`
   *  which are scoped to the current hop. */
  nodes: Node<ServiceNodeData>[];
  /** The node currently being evaluated this hop. */
  node: Node<ServiceNodeData>;
  /** This hop's outgoing edges (excluding response/return signal lines). */
  outgoingEdges: Edge<ConnectionData>[];
  allEdges: Edge<ConnectionData>[];
  orderedConnections?: boolean;
  /** Child API calls made by the current service before its forwarding path continues. */
  dependencyEdges: Edge<ConnectionData>[];
  /** Downstream service nodes reachable from `node` via `outgoingEdges` (boundary containers
   *  and edgeless targets already filtered out). */
  downstreamNodes: Node<ServiceNodeData>[];
  /** Node ids already visited this traversal - used only to pick the next unvisited hop when
   *  more than one downstream target exists; the hop-count ceiling (not this set) is what
   *  actually terminates a cycle. */
  visited: Set<string>;
  scenario: SimulationScenario;
  enforceIam?: boolean;
  legacyCapacity?: boolean;
  /** Runs the shared NACL-then-Security-Group check for one hop; pushes a step per evaluated
   *  layer and returns true if the caller should stop traversal (a layer blocked). */
  pushFirewallBlockIfAny: (source: Node<ServiceNodeData>, target: Node<ServiceNodeData>, protocol: string, evidence?: SimulationTrace, connection?: Edge<ConnectionData>) => boolean;
}

/** What an adapter tells the orchestrator to do after evaluating the current hop. */
export type AdapterSignal =
  | { type: 'terminate' }
  | { type: 'advance'; nextNode: Node<ServiceNodeData> }
  | { type: 'continue' };

export const CONTINUE: AdapterSignal = { type: 'continue' };
export const TERMINATE: AdapterSignal = { type: 'terminate' };
export function advanceTo(nextNode: Node<ServiceNodeData>): AdapterSignal {
  return { type: 'advance', nextNode };
}

/**
 * One named, independently-reviewable behavior in the traversal loop. Order in the pipeline
 * array is significant (see `index.ts`) - several adapters are genuinely order-dependent (WAF
 * must run before load-balancer routing; the compute-to-data-tier check must run before the
 * generic network-path resolution), unlike the cost-calculator's pricing-module registry, whose
 * modules are mutually independent.
 */
export type Adapter = (ctx: AdapterContext) => AdapterSignal;
