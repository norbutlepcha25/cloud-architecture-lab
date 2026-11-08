# Amazon OpenSearch Service — opensearch_db

Status: PARTIAL (bounded slice). Last reviewed 2026-11-08. Sources opened 2026-11-08.
Implementation: src/engine/serviceOperations/{definitions,handlers,runner}.ts.

## Scope and resource roles

VPC domain HTTPS request (operation-only).

## Configuration contract

| Field | Effect |
| --- | --- |
| Placement | VPC domain (ENIs in subnets); public domains excluded (behavior) |
| Protocol / port | HTTPS 443 (or HTTP 80) (behavior + validation) |
| Authentication | Domain access policy: open (SG only) or IAM (caller role es:ESHttpGet/ESHttpPost) (behavior) |
| Status | status values UNKNOWN (not enforced) (behavior) |
| Health (Failure Lab) | failed resource → 503 (teaching failure) |

## Behavior and evidence matrix

| Rule | AWS source | Test |
| --- | --- | --- |
| VPC domain; ports 80/443; SG and signature both required | [source](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/vpc.html) | DB-OPENSEARCH_DB-OK-001 |
| Access policy, es:ESHttp*, open policy in VPC | [source](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/ac.html) | DB-OPENSEARCH-IAM-001/002 |

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

Fine-grained access control, IP-based policies, resource-policy principals, OpenSearch Serverless.
