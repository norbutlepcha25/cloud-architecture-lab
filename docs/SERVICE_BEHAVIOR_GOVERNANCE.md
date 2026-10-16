# Shared service behavior: implementation plan and agent rules

Status: incremental implementation underway. See [implementation evidence and remaining work](target-architecture/SERVICE_CONSISTENCY_PROGRESS.md). Stages below are not complete unless backed by code and current passing evidence. Created 2026-10-16.

## Authority and scope

Read this document before changing service configuration, connections, request execution, failures, capabilities, references, labs, or challenges. It supplements AGENTS.md and CLAUDE.md. Follow user instructions and preserve unrelated working-tree changes. Historical audits and handoff test counts are snapshots, not proof of current correctness.

One normalized resource configuration, relationship graph, workload, resource state, and execution options must produce the same behavioral decisions in a new design, reference, lab, and challenge. Teaching text, layout, grading, and presentation may differ. Reference IDs, labels, node-array order, and active UI mode must not select alternate AWS semantics.

This is an incremental migration of the existing product. Do not create another competing simulator, rewrite working systems wholesale, or claim this document implements the roadmap.

## Required service-by-name workflow

When the user supplies a service name in an established service-improvement conversation, treat it as a request to inspect and improve that service through this workflow. In a different context, follow the actual request; a service mentioned in a question is not automatic permission to edit code.

1. Resolve the name and aliases to the existing catalog service ID. Search before creating anything. Distinguish related resources (for example EKS cluster, node group, and workload). Ask only if materially ambiguous; otherwise state the interpretation and proceed.
2. Read AGENTS.md, the relevant handoff sections, this document, docs/SERVICE_BEHAVIOR_EXTENSION.md, and the applicable service specification. Inspect actual current code; do not rely on historical inventories.
3. Locate the behavior implementation through src/engine/service/registry.ts. Search shared model files as well as dedicated files. A missing <serviceId>.ts file does not mean behavior is missing. Inspect validation, connection contracts, live adapters, network/IAM integration, failure dependencies, inspector, capabilities, pricing where relevant, persistence, and fixtures.
4. Create or update docs/behavior/<canonical-service-id>.md using the adjacent template. Inventory supported operations, configuration, relationships, limitations, and existing evidence. Read authoritative AWS documentation for rules being implemented and record exact links and verification date. Use UNKNOWN for unresolved behavior; do not fabricate it when documentation is unavailable.
5. State a bounded implementation slice and acceptance conditions before edits. For a broad service name, first establish configuration, supported interactions, one meaningful live operation, and applicable denial/failure cases; document the remaining backlog. Never promise full AWS fidelity.
6. Add meaningful regression/conformance tests, implement the smallest appropriate change, and wire it into the authoritative live path. Reuse existing modules; create missing necessary files and registry entries. Do not create empty adapters, unnecessary inspectors, or duplicated engines merely to satisfy a file checklist.
7. Verify cross-service composition and cross-context equivalence. A standalone model test or registry entry is not live integration evidence. Exercise the actual lab dispatcher as well as direct request execution where relevant; inspect serialization/defaults and failure injection effects.
8. Run the relevant focused tests, then npm test and npm run build for implementation changes. These commands have generation hooks: inspect generated diffs and preserve unrelated changes. Never weaken tests to obtain a pass. Record pre-existing failures separately; do not claim overall validity when required checks fail or are unavailable.
9. Update the service specification, capability evidence, limitations, and applicable handoff/backlog entries. Report behavior changed, files, verification results, and remaining unsupported cases. Stop when the bounded acceptance conditions are met.

## Files and integration checklist

| Concern | Existing location / action |
| --- | --- |
| Service specification | docs/behavior/<canonical-service-id>.md; create if missing |
| Behavior | src/engine/service/models/; inspect shared families before extracting or creating a module |
| Registration | src/engine/service/registry.ts |
| Configuration | Existing domain types, validation and service configuration surfaces; reuse existing abstractions |
| Relationships | src/engine/architecture/connectionContracts.ts and relationships.ts |
| Execution | src/engine/simulation/liveSimulation.ts, requestSimulator.ts and adapters/ |
| Shared evaluators | src/engine/network/, iam/, failure/, validation/, trace/ |
| Coverage | src/engine/capability/; require live passing evidence for claims |
| User configuration | Existing inspector/explorer; add UI only for supported meaningful settings |
| Conformance | tests/aws-conformance/<domain>/; extend existing appropriate suites |
| Integration/regression | test/; include live interaction, context equivalence and affected references |
| Fixtures | Existing reference/lab JSON source files; preserve educational intent and generators |

## Behavioral invariants

- Service modules own service decisions; shared engines own networking, IAM, workflow orchestration, failure evaluation, and traces. React renders recorded outcomes and collects configuration.
- Separate configuration validity, request success, architecture quality, and teaching assessment. Configuration-only and IAM-only exercises must identify their result kind and scope; they must not imply a network request succeeded.
- Connections declare request, dependency call, subscription/consumption, target registration, management, authorization, attachment, or annotation meaning. Extend the existing relationship representation incrementally; do not silently reinterpret persisted edges.
- Validate relationship semantics on creation, reconnection, editing, import, and fixture loading. Unsupported is distinct from invalid. Annotations never execute or grant permissions. Valid relationships may fail at runtime because of routing, security, IAM, health, or application state.
- Evaluate only dependencies attached to the resource. Unrelated ASGs, replica counts, multi-AZ flags, labels, or nearby nodes must not confer scaling, permissions, or reachability.
- Keep desired, observed, and effective failure state separate. Do not assume instantaneous scaling or recovery. Distinguish request failures from unsupported execution; never map every unsuccessful result to authorization denial.
- Configuration fields must declare their effect: behavior, validation, cost, or descriptive metadata. Do not imply machine specifications alone determine application throughput. Publish assumptions for educational capacity models.
- EKS and ECS composite views use explicit resource roles and relationships. Separate AWS-managed explanatory internals from customer-configurable resources. Expanded/collapsed layout must not change behavior.
- References and labs supply architecture, workload, initial state, teaching instructions and expected checks; they must not supply alternate service implementations or hard-coded successful outcomes.
- Unsupported services must not silently establish AWS success through the generic healthy-node fallback. Preserve honest metadata/annotation access and report the unsupported execution boundary.
- Traces are immutable evidence of the executed decisions, including applicable inputs, resource, operation, reason, rule reference, limitations, and correlation identifiers. Animation must consume that evidence rather than independently choose targets.

## Required service-specific inspector contract

The right-hand column exposes only configuration appropriate to the selected service/resource role. Keep Overview and Config as tabs; use collapsed InspectorAccordion sections for Teaching Notes and supporting controls. Reuse service-owned panels; register surfaces and placement applicability in inspectorProfile.ts. Keep common connection, display, cost and drawing controls separate. Do not expose universal replicas, AZ placement or RDS standby controls on unrelated services. Missing service panels get an honest coverage note. Opening/closing sections must not mutate architecture state; switching resources resets expansion. See [inspector ownership and verification](features/SERVICE_INSPECTOR.md).

## Workflow execution target

Architecture describes available resources and relationships. Workload describes which operations actually execute. Migrate existing scenarios incrementally to explicit calls, responses, branches, required/optional dependencies, and asynchronous publish/consume operations. A diagram edge is not an instruction to execute every downstream resource.

Use deterministic simulated time, stable event ordering and bounded retries. Store parent/child correlation and response outcomes. Network/IAM context must propagate through real calls and transparent hops correctly. Step numbers can describe an explicit operation order, but array order and drawing position cannot define application behavior. Management and explanatory internals are never generic application forwarding hops.

## Ordered implementation plan

Baseline execution audit and bounded parts of stages 2–4 are implemented; the complete stages remain open. Update status only with linked implementation and current test evidence.

| Stage | Work | Completion evidence |
| --- | --- | --- |
| 1 — baseline | Inventory entry points, duplicated decisions, exceptions, field effects, and affected fixtures; capture existing regressions | Current inventory and reproducible baseline; gaps ranked |
| 2 — contracts | Unify service schemas/defaults, explicit roles, typed relationships and scoped result kinds | Same configuration survives each loader/import; invalid/unsupported distinctions tested |
| 3 — shared evaluation | Consolidate live network/IAM evaluation and resource-scoped dependencies; retire heuristics incrementally | Positive/negative live tests; unrelated-node invariance |
| 4 — workflows | Introduce explicit operations, call/return and event scheduling behind existing entry points | Deterministic branches, required/optional calls, timeout and bounded retry tests |
| 5 — core depth | Networking/IAM first; EC2, ALB, ASG, RDS, S3 and Lambda in bounded slices | Documented operations, conformance, live composition, configuration effects |
| 6 — migration | Move references/labs/challenges onto shared contracts and execution; preserve intentional check-only exercises | Cross-context equivalence, persistence compatibility and fixture regressions |
| 7 — expansion | SQS/SNS asynchronous paths, then deeper ECS/Fargate/EKS composition | Event lifecycle and resource-role tests; honest coverage and limits |

Keep each stage deliverable small and reviewable. Existing working behavior may already satisfy parts of a stage; verify and reuse it. A later service request may address a bounded slice before all stages finish, but must disclose foundational limitations rather than bypass them.

## Required verification evidence

For each implemented operation cover success and relevant invalid configuration, network denial, IAM denial, unavailable dependency, and recovery/surviving path. Mark inapplicable cases with reasons. Add an unrelated-resource test where previous heuristics could affect the result.

For cross-context tests use equivalent normalized inputs and execution options through actual entry points. Compare final outcome, selected resources, evaluated operations and decision reasons; ignore run IDs, presentation text and decorative layout. Explicitly distinguish check-only labs instead of forcing them into request execution. Verify repeated runs and semantically equivalent node/edge reorderings preserve decisions unless workload ordering is explicitly meaningful.

AWS conformance cases record test ID, documented rule, official source, configuration, request, expected outcome and actual asserted result. Update docs/aws-behavior/* deviations where applicable. Passing tests establish only their enumerated scope, never complete service fidelity.

## Service slice completion record

Record specification link, implemented operations and exclusions, model/integration paths, official rules, exact test commands and outcomes, cross-context evidence, persistence impact, coverage changes and remaining gaps. If any required gate is unrun or failing, state that the slice is not fully verified. Do not mark roadmap stages complete based on build success alone.
