# Amazon RDS Proxy — rds_proxy

Status: PARTIAL (bounded slice). Last reviewed 2026-11-08. Sources opened 2026-11-08.
Implementation: src/engine/serviceOperations/{definitions,handlers,runner}.ts.

## Scope and resource roles

Connect on the default read/write endpoint: secret read by the proxy role, then connection to the writer target (operation-only).

## Configuration contract

| Field | Effect |
| --- | --- |
| Placement | VPC only (same VPC as the database), never public (behavior) |
| Protocol / port | SQL; POSTGRESQL 5432 / MYSQL 3306 (behavior + validation) |
| Authentication | Proxy role trusted by rds.amazonaws.com with secretsmanager:GetSecretValue on the linked secret (behavior) |
| Status | available; target healthy and available (behavior) |
| Health (Failure Lab) | failed resource → 503 (teaching failure) |

## Behavior and evidence matrix

| Rule | AWS source | Test |
| --- | --- | --- |
| Same VPC, never public; ports 3306/5432 | [source](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy.html) | DB-PROXY-VPC-001, DB-PROXY-PORT-001 |
| Secret required | [source](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy-secrets-arns.html) | DB-PROXY-SECRET-001 |
| Role GetSecretValue (+kms:Decrypt) | [source](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy-iam-setup.html) | DB-PROXY-IAM-001/002 |
| Default endpoint routes to the writer | [source](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy.howitworks.html) | DB-PROXY-OK-001, DB-PROXY-TARGET-001, DB-PROXY-NET-001 |

Tests: tests/aws-conformance/databases/database-operations.test.ts, tests/aws-conformance/services/operations.test.ts.

## Inspector surface

Service operation lab (seeded example on creation for new services, editable JSON resource/request, Run service operation); More information walkthrough built from the same run. Service role panel for the proxy role.

## Relationships and execution

EC2/Lambda/ECS/Fargate → service request links using the protocol above; generic request traversal (e.g. user → ALB → EC2 → service) runs the same evaluator. Proxy → Secrets Manager and proxy → writer (RDS/Aurora/Aurora Serverless) are manages links.

## Identity, authorization and network context

Private VPC services require caller and endpoint in the same VPC and security-group ingress on the port; regional services use the shared route engine (NAT/IGW or matching interface endpoint) and the caller role through the IAM engine.

## State and failures

Status gate as above; invalid configuration 400; IAM denial 403; network/route denial 403/504; unavailable 503; unmodeled scope 501.

## Remaining work

Pooling, pinning, read-only endpoints, end-to-end IAM, SQL Server, KMS key policy.
