# AWS CodeBuild — codebuild

Status: VERIFIED FOR LISTED OPERATIONS (as a CodePipeline build/test action). Last reviewed 2026-10-17.
Implementation: src/engine/cicd/pipeline.ts `buildAction`. Spec for the workflow: [codepipeline.md](codepipeline.md).

| Field | Default | Effect |
| --- | --- | --- |
| `customConfig.buildspec` | buildspec.yml | descriptive |
| `customConfig.computeType` | BUILD_GENERAL1_SMALL | descriptive (cost/capacity not modeled) |
| `customConfig.privilegedMode` | false | behavior: required to build/push Docker images |
| `customConfig.buildResult` | SUCCEEDED | behavior: simulated buildspec outcome (teaching input) |
| `iamRole` (trusted by codebuild.amazonaws.com) | none = NOT_EVALUATED | behavior |
| placement inside a subnet | outside VPC | behavior: VPC egress rule |

| Rule | Source (verified 2026-10-17) | Test |
| --- | --- | --- |
| Docker builds need privilegedMode; otherwise Docker daemon commands fail | [ProjectEnvironment](https://docs.aws.amazon.com/codebuild/latest/APIReference/API_ProjectEnvironment.html) | CB-DOCKER-001 |
| Pushing to ECR needs ecr:GetAuthorizationToken, BatchCheckLayerAvailability, InitiateLayerUpload, UploadLayerPart, CompleteLayerUpload, PutImage | [Docker sample](https://docs.aws.amazon.com/codebuild/latest/userguide/sample-docker.html) | role check |
| A VPC build needs a NAT gateway; an internet gateway cannot be used (ENIs get no public IP); use private subnets | [VPC support](https://docs.aws.amazon.com/codebuild/latest/userguide/vpc-support.html) | CB-VPC-001 |
| Artifact types CODEPIPELINE / S3 / NO_ARTIFACTS | [ProjectArtifacts](https://docs.aws.amazon.com/codebuild/latest/APIReference/API_ProjectArtifacts.html) | descriptive |

Relationships: CodeCommit/S3 → build (source), pipeline → build, build → S3 (artifacts), ECR
(push), CloudWatch (logs), CodeDeploy (next action). Not modeled: standalone builds outside a
pipeline, batch builds, reports, caching, fleets, source/artifact type mismatch rules.
