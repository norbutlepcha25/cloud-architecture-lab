---
name: aws-service
description: Implement or improve an AWS service in AWS Architecture Lab with documented AWS conformance, live service operations, valid canvas connections, service-owned inspector configuration, and end-to-end regression evidence. Use for "/aws-service SERVICE", service behavior implementation, or fixing service execution and connection support. A catalog entry, inspector panel, or valid connection alone is not completion.
---

# AWS service behavior workflow

Arguments: one or more AWS service names (`$ARGUMENTS`). Work through every step for each service.
This skill is the Claude Code entry point to `docs/SERVICE_BEHAVIOR_GOVERNANCE.md`; read that file,
`CLAUDE.md`, `AGENTS.md` and the relevant `docs/HANDOFF.md` sections first. They win on conflict.

Resolve repository paths from the AWS Architecture Lab root. Also read
`docs/SERVICE_BEHAVIOR_EXTENSION.md`. Shared governance is authoritative for both
this skill and `.agents/skills/aws-service/SKILL.md`; keep their behavioral requirements aligned.
A bare service name triggers implementation only in an established service-improvement
conversation. Informational questions do not authorize edits. If AWS sources cannot be verified,
record UNKNOWN rather than enforcing guessed rules.

## 1. Resolve and inspect (no edits yet)

- Map each name to its catalog id in `src/data/serviceCatalog.ts` (`createService('<id>', ...)`).
  Distinguish related resources (cluster vs node group vs workload). State the interpretation.
- Find what already exists: `src/engine/service/registry.ts` and `models/`, `src/engine/<domain>/`,
  `src/engine/architecture/connectionContracts.ts`, `src/engine/simulation/adapters/`,
  `src/engine/capability/` (`liveCoverage.ts`, `iamCoverage.ts`, `registry.ts`),
  `src/components/inspector/inspectorProfile.ts`, `docs/behavior/<id>.md`, labs
  (`src/data/labs/*.json`) and references (`src/data/references/*.json`) that use it.
  A catalog entry or icon is not behavior.
- Reproduce the current user journey: right-hand configuration, canvas connection creation,
  reconnection/editing, Simulate start selection, and service run actions. Record which entry
  points actually execute the service, which only validate configuration, and which are unsupported.

## 2. Verify AWS behavior from official documentation

- Use WebFetch on docs.aws.amazon.com (user guide, API reference, quotas, Service Authorization
  Reference). Never rely on memory for AWS semantics.
- Record each rule with its exact URL and today's date. Anything not confirmed is UNKNOWN and is
  not enforced. Note availability notices (deprecated / closed to new customers).

## 3. State a bounded slice before editing

List the operations, configuration fields, relationships, denial/failure cases and explicit
exclusions you will implement, and the acceptance tests. Prefer one meaningful live operation plus
its documented failure modes over broad shallow coverage.
Create a compact acceptance matrix: operation/entry point, applicable configuration, incoming and
outgoing relationship meaning, AWS source/date, expected success and denial/failure, and live test.
Include standalone operations where AWS supports them and they belong to the requested slice;
do not assume every service is a request receiver or requires an orchestrator. Record exclusions
explicitly instead of promising all AWS behavior.

## 4. Implement in the shared engines (never in React components)

- Behavior goes in `src/engine/` (a service model, or a domain module like `src/engine/cicd/`).
  Reuse shared evaluators instead of re-implementing them:
  - IAM: `engine/iam/` (`assumeRole`, `evaluateAuthorization`, `servicePrincipals.ts` for the AWS
    service principal that assumes the role);
  - routing and egress: `engine/network/subnetRouting.ts` (internet ingress, NAT/IGW/endpoint
    egress, honoring the "Assume route tables" option);
  - placement: `engine/layout/containment.ts`; firewalls: `simulation/networkFirewalls.ts`;
  - health and failures: node `health`, `engine/failure/`.
- Wire it into the live entry point (`engine/simulation/liveSimulation.ts` / adapters) so the
  Simulate button, labs and references all use the same code path. Request flows use
  `kind: 'request'`; control-plane workflows use their own result kind (see `workflow`).
- Configuration that AWS rejects becomes validation findings (`engine/validation/`), separate from
  request results and architecture analysis.

## 4b. Service execution contract

- Implement observable operations, prerequisites, state transitions, outputs and relevant failure/
  recovery behavior using existing service/domain modules and shared network/IAM engines.
  Use the resource's own configured identities, dependencies and effective health.
- Wire every supported entry point into the authoritative dispatcher: selected simulation start,
  service-owned run action, upstream invocation and orchestrated action where applicable. Reuse
  the same operation evaluator; never create a fake orchestrator to run a standalone operation.
- A supported service operation must not fall through to generic application traversal or
  "Unsupported service execution". Fix the dispatcher/model gap; do not hide the message or
  substitute success. For excluded operations, retain an honest scoped unsupported result and
  explain the supported entry point and missing capability.
- Distinguish invalid configuration, IAM denial, network failure, unavailable dependency and
  unsupported scope. Missing role evaluation is not AWS authorization success. Do not introduce
  silent grants/default resources to force success; disclose compatibility assumptions already
  required by existing fixtures and record their limitations.
- Connections describe available relationships, not automatic execution of every downstream
  resource. A build does not start deployment merely because a line exists. Preserve request,
  workflow, authorization-check and configuration-check result kinds and their actual scope.
- Record operation decisions and reasons during execution. Walkthroughs and animation consume
  the same evaluator/evidence, including standalone failures; they must not invent a second result.

## 4c. Connection support contract

- Define documented source/destination pairs and their direction and meaning in existing shared
  contracts (`connectionContracts.ts`, `relationships.ts`, domain relationship modules such as
  `cicdRelationships.ts`). Distinguish request, dependency, management, event/subscription,
  attachment, target registration and annotation using existing types or justified extensions.
- Verify users can actually draw valid pairs. Protocol choices, default relationship, inspector
  edits, reconnection validation and live dispatch must agree. A valid pair in a lookup table is
  insufficient if the canvas blocks it or simulation interprets it as application traffic.
- Validate creation, reconnection, edits, import/export/reload and affected fixtures. Preserve
  legacy persisted meanings through explicit compatibility handling; do not silently migrate all
  edges. Invalid is distinct from unmodeled. A valid relationship does not grant IAM or guarantee
  network reachability, dependency availability or operation success.
- Exclude annotations, response drawings and unrelated resources from action/target/dependency
  discovery. Evaluate only attached/configured resources; unrelated nodes, layout and array order
  must not change decisions. Check `engine/analysis/strayComponents.ts` recognizes legitimate links.
- Prove at least one supported cross-service interaction through the live dispatcher, including
  applicable network/IAM denial, dependency failure and recovery. Model meaningful invalid pairs
  and reject incompatible application protocols on control-plane relationships.

## 5. User configuration

Add a service-owned inspector panel only for settings that change behavior; register it in
`inspectorProfile.ts` and render it in `ServiceInspector.tsx` inside an `InspectorAccordion`.
Preserve existing right-hand configuration controls, Overview/Config tabs, accordion behavior,
placement applicability and saved values. Every new setting must declare its behavior, validation,
cost or descriptive effect; test that behavior-affecting edits change the engine result and survive
persistence. Do not add inert controls or move AWS rules into React.
Show engine-reported issues inline. Add a clearly named run action for supported non-request
operations and connect it to the real dispatcher without changing the saved request start.
Configuration UI complements operation/connection support; it cannot replace either.
Multi-step behavior also needs the explanation overlay in step 5b.

## 5b. Explanation overlay (required for multi-step behavior)

If the service's behavior is multi-step, asynchronous or otherwise hidden from a single request
trace (queues and retries/DLQs, pipelines and stages, deployments and batches, routing via
NAT/IGW, scaling, failover, event fan-out), add a step-by-step overlay opened from
**More information**:

- Build the walkthrough in `src/engine/explain/walkthrough.ts` (or a sibling module) **from the
  same engine functions the simulation uses** - never re-implement AWS rules in React. Each frame
  names its lane (where the message/artifact/packet/revision is), status, optional clock, the
  explanation, and the AWS documentation URL.
- "What if" toggles (consumer fails, build fails, instance fails, strict routing, another
  deployment configuration) apply to cloned nodes only; the architecture must not change.
- Render with `src/components/learning/WalkthroughView.tsx`. Register the service in
  `WALKTHROUGH_SERVICES` (`WalkthroughExplorer.tsx`) or add it to an existing explorer
  (`ServiceBehaviorExplorer.tsx`, ECS/EKS explorers) without removing existing lessons.
- Use the reference diagram for the service to show the interesting path (for example a DLQ so
  the redrive is visible), and add walkthrough tests (sequence, timing, what-if immutability).

## 6. Tests

- Conformance cases in `tests/aws-conformance/<domain>/<service>.test.ts` using `harness.ts`:
  test id, AWS rule, official source, configuration, request, expected, actual. Cover success,
  invalid configuration, network denial, IAM denial, unavailable dependency, and recovery where
  applicable; mark inapplicable cases with reasons.
- Exercise the real provider/UI for service run actions and connection creation/reconnection,
  plus affected inspector changes. Prove a supported operation executes (not just that a button
  renders or a contract says valid), and check configuration/persistence round trips.
- Cover direct standalone and orchestrated entry points separately where supported. Assert the
  operation, selected resources, verdict and reason; a status code alone can pass for the wrong
  failure. Include annotation exclusion, unrelated-resource invariance, reorder determinism,
  immutability and live/lab equivalence where relevant.
- Print each failure's reason once to confirm it fails for the documented rule, not by accident.
- Never weaken an existing test. If an existing test relied on non-AWS behavior, fix the data or
  behavior and explain it; update only your own new expectations.

## 7. Consistency across every design, lab and reference

- Before and after the change, run every lab (`runLabReference`, assumed and strict routing) and
  every reference (`runLiveSimulation`) and diff the outcomes. Explain every difference.
- `test/stray-components.test.ts` and `test/routing-validation.test.ts` must stay clean.
- If a shipped diagram is wrong per AWS, fix it minimally and say so. Do not rewrite references
  casually; consider adding a new reference diagram that demonstrates the service end to end.

## 8. Documentation and evidence

- `docs/behavior/<id>.md` from `docs/behavior/SERVICE_TEMPLATE.md`: scope, configuration
  contract, rule/source/test matrix, relationships, UNKNOWNs, remaining work.
- Capability evidence in `src/engine/capability/liveCoverage.ts` only for behavior with passing tests.
- Deviations in `docs/aws-behavior/*` where the simulator differs from AWS.
- Update `docs/HANDOFF.md` (snapshot, not a log).

## 9. Verify and report

Run `npx tsc --noEmit -p .`, `npm test` and `npm run build`; check generated diffs. If possible,
check the UI in a browser (vite dev server + headless Chrome). Report: behavior added, AWS rules
with sources, files, test results, cross-diagram diff, UNKNOWN/unsupported scope. Do not commit
unless asked.

Completion requires evidence for the declared slice across **AWS rules + service execution +
connections + preserved right-hand configuration + tests + explanations**. Report supported entry
points and exclusions separately. If any required check is unrun/failing or an advertised operation
still reaches the unsupported fallback, say the slice is not fully verified; do not claim AWS
conformance or full service support based only on metadata, registration, configuration or build success.
