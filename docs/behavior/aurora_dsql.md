# Amazon Aurora DSQL — aurora_dsql

Status: PARTIAL (bounded slice). Last reviewed 2026-11-08. Sources opened 2026-11-08.
Implementation: src/engine/serviceOperations/{definitions,handlers,runner}.ts.

## Scope and resource roles

IAM-token connection to the regional endpoint (operation-only).

## Configuration contract

| Field | Effect |
| --- | --- |
| Placement | Regional managed endpoint; optional PrivateLink (privatelink endpointService aurora_dsql) (behavior) |
| Protocol / port | SQL; 5432, TLS required (behavior + validation) |
| Authentication | IAM only: dsql:DbConnectAdmin (admin role) / dsql:DbConnect (custom roles) (behavior) |
| Status | ACTIVE modeled; other states UNKNOWN (501) (behavior) |
| Health (Failure Lab) | failed resource → 503 (teaching failure) |

## Behavior and evidence matrix

| Rule | AWS source | Test |
| --- | --- | --- |
| IAM token auth, admin vs custom role actions | [source](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/authentication-authorization.html) | DB-DSQL-IAM-001 |
| Port 5432, SSL required | [source](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/accessing.html) | DB-AURORA_DSQL-OK-001 |
| Cluster states | [source](https://docs.aws.amazon.com/aurora-dsql/latest/APIReference/API_GetCluster.html) | DB-DSQL-STATUS-001 |

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

Multi-Region clusters, token expiry, SQL execution. Whether private callers need NAT is not stated by AWS; the shared regional-endpoint routing rule applies.
