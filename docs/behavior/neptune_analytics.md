# Amazon Neptune Analytics — neptune_analytics

Status: PARTIAL (bounded slice). Last reviewed 2026-11-08. Sources opened 2026-11-08.
Implementation: src/engine/serviceOperations/{definitions,handlers,runner}.ts.

## Scope and resource roles

SigV4-authorized graph query (operation-only).

## Configuration contract

| Field | Effect |
| --- | --- |
| Placement | Private endpoint in the caller VPC by default; public connectivity optional (behavior) |
| Protocol / port | HTTPS (port not stated by AWS; 443 assumed for the URL) (behavior + validation) |
| Authentication | IAM always: neptune-graph:ReadDataViaQuery / WriteDataViaQuery (behavior) |
| Status | AVAILABLE (behavior) |
| Health (Failure Lab) | failed resource → 503 (teaching failure) |

## Behavior and evidence matrix

| Rule | AWS source | Test |
| --- | --- | --- |
| Public connectivity disabled by default; same-VPC private access; SigV4 | [source](https://docs.aws.amazon.com/neptune-analytics/latest/userguide/gettingStarted-connecting.html) | DB-NGA-NET-001/002/003 |
| ExecuteQuery IAM mapping | [source](https://docs.aws.amazon.com/neptune-analytics/latest/userguide/query-APIs-IAM-role-mappings.html) | DB-NEPTUNE_ANALYTICS (generic suite) |

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

Query execution, graph import, DNS over peering.
