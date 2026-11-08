# Amazon RDS — rds

Status: PARTIAL (bounded slice). Last reviewed 2026-11-08. Sources opened 2026-11-08.
Implementation: src/engine/serviceOperations/{definitions,handlers,runner}.ts.

## Scope and resource roles

Existing Connect operation (opt-in operation lab) plus the legacy request path (Multi-AZ failover, cache fallback).

## Configuration contract

| Field | Effect |
| --- | --- |
| Placement | VPC ENI; private same-VPC connection (behavior) |
| Protocol / port | SQL; PostgreSQL 5432 / MySQL 3306 (behavior + validation) |
| Authentication | DB password (authored `credentialsValid`); IAM DB auth (`rds-db:connect`) excluded (behavior) |
| Status | available only (behavior) |
| Health (Failure Lab) | failed resource → 503 (teaching failure) |

## Behavior and evidence matrix

| Rule | AWS source | Test |
| --- | --- | --- |
| Connect when available; SG inbound required | [source](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Troubleshooting.html) | DB-RDS-OK-001 |
| Ports 5432/3306 | [source](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ConnectToPostgreSQLInstance.html) | DB-RDS-OK-001 |

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

Public access, IAM DB auth, Kerberos, read replicas, SQL execution.
