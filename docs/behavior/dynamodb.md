# DynamoDB — bounded synchronous dependency coverage

Status: PARTIAL. Reviewed 2026-10-16. This document records a bounded live integration; it does not certify all DynamoDB behavior.

## Ownership and configuration

- Existing model: src/engine/service/models/data.ts, registered as dynamodb in service/registry.ts. Do not create a duplicate model because a dynamodb.ts filename is absent.
- Live child orchestration: simulation/adapters/dependencyCalls.ts; shared gate: simulation/applicationHop.ts.
- Supported caller IDs: EC2, ECS, Lambda and Fargate, using existing attached-role authorization semantics. EKS Pod Identity/IRSA is not implemented by this increment.
- Explicit edge fields: relationship=dependency (or legacy traversal=dependency), protocol=HTTPS, action=dynamodb:GetItem or dynamodb:PutItem, dependencyRequired (default true), optional destinationPort. stepNumber orders calls. timeoutMs is a teaching delay for an unavailable target, not an AWS SDK timeout implementation.
- Resource ARN uses existing customConfig.resourceArn where supplied. Synthetic fallback ARN/account context remains a limitation; use explicit ARNs for meaningful policy assertions.

## Rules and evidence

| Rule | Source verified 2026-10-16 | Live evidence |
| --- | --- | --- |
| Applicable explicit policy deny overrides allow for the requested action | https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html | dependency-workflow.test.ts: explicit child IAM deny and selected action |
| GetItem is an API operation with a request and response | https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_GetItem.html | Correlated logical call/response; item/key/content behavior is NOT modeled |
| Inbound SG restrictions use source, protocol and port where modeled | https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html | Child SG denial required/optional handling; networking live-firewall-context.test.ts |

Required versus optional failure handling is application configuration, not an AWS service rule. A denied optional call remains denied; only the parent application's response to the error changes.

## Outcomes and limitations

Required unavailable, missing, invalid, network-denied or IAM-denied calls stop the parent. Optional failures record handled/bypassed steps and retain detailed decision evidence, then continue the parent's forwarding path. The child does not overwrite the parent verdict directly.

Call IDs distinguish child executions; parentCallId refers to the scenario. Logical response steps return application control to the caller and mark returnPathEvaluated=false. Fixed success latency is educational.

Not implemented: item keys/data/storage, query/scan, consistency, capacity/throttling, SDK retries, transactions, streams, global tables, full gateway endpoint/DNS resolution for every legacy topology, reverse packet evaluation, and full AWS error mappings. The existing standalone data-family model and forwarding adapter retain other documented simplifications; this child slice does not certify them.

## Verification and integration

Run dependency-workflow, DIT reference and execution-consistency tests, the networking conformance suite, then npm test and npm run build. DIT regression verifies the child operation precedes the original S3 forwarding path; cross-context tests verify teaching context does not change supported execution. Existing JSON connection fields are preserved; new correlation evidence is optional for older saved runs.
