# Amazon QLDB (retired) — qldb

Status: PARTIAL (bounded slice). Last reviewed 2026-11-08. Sources opened 2026-11-08.
Implementation: src/engine/serviceOperations/{definitions,handlers,runner}.ts; src/engine/architecture/serviceIntegrations.ts (RETIRED_SERVICES).

## Scope and resource roles

No operation. Amazon QLDB reached end of support on 2025-07-31 and was fully shut down; every relationship is rejected with the notice (RETIRED_SERVICES).

## Configuration contract

| Field | Effect |
| --- | --- |
| Placement | n/a (behavior) |
| Protocol / port | n/a (behavior + validation) |
| Authentication | n/a (behavior) |
| Status | n/a (behavior) |
| Health (Failure Lab) | failed resource → 503 (teaching failure) |

## Behavior and evidence matrix

| Rule | AWS source | Test |
| --- | --- | --- |
| Full shutdown July 31, 2025 | [source](https://docs.aws.amazon.com/general/latest/gr/full_shutdown_services.html) | DB-QLDB-RETIRED-001 |

Tests: tests/aws-conformance/databases/database-operations.test.ts.

## Inspector surface

None (retired).

## Relationships and execution

All relationships rejected.

## Identity, authorization and network context

Private VPC services require caller and endpoint in the same VPC and security-group ingress on the port; regional services use the shared route engine (NAT/IGW or matching interface endpoint) and the caller role through the IAM engine.

## State and failures

Status gate as above; invalid configuration 400; IAM denial 403; network/route denial 403/504; unavailable 503; unmodeled scope 501.

## Remaining work

Everything (service no longer exists).
