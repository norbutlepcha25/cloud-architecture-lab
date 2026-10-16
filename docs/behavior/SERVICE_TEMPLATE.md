# <Service name> — <canonical service ID>

Status: PLANNED / PARTIAL / VERIFIED FOR LISTED OPERATIONS. Verified does not mean full AWS fidelity.
Last reviewed: <date>. Implementation owner: <module paths>.

## Scope and resource roles

List modeled operations, supported resource roles, related service boundaries, and explicit exclusions.

## Configuration contract

| Field | Type/default | Validation | Effect: behavior / validation / cost / metadata | Persistence compatibility |
| --- | --- | --- | --- | --- |

## Behavior and evidence matrix

| Rule/test ID | Operation or condition | Expected observable decision | Official source and verification date | Implementation | Live/conformance test | Status/limitation |
| --- | --- | --- | --- | --- | --- | --- |

Use UNKNOWN for unresolved semantics. Do not treat catalog metadata as evidence.

## Inspector surface

Name the service-owned panel and inspectorProfile registration. List applicable accordion sections and shared controls, field effects, and absent/unsupported controls. Test collapsed defaults, resource selection reset, keyboard-accessible expansion, retained edits and persistence. Do not invent generic capacity or replication settings.

## Relationships and execution

Document accepted incoming/outgoing relationships, endpoints, ports/actions, request and response behavior, dependencies, workload operations, and unsupported combinations. Separate control plane, data plane, and annotations.

## Identity, authorization and network context

Specify caller/resource identity, VPC/subnet/ENI associations, route and firewall checks, credential/role handling, and inapplicable cases with reasons. Delegate to shared evaluators.

## State and failures

Separate desired/observed/effective state. Describe affected and surviving requests, recovery timing and assumptions, and explicitly unmodeled failures.

## Explanation overlay

For multi-step or asynchronous behavior, name the walkthrough builder (engine/explain/), its lanes,
what-if toggles and tests. The overlay must be built from engine decisions and never edit the architecture.

## Trace and coverage

List recorded decisions, source references, capability evidence, student explanations, and approximation disclosures.

## Integration and verification

Record actual paths through UI, live execution, references, labs and challenges; configuration-only exceptions; cross-service tests; cross-context equivalence; ordering/repeatability checks; serialization compatibility. Record exact commands, current outcomes and blockers.

## Remaining work

List bounded next slices. Keep unimplemented features out of implemented coverage.
