# Amazon Timestream (for InfluxDB) — timestream

Status: PARTIAL (bounded slice). Last reviewed 2026-11-08. Sources opened 2026-11-08.
Implementation: src/engine/serviceOperations/{definitions,handlers,runner}.ts.

## Scope and resource roles

Timestream for InfluxDB connection (operation-only). Timestream for LiveAnalytics is closed to new customers (effective 2025-06-20) and not modeled.

## Configuration contract

| Field | Effect |
| --- | --- |
| Placement | VPC DB instance (public option excluded) (behavior) |
| Protocol / port | HTTPS 8086 (InfluxDB API) (behavior + validation) |
| Authentication | InfluxDB credentials (authored); IAM is control plane only (behavior) |
| Status | AVAILABLE (behavior) |
| Health (Failure Lab) | failed resource → 503 (teaching failure) |

## Behavior and evidence matrix

| Rule | AWS source | Test |
| --- | --- | --- |
| Default port 8086 | [source](https://docs.aws.amazon.com/ts-influxdb/latest/ts-influxdb-api/API_CreateDbInstance.html) | DB-TIMESTREAM-OK-001 |
| Data access uses InfluxDB credentials | [source](https://docs.aws.amazon.com/timestream/latest/developerguide/timestream-for-influxdb.html) | DB-TIMESTREAM-AUTH-001 |
| LiveAnalytics availability change | [source](https://docs.aws.amazon.com/timestream/latest/developerguide/AmazonTimestreamForLiveAnalytics-availability-change.html) | — |

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

LiveAnalytics WriteRecords/DescribeEndpoints, writes/queries, public instances.
