# Unified Pipeline: Documented Deviations and Design Notes

Companion to `src/engine/pipeline/` (Phase 8 of `docs/target-architecture/MIGRATION_PLAN.md`).
Documents the result-status mapping, exactly which hardcoded shortcuts were eliminated (and which
single-resource lookups legitimately remain), and why `runSimulation` itself was not swapped to
call this engine in this pass.

## 0. Standalone - not yet wired into `runSimulation`

`runUnifiedPipeline()` is a complete, independently-tested implementation of the 13-step pipeline.
It is **not** called by `src/engine/simulation/requestSimulator.ts` in this pass, for the same
reason Phase 5-7's engines stayed standalone plus one additional one specific to this phase:

- `test/engine.test.ts`'s 50 tests assert on very specific narration strings and step orderings
  produced by the nine hand-tuned adapters in `src/engine/simulation/adapters/`. Swapping
  `runSimulation`'s internals to call `runUnifiedPipeline` + `toSimulationResult()` would require
  either (a) risking many of those exact-string assertions, or (b) rewriting
  `toSimulationResult()`'s narration to byte-match every adapter's phrasing - a large, separate,
  narration-parity effort outside this phase's scope.
- `toSimulationResult()` (`adapter.ts`) is a real, tested bridge proving the new engine's output
  *can* feed the existing `SimulationResult`/`SimulationStep[]` shape `EventTimeline.tsx` /
  `NodeStatusModal.tsx` / `SimulationControls.tsx` already render, with zero UI component changes
  required - see `test/unified-pipeline.test.ts`'s use of it in the P1 explanation test. This
  satisfies "adapt this engine to the existing interface" as a proven, ready capability; actually
  swapping `runSimulation`'s call site is the natural next increment (mirroring how Phase 7's
  `computeCapacityAdapter` extraction was done: one verified swap at a time against the full
  suite), not attempted wholesale here.

## 1. Accounting: every hardcoded array from `adapters/networkPath.ts`, replaced

| Removed array | Replaced by |
|---|---|
| `VPC_HOSTED_INGRESS_SERVICE_IDS` | `destModel.resolveEndpoints(node).requiresEni` (+ `subnet === 'public'`) |
| `INGRESS_PROXY_SERVICE_IDS` | `destModel.resolveEndpoints(node).isIngressProxy` |
| `MANAGED_EVENT_TARGET_SERVICE_IDS` | `destModel.resolveEndpoints(node).isManagedEventTarget` |
| `ENDPOINT_SERVICE_IDS` | `destModel.resolveEndpoints(node).isVpcEndpoint !== null` |

Each mapping was verified against the exact same set of ids the removed array contained, for every
Tier 1/2 service (`src/engine/service/models/*.ts`), before `engine.ts` was written to depend on
it - see Phase 7's `SERVICE_ENGINE_DEVIATIONS.md` for the original per-service capability values.

**One genuinely new capability flag was required**, not present after Phase 7:
`EndpointCapabilities.performsTargetRouting` (optional, defaults falsy). Phase 7's single
`isIngressProxy` flag conflated two distinct real behaviors: "a valid direct-hit edge target from
the public internet" (ALB, NLB, API Gateway, **and CloudFront**) vs. "selects among multiple
registered downstream targets by health" (ALB, NLB, API Gateway **only** - CloudFront has one
origin and caches, it does not target-group-route). The pre-Phase-8 adapter pipeline got this
distinction right implicitly, by ordering: `loadBalancerAdapter` (ALB/NLB/API Gateway only)
runs and unconditionally advances *before* `networkPathAdapter`'s direct-ingress-block check ever
executes for those three services, so CloudFront (handled by a separate, earlier-but-non-terminal
`cloudFrontAdapter`) is the only edge service that ever reaches that check. This engine has no such
"first adapter wins" pipeline-order trick - it needed the capability flag made explicit instead.
This was caught by the very case it names: a P3 test (`API Gateway -> Lambda -> DynamoDB`) initially
failed with a wrongly-invented `BLOCKED` result before this flag was added - see the flag's own
comment in `src/engine/service/types.ts` for detail.

## 2. Singleton-resource lookups that remain (not shortcuts)

`resolveNode.data.serviceId === 'internet_gateway'` and `'nat_gateway'` still appear literally in
`engine.ts`. These are not classification shortcuts - there is exactly one AWS resource TYPE these
strings identify ("find THE Internet Gateway attached to this VPC"), the same way the pre-Phase-8
adapters, the Phase 5 Network Engine, and even AWS's own API (`DescribeInternetGateways`) all
address it by its one real resource kind. Eliminating a *classification array* (which service ids
count as "this kind of thing") is what Phase 8 asked for; a *reference to the one resource concept
that exists* is unavoidable and appears in exactly two places.

## 3. Result status mapping

| `PipelineResultStatus` | When | Legacy status code |
|---|---|---|
| `SUCCESS` | Every step passed | 200 |
| `DENIED` | IAM (Phase 6) explicit or implicit deny at the terminal hop | 403 |
| `BLOCKED` | NACL/Security Group blocked the packet, or a direct public-ingress-to-private-subnet routing violation | 403 |
| `MISCONFIGURED` | Missing required infrastructure (no IGW/NAT Gateway at all), invalid placement (`subnet === 'unassigned'`), or a `ServiceModel.validateConfiguration` issue | 400 |
| `UNAVAILABLE` | Target/gateway reachable and authorized, but its own runtime state can't serve the request (failed IGW/NAT Gateway, no healthy LB targets, single-AZ DB down) | 503 |
| `TIMEOUT` | A `processRequest` failure whose legacy status code is 504 (saturation, single-AZ DB failure), or a stateless-NACL-return-path block | 504 |
| `UNSUPPORTED` | Unknown serviceId, no service nodes at all, or a routing loop | 502 |

The "no route exists at all" case (a direct public-to-private hop with no ingress proxy mediating
it) is classified `BLOCKED` rather than `MISCONFIGURED`, since it is the correct, expected
consequence of how AWS route tables work (a private route table genuinely has no path from the
internet) - not a broken configuration value. This is a judgment call, made explicitly rather than
left implicit; a reader who'd classify it differently can see exactly where and why in `engine.ts`.

## 4. IAM authorization is evaluated once, at the terminal hop only

Per the request model ("not every field is required for every request"), `request.principal` /
`request.action` / `request.resource` are optional. When present, they are evaluated exactly once,
at whichever hop is the request's actual destination (`request.destination` if given, otherwise the
last node in the traversed chain) - not at every intermediate hop. This matches the worked examples
in both this phase's brief and Phase 6's (`Lambda -> Execution Role -> s3:GetObject -> S3`): the
authorization question is about the resource actually being accessed, not every hop along the way.
There is still no per-node `principalId` wiring on the canvas (`docs/target-architecture/DOMAIN_MODEL.md`
§3's proposed field remains unimplemented) - `request.principal` must be supplied by the caller of
`runUnifiedPipeline` directly, exactly as Phase 6/7's own standalone tests already do.

## 5. Route resolution remains subnet-derived, not a real Route Table entity

Step 5 ("resolve routes") is, honestly, a pass-through confirmation of the same subnet-derived
reachability heuristic the Network Engine has used since Phase 5 - see
`docs/aws-behavior/NETWORK_ENGINE_DEVIATIONS.md` §2 for why a real `RouteTable`/`Route` entity
remains reserved-but-unimplemented (Phase 4 of the migration plan, gated on a canvas UI decision
that hasn't been made). Every hop's trace still records a "Route resolution" check, honestly worded
to say exactly this, rather than silently implying more precision than actually exists.

## 6. What "UI compatibility" means concretely in this pass

`toSimulationResult()` is a real, tested function (not a design sketch) that takes any
`PipelineResult` and returns a `SimulationResult` with the exact shape `SimulationControls.tsx`'s
"Send Request" flow already expects. No component in `src/components/` was modified. Adopting this
engine in the live UI would mean changing what `runSimulation()`'s call sites receive their data
from - a one-function-signature swap - not a UI redesign; this phase stops short of making that
swap itself (§0), but the bridge it would go through already exists and is verified.

## Shared live execution increment (2026-10-16)

Product request paths, including the redundancy experiment, use runLiveSimulation.
The live traversal delegates route/configured-inbound-firewall/IAM checks to
simulation/applicationHop.ts with caller-provided evidence sinks. Supported
DynamoDB child failures no longer overwrite the parent verdict when optional.
The standalone unified pipeline remains diagnostic; this is not its migration
into the product. Result kinds/outcomes and deterministic defaults are documented
in target-architecture/SERVICE_CONSISTENCY_PROGRESS.md.
