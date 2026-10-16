---
name: aws-service
description: Build or improve an AWS service's simulated behavior in the AWS Architecture Lab from a service name (e.g. "/aws-service CodeBuild", "/aws-service SQS"). Verifies rules against official AWS documentation, implements engine behavior, makes the service connectable to the right canvas components, adds an inspector panel, conformance tests, a behavior spec and capability evidence, and checks every lab and reference still behaves the same. Use whenever the user names an AWS service to add, model, simulate or make "behave like AWS".
---

# AWS service behavior workflow

Arguments: one or more AWS service names (`$ARGUMENTS`). Work through every step for each service.
This skill is the Claude Code entry point to `docs/SERVICE_BEHAVIOR_GOVERNANCE.md`; read that file,
`CLAUDE.md`, `AGENTS.md` and the relevant `docs/HANDOFF.md` sections first. They win on conflict.

## 1. Resolve and inspect (no edits yet)

- Map each name to its catalog id in `src/data/serviceCatalog.ts` (`createService('<id>', ...)`).
  Distinguish related resources (cluster vs node group vs workload). State the interpretation.
- Find what already exists: `src/engine/service/registry.ts` and `models/`, `src/engine/<domain>/`,
  `src/engine/architecture/connectionContracts.ts`, `src/engine/simulation/adapters/`,
  `src/engine/capability/` (`liveCoverage.ts`, `iamCoverage.ts`, `registry.ts`),
  `src/components/inspector/inspectorProfile.ts`, `docs/behavior/<id>.md`, labs
  (`src/data/labs/*.json`) and references (`src/data/references/*.json`) that use it.
  A catalog entry or icon is not behavior.

## 2. Verify AWS behavior from official documentation

- Use WebFetch on docs.aws.amazon.com (user guide, API reference, quotas, Service Authorization
  Reference). Never rely on memory for AWS semantics.
- Record each rule with its exact URL and today's date. Anything not confirmed is UNKNOWN and is
  not enforced. Note availability notices (deprecated / closed to new customers).

## 3. State a bounded slice before editing

List the operations, configuration fields, relationships, denial/failure cases and explicit
exclusions you will implement, and the acceptance tests. Prefer one meaningful live operation plus
its documented failure modes over broad shallow coverage.

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
- Make the service connectable: add its valid pairs to `connectionContracts.ts` (request protocols
  in `inputs`, or control-plane relationships such as `CICD_PAIRS`) so drawing an edge to the
  right components shows "valid" and wrong pairs show "unknown"/"invalid". Check
  `engine/analysis/strayComponents.ts` treats its legitimate relationships as connected.
- Configuration that AWS rejects becomes validation findings (`engine/validation/`), separate from
  request results and architecture analysis.

## 5. User configuration

Add a service-owned inspector panel only for settings that change behavior; register it in
`inspectorProfile.ts` and render it in `ServiceInspector.tsx` inside an `InspectorAccordion`.
Show engine-reported issues inline. Add a run action if the operation is not a request. Multi-step behavior also needs the explanation overlay in step 5b.

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
