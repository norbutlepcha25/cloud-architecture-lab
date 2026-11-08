# Amazon ElastiCache Serverless — elasticache_serverless

Status: PARTIAL (bounded slice). Last reviewed 2026-11-08. Sources opened 2026-11-08.
Implementation: src/engine/serviceOperations/{definitions,handlers,runner}.ts.

## Scope and resource roles

VPC endpoint GET/SET (6379) and GET on the 6380 read-from-replica port (operation-only).

## Configuration contract

| Field | Effect |
| --- | --- |
| Placement | VPC endpoint (default); public endpoint excluded (501) (behavior) |
| Protocol / port | TCP 6379 / 6380, TLS always on (behavior + validation) |
| Authentication | RBAC credential validity (authored); IAM excluded (behavior) |
| Status | AVAILABLE only (behavior) |
| Health (Failure Lab) | failed resource → 503 (teaching failure) |

## Behavior and evidence matrix

| Rule | AWS source | Test |
| --- | --- | --- |
| Ports 6379 and 6380 | [source](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/set-up.html) | DB-ECS-SL-READER-001/002 |
| In-transit encryption always enabled | [source](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/in-transit-encryption.html) | DB-ECS-SL-TLS-001 |
| ConnectionType vpc|public | [source](https://docs.aws.amazon.com/AmazonElastiCache/latest/APIReference/API_ServerlessCache.html) | DB-ECS-SL-PUBLIC-001 |

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

Public endpoints (TLS 1.3, IAM-only user groups), Memcached serverless, ECPU limits.
