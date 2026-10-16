# AWS CodeDeploy — codedeploy

Status: VERIFIED FOR LISTED OPERATIONS (as a CodePipeline deploy action). Last reviewed 2026-10-17.
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
