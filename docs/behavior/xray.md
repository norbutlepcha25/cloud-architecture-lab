# AWS X-Ray — xray

Status: PARTIAL — verified only for the listed root-segment submission behaviors.
Last reviewed: 2026-10-18. Catalog ID `xray` (AWS X-Ray, Developer Tools).

## Scope and resource roles

One operation: explicit `xray:PutTraceSegments` over HTTPS. EC2, Lambda, ECS and Fargate
publishers supply credentials. The X-Ray node represents the regional ingestion API, not an
application proxy or a customer ENI. A line does not enable automatic tracing or instrument code.
Supported documents are completed and in-progress root segments. Stored documents are simulator
state; they are not uploaded to AWS. No backend or actual AWS credentials are used.

Implementation: `engine/observability/xrayDocuments.ts` (document evaluation),
`engine/observability/xray.ts` (role, route, ingestion and recorded result),
`engine/service/models/xray.ts` (registered service contract),
`engine/simulation/adapters/xray.ts` and `liveSimulation.ts` (live entry points).

## Configuration contract

| Field | Type/default | Validation and effect | Persistence |
| --- | --- | --- | --- |
| `customConfig.segmentDocuments` | JSON array text, no implicit successful workload | Behavior: root objects or JSON document strings; invalid batch JSON/shape gives configuration failure | Existing customConfig |
| `customConfig.publisherNodeId` | Optional ID; infer only if exactly one valid publisher | Behavior: must identify a connected executable HTTPS publisher | Existing customConfig |
| Publisher `iamRole` | No default/grant | Behavior: trust, identity policy, explicit deny and supported boundary evaluation | Existing role representation |
| X-Ray `customConfig.serviceRuntime.records` | Empty until a submission | Observed state: documents keyed by trace_id/id, completion replaces in-progress | Existing Runtime/draft serialization |
| Runtime sequence/trace | Increment once per modeled batch | Observed submission count/summary; not AWS quotas or wall-clock time | Existing Runtime |
| Publisher/X-Ray `health` | Existing healthy default | Injected unavailability prevents submission | Existing failure state |

No workload means the X-Ray resource itself is not invalid. Submitting without an authored batch
fails with an explicit configuration explanation. The sample is loaded only by an explicit user
action; no permissions or successful documents are silently invented. Example IDs/times are fixed
teaching inputs, not production trace-ID generation or current timestamps.

## Behavior and acceptance matrix

Official sources below were checked 2026-10-18. Test file:
`tests/aws-conformance/observability/xray.test.ts`.

| Operation/condition | Expected decision | AWS source | Test/evidence |
| --- | --- | --- | --- |
| Completed root segment | HTTP 200, accepted document stored | [PutTraceSegments](https://docs.aws.amazon.com/xray/latest/api/API_PutTraceSegments.html) | XRAY-PUT-001, reference test |
| Valid and invalid documents in one batch | HTTP 200 with UnprocessedTraceSegments; valid items retained | PutTraceSegments | XRAY-PARTIAL-001 |
| Required fields, name charset/length, identifier formats and numeric/boolean types | Rejected items reported with reasons | [Segment documents](https://docs.aws.amazon.com/xray/latest/devguide/xray-api-segmentdocuments.html) | Required-field integration cases |
| UTF-8 document size above 64 KiB | Item not ingested | Segment documents | XRAY-SIZE-001 |
| In-progress then completed, same trace/id | One stored completed document | PutTraceSegments | XRAY-UPDATE-001 |
| No role, explicit deny, wrong trust or grant restricted to a group ARN | IAM denial; no ingestion | [X-Ray authorization reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_xray.html) | XRAY-IAM-001 |
| Private publisher lacks NAT/interface endpoint | Route failure; no ingestion | [X-Ray interface endpoints](https://docs.aws.amazon.com/xray/latest/devguide/xray-security-vpc-endpoint.html) | Private-publisher integration case |
| Matching interface endpoint or working NAT | Reachability permits subsequent IAM/API evaluation | X-Ray interface endpoints | Private-publisher integration case |
| Interface endpoint failure and recovery | Failure then successful new submission | Same route model; injected health is simulator input | Private-publisher integration case |
| VPC-connected Lambda with only IGW route | No public-internet access | [Lambda internet access](https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc-internet.html) | Private-publisher integration case |
| Invalid batch JSON or unavailable publisher/target | Specific configuration/availability failure, then recovery | API request requirements; health injection is educational | Configuration/health integration case |
| Direct X-Ray start/service button vs publisher API call | Same batch results and stored state through same evaluator | [Sending trace data](https://docs.aws.amazon.com/xray/latest/devguide/xray-api-sendingdata.html) | Standalone/live tests; UI submission test |

`accepted` is a simulator evidence field, not an AWS response property. The API-shaped evidence
includes `UnprocessedTraceSegments`. `InvalidSegment` error labels are simulator-local: exact AWS
per-item error-code/message mapping is UNKNOWN and not asserted. A rejected item is an informational
trace frame, not an HTTP request failure. Unsupported subsegments produce a scoped simulator 501
before any batch state is committed; this is not a claim that AWS rejects subsegments.

## Relationships and execution

- Incoming: EC2/Lambda/ECS/Fargate → X-Ray, explicit request, HTTPS/443,
  optional action `xray:PutTraceSegments`. Incompatible protocols/actions/ports are rejected.
- Outgoing X-Ray application forwarding is invalid. Automatic telemetry/dependency execution is
  not modeled; dependency edges are rejected rather than advertised as executable.
- Structural lab annotations, response drawings and unrelated nodes do not select publishers or
  grant permissions. Multiple valid publishers require explicit selection for an X-Ray start.
- Canvas creation, reconnection/editing, draft export/reload and reference loading share contracts.
  Existing lab annotation meanings remain unchanged. No persisted-edge migration is performed.
- Starting at a publisher executes the first selected X-Ray request through the live adapter.
  Starting at X-Ray or clicking Submit trace segments uses the configured connected publisher.
  This is an explicit API-operation convenience, not an X-Ray-owned execution role.
- Requests that do not invoke this explicit API call are not traced automatically. Sampling and
  observability delivery failures are not modeled as failures of unrelated application calls.

## Inspector surface and explanations

`XrayPanel.tsx`, registered as `xray` in inspectorProfile, lives in the collapsed **X-Ray trace
ingestion** accordion under Config. Existing Overview/Config tabs and other service panels remain.
It exposes publisher selection, the batch editor, Load sample segment, Submit trace segments and
stored segment summaries. Batch validation issues appear inline. No fake sampling/map controls.
Publisher permissions are configured on its own existing role panel; the shared role builder now
uses `xray:PutTraceSegments` with Resource `*` (this API has no resource-level ARN).

The run action preserves the saved request starting point. `runFromNode` now applies returned
serviceStates, as the main simulation action already does, so operation controls retain observed
state. Opening/closing the accordion does not submit or alter documents.

**More information** uses `xrayWalkthrough`, built from `runXraySubmission`: route, credentials,
per-document decisions, storage and batch response. Its publisher-failure what-if uses cloned
nodes. Live traces record AWS rule links and input/coverage metadata. JSON payloads contain
authored timestamps; simulation does not infer application timing from drawing positions.

## Identity/network and failure boundaries

Authorization reuses shared assumeRole/evaluateAuthorization via authorizeApplicationHop, using
the publisher's own role and Resource `*`. Synthetic account context remains inherited from the
shared IAM engine; this is not cross-account, SCP/session-policy or full IAM conformance.
Egress reuses subnetRouting with assumed/strict routing options. X-Ray needs no subnet itself.
Interface endpoint service ID is `xray`; existing endpoint configuration can author it.

Route success is partial reachability evidence. Endpoint policies, endpoint SG/NACL, private DNS
configuration, region availability, publisher egress/return packet controls and public-IP assignment
for EC2/ECS/Fargate are not fully evaluated. A publisher outside modeled VPC routing uses the
existing managed/public-access assumption, explicitly recorded. Scheduler/task readiness and
collector/daemon buffering are not modeled by this API-operation slice.

An injected failed endpoint/publisher prevents ingestion; restored health permits a new operation.
This does not establish a differentiated X-Ray failure simulator. FAILURE_SIMULATION stays false;
configuration, connectivity, IAM and request evidence are partial and do not certify FULL coverage.

## Integration and verification

New reference: `19-xray-segment-ingestion.json` (Lambda → X-Ray). Its role, request and sample
are explicit. Both routing modes succeed; detaching the role fails for IAM. Existing labs 13
remain configuration-only exercises; their wording/check dispatch is unchanged.

Verification 2026-10-18:
- `npx tsc --noEmit -p .`: passed.
- `npm test`: 609 engine/conformance and 50 UI tests passed.
- `npm run build`: passed; existing Vite bundle-size warning remains.
- Existing 64 lab/reference/routing records: zero differences in verdicts, paths, decisions/reasons
  or summaries. New reference adds two successful routing records (66 total).
- UI test covers drawn/reconnected connections, collapsed accordion, explicit submission,
  observed-state application, saved-start preservation, accordion reopening and draft reload.
- Conformance/integration tests cover immutability, reorder invariance, actual lab dispatch,
  annotation exclusion, unrelated endpoint isolation, denial, unavailable dependencies and recovery.
- Reference regression asserts live ingestion and IAM denial; walkthrough decisions match execution.

## Remaining work and lifecycle notice

Not implemented: sampling rules/reservoirs, automatic/active instrumentation, trace header
propagation, daemon UDP/ADOT collector behavior, nested/separate subsegments, full segment JSON
schema/optional-field semantics, trace age/retention/clock validation, throttling/quotas, indexing,
GetTraceSummaries/BatchGetTraces, service maps, cross-account observability, retries/backoff and
real AWS ingestion. Unsupported fields are not evidence of complete schema validation.

AWS's current [SDK/daemon timeline](https://docs.aws.amazon.com/xray/latest/devguide/xray-sdk-daemon-timeline.html)
places the X-Ray SDKs/daemon in maintenance mode from February 25, 2026 and recommends OpenTelemetry.
This implementation targets the ingestion API; it does not install or recommend the legacy SDK.
