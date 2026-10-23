# AWS CodeBuild — codebuild

Status: PARTIAL — pipeline build/test actions and bounded standalone StartBuild. Last reviewed 2026-10-18.
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
(push), CloudWatch (logs), CodeDeploy (next action). Not modeled: batch builds, reports, caching, fleets, external Git providers, buildspec command execution, full source/artifact schema validation.

## Connection and artifact validation — 2026-10-18

Pipeline action input/output counts and multi-input `primarySource` are validated against the
[CodeBuild action reference](https://docs.aws.amazon.com/codepipeline/latest/userguide/action-reference-CodeBuild.html)
and [artifact limits](https://docs.aws.amazon.com/codepipeline/latest/userguide/reference-action-artifacts.html)
(verified 2026-10-18). See `tests/aws-conformance/devtools/connections.test.ts`.
Only executable CI/CD relationships infer ECR pushes; annotations do not require privileged
mode or ECR permissions. Canvas links are management relationships, with legacy HTTPS compatibility.
Full connection scope and verification: [codepipeline.md](codepipeline.md#connection-consistency-increment--2026-10-18).

## Standalone StartBuild — 2026-10-18

Selecting this project as the simulation start or clicking **Start build** executes only this
project through `runStandaloneDeveloperTool` and the same `buildAction` used by pipelines.
It never runs upstream pipelines or automatically deploys downstream targets.

| Configuration | Default and effect |
| --- | --- |
| `sourceType` | Infer from one connected source; supported: CODECOMMIT, S3, NO_SOURCE. CODEPIPELINE requires a pipeline run. |
| `sourceNodeId` | Single connected source; select explicitly for multiple sources. |
| `sourceKey` | S3 source ZIP key; falls back to source bucket sourceKey/objectKey. No versioning requirement for standalone source. |
| `buildspec` | File for source builds; inline multiline buildspec with phases for NO_SOURCE. Basic shape check only, no full YAML validation. |
| `iamRole` | Required for standalone execution; trust and permissions evaluated through shared IAM. |
| ECR/S3/CloudWatch output relationships | Availability checked; ECR adds Docker and ECR permission checks; S3 adds scoped PutObject. |

CodeCommit source uses `codecommit:GitPull`; S3 source uses scoped `s3:GetObject`.
Logging uses CreateLogGroup/CreateLogStream/PutLogEvents (always enabled in this bounded model).
VPC builds reuse NAT routing evaluation. No-source builds require no artificial S3 permissions.
Source, dependency, role, route and command outcomes are recorded as workflow evidence.

Official rules checked 2026-10-18: [StartBuild](https://docs.aws.amazon.com/codebuild/latest/userguide/run-build-cli.html),
[project sources](https://docs.aws.amazon.com/codebuild/latest/APIReference/API_ProjectSource.html),
[NO_SOURCE](https://docs.aws.amazon.com/codebuild/latest/userguide/no-source.html).
Tests: `tests/aws-conformance/devtools/standalone.test.ts` CB-STANDALONE-*; includes source failure/
recovery, IAM denial, network denial/recovery, live/lab equivalence and unrelated-resource invariance.
Inspector: Build project source controls and Start build action; role creator includes GitPull.
Standalone explanation overlay uses the same execution engine, with a build-failure what-if.

Limits: caller StartBuild authorization, KMS, endpoint-only private builds, per-source firewalls,
source ZIP existence/content, full Git protocol, buildspec execution and output object contents
are not evaluated. Simulated buildResult is an explicit teaching input. Build output bucket
permissions use a synthetic bucket/* resource because concrete artifact object names are unmodeled.
