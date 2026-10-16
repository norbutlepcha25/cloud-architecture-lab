/**
 * Curated, evidence-cited coverage tables for the two axes that cannot be derived purely
 * structurally: CONNECTIVITY (is this serviceId actually branched on by name somewhere in the
 * live `runSimulation` pipeline?) and the two test-gated axes, REQUEST_SIMULATION and
 * FAILURE_SIMULATION. Every entry below was verified by reading the cited source file or test
 * file directly during Phase 14 - this is not a guess, and it is not derived from the standalone,
 * unwired Phase 7/8 engines (`engine/service/`, `engine/pipeline/`), which prove behavior exists
 * but not that a user hitting "Send Request" would ever see it.
 */

/**
 * Every serviceId that appears, by literal string match, inside one of the 9 adapters in
 * `engine/simulation/adapters/` (`SIMULATION_PIPELINE`) - i.e. the live traversal engine
 * recognizes this service specifically, rather than falling through to the generic
 * forward-or-terminal path in `networkPath.ts`. Source: `perimeterInspection.ts`,
 * `computeCapacity.ts`, `natGatewayHop.ts`, `terminalNode.ts`, `cloudFront.ts`, `loadBalancer.ts`,
 * `dataTierInteraction.ts`, `vpcEndpoint.ts`, `networkPath.ts` (read in full for this audit).
 */
export const LIVE_ADAPTER_SERVICE_IDS = [
  'cloudwatch', 'cloudtrail', // managedServices.ts (bounded operation model)
  'waf',                                            // perimeterInspection.ts
  'ec2', 'ecs', 'eks', 'lambda', 'fargate', 'app_runner',  // computeCapacity.ts (COMPUTE_SERVICE_IDS)
  'nat_gateway',                                     // natGatewayHop.ts
  'rds', 'dynamodb', 's3', 'elasticache', 'aurora', // terminalNode.ts (TERMINAL_DATA_STORE_SERVICE_IDS)
  'cloudfront',                                      // cloudFront.ts
  'alb', 'nlb', 'api_gateway',                       // loadBalancer.ts (LOAD_BALANCER_SERVICE_IDS)
  'sqs',                                             // dataTierInteraction.ts + networkPath.ts (MANAGED_EVENT_TARGET)
  's3_gateway_endpoint', 'privatelink',              // vpcEndpoint.ts
  'internet_gateway',                                // networkPath.ts (IGW attachment check)
  'sns', 'eventbridge', 'step_functions',            // networkPath.ts (MANAGED_EVENT_TARGET_SERVICE_IDS)
  'user', 'client_ui', 'api_client'                  // networkPath.ts (isPublicOrigin) - request originators
];

/**
 * REQUEST_SIMULATION = true ONLY for services with a specific, currently-passing test that
 * exercises `runSimulation` (the LIVE engine - `test/engine.test.ts` or `tests/aws-conformance/`,
 * never the standalone `runUnifiedPipeline`/`simulateInteraction` engines, which are real but not
 * user-reachable - see MIGRATION_PLAN.md) and asserts a specific SUCCESS outcome for it. Every
 * entry names the test(s) that back it.
 */
export const REQUEST_SIMULATION_EVIDENCE: Record<string, string> = {
  codepipeline: 'tests/aws-conformance/devtools/cicd.test.ts CP-RUN-001, CP-STOP-001, CP-IAM-001 - pipeline execution (workflow result, engine/cicd/pipeline.ts)',
  codecommit: 'tests/aws-conformance/devtools/cicd.test.ts CP-RUN-001 - push starts the connected pipeline (source action)',
  codebuild: 'tests/aws-conformance/devtools/cicd.test.ts CB-DOCKER-001, CB-VPC-001 - build action within a pipeline execution',
  codedeploy: 'tests/aws-conformance/devtools/cicd.test.ts CD-CONFIG-001, CD-LIVE-001, CD-AGENT-001, CD-ECS-NLB-001 - deployment action within a pipeline execution',
  cloudwatch: 'test/managed-services.test.ts: live single-period alarm evaluation',
  cloudtrail: 'test/managed-services.test.ts: live audit event selection',
  sns: 'test/managed-services.test.ts: live SNS fanout to permitted queues',
  ec2: 'test/engine.test.ts (tests 2-4, HA template); tests/aws-conformance/compute/ec2.test.ts SVC-EC2-SUCCESS-001',
  eks: 'test/eks-live.test.ts: Ready endpoint gating, selectors and no implicit scaling',
  ecs: 'test/engine.test.ts (tests 2-4, HA template - node-ecs-az-a/b)',
  fargate: 'tests/aws-conformance/compute/fargate.test.ts SVC-FARGATE-SUCCESS-001, SVC-FARGATE-SERVERLESS-SCALING-001',
  lambda: 'tests/aws-conformance/compute/lambda.test.ts SVC-LAMBDA-SUCCESS-001',
  alb: 'test/engine.test.ts (tests 2-4); tests/aws-conformance/load-balancing/alb.test.ts SVC-ALB-SUCCESS-001',
  nlb: 'tests/aws-conformance/load-balancing/nlb.test.ts SVC-NLB-SUCCESS-001',
  api_gateway: 'test/engine.test.ts; tests/aws-conformance/compute/lambda.test.ts SVC-LAMBDA-SUCCESS-001 (API GW -> Lambda)',
  rds: 'test/engine.test.ts (tests 2-3); tests/aws-conformance/database/rds.test.ts SVC-RDS-SUCCESS-001',
  dynamodb: 'tests/aws-conformance/database/dynamodb.test.ts SVC-DDB-SUCCESS-001; test/dependency-workflow.test.ts bounded live child calls (item data and reverse packets unmodeled)',
  s3: 'tests/aws-conformance/storage/s3.test.ts SVC-S3-SUCCESS-001; networking/subnets-endpoints.test.ts NET-ENDPOINT-001',
  sqs: 'tests/aws-conformance/messaging/messaging.test.ts SVC-SQS-SUCCESS-001; tests/aws-conformance/messaging/sqs.test.ts SQS-SEND-001, SQS-VPC-001, SQS-ESM-001/002, SQS-DLQ-001 (engine/messaging/sqs.ts)',
  cloudfront: 'tests/aws-conformance/dns/cloudfront.test.ts SVC-CF-CACHE-HIT-001, SVC-CF-CACHE-MISS-001',
  route53: 'tests/aws-conformance/dns/route53.test.ts SVC-R53-SUCCESS-001',
  nat_gateway: 'test/engine.test.ts; test/failure-engine.test.ts; tests/aws-conformance/networking/routing.test.ts NET-NAT-001/002',
  internet_gateway: 'test/engine.test.ts; tests/aws-conformance/networking/subnets-endpoints.test.ts NET-SUBNET-001',
  s3_gateway_endpoint: 'test/engine.test.ts; tests/aws-conformance/networking/subnets-endpoints.test.ts NET-ENDPOINT-001',
  privatelink: 'test/engine.test.ts (VPC Gateway/Interface Endpoint routing scenarios)',
  user: 'every test that calls runSimulation with a user/client_ui start node (the overwhelming majority of test/engine.test.ts)',
  client_ui: 'shares the same start-node resolution path as "user" in requestSimulator.ts',
  api_client: 'shares the same start-node resolution path as "user" in requestSimulator.ts'
};

/**
 * FAILURE_SIMULATION = true ONLY for services with a specific, currently-passing test
 * demonstrating a DIFFERENTIATED failure/recovery outcome - Multi-AZ failover, cache fallback,
 * target-group/sibling failover, or AZ/NAT-scoped blast radius - not merely "this node's `health`
 * field can be set to 'failed'", which every one of the 327 catalog services already gets for
 * free via the fully generic mechanism in `requestSimulator.ts`'s hop loop and
 * `engine/failure/propagation.ts`. That generic mechanism alone does not earn this flag.
 */
export const FAILURE_SIMULATION_EVIDENCE: Record<string, string> = {
  codedeploy: 'tests/aws-conformance/devtools/cicd.test.ts CD-LIVE-001 - failed target instances count against the deployment configuration',
  ec2: 'tests/aws-conformance/compute/ec2.test.ts SVC-EC2-SERVICE-FAILURE-001 (503, no failover in front of it)',
  fargate: 'tests/aws-conformance/compute/fargate.test.ts SVC-FARGATE-SERVICE-FAILURE-001',
  lambda: 'tests/aws-conformance/compute/lambda.test.ts SVC-LAMBDA-SERVICE-FAILURE-001',
  alb: 'test/engine.test.ts (test 4); tests/aws-conformance/load-balancing/alb.test.ts SVC-ALB-SERVICE-FAILURE-001 (503 on zero healthy targets)',
  nlb: 'tests/aws-conformance/load-balancing/nlb.test.ts SVC-NLB-SERVICE-FAILURE-001',
  rds: 'tests/aws-conformance/database/rds.test.ts SVC-RDS-SERVICE-FAILURE-001 (Single-AZ, hard failure) and SVC-RDS-MULTIAZ-FAILOVER-001 (Multi-AZ, automatic recovery)',
  dynamodb: 'tests/aws-conformance/database/dynamodb.test.ts SVC-DDB-SERVICE-FAILURE-001; test/dependency-workflow.test.ts required/optional live child failure isolation',
  s3: 'tests/aws-conformance/storage/s3.test.ts SVC-S3-SERVICE-FAILURE-001',
  cloudfront: 'tests/aws-conformance/dns/cloudfront.test.ts SVC-CF-CACHE-MISS-001 (origin failure not masked by the cache layer)',
  route53: 'tests/aws-conformance/dns/route53.test.ts SVC-R53-SERVICE-FAILURE-001',
  nat_gateway: 'test/failure-engine.test.ts (NAT failure scoped to internet-bound egress only); tests/aws-conformance/failures/az-and-nat-failures.test.ts FAIL-NAT-001',
  elasticache: 'test/engine.test.ts / engine/failure/redundancy.ts checkRedundancy cache-fallback role (exercised via the RDS Multi-AZ/cache-fallback failure tests)'
  // Deliberately NOT listed: sqs - test S10 in test/engine.test.ts ("Always Succeeds Regardless of
  // Queue Health") explicitly documents that SQS health has NO effect on the simulated outcome
  // today (a known, named approximation per docs/audit/FAILURE_GAPS.md) - marking sqs true here
  // would be exactly the false claim this phase exists to prevent.
};
