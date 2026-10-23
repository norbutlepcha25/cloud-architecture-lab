# AWS service behavior update and integration backlog

Audit date: 2026-09-13  
Status: planning backlog; unchecked items are not implemented by this document.

## Scope and evidence

Reviewed the service catalog and registry, all service-model families, live request/adapters and child-call path, IAM/network integration seams, validation/failure interfaces, canvas/context trace mapping, capability evidence tables, reference templates, and relevant test suites. Enumerated source/test files; this is a behavior-focused repository audit, not a claim of line-by-line review of every SVG, stylesheet, or unrelated cost/UI file.

The appendix is generated from the actual catalog and registry: **327 catalog entries; 33 dedicated model registrations; 294 generic model fallbacks**. A dedicated model can be only a health check. Four generic entries appear in the curated live-adapter list: three client abstractions and App Runner. Some catalog entries are concepts or variants rather than distinct AWS services.

**No service is certified FULL by this audit.** All AWS-service entries need either correction, deeper behavior, or explicit unsupported coverage. Keep client abstractions as simulation inputs, not AWS services requiring full implementation.

Current baseline: `npm test` was run for this audit; all 312 tests passed (304 engine/conformance and 8 UI integration tests). The inventory was also checked programmatically: 327 rows, 327 unique IDs, no missing catalog entries. A passing test proves only its asserted scenario; model-existence tests and generic health checks are not AWS fidelity evidence.

## Fix these shared blockers first

- [ ] **P0-A: Authoritative execution contract.** UI calls `runLiveSimulation` → legacy adapters. `runUnifiedPipeline` remains separate; some experiments and tests call compatibility `runSimulation` without IAM. Selectively delegate to shared evaluators and verify live behavior before retiring compatibility paths.
- [ ] **P0-B: Packet and route context.** Connect source/destination IP, port, protocol, VPC and subnet route-table associations to every hop. Live firewall calls omit source CIDR/port context in places; standalone evaluator tests do not establish live enforcement.
- [ ] **P0-C: SG/NACL directions.** Keep SG statefulness distinct from NACL statelessness. Check egress and ingress plus actual response packet; replace the return-path search for an ephemeral-rule label with rule evaluation. Preserve the recently corrected subnet-only NACL inspector.
- [ ] **P0-D: IAM identity and policy context.** Remove synthetic service principals/ARN assumptions from authoritative tests; validate resource policies, boundaries, session/SCP context and cross-account rules only for documented supported cases. Trust-policy matching alone is not full STS authorization.
- [ ] **P0-E: Child calls.** `ecsDependencyCalls.ts` runs direct ECS→DynamoDB calls but skips route selection, source egress and explicit return-path evaluation. Missing targets are filtered away; optional IAM denial still terminates the parent. The explanatory “returned” string and `returnsToNodeId` are not an actual reverse packet stage. Add explicit parent/child IDs, call/response stages, required/optional behavior and cache state.
- [ ] **P0-F: Animation truth.** `CustomConnectionEdge.tsx` distributes load across healthy siblings independently of the execution engine. Move selection/allocation into engine results so each bubble corresponds to a recorded request or explicitly labeled aggregate.
- [ ] **P0-G: Capability truth.** `capability/registry.ts` treats trivial validation as coverage and derives FULL from coarse booleans. Replace certification with behavior IDs and live conformance evidence; unknown applicability must not count as proven NOT_APPLICABLE.
- [ ] **P0-H: Failure consistency.** Reconcile generic failed-health checks, service failover branches and child-call results. Test surviving calls, AZ scope, required dependencies, and failure timing through the same live entry point.
- [ ] **P0-I: Stable identifiers.** The DIT template now uses `ecr`, but the catalog and dedicated ECR model use `ecr_registry`. Correct or explicitly alias it and regression-test every template node ID. Do not silently replace existing user canvas data.
- [ ] **P0-J: Validation versus simulation versus quality.** Keep these results separate; route absence, IAM rejection and lack of redundancy must not become interchangeable findings.

### Network and identity objects outside the catalog

These need their own behavior work even though the appendix has no separate catalog row for each:

| Object | Required next behavior | Integration proof |
|---|---|---|
| Subnets | Logical VPC association, valid/non-overlapping CIDR, actual route-table association | Same VPC internal call survives NAT failure |
| Security groups | ENI attachments, packet-aware CIDR/reference rules, inbound/outbound and stateful response | ALB→ECS allowed; unrelated source denied |
| NACLs | Ordered rules for both directions and ephemeral response ports | Outbound request allowed but response denied produces timeout |
| ENIs | Addresses, SG IDs and subnet/AZ identity independent of drawing position | Task or instance moves only through a modeled configuration change |
| Routes | Longest-prefix selection, target existence and blackhole state | More-specific route beats default and explains selected route |
| STS | Caller authorization plus trust/context, session credentials/expiry within declared scope | Trusted-but-unauthorized caller denied where AWS requires both |
| AZs | Explicit placement/replicas and dependency scope | One AZ outage preserves an independent AZ path |

## Ordered service work

P0 = shared correctness prerequisite; P1–P7 = staged service expansion. These are sequencing groups, not promises of complete AWS emulation. Finish one bounded behavior slice with its integration tests before taking the next row. All tasks below are open.

| Service ID | Stage | Observed coverage | Update to implement | Integrate with | Evidence under src/engine unless noted |
|---|---|---|---|---|---|
| `vpc` | P0 | Partial network infrastructure | [ ] Bind resource/VPC/subnet IDs independently of geometry; scope gateways and endpoints to their VPC; make invalid/missing configuration distinguishable from denied traffic. | EC2, ALB, ECS, RDS | layout/containment.ts; validation/network.ts; simulation/adapters/networkPath.ts |
| `route_tables` | P0 | Placeholder model; separate route evaluator | [ ] Attach actual route tables to subnets; call longest-prefix evaluator in every live request and child call; model blackholes and route target failure. | IGW, NAT, endpoints, peering | network/routeTable.ts; service/models/networkingPrimitives.ts |
| `internet_gateway` | P0 | Partial; architecture-wide lookup | [ ] Scope attachment to VPC; evaluate route and public address requirements; distinguish VPC-origin prerequisite from actual transit. | EC2, ECS, CloudFront | simulation/adapters/networkPath.ts |
| `nat_gateway` | P0 | Partial path/placement logic | [ ] Scope chosen NAT to actual routes and AZ; separate public/private NAT semantics; verify return path and surviving internal calls. | Private EC2/ECS, external APIs | network/nat.ts; simulation/adapters/natGatewayHop.ts |
| `s3_gateway_endpoint` | P0 | Partial live endpoint path | [ ] Match endpoint service, route table and VPC; apply endpoint policy; add DynamoDB gateway endpoint support separately. | S3, DynamoDB, EC2/ECS | simulation/adapters/vpcEndpoint.ts; network/nat.ts |
| `privatelink` | P0 | Partial interface endpoint path | [ ] Model endpoint ENIs, DNS resolution, SGs, service identity and endpoint policies; reject mismatched endpoints. | ECR, Secrets Manager, KMS | service/models/networkingPrimitives.ts; simulation/adapters/vpcEndpoint.ts |
| `iam` | P0 | Real evaluator; incomplete live context | [ ] Normalize service principals; use real action/ARN/account/context; resource policies and policy ceilings must reach live calls; keep decorative IAM node separate. | Every AWS API caller | iam/applicationHop.ts; iam/evaluate.ts; validation/iam.ts |
| `ec2` | P1 | Partial runtime; approximate scaling | [ ] Model running/stopped state, ENI/network identity and attached instance role; require actual ASG membership and policy for scaling. | ALB, EBS, RDS, S3 | service/models/compute.ts; simulation/adapters/computeCapacity.ts |
| `lambda` | P1 | Partial; generic serverless scaling | [ ] Add execution-role principal compatibility, invocation permissions, timeout and concurrency limits, explicit VPC attachment and trigger retry semantics. | API Gateway, SQS, S3, DynamoDB | service/models/compute.ts; iam/applicationHop.ts |
| `ecs` | P1 | Partial awsvpc runtime and DynamoDB child call | [ ] Complete child routing/return trace, cache selection and missing-target handling; separate task/execution roles; add startup dependencies and scheduler recovery. | ALB, DynamoDB, S3, ECR, Secrets Manager | service/models/ecs.ts; simulation/adapters/ecsDependencyCalls.ts |
| `fargate` | P1 | Approximation; diverges from ECS model | [ ] Use ECS task/network/role contract for ECS launch type; do not infer automatic task scaling solely from Fargate; keep EKS Fargate distinct. | ECS, ECR, ALB | service/models/compute.ts |
| `eks` | P1 | Generic compute-like dedicated model | [ ] Separate cluster/control plane, nodes, pods, Services, readiness and pod identity; bound first slice to pod-to-AWS API access. | VPC, IAM, ECR, ALB, EFS | service/models/compute.ts; service/registry.ts |
| `s3` | P2 | Partial IAM/endpoint path; generic object response | [ ] Add bucket/object existence, action-specific ARNs, bucket policy, public access controls, KMS dependency and CloudFront OAC. | ECS/Lambda, CloudFront, KMS | service/models/data.ts; simulation/adapters/terminalNode.ts |
| `rds` | P2 | Approximate relational health/failover | [ ] Model engine/port, DB authentication, writer/standby topology and failover interval; avoid success solely from multiAz flag. | EC2/ECS/Lambda, SG, Secrets Manager | service/models/data.ts; simulation/adapters/dataTierInteraction.ts |
| `aurora` | P2 | Shares coarse database model | [ ] Separate storage redundancy from available compute replicas; writer/reader endpoints and promotion eligibility. | ECS, RDS interfaces, DNS | service/models/data.ts |
| `dynamodb` | P2 | Partial IAM lookup; inconsistent DB-style failure path | [ ] Separate from relational failover semantics; model GetItem/PutItem, key/result/absence, throughput and retry outcomes; reuse in child calls. | ECS/Lambda, endpoints, KMS | service/models/data.ts; simulation/adapters/ecsDependencyCalls.ts |
| `alb` | P3 | Partial routing; health semantics approximation | [ ] Distinguish no registered targets from all unhealthy; implement fail-open correctly; listener/target-group and per-request routing; engine-owned packet allocation. | EC2, ECS, Lambda, CloudFront | service/models/edge.ts; simulation/adapters/loadBalancer.ts |
| `nlb` | P3 | Shares ALB-like HTTP model | [ ] Use L4 connection outcomes, flow affinity, listener protocol, source IP and fail-open; avoid invented HTTP errors for TCP failures. | EC2/ECS, PrivateLink | service/models/edge.ts; simulation/adapters/loadBalancer.ts |
| `api_gateway` | P3 | Integration routing mixed with load-balancer selection | [ ] Explicit route/method/integration mapping; authorizer and invocation permissions; timeouts and response mapping. | Lambda, Cognito, IAM | service/models/edge.ts; simulation/adapters/loadBalancer.ts |
| `sqs` | P4 | Approximate enqueue; health ignored in some paths | [ ] Queue state, Send/Receive/Delete, visibility timeout, retries/DLQ; distinguish API 200 acknowledgment from app response 202. | Lambda/ECS, IAM, KMS | service/models/messaging.ts; simulation/adapters/dataTierInteraction.ts |
| `sns` | P4 | Publish narrative; limited event plumbing | [ ] Subscription fan-out, filter policies, endpoint permissions, delivery failure/retry; publisher acknowledgment separate from delivery. | SQS, Lambda, HTTP endpoints | service/models/messaging.ts |
| `cloudfront` | P5 | Explicit cache state in live adapter; heuristic elsewhere | [ ] Unify cache behavior; cache key/TTL and origin failures; configure private origin/SG/return rules; viewer functions and OAC in bounded slices. | ALB, S3, Lambda edge features | service/models/edge.ts; simulation/adapters/cloudFront.ts; simulation/adapters/networkPath.ts |
| `route53` | P5 | DNS pass-through approximation | [ ] Records/aliases, answers, NXDOMAIN, TTL and health-routing state; separate DNS lookup from HTTP forwarding. | ALB, CloudFront, endpoints | service/models/edge.ts |
| `ecr_registry` | P6 | Dedicated health-only placeholder | [ ] First repair ecr versus ecr_registry template identity; model execution-role image pull, repository/tag absence and endpoint/Internet reachability. | ECS/Fargate/EKS, IAM, S3 | service/models/tier2.ts; data/referenceArchitectures.ts |
| `efs` | P6 | Endpoint flag and health-only model | [ ] Mount targets per AZ, NFS port/security, access points and filesystem permissions; mount availability. | EC2, ECS, EKS | service/models/tier2.ts |
| `kms` | P6 | Health-only model plus representative IAM action | [ ] Key policy plus identity authorization; key state, grants and encrypt/decrypt context; propagate only to encrypted operations. | S3, DynamoDB, SQS, Secrets Manager | service/models/tier2.ts; capability/iamCoverage.ts |
| `secrets_manager` | P6 | Health-only model plus IAM target | [ ] Secret/version existence, GetSecretValue authorization, KMS dependency and rotation stages. | ECS startup/app calls, Lambda, RDS | service/models/tier2.ts |
| `eventbridge` | P7 | Narrated rule match; no actual pattern evaluation | [ ] Event pattern matching, target-specific permission, fan-out, retry and DLQ. | Lambda, SQS, Step Functions | service/models/tier2.ts |
| `step_functions` | P7 | Narrated state transition | [ ] Explicit states/transitions, Task integrations, Retry/Catch/Choice and failure propagation. | Lambda, ECS, DynamoDB | service/models/tier2.ts |
| `elasticache` | P7 | Health/cache fallback approximation | [ ] Key/hit/miss/TTL state; distinguish Redis-compatible and Memcached behavior; caller must explicitly configure fallback. | ECS/EC2, RDS | service/models/tier2.ts; simulation/adapters/dataTierInteraction.ts |
| `cognito` | P7 | Health-only; no token validation | [ ] User-pool token issuance/validation, audience/issuer/expiry/scopes; separate identity pools from user pools. | API Gateway, Amplify, DIT admin | service/models/tier2.ts |
| `cloudwatch` | P7 | Health-only placeholder | [ ] Emit metrics/logs from real events; configured alarms with deterministic windows; no arbitrary causal link to resource health. | ECS, Lambda, ASG | service/models/tier2.ts |
| `waf` | P7 | Path regex approximation | [ ] Rules/action/priority and configured request inspection; valid paths must not be denied merely for words such as admin. | CloudFront, ALB, API Gateway | service/models/tier2.ts; simulation/adapters/perimeterInspection.ts |
| `ec2_auto_scaling` | P1 | Metadata with indirect live heuristic | [ ] Membership, desired/min/max and configured policy; launch delay/health replacement and AZ distribution. | EC2, ALB, CloudWatch | service/models/compute.ts |
| `app_runner` | P7 | Generic model with live compute branching | [ ] Explicit service ingress, VPC connector egress and execution roles; scaling configuration. | ECR, VPC, IAM | simulation/adapters/computeCapacity.ts |
| `ebs` | P7 | Generic fallback | [ ] Volume AZ, attachment, mount state and I/O availability; encrypted volume dependencies. | EC2, KMS | service/genericModel.ts |
| `rekognition` | P7 | Generic fallback; DIT arrow unexecuted | [ ] Bound DetectLabels/DetectFaces or moderation operation; IAM, source image and cached detection result; failure must follow configured optionality. | ECS, S3, DynamoDB | service/genericModel.ts; data/referenceArchitectures.ts |
| `amplify` | P7 | Generic forwarding through portal template | [ ] Separate hosting assets from auth/API integration; bounded static hosting and deployment availability semantics. | CloudFront, S3, Cognito | service/genericModel.ts; data/referenceArchitectures.ts |

## Test expectations that need correction, not weaker assertions

1. **ALB all-unhealthy behavior:** shared routing logic equates all unhealthy with no target and 503. AWS describes fail-open routing when only unhealthy targets remain. Distinguish registration/health from actual target reachability; a routed unhealthy target can still fail. Update the ALB conformance and legacy expectations with documented cases. [AWS target health](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html)
2. **NLB behavior:** shared ALB-like errors do not establish L4 behavior. Test fail-open and connection resets separately. [AWS NLB troubleshooting](https://docs.aws.amazon.com/elasticloadbalancing/latest/network/load-balancer-troubleshooting.html)
3. **SQS acknowledgment:** `SVC-SQS-SUCCESS-001` expects 202 as AWS behavior. SendMessage returns HTTP 200 on success; an application may separately return 202. Preserve an application-response test and add the actual queue API contract. Durability does not prove a failed endpoint can accept a publish. [AWS SendMessage](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_SendMessage.html)
4. **Fargate scaling:** `SVC-FARGATE-SERVERLESS-SCALING-001` and the generic capacity model need review; Fargate infrastructure management is not proof of automatic ECS desired-count scaling. Configure the scaling policy and distinguish desired/running tasks.
5. **IAM tests:** validation-only missing-role tests must be supplemented by actual live denied-request tests. Model existence/tier checks belong to internal regression, not AWS behavior counts.
6. **DynamoDB/RDS/Aurora:** shared relational failover assertions need service-specific replacement; a Multi-AZ flag alone does not establish a surviving endpoint or recovery time.
7. **CloudFront:** extension-based cache HIT tests encode an approximation. Retain only as labeled legacy compatibility; test cache contents/key/TTL and explicit miss/hit in the authoritative engine.

For each corrected test, record its old assertion, official source, new expected decision and retained regression purpose. Do not delete or loosen an assertion merely to obtain a green run.

## Integration slices and acceptance gates

1. **Repair current DIT child call:** routing + IAM + actual response trace; absent dependency must fail configuration; optional denial follows explicit caller policy; no S3 fetch after a required policy lookup fails.
2. **Networking and IAM foundation:** VPC-scoped routes, packet security, supported authorization context; prove EC2→RDS and ECS→S3 with positive and negative cases.
3. **Core compute:** EC2 then Lambda then ECS/Fargate then EKS; share ENI/identity contracts without conflating their scheduling models.
4. **Data:** S3 then RDS/Aurora then DynamoDB; explicit operations and resource identities; add EBS/EFS when required by the chosen compute slice.
5. **Request entry:** ALB/NLB then API Gateway; engine produces actual per-request target decisions and response outcomes.
6. **Async and edge:** SQS/SNS then CloudFront then Route 53. Do not interpret DNS answers or queue delivery as synchronous HTTP forwarding.
7. **Supporting dependencies:** ECR then EFS then KMS then Secrets Manager then EventBridge; extend the DIT workflow with Cognito, Rekognition and Amplify as separate bounded tasks.
8. **Remaining catalog:** select one entry from the appendix based on student scenarios. Start with the generic backlog below, then write a service-specific specification.

Every slice must include:
- [ ] Official behavior reference and precise scope; uncertain behavior stays UNKNOWN.
- [ ] Typed configuration and reusable service/network/IAM rules outside React.
- [ ] Success, invalid configuration, missing permission, blocked network, service failure, and surviving unrelated request tests.
- [ ] Same result through Send Request and Task Flow, including child calls and failure injection.
- [ ] Ordered explanatory decisions and animation derived from those decisions.
- [ ] Existing reference regressions pass, except documented AWS corrections.
- [ ] Determinism test and no mutation of input architecture.
- [ ] Capability evidence and deviations updated; no FULL badge based on model registration.

## Generic backlog for every remaining entry

**G1** — Define the first useful operation and configuration constraints from the service's official guide/API reference. Identify whether it is data plane, control plane, asynchronous delivery, or only an educational object.  
**G2** — Model endpoint/network identity, action/resource/principal and real dependencies; define success, denial and unavailable outcomes.  
**G3** — Add one dedicated module and wire it into the authoritative live path, including response and failure propagation.  
**G4** — Add official-source conformance and integration tests; keep unsupported features labeled.  
**G5** — Promote only the proven capability slice. A generic health-check success is not evidence of the real service operation.

Each generic appendix entry is a candidate requiring G1–G5. Exact AWS semantics for these long-tail entries were not researched individually in this audit. They are deliberately not guessed.

## Complete catalog inventory

“Dedicated” means registered code, not deep fidelity. “Generic” means catalog fallback; common graph/health behavior may still apply. The stage links each entry to the detailed table or G1–G5. Client entries are retained for inventory completeness.

| # | Service | Catalog ID | Current model | Next backlog |
|---|---|---|---|---|
| 1 | End User / Client | `user` | Generic + live branching | Client input contract; not an AWS service |
| 2 | Data Transfer Hub UI | `client_ui` | Generic + live branching | Client input contract; not an AWS service |
| 3 | External API Consumer | `api_client` | Generic + live branching | Client input contract; not an AWS service |
| 4 | AWS Lambda | `lambda` | Dedicated | P1 — detailed row above |
| 5 | Amazon EC2 | `ec2` | Dedicated | P1 — detailed row above |
| 6 | Amazon ECS | `ecs` | Dedicated | P1 — detailed row above |
| 7 | AWS Fargate | `fargate` | Dedicated | P1 — detailed row above |
| 8 | Amazon EKS | `eks` | Dedicated | P1 — detailed row above |
| 9 | AWS App Runner | `app_runner` | Generic + live branching | P7 — detailed row above |
| 10 | AWS Elastic Beanstalk | `elastic_beanstalk` | Generic | P8 — G1–G5, one selected operation at a time |
| 11 | Amazon Lightsail | `lightsail` | Generic | P8 — G1–G5, one selected operation at a time |
| 12 | AWS Batch | `batch` | Generic | P8 — G1–G5, one selected operation at a time |
| 13 | AWS Outposts | `outposts` | Generic | P8 — G1–G5, one selected operation at a time |
| 14 | AWS Wavelength | `wavelength` | Generic | P8 — G1–G5, one selected operation at a time |
| 15 | AWS Local Zones | `local_zones` | Generic | P8 — G1–G5, one selected operation at a time |
| 16 | AWS Serverless Application Repository | `serverless_app_repo` | Generic | P8 — G1–G5, one selected operation at a time |
| 17 | Amazon EC2 Auto Scaling | `ec2_auto_scaling` | Generic | P1 — detailed row above |
| 18 | Bottlerocket OS | `bottlerocket` | Generic | P8 — G1–G5, one selected operation at a time |
| 19 | AWS Nitro Enclaves | `nitro_enclaves` | Generic | P8 — G1–G5, one selected operation at a time |
| 20 | AWS SimSpace Weaver | `simspace_weaver` | Generic | P8 — G1–G5, one selected operation at a time |
| 21 | EC2 Image Builder | `ec2_image_builder` | Generic | P8 — G1–G5, one selected operation at a time |
| 22 | AWS ParallelCluster | `parallelcluster` | Generic | P8 — G1–G5, one selected operation at a time |
| 23 | Elastic Load Balancing (ELB) | `elastic_load_balancing_comp` | Generic | P8 — G1–G5, one selected operation at a time |
| 24 | AWS Compute Optimizer | `compute_optimizer` | Generic | P8 — G1–G5, one selected operation at a time |
| 25 | AWS Snowball Edge Compute | `snowball_compute` | Generic | P8 — G1–G5, one selected operation at a time |
| 26 | AWS App2Container | `app2container` | Generic | P8 — G1–G5, one selected operation at a time |
| 27 | AWS Copilot | `copilot_cli` | Generic | P8 — G1–G5, one selected operation at a time |
| 28 | Amazon ECS Anywhere | `ecs_anywhere` | Generic | P8 — G1–G5, one selected operation at a time |
| 29 | Amazon S3 | `s3` | Dedicated | P2 — detailed row above |
| 30 | Amazon S3 Glacier | `s3_glacier` | Generic | P8 — G1–G5, one selected operation at a time |
| 31 | Amazon EBS | `ebs` | Generic | P7 — detailed row above |
| 32 | Amazon EFS | `efs` | Dedicated | P6 — detailed row above |
| 33 | Amazon FSx for Windows File Server | `fsx_windows` | Generic | P8 — G1–G5, one selected operation at a time |
| 34 | Amazon FSx for Lustre | `fsx_lustre` | Generic | P8 — G1–G5, one selected operation at a time |
| 35 | Amazon FSx for NetApp ONTAP | `fsx_ontap` | Generic | P8 — G1–G5, one selected operation at a time |
| 36 | Amazon FSx for OpenZFS | `fsx_openzfs` | Generic | P8 — G1–G5, one selected operation at a time |
| 37 | AWS Storage Gateway | `storage_gateway` | Generic | P8 — G1–G5, one selected operation at a time |
| 38 | AWS Backup | `backup` | Generic | P8 — G1–G5, one selected operation at a time |
| 39 | AWS Snowball | `snowball` | Generic | P8 — G1–G5, one selected operation at a time |
| 40 | AWS Snowcone | `snowcone` | Generic | P8 — G1–G5, one selected operation at a time |
| 41 | AWS Snowmobile | `snowmobile` | Generic | P8 — G1–G5, one selected operation at a time |
| 42 | AWS Elastic Disaster Recovery (DRS) | `elastic_disaster_recovery` | Generic | P8 — G1–G5, one selected operation at a time |
| 43 | Amazon S3 on Outposts | `s3_outposts` | Generic | P8 — G1–G5, one selected operation at a time |
| 44 | Amazon S3 Object Lambda | `s3_object_lambda` | Generic | P8 — G1–G5, one selected operation at a time |
| 45 | Amazon DynamoDB | `dynamodb` | Dedicated | P2 — detailed row above |
| 46 | Amazon RDS | `rds` | Dedicated | P2 — detailed row above |
| 47 | Amazon Aurora | `aurora` | Dedicated | P2 — detailed row above |
| 48 | Amazon Aurora Serverless v2 | `aurora_serverless` | Generic | P8 — G1–G5, one selected operation at a time |
| 49 | Amazon ElastiCache | `elasticache` | Dedicated | P7 — detailed row above |
| 50 | Amazon MemoryDB for Redis | `memorydb` | Generic | P8 — G1–G5, one selected operation at a time |
| 51 | Amazon DocumentDB | `documentdb` | Generic | P8 — G1–G5, one selected operation at a time |
| 52 | Amazon Neptune | `neptune` | Generic | P8 — G1–G5, one selected operation at a time |
| 53 | Amazon Timestream | `timestream` | Generic | P8 — G1–G5, one selected operation at a time |
| 54 | Amazon Keyspaces | `keyspaces` | Generic | P8 — G1–G5, one selected operation at a time |
| 55 | Amazon QLDB | `qldb` | Generic | P8 — G1–G5, one selected operation at a time |
| 56 | Amazon Redshift Serverless | `redshift_serverless` | Generic | P8 — G1–G5, one selected operation at a time |
| 57 | Amazon RDS Proxy | `rds_proxy` | Generic | P8 — G1–G5, one selected operation at a time |
| 58 | AWS Database Migration Service | `dms` | Generic | P8 — G1–G5, one selected operation at a time |
| 59 | Amazon OpenSearch Service | `opensearch_db` | Generic | P8 — G1–G5, one selected operation at a time |
| 60 | Amazon Neptune Analytics | `neptune_analytics` | Generic | P8 — G1–G5, one selected operation at a time |
| 61 | ElastiCache Serverless | `elasticache_serverless` | Generic | P8 — G1–G5, one selected operation at a time |
| 62 | Amazon Aurora DSQL | `aurora_dsql` | Generic | P8 — G1–G5, one selected operation at a time |
| 63 | Amazon VPC | `vpc` | Dedicated | P0 — detailed row above |
| 64 | Amazon CloudFront | `cloudfront` | Dedicated | P5 — detailed row above |
| 65 | Amazon Route 53 | `route53` | Dedicated | P5 — detailed row above |
| 66 | Application Load Balancer (ALB) | `alb` | Dedicated | P3 — detailed row above |
| 67 | Network Load Balancer (NLB) | `nlb` | Dedicated | P3 — detailed row above |
| 68 | Gateway Load Balancer | `gateway_load_balancer` | Generic | P8 — G1–G5, one selected operation at a time |
| 69 | Amazon API Gateway | `api_gateway` | Dedicated | P3 — detailed row above |
| 70 | AWS AppSync | `appsync` | Generic | P8 — G1–G5, one selected operation at a time |
| 71 | AWS Transit Gateway | `transit_gateway` | Generic | P8 — G1–G5, one selected operation at a time |
| 72 | AWS Direct Connect | `direct_connect` | Generic | P8 — G1–G5, one selected operation at a time |
| 73 | AWS PrivateLink | `privatelink` | Dedicated | P0 — detailed row above |
| 74 | AWS Client VPN | `client_vpn` | Generic | P8 — G1–G5, one selected operation at a time |
| 75 | AWS Site-to-Site VPN | `site_to_site_vpn` | Generic | P8 — G1–G5, one selected operation at a time |
| 76 | AWS Cloud WAN | `cloud_wan` | Generic | P8 — G1–G5, one selected operation at a time |
| 77 | AWS Global Accelerator | `global_accelerator` | Generic | P8 — G1–G5, one selected operation at a time |
| 78 | Internet Gateway (IGW) | `internet_gateway` | Dedicated | P0 — detailed row above |
| 79 | NAT Gateway | `nat_gateway` | Dedicated | P0 — detailed row above |
| 80 | S3 Gateway Endpoint | `s3_gateway_endpoint` | Dedicated | P0 — detailed row above |
| 81 | Route Tables | `route_tables` | Dedicated | P0 — detailed row above |
| 82 | AWS Network Firewall | `network_firewall` | Generic | P8 — G1–G5, one selected operation at a time |
| 83 | Route 53 Resolver | `route53_resolver` | Generic | P8 — G1–G5, one selected operation at a time |
| 84 | Amazon VPC Lattice | `vpc_lattice` | Generic | P8 — G1–G5, one selected operation at a time |
| 85 | VPC Peering | `vpc_peering` | Generic | P8 — G1–G5, one selected operation at a time |
| 86 | AWS Verified Access | `verified_access` | Generic | P8 — G1–G5, one selected operation at a time |
| 87 | AWS App Mesh | `app_mesh` | Generic | P8 — G1–G5, one selected operation at a time |
| 88 | AWS Cloud Map | `cloud_map` | Generic | P8 — G1–G5, one selected operation at a time |
| 89 | AWS IAM | `iam` | Dedicated | P0 — detailed row above |
| 90 | Amazon Cognito | `cognito` | Dedicated | P7 — detailed row above |
| 91 | AWS Key Management Service (KMS) | `kms` | Dedicated | P6 — detailed row above |
| 92 | AWS Secrets Manager | `secrets_manager` | Dedicated | P6 — detailed row above |
| 93 | AWS WAF | `waf` | Dedicated | P7 — detailed row above |
| 94 | AWS Shield | `shield` | Generic | P8 — G1–G5, one selected operation at a time |
| 95 | Amazon GuardDuty | `guardduty` | Generic | P8 — G1–G5, one selected operation at a time |
| 96 | Amazon Inspector | `inspector` | Generic | P8 — G1–G5, one selected operation at a time |
| 97 | Amazon Macie | `macie` | Generic | P8 — G1–G5, one selected operation at a time |
| 98 | AWS Security Hub | `security_hub` | Generic | P8 — G1–G5, one selected operation at a time |
| 99 | AWS Certificate Manager (ACM) | `acm` | Generic | P8 — G1–G5, one selected operation at a time |
| 100 | AWS Directory Service | `directory_service` | Generic | P8 — G1–G5, one selected operation at a time |
| 101 | AWS CloudHSM | `cloudhsm` | Generic | P8 — G1–G5, one selected operation at a time |
| 102 | AWS Artifact | `artifact` | Generic | P8 — G1–G5, one selected operation at a time |
| 103 | AWS Audit Manager | `audit_manager` | Generic | P8 — G1–G5, one selected operation at a time |
| 104 | Amazon Detective | `detective` | Generic | P8 — G1–G5, one selected operation at a time |
| 105 | AWS IAM Identity Center (SSO) | `iam_identity_center` | Generic | P8 — G1–G5, one selected operation at a time |
| 106 | Permissions Boundaries | `permissions_boundary` | Generic | P8 — G1–G5, one selected operation at a time |
| 107 | Amazon Verified Permissions | `verified_permissions` | Generic | P8 — G1–G5, one selected operation at a time |
| 108 | AWS Payment Cryptography | `payment_cryptography` | Generic | P8 — G1–G5, one selected operation at a time |
| 109 | Amazon Security Lake | `security_lake` | Generic | P8 — G1–G5, one selected operation at a time |
| 110 | VPC Network Firewall | `network_firewall_sec` | Generic | P8 — G1–G5, one selected operation at a time |
| 111 | OpenID Connect (OIDC) | `openid` | Generic | P8 — G1–G5, one selected operation at a time |
| 112 | AWS Signer | `signer` | Generic | P8 — G1–G5, one selected operation at a time |
| 113 | AWS Incident Response | `security_incident_response` | Generic | P8 — G1–G5, one selected operation at a time |
| 114 | IAM Access Analyzer | `access_analyzer` | Generic | P8 — G1–G5, one selected operation at a time |
| 115 | Amazon SQS | `sqs` | Dedicated | P4 — detailed row above |
| 116 | Amazon SNS | `sns` | Dedicated | P4 — detailed row above |
| 117 | Amazon EventBridge | `eventbridge` | Dedicated | P7 — detailed row above |
| 118 | AWS Step Functions | `step_functions` | Dedicated | P7 — detailed row above |
| 119 | Amazon MQ | `amazon_mq` | Generic | P8 — G1–G5, one selected operation at a time |
| 120 | Amazon AppFlow | `appflow` | Generic | P8 — G1–G5, one selected operation at a time |
| 121 | Amazon MWAA (Apache Airflow) | `mwaa` | Generic | P8 — G1–G5, one selected operation at a time |
| 122 | Amazon EventBridge Pipes | `pipes` | Generic | P8 — G1–G5, one selected operation at a time |
| 123 | Amazon Simple Workflow (SWF) | `swf` | Generic | P8 — G1–G5, one selected operation at a time |
| 124 | EventBridge Scheduler | `eventbridge_scheduler` | Generic | P8 — G1–G5, one selected operation at a time |
| 125 | AWS B2B Data Interchange | `b2b_data_interchange` | Generic | P8 — G1–G5, one selected operation at a time |
| 126 | Amazon Pinpoint Messaging | `pinpoint_msg` | Generic | P8 — G1–G5, one selected operation at a time |
| 127 | Kinesis Streams Buffer | `kinesis_data_streams_msg` | Generic | P8 — G1–G5, one selected operation at a time |
| 128 | Amazon SNS FIFO | `sns_fifo` | Generic | P8 — G1–G5, one selected operation at a time |
| 129 | SQS Dead-Letter Queue (DLQ) | `sqs_dlq` | Generic | P8 — G1–G5, one selected operation at a time |
| 130 | Amazon Athena | `athena` | Generic | P8 — G1–G5, one selected operation at a time |
| 131 | Amazon EMR | `emr` | Generic | P8 — G1–G5, one selected operation at a time |
| 132 | Amazon Kinesis | `kinesis` | Generic | P8 — G1–G5, one selected operation at a time |
| 133 | Amazon Data Firehose | `kinesis_firehose` | Generic | P8 — G1–G5, one selected operation at a time |
| 134 | Kinesis Video Streams | `kinesis_video` | Generic | P8 — G1–G5, one selected operation at a time |
| 135 | Amazon MSK (Apache Kafka) | `msk` | Generic | P8 — G1–G5, one selected operation at a time |
| 136 | AWS Glue | `glue` | Generic | P8 — G1–G5, one selected operation at a time |
| 137 | AWS Glue DataBrew | `glue_databrew` | Generic | P8 — G1–G5, one selected operation at a time |
| 138 | AWS Lake Formation | `lake_formation` | Generic | P8 — G1–G5, one selected operation at a time |
| 139 | Amazon OpenSearch Service | `opensearch` | Generic | P8 — G1–G5, one selected operation at a time |
| 140 | Amazon Redshift | `redshift` | Generic | P8 — G1–G5, one selected operation at a time |
| 141 | Amazon QuickSight | `quicksight` | Generic | P8 — G1–G5, one selected operation at a time |
| 142 | AWS Clean Rooms | `clean_rooms` | Generic | P8 — G1–G5, one selected operation at a time |
| 143 | AWS Data Exchange | `data_exchange` | Generic | P8 — G1–G5, one selected operation at a time |
| 144 | Amazon DataZone | `datazone` | Generic | P8 — G1–G5, one selected operation at a time |
| 145 | Amazon FinSpace | `finspace` | Generic | P8 — G1–G5, one selected operation at a time |
| 146 | Amazon CloudSearch | `cloudsearch` | Generic | P8 — G1–G5, one selected operation at a time |
| 147 | OpenSearch Serverless | `opensearch_serverless` | Generic | P8 — G1–G5, one selected operation at a time |
| 148 | Amazon MSK Serverless | `msk_serverless` | Generic | P8 — G1–G5, one selected operation at a time |
| 149 | Amazon EMR Serverless | `emr_serverless` | Generic | P8 — G1–G5, one selected operation at a time |
| 150 | Redshift Data Sharing | `redshift_data_sharing` | Generic | P8 — G1–G5, one selected operation at a time |
| 151 | Athena Federated Query | `athena_federated` | Generic | P8 — G1–G5, one selected operation at a time |
| 152 | Amazon Bedrock | `bedrock` | Generic | P8 — G1–G5, one selected operation at a time |
| 153 | Amazon SageMaker | `sagemaker` | Generic | P8 — G1–G5, one selected operation at a time |
| 154 | SageMaker Studio | `sagemaker_studio` | Generic | P8 — G1–G5, one selected operation at a time |
| 155 | SageMaker Canvas | `sagemaker_canvas` | Generic | P8 — G1–G5, one selected operation at a time |
| 156 | Amazon Rekognition | `rekognition` | Generic | P7 — detailed row above |
| 157 | Amazon Comprehend | `comprehend` | Generic | P8 — G1–G5, one selected operation at a time |
| 158 | Amazon Comprehend Medical | `comprehend_medical` | Generic | P8 — G1–G5, one selected operation at a time |
| 159 | Amazon Polly | `polly` | Generic | P8 — G1–G5, one selected operation at a time |
| 160 | Amazon Transcribe | `transcribe` | Generic | P8 — G1–G5, one selected operation at a time |
| 161 | Amazon Translate | `translate` | Generic | P8 — G1–G5, one selected operation at a time |
| 162 | Amazon Textract | `textract` | Generic | P8 — G1–G5, one selected operation at a time |
| 163 | Amazon Kendra | `kendra` | Generic | P8 — G1–G5, one selected operation at a time |
| 164 | Amazon Lex | `lex` | Generic | P8 — G1–G5, one selected operation at a time |
| 165 | Amazon Personalize | `personalize` | Generic | P8 — G1–G5, one selected operation at a time |
| 166 | Amazon Forecast | `forecast` | Generic | P8 — G1–G5, one selected operation at a time |
| 167 | Amazon CodeWhisperer | `codewhisperer` | Generic | P8 — G1–G5, one selected operation at a time |
| 168 | Amazon Q | `amazon_q` | Generic | P8 — G1–G5, one selected operation at a time |
| 169 | Amazon Augmented AI (A2I) | `augmented_ai` | Generic | P8 — G1–G5, one selected operation at a time |
| 170 | AWS DeepLens | `deeplens` | Generic | P8 — G1–G5, one selected operation at a time |
| 171 | AWS DeepRacer | `deepracer` | Generic | P8 — G1–G5, one selected operation at a time |
| 172 | AWS DeepComposer | `deepcomposer` | Generic | P8 — G1–G5, one selected operation at a time |
| 173 | AWS Panorama | `panorama` | Generic | P8 — G1–G5, one selected operation at a time |
| 174 | Amazon Monitron | `monitron` | Generic | P8 — G1–G5, one selected operation at a time |
| 175 | AWS HealthLake | `healthlake` | Generic | P8 — G1–G5, one selected operation at a time |
| 176 | AWS HealthOmics | `healthomics` | Generic | P8 — G1–G5, one selected operation at a time |
| 177 | Amazon Lookout for Vision | `lookout_vision` | Generic | P8 — G1–G5, one selected operation at a time |
| 178 | Amazon CloudWatch | `cloudwatch` | Dedicated | P7 — detailed row above |
| 179 | AWS CloudTrail | `cloudtrail` | Generic | P8 — G1–G5, one selected operation at a time |
| 180 | AWS CloudFormation | `cloudformation` | Generic | P8 — G1–G5, one selected operation at a time |
| 181 | AWS Config | `config` | Generic | P8 — G1–G5, one selected operation at a time |
| 182 | AWS Systems Manager | `systems_manager` | Generic | P8 — G1–G5, one selected operation at a time |
| 183 | AWS Organizations | `organizations` | Generic | P8 — G1–G5, one selected operation at a time |
| 184 | AWS Control Tower | `control_tower` | Generic | P8 — G1–G5, one selected operation at a time |
| 185 | AWS Service Catalog | `service_catalog` | Generic | P8 — G1–G5, one selected operation at a time |
| 186 | AWS License Manager | `license_manager` | Generic | P8 — G1–G5, one selected operation at a time |
| 187 | AWS Auto Scaling | `auto_scaling_mgmt` | Generic | P8 — G1–G5, one selected operation at a time |
| 188 | AWS Well-Architected Tool | `well_architected` | Generic | P8 — G1–G5, one selected operation at a time |
| 189 | AWS Proton | `proton` | Generic | P8 — G1–G5, one selected operation at a time |
| 190 | AWS Resilience Hub | `resilience_hub` | Generic | P8 — G1–G5, one selected operation at a time |
| 191 | Compute Optimizer Engine | `compute_optimizer_mgmt` | Generic | P8 — G1–G5, one selected operation at a time |
| 192 | AWS OpsWorks | `opsworks` | Generic | P8 — G1–G5, one selected operation at a time |
| 193 | AWS Resource Groups | `resource_groups` | Generic | P8 — G1–G5, one selected operation at a time |
| 194 | AWS Trusted Advisor | `trusted_advisor` | Generic | P8 — G1–G5, one selected operation at a time |
| 195 | AWS Health Dashboard | `health_dashboard` | Generic | P8 — G1–G5, one selected operation at a time |
| 196 | AWS FIS (Fault Injection Simulator) | `fault_injection_simulator` | Generic | P8 — G1–G5, one selected operation at a time |
| 197 | AWS AppConfig | `appconfig` | Generic | P8 — G1–G5, one selected operation at a time |
| 198 | AWS Distro for OpenTelemetry | `distro_opentelemetry` | Generic | P8 — G1–G5, one selected operation at a time |
| 199 | Amazon Managed Grafana | `managed_grafana` | Generic | P8 — G1–G5, one selected operation at a time |
| 200 | Amazon Managed Service for Prometheus | `managed_prometheus` | Generic | P8 — G1–G5, one selected operation at a time |
| 201 | CloudWatch Synthetics | `cloudwatch_synthetics` | Generic | P8 — G1–G5, one selected operation at a time |
| 202 | AWS CodeCommit | `codecommit` | Generic | P8 — G1–G5, one selected operation at a time |
| 203 | AWS CodeBuild | `codebuild` | Generic | P8 — G1–G5, one selected operation at a time |
| 204 | AWS CodeDeploy | `codedeploy` | Generic | P8 — G1–G5, one selected operation at a time |
| 205 | AWS CodePipeline | `codepipeline` | Generic | P8 — G1–G5, one selected operation at a time |
| 206 | AWS CodeArtifact | `codeartifact` | Generic | P8 — G1–G5, one selected operation at a time |
| 207 | Amazon CodeCatalyst | `codecatalyst` | Generic | P8 — G1–G5, one selected operation at a time |
| 208 | AWS Cloud9 | `cloud9` | Generic | P8 — G1–G5, one selected operation at a time |
| 209 | AWS X-Ray | `xray` | Partial: PutTraceSegments root segments | See [spec](behavior/xray.md); sampling, subsegments, queries and automatic instrumentation remain unsupported |
| 210 | AWS CloudShell | `cloudshell` | Generic | P8 — G1–G5, one selected operation at a time |
| 211 | AWS Application Composer | `app_composer` | Generic | P8 — G1–G5, one selected operation at a time |
| 212 | Amazon Corretto | `corretto` | Generic | P8 — G1–G5, one selected operation at a time |
| 213 | Amazon CodeGuru Reviewer | `codeguru_reviewer` | Generic | P8 — G1–G5, one selected operation at a time |
| 214 | Amazon CodeGuru Profiler | `codeguru_profiler` | Generic | P8 — G1–G5, one selected operation at a time |
| 215 | AWS Device Farm Dev Testing | `device_farm_dev` | Generic | P8 — G1–G5, one selected operation at a time |
| 216 | AWS Command Line Interface (CLI) | `aws_cli` | Generic | P8 — G1–G5, one selected operation at a time |
| 217 | AWS Serverless Application Model (SAM) | `sam_cli` | Generic | P8 — G1–G5, one selected operation at a time |
| 218 | Amazon ECR Public & Private | `ecr_registry` | Dedicated | P6 — detailed row above |
| 219 | Amazon Elastic Container Service | `ecs_container` | Generic | P8 — G1–G5, one selected operation at a time |
| 220 | Amazon Elastic Kubernetes Service | `eks_container` | Generic | P8 — G1–G5, one selected operation at a time |
| 221 | AWS Fargate Serverless Containers | `fargate_container` | Generic | P8 — G1–G5, one selected operation at a time |
| 222 | AWS App Runner Containers | `app_runner_container` | Generic | P8 — G1–G5, one selected operation at a time |
| 223 | Red Hat OpenShift on AWS (ROSA) | `rosa` | Generic | P8 — G1–G5, one selected operation at a time |
| 224 | Bottlerocket Container Host | `bottlerocket_os` | Generic | P8 — G1–G5, one selected operation at a time |
| 225 | AWS Copilot CLI | `copilot_tool` | Generic | P8 — G1–G5, one selected operation at a time |
| 226 | App2Container Migration Tool | `app2container_tool` | Generic | P8 — G1–G5, one selected operation at a time |
| 227 | Finch Open Source Client | `finch` | Generic | P8 — G1–G5, one selected operation at a time |
| 228 | ECS Anywhere Node Manager | `ecs_anywhere_ctr` | Generic | P8 — G1–G5, one selected operation at a time |
| 229 | EKS Anywhere On-Premises | `eks_anywhere_ctr` | Generic | P8 — G1–G5, one selected operation at a time |
| 230 | AWS Amplify | `amplify` | Generic | P7 — detailed row above |
| 231 | AWS Amplify Studio | `amplify_studio` | Generic | P8 — G1–G5, one selected operation at a time |
| 232 | AppSync GraphQL API | `appsync_mobile` | Generic | P8 — G1–G5, one selected operation at a time |
| 233 | AWS Device Farm | `device_farm` | Generic | P8 — G1–G5, one selected operation at a time |
| 234 | Amazon Location Service | `location_service` | Generic | P8 — G1–G5, one selected operation at a time |
| 235 | Amazon Pinpoint | `pinpoint` | Generic | P8 — G1–G5, one selected operation at a time |
| 236 | Amazon Chime SDK | `chime_sdk` | Generic | P8 — G1–G5, one selected operation at a time |
| 237 | Cognito User Pools Mobile | `cognito_mobile` | Generic | P8 — G1–G5, one selected operation at a time |
| 238 | Serverless Web API | `serverless_api_web` | Generic | P8 — G1–G5, one selected operation at a time |
| 239 | Pinpoint Mobile Analytics | `mobile_analytics` | Generic | P8 — G1–G5, one selected operation at a time |
| 240 | AWS Database Migration Service (DMS) | `dms_migration` | Generic | P8 — G1–G5, one selected operation at a time |
| 241 | AWS DataSync | `datasync_migration` | Generic | P8 — G1–G5, one selected operation at a time |
| 242 | AWS Transfer Family | `transfer_family` | Generic | P8 — G1–G5, one selected operation at a time |
| 243 | AWS Application Migration Service (MGN) | `mgn_migration` | Generic | P8 — G1–G5, one selected operation at a time |
| 244 | Snowball Edge Migration | `snowball_migration` | Generic | P8 — G1–G5, one selected operation at a time |
| 245 | AWS Migration Hub | `migration_hub` | Generic | P8 — G1–G5, one selected operation at a time |
| 246 | AWS Application Discovery Service | `application_discovery` | Generic | P8 — G1–G5, one selected operation at a time |
| 247 | AWS Server Migration Service | `server_migration_service` | Generic | P8 — G1–G5, one selected operation at a time |
| 248 | AWS Mainframe Modernization | `mainframe_modernization` | Generic | P8 — G1–G5, one selected operation at a time |
| 249 | AWS Schema Conversion Tool (SCT) | `schema_conversion_tool` | Generic | P8 — G1–G5, one selected operation at a time |
| 250 | Transfer Family SFTP | `transfer_sftp` | Generic | P8 — G1–G5, one selected operation at a time |
| 251 | Transfer Family FTPS | `transfer_ftps` | Generic | P8 — G1–G5, one selected operation at a time |
| 252 | Migration Evaluator | `migration_evaluator` | Generic | P8 — G1–G5, one selected operation at a time |
| 253 | AWS Cloud Adoption Framework | `cloudadopt` | Generic | P8 — G1–G5, one selected operation at a time |
| 254 | AWS Elemental MediaConvert | `mediaconvert` | Generic | P8 — G1–G5, one selected operation at a time |
| 255 | AWS Elemental MediaLive | `medialive` | Generic | P8 — G1–G5, one selected operation at a time |
| 256 | AWS Elemental MediaPackage | `mediapackage` | Generic | P8 — G1–G5, one selected operation at a time |
| 257 | AWS Elemental MediaStore | `mediastore` | Generic | P8 — G1–G5, one selected operation at a time |
| 258 | AWS Elemental MediaTailor | `mediatailor` | Generic | P8 — G1–G5, one selected operation at a time |
| 259 | Amazon Interactive Video Service (IVS) | `ivs` | Generic | P8 — G1–G5, one selected operation at a time |
| 260 | Amazon Elastic Transcoder | `elastic_transcoder` | Generic | P8 — G1–G5, one selected operation at a time |
| 261 | Kinesis Video Consumer | `kinesis_video_media` | Generic | P8 — G1–G5, one selected operation at a time |
| 262 | Elemental On-Premises Appliances | `elemental_appliances` | Generic | P8 — G1–G5, one selected operation at a time |
| 263 | Amazon Nimble Studio | `nimble_studio` | Generic | P8 — G1–G5, one selected operation at a time |
| 264 | AWS Elemental MediaConnect | `mediaconnect` | Generic | P8 — G1–G5, one selected operation at a time |
| 265 | Satellite Media Ingest | `ground_station_media` | Generic | P8 — G1–G5, one selected operation at a time |
| 266 | Amazon Connect | `connect` | Generic | P8 — G1–G5, one selected operation at a time |
| 267 | Amazon SES (Simple Email Service) | `ses` | Generic | P8 — G1–G5, one selected operation at a time |
| 268 | Amazon WorkMail | `workmail` | Generic | P8 — G1–G5, one selected operation at a time |
| 269 | Amazon Chime | `chime` | Generic | P8 — G1–G5, one selected operation at a time |
| 270 | AWS Wickr | `wickr` | Generic | P8 — G1–G5, one selected operation at a time |
| 271 | AWS Supply Chain | `supply_chain` | Generic | P8 — G1–G5, one selected operation at a time |
| 272 | AWS AppFabric | `appfabric` | Generic | P8 — G1–G5, one selected operation at a time |
| 273 | Amazon Honeycode | `honeycode` | Generic | P8 — G1–G5, one selected operation at a time |
| 274 | Pinpoint Marketing Campaigns | `pinpoint_email` | Generic | P8 — G1–G5, one selected operation at a time |
| 275 | Amazon Connect Voice ID | `voice_id` | Generic | P8 — G1–G5, one selected operation at a time |
| 276 | Contact Lens for Amazon Connect | `contact_lens` | Generic | P8 — G1–G5, one selected operation at a time |
| 277 | Amazon Connect Wisdom | `wisdom` | Generic | P8 — G1–G5, one selected operation at a time |
| 278 | Amazon Connect Customer Profiles | `customer_profiles` | Generic | P8 — G1–G5, one selected operation at a time |
| 279 | Amazon Connect Cases | `connect_cases` | Generic | P8 — G1–G5, one selected operation at a time |
| 280 | Amazon WorkSpaces | `workspaces` | Generic | P8 — G1–G5, one selected operation at a time |
| 281 | Amazon AppStream 2.0 | `appstream` | Generic | P8 — G1–G5, one selected operation at a time |
| 282 | Amazon WorkSpaces Web | `workspaces_web` | Generic | P8 — G1–G5, one selected operation at a time |
| 283 | Amazon WorkDocs | `workdocs` | Generic | P8 — G1–G5, one selected operation at a time |
| 284 | Amazon WorkLink | `worklink` | Generic | P8 — G1–G5, one selected operation at a time |
| 285 | Amazon WorkSpaces Core | `workspaces_core` | Generic | P8 — G1–G5, one selected operation at a time |
| 286 | Amazon WorkSpaces Thin Client | `workspaces_thin_client` | Generic | P8 — G1–G5, one selected operation at a time |
| 287 | Virtual Desktop Pool | `virtual_desktop` | Generic | P8 — G1–G5, one selected operation at a time |
| 288 | Remote Desktop Gateway | `remote_desktop` | Generic | P8 — G1–G5, one selected operation at a time |
| 289 | Secure Web Browser Instance | `secure_browser` | Generic | P8 — G1–G5, one selected operation at a time |
| 290 | AWS IoT Core | `iot_core` | Generic | P8 — G1–G5, one selected operation at a time |
| 291 | AWS IoT Greengrass | `iot_greengrass` | Generic | P8 — G1–G5, one selected operation at a time |
| 292 | AWS IoT Analytics | `iot_analytics` | Generic | P8 — G1–G5, one selected operation at a time |
| 293 | AWS IoT SiteWise | `iot_sitewise` | Generic | P8 — G1–G5, one selected operation at a time |
| 294 | AWS IoT Device Defender | `iot_device_defender` | Generic | P8 — G1–G5, one selected operation at a time |
| 295 | AWS IoT Device Management | `iot_device_management` | Generic | P8 — G1–G5, one selected operation at a time |
| 296 | AWS IoT Events | `iot_events` | Generic | P8 — G1–G5, one selected operation at a time |
| 297 | AWS IoT Things Graph | `iot_things_graph` | Generic | P8 — G1–G5, one selected operation at a time |
| 298 | AWS IoT ExpressLink | `iot_expresslink` | Generic | P8 — G1–G5, one selected operation at a time |
| 299 | AWS IoT RoboRunner | `iot_roborunner` | Generic | P8 — G1–G5, one selected operation at a time |
| 300 | AWS IoT 1-Click | `iot_1click` | Generic | P8 — G1–G5, one selected operation at a time |
| 301 | AWS IoT FleetWise | `iot_fleetwise` | Generic | P8 — G1–G5, one selected operation at a time |
| 302 | AWS IoT Enterprise Button | `iot_button` | Generic | P8 — G1–G5, one selected operation at a time |
| 303 | AWS IoT TwinMaker | `iot_twinmaker` | Generic | P8 — G1–G5, one selected operation at a time |
| 304 | AWS IoT Device Tester | `iot_device_tester` | Generic | P8 — G1–G5, one selected operation at a time |
| 305 | AWS IoT Core for LoRaWAN | `iot_lorawan` | Generic | P8 — G1–G5, one selected operation at a time |
| 306 | AWS Cost Explorer | `cost_explorer` | Generic | P8 — G1–G5, one selected operation at a time |
| 307 | AWS Budgets | `budgets` | Generic | P8 — G1–G5, one selected operation at a time |
| 308 | AWS Cost & Usage Report (CUR) | `cost_and_usage_report` | Generic | P8 — G1–G5, one selected operation at a time |
| 309 | AWS Savings Plans | `savings_plans` | Generic | P8 — G1–G5, one selected operation at a time |
| 310 | AWS Pricing Calculator | `pricing_calculator` | Generic | P8 — G1–G5, one selected operation at a time |
| 311 | AWS Billing Conductor | `billing_conductor` | Generic | P8 — G1–G5, one selected operation at a time |
| 312 | AWS Cost Categories | `cost_categories` | Generic | P8 — G1–G5, one selected operation at a time |
| 313 | AWS Cost Anomaly Detection | `cost_anomaly_detection` | Generic | P8 — G1–G5, one selected operation at a time |
| 314 | Migration Cost Evaluator | `migration_evaluator_cost` | Generic | P8 — G1–G5, one selected operation at a time |
| 315 | AWS Marketplace | `aws_marketplace` | Generic | P8 — G1–G5, one selected operation at a time |
| 316 | Amazon Managed Blockchain | `managed_blockchain` | Generic | P8 — G1–G5, one selected operation at a time |
| 317 | Amazon Braket | `braket` | Generic | P8 — G1–G5, one selected operation at a time |
| 318 | Amazon QLDB Ledger | `qldb_ledger` | Generic | P8 — G1–G5, one selected operation at a time |
| 319 | Managed Blockchain Query | `managed_blockchain_query` | Generic | P8 — G1–G5, one selected operation at a time |
| 320 | Amazon Braket Simulators | `quantum_simulator` | Generic | P8 — G1–G5, one selected operation at a time |
| 321 | AWS Web3 RPC Endpoints | `web3_rpc` | Generic | P8 — G1–G5, one selected operation at a time |
| 322 | AWS RoboMaker | `robomaker` | Generic | P8 — G1–G5, one selected operation at a time |
| 323 | AWS Ground Station | `ground_station` | Generic | P8 — G1–G5, one selected operation at a time |
| 324 | SimSpace Weaver Spatial Engine | `simspace_weaver_sim` | Generic | P8 — G1–G5, one selected operation at a time |
| 325 | RoboMaker Simulation WorldForge | `robomaker_sim` | Generic | P8 — G1–G5, one selected operation at a time |
| 326 | Ground Station Antenna | `satellite_antenna` | Generic | P8 — G1–G5, one selected operation at a time |
| 327 | Orbital Telemetry Stream | `orbital_telemetry` | Generic | P8 — G1–G5, one selected operation at a time |

## Source map and audit boundaries

- `src/data/serviceCatalog.ts`, `src/data/referenceArchitectures.ts`: inventory/configuration and integration scenarios.
- `src/engine/service/registry.ts`, `models/*.ts`, `genericModel.ts`: dedicated versus fallback behavior.
- `src/engine/simulation/liveSimulation.ts`, `requestSimulator.ts`, `adapters/*.ts`: actual UI execution and child calls.
- `src/engine/pipeline/engine.ts`, `service/interaction.ts`: separate evaluation paths; not assumed equivalent to live UI.
- `src/engine/network/*`, `iam/*`, `validation/*`, `failure/*`, `trace/*`: shared foundation and integration limitations.
- `src/engine/capability/*`: current coverage claims; audited as claims, not certification.
- `src/context/ArchitectureContext.tsx`, `src/components/canvas/CustomConnectionEdge.tsx`: result display and independent animation decisions.
- `test/*.test.ts`, `test/ui/ui-integration.test.ts`, `tests/aws-conformance/*`: regression versus AWS evidence.
- Existing `docs/FINAL_AWS_SIMULATOR_AUDIT.md`, `docs/SERVICE_BEHAVIOR_EXTENSION.md`, `docs/DIT_TEMPLATE_CORRECTIONS.md` provide historical context; source code takes precedence over stale status statements.

Additional official references for upcoming slices: [ECS task role](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html), [ECS execution role](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html). These roles authorize different actors and must not be merged.

No simulator code or tests were changed for this backlog. A fresh build is unnecessary for a Markdown-only deliverable. The 327-row inventory is exhaustive for the current catalog; the behavior list is a prioritized implementation plan, not an exhaustive enumeration of all AWS features.
