# Shared service consistency — implementation evidence

Updated 2026-10-16. This is an incremental implementation record, not a claim that the full governance roadmap is complete.

## Baseline and entry-point inventory

The initial `npm test` run had 468 engine/conformance entries: 466 passed and two failed. Both failures came from `15-eks-architecture.json` naming an absent `eks-workload` resource. UI tests were not reached because the engine command failed. Historical handoff test counts were not used as current evidence.

| Entry point | Purpose and current authority |
| --- | --- |
| ArchitectureContext.evaluateCurrentScenario | Canvas design, reference and challenge request execution; applies effective failure state, then live simulation or lab dispatcher |
| runLiveSimulation | Authoritative product request wrapper; deterministic ordering, IAM enabled, captured result evidence |
| runLabReference | Dispatches request, configuration-only or authorization-only exercises; kinds are now stored on results |
| RedundancyExperimentModal | Now calls runLiveSimulation rather than compatibility runSimulation |
| requestSimulator.runSimulation | Shared traversal implementation; direct callers can still choose legacy compatibility options |
| service/interaction.simulateInteraction | Standalone diagnostic/model evaluator; not a substitute for live integration evidence |
| pipeline/engine.runUnifiedPipeline | Separate existing diagnostic engine; not wired into product request execution |
| trace.explainHop / explainRequest | Diagnostic explanations; product UI uses traceFromSimulation on the recorded run |
| scaling/asg and services/operations | Explicit stateful controllers/operations; not equivalent to generic request traversal |

Current tests cover repeated runs and node/edge reorderings through every request-mode course-lab dispatcher, persisted references with explicit scenarios, and the real React provider for representative lab/design cases. They do not certify every catalog service or every possible reference workload. Configuration/IAM-only labs intentionally remain different operation kinds.

## Implemented slices

### Result scope and outcome

- Simulation results carry optional `kind` and `outcome` fields; older saved results remain readable as request evidence.
- Live requests distinguish success, failure, denial and unsupported behavior. Trace rendering no longer calls availability failures authorization denials.
- Configuration and policy checks carry their own kind through serialization. Controls render the stored result kind instead of inferring result meaning from whichever lab is currently selected.
- Live evidence is cloned before being returned, so later nested architecture configuration edits cannot rewrite the prior run.
- Trace numbering now uses the stored one-based order.

### Deterministic entry points and traversal

- requestStart.ts supplies one deterministic default to the loader and execution engine. Explicit missing live start resources fail rather than silently execute another service.
- Live node/edge ordering is canonical by ID. Explicit step numbers retain priority. This stabilizes the existing traversal; it is not a full application workflow scheduler.
- Services with neither a dedicated model, explicit interaction contract nor the existing App Runner adapter fail with unsupported execution, including standalone terminal nodes. Explicit contracts such as the Amplify frontend abstraction retain their existing limited behavior. Dedicated registration or a contract still does not certify deep service fidelity.

### Shared gate and isolated child calls

- simulation/applicationHop.ts is the shared live route, configured inbound firewall and supported IAM gate.
- dependencyCalls.ts replaces the ECS-specific orchestration owner; the old module is a compatibility export. EC2, ECS, Lambda and Fargate callers use the same bounded DynamoDB dependency handling.
- Each child call has correlated call/response evidence and an independent verdict. Required errors stop the parent; optional errors are recorded as handled/bypassed while keeping the underlying DENY decision.
- Missing child targets fail or are explicitly handled; they are not silently filtered away. Selected edge action and port reach the shared gate.
- This slice models availability/authorization, not DynamoDB item storage. Logical response evidence explicitly states that reverse packets were not evaluated. Other dependency annotations are not automatically executed.

### Explicit inbound packet context

- Source `networkIdentity.privateIp` participates in configured inbound SG/NACL CIDR checks.
- Optional connection `destinationPort` participates in inbound port matching; the inspector exposes it and rejects invalid edits. Imported invalid explicit ports are rejected on live use; malformed explicit IPv4 identities fail validation.
- Trace entries store packet inputs, rule references and whether source/port were evaluated. Missing values remain an explicitly disclosed educational abstraction.
- Existing independent SG-reference matching and numbered NACL evaluation remain shared evaluators.

### Reference repair

Restored the missing observed workload snapshot in EKS reference 15, retaining supplied component positions and management edges. Its role is explicitly `workload`; the regional AWS-managed control-plane representation remains separate. Existing readiness, selector mismatch, control-plane distinction and containment tests now run and pass.

## Test evidence

- `test/execution-consistency.test.ts`: direct/lab equivalence, import equivalence, reorder determinism, default/missing start, scoped results, unsupported terminal coverage and captured nested evidence.
- `test/dependency-workflow.test.ts`: required/optional IAM and SG failures, missing target, invalid child protocol, selected action and correlated application response.
- `tests/aws-conformance/networking/live-firewall-context.test.ts`: actual source CIDR, explicit port, NACL first matching deny and invalid explicit packet configuration.
- `test/ui/ui-integration.test.ts`: real provider context equivalence, scoped check display, failure verdict, port editing/persistence and loader defaults.
- Existing suites remain required. See docs/HANDOFF.md for final commands, counts and build status; do not infer completion from test existence.

## Remaining work in roadmap order

1. Complete the field-by-field service configuration/effect inventory and versioned schema/default normalization across loaders. No universal configuration schema registry was added here.
2. Normalize educational protocol labels versus transport protocols. Current firewall APIs retain legacy abstractions; SQL/HTTPS labels are not yet a fully specified packet model.
3. Evaluate source SG egress, source/destination NACL directions, real response ports and return routes. Existing legacy return-rule-name heuristics remain. Do not describe inbound tests as end-to-end TCP conformance.
4. Replace legacy NAT/IGW presence heuristics and synthetic IAM resources/principals where still used. Explicit route tables have bounded existing support; DNS/address resolution and all cross-account policy combinations are not complete.
5. Introduce explicit workload operations, branches, parallelism, asynchronous scheduling, bounded retries and timeouts. Step numbers and isolated child calls are only foundational slices.
6. Consolidate compute models: standalone/compatibility evaluateCapacity still contains legacy replica/multi-AZ/sibling-ASG heuristics; live EC2 already bypasses that path. Lambda/Fargate load scaling also needs a documented bounded model instead of broad elasticity claims.
7. Deepen networking/IAM then EC2, ALB, ASG, RDS, S3 and Lambda per service specifications. Existing DB failover/cache fallback assumptions and terminal completion do not establish full service execution.
8. Complete all-context fixture migrations, capability evidence and animation-from-execution consolidation. Add SQS/SNS event lifecycle, followed by deeper ECS/Fargate/EKS composite behavior.

Do not remove compatibility paths until callers and regression contracts are deliberately migrated. Keep each remaining slice bounded, source-backed, tested and documented using SERVICE_BEHAVIOR_GOVERNANCE.md.
