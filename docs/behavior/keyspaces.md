# Amazon Keyspaces — keyspaces

Status: PARTIAL (bounded slice). Last reviewed 2026-11-08. Sources opened 2026-11-08.
Implementation: src/engine/serviceOperations/{definitions,handlers,runner}.ts.

## Scope and resource roles

CQL request authorized by IAM (operation-only).

## Configuration contract

| Field | Effect |
| --- | --- |
| Placement | Regional public endpoint or interface VPC endpoint (endpointService keyspaces) (behavior) |
| Protocol / port | TCP 9142, TLS required (behavior + validation) |
| Authentication | IAM SigV4: cassandra:Select / cassandra:Modify (behavior) |
| Status | ACTIVE (behavior) |
| Health (Failure Lab) | failed resource → 503 (teaching failure) |

## Behavior and evidence matrix

| Rule | AWS source | Test |
| --- | --- | --- |
| Port 9142 TLS | [source](https://docs.aws.amazon.com/keyspaces/latest/devguide/programmatic.endpoints.html) | DB-KEYSPACES-OK-001 |
| Interface endpoint avoids IGW/NAT | [source](https://docs.aws.amazon.com/keyspaces/latest/devguide/vpc-endpoints.html) | DB-KEYSPACES-NET-001/002 |
| cassandra:Select / Modify | [source](https://docs.aws.amazon.com/keyspaces/latest/devguide/security_iam_id-based-policy-examples.html) | DB-KEYSPACES-IAM-001 |

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

System-table Select requirement, service-specific credentials, CQL execution.
