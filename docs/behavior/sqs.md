# Amazon SQS — sqs (and sqs_dlq as a dead-letter target)

Status: VERIFIED FOR LISTED OPERATIONS (standard queues). Verified does not mean full AWS fidelity.
Last reviewed: 2026-10-17. Implementation: src/engine/messaging/sqs.ts (limits, producer path,
consumers, redrive), src/engine/services/operations.ts (send/receive/delete/clock runtime, SNS
fan-out), src/engine/simulation/adapters/managedServices.ts (live wiring), validation in
src/engine/validation/index.ts. UI: ManagedServicePanel QueueSettings; Lambda timeout and
simulated processing result in LambdaConfigurationPanel.

## Scope

- **SendMessage (request):** producer → queue. Route to the regional endpoint (NAT, IGW for a public
  subnet, or an SQS interface VPC endpoint), IAM sqs:SendMessage, queue health, 1 MiB size limit.
  Returns 202; consumer outcomes never change the producer result.
- **Consumers (async, same trace):** queue → Lambda (event source mapping) or EC2/ECS/Fargate
  pollers. Mapping validation, consumer IAM, consumer network path, processing, delete, retries,
  redrive to a dead-letter queue.
- **Runtime experiment (panel):** send, receive, delete with receipt handle, visibility timeout,
  delivery delay, retention expiry on clock advance.
- Excluded: FIFO (explicitly rejected; test pins this), message attributes and filtering, long
  polling wait, batch size/window and partial batch responses, Lambda scaling/concurrency,
  queue resource policies beyond the SNS allow-list, redrive allow policy, cross-account.

## Configuration contract

| Field | Default | Validation | Effect |
| --- | --- | --- | --- |
| `visibilityTimeoutSeconds` | 30 | 0–43,200 | behavior (receive hiding, retry interval, Lambda rule) |
| `messageRetentionSeconds` | 345,600 (4 days) | 60–1,209,600 | behavior (expiry on clock advance) |
| `delaySeconds` | 0 | 0–900 | behavior (new message hidden) |
| `messageSizeBytes` | 1,024 | ≤ 1,048,576 | behavior (simulated payload size) |
| `redrivePolicy {deadLetterTargetId, maxReceiveCount}` or queue → queue/DLQ edge | none; maxReceiveCount default 5 when only an edge is drawn (simulator default from Lambda's ≥5 recommendation) | DLQ exists, same type, same Region | behavior |
| `kmsKeyId` (KMS node) | SSE-SQS | — | consumers need kms:Decrypt on that key |
| Lambda `timeoutSeconds` / `processingResult` | 3 / SUCCEEDED | 1–900 | behavior |

## Behavior and evidence matrix (tests/aws-conformance/messaging/sqs.test.ts)

| Rule | Source (verified 2026-10-17) | Test |
| --- | --- | --- |
| Producer gets an acknowledgment independent of consumers | [How SQS works](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-how-it-works.html) | SQS-SEND-001 |
| Max message size 1,048,576 bytes | [Message quotas](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/quotas-messages.html) | SQS-SIZE-001 |
| Visibility 0–12 h, retention 60 s–14 days, delay 0–15 min | Message quotas | SQS-CONFIG-001, SQS-DELAY-001 |
| DLQ same type, same account and Region; receives beyond maxReceiveCount move the message | [Dead-letter queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html) | SQS-CONFIG-001, SQS-DLQ-001 |
| VPC access via interface endpoint (PrivateLink) or NAT; no gateway endpoint | [Traffic privacy](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-internetwork-traffic-privacy.html) | SQS-VPC-001 |
| Lambda rejects the mapping if function timeout > visibility timeout; 6× recommended | [Lambda SQS mapping](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html) | SQS-ESM-001 |
| Consumer role needs ReceiveMessage, DeleteMessage, GetQueueAttributes (+kms:Decrypt if encrypted) | Lambda SQS mapping | SQS-ESM-002 |
| Failed batch reappears after the visibility timeout | [Using Lambda with SQS](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html) | SQS-DLQ-001 |
| IAM: no SendMessage permission → denied | IAM evaluation logic | messaging.test.ts SVC-SQS-IAM-FAILURE-001 |

UNKNOWN / not enforced: maxReceiveCount upper bound (not on the pages read).

## Relationships

Producer → queue (HTTPS request), queue → Lambda/EC2/ECS/Fargate (Message, polling consumer),
queue → queue/sqs_dlq (redrive, control plane), SNS → queue (subscription, allow-list),
privatelink with `endpointService: 'sqs'` (interface endpoint).

## Data changes

Reference 07 (Event-Driven Decoupled): the web tier is in a private subnet with no NAT, so AWS
gives it no route to SQS. Added an SQS interface endpoint and a worker task role
(Receive/Delete/GetQueueAttributes). The run now shows send → worker processes and deletes.

## Remaining work

FIFO (ordering, deduplication, message groups), long polling, batching and partial batch
responses, queue access policies, redrive allow policy, Lambda concurrency/scaling, CloudWatch
queue metrics. Capability flag FAILURE_SIMULATION stays false (test/service-capability-registry
test 7 and S10 guard the older diagnostic engine).

## Explanation overlay

More information on a queue shows the message lifecycle (sqsWalkthrough): send, delay, receive,
visibility timeout, delete, retries and redrive to the DLQ, with a "consumer fails" what-if. Reference
07 gained an Orders DLQ (maxReceiveCount 5, 14-day retention) so the redrive is visible.
