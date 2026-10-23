# Service Behavior Engine: Documented Deviations and Scope

Companion to `docs/target-architecture/SERVICE_ENGINE.md` (design) and `src/engine/service/`
(implementation - Phase 7 of `docs/target-architecture/MIGRATION_PLAN.md`). Documents exactly what
is and isn't modeled per service tier, and every place this phase's own instructions ("do not
falsely claim full simulation", "do not invent unsupported AWS behavior") required a deliberate
scope cut.

## 0. Standalone, like Phase 5/6 - plus one real, verified extraction

`interaction.ts`'s `simulateInteraction()` is a standalone pipeline (request → resolve service
model → service model handles behavior, composed with the Phase 5 Network Engine and Phase 6 IAM
Engine) - not wired into `runSimulation`'s live per-hop trace, for the same reason Phase 5/6 were
kept standalone: no existing reference architecture authors the data (Principal/Policy assignments,
a Route Table) this composition needs, and wiring it in is a product decision about the canvas UI,
not an engine-design one.

**One piece of this phase genuinely IS wired into the live simulator**, though, per the phase's
explicit instruction to "remove service-specific behavior from generic request code wherever
possible": `adapters/computeCapacity.ts` no longer contains its own auto-scaling/saturation
decision logic inline - it now calls `evaluateCapacity()` from
`src/engine/service/models/compute.ts`, the same function the standalone Service Engine's compute
models use. This is a real, behavior-preserving extraction (`test/service-engine.test.ts` S2 is a
decisive regression guard for it, and the full existing suite - tests 10, 29, 30 in
`test/engine.test.ts` - passes unchanged). The other three service-specific adapters
(`loadBalancer.ts`, `dataTierInteraction.ts`, `cloudFront.ts`) were **not** extracted in this pass -
see §6.

## 1. Tier assignment and what "Tier 1 / Tier 2 / Tier 3" actually mean here

- **Tier 1** (24 services named in the task brief): a dedicated `ServiceModel` with a real,
  behaviorally-grounded `processRequest` - either mirroring existing adapter logic exactly
  (EC2/ECS/Fargate/Lambda capacity, ALB/NLB/API Gateway target-health, RDS/Aurora/DynamoDB
  failover, CloudFront caching) or a small, honestly-scoped new rule for a service the live
  simulator never modeled specially before (EKS, Route 53, VPC, IGW, NAT Gateway, IAM, STS).
- **Tier 2** (11 services): a "meaningful adapter" - one or two real behavioral facts (WAF's L7
  pattern inspection reusing the exact regex `perimeterInspectionAdapter` already uses; EventBridge's
  pattern-matching-can-silently-drop-an-event fact; ElastiCache as a cache-tier participant), not a
  full request lifecycle.
- **Tier 3** (everything else - ~290 remaining catalog entries): the generic fallback
  (`genericModel.ts`) built from the existing `AWSService` catalog entry only - metadata,
  trivial config validation (does a serviceId even resolve), a dependency list, "basic
  connectivity" (always reachable unless marked failed), and the catalog's own educational
  description. `processRequest` for a Tier 3 service does exactly one thing: check `health`. This
  is intentional and matches this phase's explicit instruction not to fabricate 327 deep models.

## 2. EKS: an honest extension, not a preserved behavior

Unlike every other Tier 1 compute service, **no existing adapter logic in
`src/engine/simulation/adapters/` ever mentioned `eks`** - it was not in `computeCapacityAdapter`'s
`COMPUTE_SERVICE_IDS`, not in `loadBalancerAdapter`'s target list, nothing. `eksModel` in
`models/compute.ts` models it as a non-serverless compute service (worker-node health/capacity,
like ECS), which is a reasonable, real-AWS-consistent behavior to assign - but it is a **new**
capability this phase adds, not a preserved one. It is not wired into the live traversal at all
(the live adapters' hardcoded service-id lists were left untouched, per §6's scope decision), so an
EKS node on the canvas today still behaves exactly as it did before this phase: generic pass-through.

## 3. DynamoDB's Multi-AZ rule is a preserved pre-existing approximation, not a new one

`data.ts`'s `dbProcessRequest` treats DynamoDB exactly like RDS/Aurora for the Multi-AZ-failover
rule: `isMultiAzDb` is true only if the node's own `multiAz` flag or `az === 'Multi-AZ'` is set (or
the serviceId is `aurora`). Real DynamoDB is **always** multi-AZ replicated under the hood - a
"failed, single-AZ DynamoDB table" isn't a real AWS failure mode at all. This model deliberately
preserves the exact grouping `adapters/dataTierInteraction.ts`'s `DB_SERVICE_IDS = ['rds',
'dynamodb', 'aurora']` already had, rather than silently fixing it as part of this phase - fixing it
would be an uncoordinated behavior change to the live simulator's DB-failure narrative, out of scope
for "build the Service Behavior Engine." Test S9 in `test/service-engine.test.ts` documents this
explicitly rather than hiding it.

## 4. SQS/SNS never check target health - preserved, not new

`messaging.ts`'s `processRequest` for both SQS and SNS always succeeds, regardless of
`target.health`. This mirrors `adapters/dataTierInteraction.ts`'s queue branch exactly, which never
reads `queueTarget.data.health` at all. It happens to be a reasonable approximation of SQS/SNS's
real extremely-high durability characteristics, but that is a happy coincidence, not the reason for
the behavior - the reason is behavior preservation of the existing (pre-Phase-7) simulator. Test S10
documents this explicitly.

## 5. Tier 2 models: exactly the "one or two facts", nothing deeper

None of the Tier 2 models attempt lifecycle depth. Specifics:
- **ECR**, **EFS**, **KMS**, **Secrets Manager**, **Cognito**, **CloudWatch**: a single shared
  passthrough shape (health check only) - there was no existing behavior to preserve and no
  single dominant behavioral fact obviously worth encoding beyond "is it up."
- **EventBridge**: models the one real fact worth surfacing - an event that matches no rule is
  silently dropped, not retried or dead-lettered by default.
- **Step Functions**: models one real fact - an uncaught error in a state transition fails the
  whole execution (no automatic retry/catch modeled).
- **ElastiCache**: modeled as a cache-tier participant (own health/config validation), but its
  role as a circuit-breaker fallback FOR a failed database is (correctly) modeled on the caller
  side / in `interaction.ts`'s future composition, not duplicated here - see §0's data.ts note.
- **WAF**: reuses the exact malicious-pattern regex `perimeterInspectionAdapter` already uses -
  genuinely the same behavior, not a new invention.
- **VPC Endpoints** (`s3_gateway_endpoint`, `privatelink`): thin wrappers exposing the
  gateway-vs-interface distinction (`EndpointCapabilities.isVpcEndpoint`) already established in
  Phase 5's Network Engine (`NETWORK_ENGINE.md` §6) - not new logic, a new home for existing facts.

## 6. What was NOT extracted from the live adapters in this pass

Per `SERVICE_ENGINE.md` §3's own migration table, only `computeCapacityAdapter` was extracted to
delegate to the Service Behavior Engine's registry in this pass (§0 above). `loadBalancerAdapter`,
`dataTierInteractionAdapter`, and `cloudFrontAdapter` still contain their decision logic inline,
even though `models/edge.ts`'s `evaluateLoadBalancing()` and `models/edge.ts`'s CloudFront
`processRequest` implement the equivalent logic standalone (and are tested identically via
`test/service-engine.test.ts`). Extracting all three, one at a time, verified against the full
suite exactly as `computeCapacityAdapter` was, is the natural next increment - not attempted here to
keep this phase's live-code changes to the one, most clearly bounded and lowest-risk extraction.

## 7. Interaction outcome vocabulary: a 5th category, `service_failure`

The task brief names four outcome categories (success / network failure / IAM failure / config
failure). `interaction.ts` uses a fifth, `service_failure`, for the case none of the first four
correctly describe: the target is reachable, authorized, and correctly configured, but its own
runtime state can't fulfill the request right now (a database with a dead primary and no standby,
a load balancer with zero healthy targets, a saturated single compute instance). Collapsing this
into `config_failure` would misrepresent a transient operational state as a structural misconfiguration
- exactly the kind of invented/incorrect behavior this phase's brief warned against. Every
interaction test (`test/service-engine.test.ts` S3-S11) that hits this category names it explicitly.

## 8. STS and "Subnet"/"Security Group"/"NACL"/"Route Table" have no ServiceModel entry

- **STS** (`stsModel`) exists in the registry as a documentation placeholder only - there is no
  `sts` serviceId in `src/data/serviceCatalog.ts` and no canvas node can ever carry it, matching
  real AWS where STS is a control-plane API, never a resource you place on an architecture diagram.
- **Subnet, Security Group, NACL, Route Table**: these are boundary/config constructs
  (`boundaryType` values on a `boundaryNode`), not entries in `AWS_SERVICES` - there is no serviceId
  to resolve a `ServiceModel` for. Their behavior is fully owned by the Phase 5 Network Engine
  (`src/engine/network/`) and `src/engine/layout/containment.ts`, unchanged by this phase. Forcing
  an artificial `ServiceModel` onto a non-service concept would misrepresent what this abstraction
  is for.

## Developer-tool connection scope (2026-10-18)

CI/CD management links and legacy HTTPS drawings share the live workflow engine. Artifact
routing, artifact cardinality and CodeBuild PrimarySource validation are bounded supported behavior;
see [CodePipeline specification](../behavior/codepipeline.md#connection-consistency-increment--2026-10-18).
Canvas-derived stages remain educational shorthand. Missing service roles are still reported
NOT_EVALUATED rather than denied, artifact-store access is not fully evaluated, and complete event-trigger fan-out/filtering remains unsupported. Standalone build/deploy now
have a bounded implementation documented in their service specs; caller API authorization,
source/revision contents and command/hook execution remain unmodeled. Passing
connection validation is not proof of runtime access or complete AWS service fidelity.

## X-Ray root-segment API slice (2026-10-18)

[Specification and evidence](../behavior/xray.md): explicit PutTraceSegments ingestion now runs
through the shared live dispatcher with publisher credentials, shared route checks and per-item
results. This is not automatic tracing. Root required fields, name/ID formats, size, partial
batch acceptance and in-progress replacement are bounded supported behavior. Exact item error
codes, full optional-field schema, trace time freshness, sampling, subsegments, querying/maps,
collector behavior and endpoint policy/firewall completeness remain outside coverage. API success
can contain unprocessed documents. Store/UI `accepted` counts and `InvalidSegment` labels are
simulator evidence, not guaranteed AWS response fields/error strings. Generic injected health
failure is tested without claiming specialized X-Ray FAILURE_SIMULATION or FULL_BEHAVIOR.

## Third-party actors and assumed gateways (2026-10-22)

- External actors are modeled as internet endpoints only; Git push results are workflow evidence,
  not packet traces. GitHub/GitLab/Bitbucket permissions and webhook delivery are not simulated.
- CodeCommit developer identity uses preset identity policies (Git subset of the AWS managed
  policies), not the full managed policy documents or branch-condition keys.
- "Assume gateways" deliberately deviates from AWS (a VPC without an IGW has no internet path);
  it is opt-in, labeled in every trace step it affects, and never overrides drawn gateways.
- Service integrations (serviceIntegrations.ts): build dependencies are checked as role permissions
  plus health only (no secret values, packages or signatures); EventBridge patterns match branch
  only; non-executed integrations are relationship-only and say so in their connection reason.
