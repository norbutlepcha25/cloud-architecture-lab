# AWS Database Migration Service — dms

Status: PARTIAL (bounded slice). Last reviewed 2026-11-08. Sources opened 2026-11-08.
Implementation: src/engine/serviceOperations/{definitions,handlers,runner}.ts and src/engine/database/dms.ts.

## Scope and resource roles

StartReplicationTask full load (workflow), from the DMS node or its Replication task panel.

## Configuration contract

| Field | Effect |
| --- | --- |
| Placement | Replication instance always in a VPC subnet (behavior) |
| Protocol / port | Endpoint DB ports (rds/aurora 5432, documentdb 27017, or the endpoint operation-lab port) (behavior + validation) |
| Authentication | Account role dms-vpc-role (AmazonDMSVPCManagementRole); endpoint credentials (authored) (behavior) |
| Status | replication instance available; endpoints available/active (behavior) |
| Health (Failure Lab) | failed resource → 503 (teaching failure) |

## Behavior and evidence matrix

| Rule | AWS source | Test |
| --- | --- | --- |
| Always in a VPC; endpoint SG ingress from the replication instance | [source](https://docs.aws.amazon.com/dms/latest/userguide/CHAP_ReplicationInstance.VPC.html) | DB-DMS-VPC-001, DB-DMS-NET-001 |
| Exact role dms-vpc-role | [source](https://docs.aws.amazon.com/dms/latest/userguide/security-iam.html) | DB-DMS-IAM-001 |
| TestConnection | [source](https://docs.aws.amazon.com/dms/latest/APIReference/API_TestConnection.html) | DB-DMS-AUTH-001, DB-DMS-HEALTH-001 |
| Task Starting connects to endpoints | [source](https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Monitoring.html) | DB-DMS-OK-001 |

Tests: tests/aws-conformance/databases/database-operations.test.ts, test/database-walkthrough.test.ts, test/ui/ui-integration.test.ts (Databases).

## Inspector surface

Replication task panel (source/target selection, dms-vpc-role, Start replication task) and More information walkthrough.

## Relationships and execution

Source database → DMS and DMS → target database (manages links; data-flow direction).

## Identity, authorization and network context

Private VPC services require caller and endpoint in the same VPC and security-group ingress on the port; regional services use the shared route engine (NAT/IGW or matching interface endpoint) and the caller role through the IAM engine.

## State and failures

Status gate as above; invalid configuration 400; IAM denial 403; network/route denial 403/504; unavailable 503; unmodeled scope 501.

## Remaining work

CDC, table mappings, schema conversion, cross-VPC/public endpoints, subnet group AZ count, behavior when an endpoint becomes unreachable mid-task (UNKNOWN).
