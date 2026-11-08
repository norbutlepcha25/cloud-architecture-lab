# Amazon DocumentDB — documentdb

Status: PARTIAL (bounded slice). Last reviewed 2026-11-08. Sources opened 2026-11-08.
Implementation: src/engine/serviceOperations/{definitions,handlers,runner}.ts.

## Scope and resource roles

Connect (operation-only).

## Configuration contract

| Field | Effect |
| --- | --- |
| Placement | VPC only (SSH tunnel/peering for outside) (behavior) |
| Protocol / port | TCP 27017; TLS on by default (tls parameter) (behavior + validation) |
| Authentication | Username/password (authored); MONGODB-AWS IAM excluded (behavior) |
| Status | available (instance-based) or active (elastic) (behavior) |
| Health (Failure Lab) | failed resource → 503 (teaching failure) |

## Behavior and evidence matrix

| Rule | AWS source | Test |
| --- | --- | --- |
| VPC deployment | [source](https://docs.aws.amazon.com/documentdb/latest/developerguide/connect-from-outside-a-vpc.html) | DB-DOCDB-NET-001, DB-E2E-001 |
| Port 27017, TLS default | [source](https://docs.aws.amazon.com/documentdb/latest/developerguide/security.encryption.ssl.html) | DB-DOCUMENTDB-OK-001 |
| Cluster status | [source](https://docs.aws.amazon.com/documentdb/latest/developerguide/monitoring_docdb-cluster_status.html) | DB-DOCDB-STATUS-001/002 |

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

MongoDB commands, IAM auth, elastic-cluster sharding.
