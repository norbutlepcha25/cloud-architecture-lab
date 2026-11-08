# Amazon Redshift Serverless — redshift_serverless

Status: PARTIAL (bounded slice). Last reviewed 2026-11-08. Sources opened 2026-11-08.
Implementation: src/engine/serviceOperations/{definitions,handlers,runner}.ts.

## Scope and resource roles

Workgroup SQL connection (operation-only).

## Configuration contract

| Field | Effect |
| --- | --- |
| Placement | Workgroup in the VPC; public access excluded (behavior) |
| Protocol / port | SQL 5439 (ports 5431–5455, 8191–8215) (behavior + validation) |
| Authentication | Credentials stand for GetCredentials temporary credentials (authored) (behavior) |
| Status | AVAILABLE (behavior) |
| Health (Failure Lab) | failed resource → 503 (teaching failure) |

## Behavior and evidence matrix

| Rule | AWS source | Test |
| --- | --- | --- |
| Ports and default 5439 | [source](https://docs.aws.amazon.com/redshift/latest/mgmt/serverless-connecting.html) | DB-RSS-PORT-001, DB-REDSHIFT_SERVERLESS-OK-001 |
| Workgroup status values | [source](https://docs.aws.amazon.com/redshift-serverless/latest/APIReference/API_Workgroup.html) | DB-RSS-STATUS-001 |

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

Data API, public access, GetCredentials IAM, query execution. Notice: Python UDFs unsupported after 2026-06-30.
