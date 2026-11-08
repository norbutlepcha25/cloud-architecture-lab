# Amazon Aurora Serverless v2 — aurora_serverless

Status: PARTIAL (bounded slice). Last reviewed 2026-11-08. Sources opened 2026-11-08.
Implementation: src/engine/serviceOperations/{definitions,handlers,runner}.ts.

## Scope and resource roles

Connect with auto-pause/resume (operation-only).

## Configuration contract

| Field | Effect |
| --- | --- |
| Placement | VPC ENI (behavior) |
| Protocol / port | SQL; 5432 (aurora-postgresql) / 3306 (behavior + validation) |
| Authentication | Password (authored) (behavior) |
| Status | `available` (also while paused) (behavior) |
| Health (Failure Lab) | failed resource → 503 (teaching failure) |

## Behavior and evidence matrix

| Rule | AWS source | Test |
| --- | --- | --- |
| 0 ACU minimum enables auto-pause; a connection resumes it (~15 s), even with invalid credentials | [source](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2-auto-pause.html) | DB-ASV2-RESUME-001/002, DB-ASV2-CONFIG-001 |

Tests: tests/aws-conformance/databases/database-operations.test.ts, tests/aws-conformance/services/operations.test.ts.

## Inspector surface

Service operation lab (seeded example on creation for new services, editable JSON resource/request, Run service operation); More information walkthrough built from the same run.

## Relationships and execution

EC2/Lambda/ECS/Fargate → service request links using the protocol above; generic request traversal (e.g. user → ALB → EC2 → service) runs the same evaluator. Usable as a DMS source/target.

## Identity, authorization and network context

Private VPC services require caller and endpoint in the same VPC and security-group ingress on the port; regional services use the shared route engine (NAT/IGW or matching interface endpoint) and the caller role through the IAM engine.

## State and failures

Status gate as above; invalid configuration 400; IAM denial 403; network/route denial 403/504; unavailable 503; unmodeled scope 501.

## Remaining work

ACU scaling, RDS Proxy blocking auto-pause, idle timeout timing.
