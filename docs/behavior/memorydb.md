# Amazon MemoryDB — memorydb

Status: PARTIAL (bounded slice). Last reviewed 2026-11-08. Sources opened 2026-11-08.
Implementation: src/engine/serviceOperations/{definitions,handlers,runner}.ts.

## Scope and resource roles

GET/SET with ACL credentials (operation-only).

## Configuration contract

| Field | Effect |
| --- | --- |
| Placement | VPC only (behavior) |
| Protocol / port | TCP 6379 (behavior + validation) |
| Authentication | ACL users (authored validity); IAM memorydb:Connect excluded (behavior) |
| Status | available (behavior) |
| Health (Failure Lab) | failed resource → 503 (teaching failure) |

## Behavior and evidence matrix

| Rule | AWS source | Test |
| --- | --- | --- |
| Always in a VPC | [source](https://docs.aws.amazon.com/memorydb/latest/devguide/vpcs.mdb.html) | DB-MEMORYDB-OK-001 |
| Port 6379; connect when available | [source](https://docs.aws.amazon.com/memorydb/latest/devguide/getting-started.html) | DB-MEMORYDB-AUTH-001, DB-MEMORYDB-HEALTH-001 |

Tests: tests/aws-conformance/databases/database-operations.test.ts, tests/aws-conformance/services/operations.test.ts.

## Inspector surface

Service operation lab (seeded example on creation for new services, editable JSON resource/request, Run service operation); More information walkthrough built from the same run.

## Relationships and execution

EC2/Lambda/ECS/Fargate → service request links using the protocol above; generic request traversal (e.g. user → ALB → EC2 → service) runs the same evaluator.

## Identity, authorization and network context

Private VPC services require caller and endpoint in the same VPC and security-group ingress on the port; regional services use the shared route engine (NAT/IGW or matching interface endpoint) and the caller role through the IAM engine.

## State and failures

Status gate as above; invalid configuration 400; IAM denial 403; network/route denial 403/504; unavailable 503; unmodeled scope 501.

## Remaining work

IAM auth, durability/transaction log, multi-Region. Rename from "MemoryDB for Redis": UNKNOWN date.
