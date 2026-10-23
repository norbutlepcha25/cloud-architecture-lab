# AWS CodeDeploy — codedeploy

Status: PARTIAL — pipeline deploy actions and bounded standalone CreateDeployment. Last reviewed 2026-10-18.
Implementation: src/engine/cicd/pipeline.ts `codeDeployAction`, `ec2DeploymentSucceeds`.

| Field | Default | Effect |
| --- | --- | --- |
| `customConfig.computePlatform` | inferred from targets (Server / ECS / Lambda) | behavior |
| `customConfig.deploymentConfig` | OneAtATime / ECSAllAtOnce / LambdaAllAtOnce | behavior |
| `customConfig.autoRollback` | false | trace: rollback step after failure |
| target EC2 `customConfig.codeDeployAgent` | true | behavior |
| target EC2 `iamRole` (instance profile) | required to read the revision | behavior |
| `iamRole` (trusted by codedeploy.amazonaws.com) | none = NOT_EVALUATED | behavior |

| Rule | Source (verified 2026-10-17) | Test |
| --- | --- | --- |
| AllAtOnce succeeds if ≥1 instance succeeds; HalfAtATime needs ≥ half (rounded up); OneAtATime fails on any failure but the last and stops there; default OneAtATime | [Deployment configurations](https://docs.aws.amazon.com/codedeploy/latest/userguide/deployment-configurations.html) | CD-CONFIG-001, CD-LIVE-001 |
| The agent is required only for EC2/on-premises; it talks outbound HTTPS 443 | [CodeDeploy agent](https://docs.aws.amazon.com/codedeploy/latest/userguide/codedeploy-agent.html) | CD-AGENT-001; egress via route tables |
| ECS behind an NLB supports only ECSAllAtOnce; ECS/Lambda canary/linear configs | Deployment configurations | CD-ECS-NLB-001 |

Targets: EC2 instances, EC2 Auto Scaling groups (members via `asgInstance.groupId`), ECS/Fargate
services (with an ALB/NLB), Lambda. Not modeled: lifecycle hook scripts, appspec validation,
traffic-shift timing, alarms-based rollback, on-premises instances, minimum healthy hosts per zone.

## Explanation overlay

More information shows the rollout instance by instance per deployment configuration, or ECS/Lambda
traffic shifting (codeDeployWalkthrough), with configuration and "instance fails" what-ifs.

## Connection handling — 2026-10-18

Targets are selected only from executable CI/CD relationships. Annotation/response/authorization
lines do not add deployment targets. New canvas links use management semantics; old HTTPS links
remain compatible without modifying saved diagrams. This models configured deployment-group
relationships ([AWS deployment groups](https://docs.aws.amazon.com/codedeploy/latest/userguide/deployment-groups.html),
verified 2026-10-18), not inbound application traffic to instances. See
[shared connection evidence and limitations](codepipeline.md#connection-consistency-increment--2026-10-18).

## Standalone CreateDeployment — 2026-10-18

Simulation start at CodeDeploy and **Create deployment** execute the configured deployment group
through the same `codeDeployAction` used by pipelines. No build/pipeline is implicitly run.
Set `customConfig.revisionBucketId` to an existing S3 node (or connect one S3 → CodeDeploy)
and `customConfig.revisionKey` to the existing revision object key. These fields persist through
customConfig and are exposed in the Deployment group inspector. Missing bucket/key yields a
specific configuration failure (400); unavailable bucket yields 503. Object existence/content,
AppSpec parsing, hook execution and revision history are unmodeled.

A standalone deployment requires its own assumable service role and appropriate group permissions.
Server instance profiles are evaluated for scoped `s3:GetObject` on the revision ARN in addition
to existing agent, route, target health and rollout checks. These instance failures count toward
the deployment configuration rather than bypassing rollout rules. Matching predefined platform
configurations are required; custom deployment configurations are outside this standalone slice.
ECS/Lambda reuse existing partial rollout behavior; revision fetch IAM for those platforms remains
unmodeled. Caller CreateDeployment authorization is outside scope.

Official sources checked 2026-10-18: [Create deployment](https://docs.aws.amazon.com/codedeploy/latest/userguide/deployments-create-cli.html),
[deployment group service role](https://docs.aws.amazon.com/codedeploy/latest/userguide/deployment-groups-create.html).
Evidence: `tests/aws-conformance/devtools/standalone.test.ts` CD-STANDALONE-* covers success,
missing revision, role denial, instance revision access, unavailable dependency, agent failure/recovery.
Standalone explanations are built from `runStandaloneDeveloperTool` (config/instance what-ifs
operate on clones). Pipeline diagrams retain their existing rollout walkthrough.

## Alarms and ECS load balancer lookup — 2026-10-22

- Deployment group alarms (CloudWatch → CodeDeploy link) are evaluated after traffic shifting:
  ALARM stops the deployment; `autoRollback` redeploys the last good revision. Service role needs
  cloudwatch:DescribeAlarms. Spec: [service_integrations.md](service_integrations.md).
- Fix: ECS blue/green found its load balancer only through CI/CD links, so an ALB/NLB drawn as the
  application path to the ECS service (ALB → ECS) was ignored ("needs a load balancer"). It now
  searches the drawn edges. Existing tests linked CodeDeploy → NLB directly and are unchanged.
  Evidence: test/secure-cicd-reference.test.ts.
