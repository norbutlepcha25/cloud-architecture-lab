/**
 * Phase 11: the Explainable AWS Simulation Trace Engine's data model. Every entry answers all
 * four questions a student needs, as four distinct fields rather than one prose blob:
 *
 *   WHAT happened?        -> `component` + `decision`
 *   WHERE did it happen?  -> `resource`
 *   WHY did it happen?    -> `reason` (detailed) / `simpleExplanation` (plain-English)
 *   WHICH AWS RULE?       -> `awsRule`
 *
 * This is built by directly composing the real per-domain evaluators (`network/nacl.ts`,
 * `network/securityGroup.ts`, `iam/evaluate.ts`, `service/registry.ts`) rather than routing
 * through `engine/pipeline`'s `HopCheck`/`PipelineResult` - that model already collapses every one
 * of those evaluators' rich structured output (rule numbers, matched SG rules, IAM's own
 * `IamTraceStep[]`) down to a single free-text `detail` string before it would ever reach here
 * (confirmed: `engine/pipeline/engine.ts`'s `evaluate-iam`/`evaluate-nacl` steps discard exactly
 * that data). Composing the ground-truth evaluators directly keeps the evidence intact.
 */

export type TraceDecision = 'ALLOW' | 'DENY' | 'SUCCESS' | 'FAILURE' | 'NOT_REQUIRED' | 'INFO';

export interface TraceEntry {
  /** Sequence position within this trace - the "timestamp/order" field. Traces are constructed
   *  synchronously from static evaluators, so a step index is the meaningful, deterministic
   *  ordering; a caller wanting wall-clock time can still fold `order * someLatency` into
   *  `metadata` without this engine inventing timing data it doesn't have. */
  order: number;
  /** WHAT kind of check this is - Source, Destination, Route, NACL, Security Group, IAM, Service,
   *  or Final. Stable across every trace, unlike `resource` (below), which names the specific
   *  instance. */
  component: 'Source' | 'Destination' | 'Route' | 'NACL' | 'Security Group' | 'IAM' | 'Service' | 'Final';
  /** WHERE this decision was actually made - the specific node/NACL/Security Group/route table
   *  instance, e.g. "RDS-SG" or "Public Subnet NACL", not just the component category. */
  resource: string;
  /** A stable, machine-matchable operation id (e.g. 'evaluate-nacl') - the thing a future UI or
   *  test can key off of without string-matching prose. */
  operation: string;
  /** The concrete input this decision was evaluated against (protocol/port/source CIDR/action/...) -
   *  structured, not prose, so a "detailed" UI view can render it as a table. */
  input: Record<string, unknown>;
  decision: TraceDecision;
  /** WHY, in full - the detailed AWS explanation. Always populated. */
  reason: string;
  /** WHY, in one plain-English sentence a beginner can read with no AWS background - the
   *  "Simple explanation" mode this phase's data model must support without forcing any UI work
   *  now. Always populated alongside `reason`, never computed lazily by a UI. */
  simpleExplanation: string;
  /** WHICH AWS RULE/mechanism caused this decision - a citable, stable sentence about how AWS
   *  itself behaves, independent of this specific scenario's inputs. */
  awsRule: string;
  /** Raw structured evidence backing this decision - the actual matched NACL rule, the matched
   *  Security Group rule, the full IAM `IamTraceStep[]`, a `RouteResolution`, etc. This is what
   *  `engine/pipeline`'s collapse throws away; here it survives untouched for a "detailed" view or
   *  a future automated check to inspect directly. */
  metadata: Record<string, unknown>;
}

/** The full explainable trace for one request (a single hop, or an entire multi-hop path -
 *  `explainRequest` renumbers `order` across hops so the whole thing reads as one sequence). */
export interface RequestTrace {
  kind?: import('../../types/index.ts').SimulationResultKind;
  entries: TraceEntry[];
  final: 'SUCCESS' | 'DENIED' | 'FAILURE' | 'UNSUPPORTED';
  /** The one-sentence answer to "why did this end up SUCCESS/DENIED" - for DENIED, this is the
   *  first blocking entry's `reason`, exactly like the spec's own worked failure example
   *  ("WHY: RDS Security Group has no inbound TCP 5432 rule allowing the source."). */
  why: string;
}
