# AWS service integrations (non-request relationships)

Status: PARTIAL. Last reviewed 2026-10-22.
Registry: src/engine/architecture/serviceIntegrations.ts (`SERVICE_INTEGRATIONS`, `NON_INTEGRATIONS`).
Used by: connectionContracts.ts (`isManagementPair`, `connectionProtocols`, `checkConnection`),
the canvas `onConnect` (default relationship, label, rejection reason), cicd/pipeline.ts (build
dependencies) and cicd/gitPush.ts (EventBridge rule path). Because every entry point (draw,
reconnect, import, fixture load, live run) reads the same table, the same pair behaves the same way
in a new design, a reference, a lab or a challenge.

A registered pair is drawn as a `manages` relationship with protocol Event/HTTPS. It never acts as
an application forwarding hop. Pairs with `executes` are evaluated during a run; the others are
valid documented relationships the simulator does not execute, and the connection reason says so.
`NON_INTEGRATIONS` pairs are rejected with what to draw instead.

## Executed

| Pair | Engine | Rule (source) |
| --- | --- | --- |
| CodeCommit → EventBridge rule | gitPush.ts | Push emits "CodeCommit Repository State Change" (referenceUpdated); rule `customConfig.referenceName` (default main) must match. [monitoring-events](https://docs.aws.amazon.com/codecommit/latest/userguide/monitoring-events.html) |
| EventBridge rule → CodeBuild / CodePipeline | gitPush.ts | Rule role (trusted by events.amazonaws.com) needs codebuild:StartBuild / codepipeline:StartPipelineExecution; missing role = NOT_EVALUATED. Build gets the emitting repository as source. [eb-targets](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-targets.html) |
| CodeBuild → Secrets Manager | pipeline.ts buildAction | secretsmanager:GetSecretValue on the project role. [build-spec-ref](https://docs.aws.amazon.com/codebuild/latest/userguide/build-spec-ref.html) |
| CodeBuild → Systems Manager (Parameter Store) | pipeline.ts buildAction | ssm:GetParameters. Same source. |
| CodeBuild → CodeArtifact | pipeline.ts buildAction | codeartifact:GetAuthorizationToken, GetRepositoryEndpoint, ReadFromRepository, sts:GetServiceBearerToken (its `sts:AWSServiceName` condition is not evaluated). [tokens-authentication](https://docs.aws.amazon.com/codeartifact/latest/ug/tokens-authentication.html) |
| CodeBuild → AWS Signer | pipeline.ts buildAction | Signer `customConfig.signingPlatform`: container (default) = signer:SignPayload, GetRevocationStatus; lambda = StartSigningJob, GetSigningProfile (versioned S3 buckets not modeled). [image-signing-prerequisites](https://docs.aws.amazon.com/signer/latest/developerguide/image-signing-prerequisites.html), [StartSigningJob](https://docs.aws.amazon.com/signer/latest/api/API_StartSigningJob.html) |
| CloudWatch alarm → CodeDeploy | pipeline.ts codeDeployAction | Alarms attached to the deployment group: alarm state `customConfig.deploymentAlarmState` (teaching override, set in the deployment group panel) else the last live evaluation `serviceRuntime.alarm`. ALARM during the rollout stops the deployment; with `autoRollback` CodeDeploy redeploys the last good revision, otherwise the rollback step is skipped. The service role needs cloudwatch:DescribeAlarms. [advanced options](https://docs.aws.amazon.com/codedeploy/latest/userguide/deployment-groups-configure-advanced-options.html) |
| CodeBuild → Security Hub | pipeline.ts buildAction | Custom integration only: securityhub:BatchImportFindings (Security Hub CSPM, ASFF). [custom providers](https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-custom-providers.html) |

Build dependencies are checked in pipeline and standalone builds: unavailable dependency = failure,
missing permission = 403. A build started by EventBridge does not start CodeDeploy (CodeDeploy is
not an EventBridge target; deployments start from CreateDeployment).

## Documented, not executed

| Pair | Meaning (source) |
| --- | --- |
| GitHub / GitLab / Bitbucket → CodeBuild | Project source via CodeConnections; role needs codeconnections:GetConnectionToken, GetConnection. [connections-github-app](https://docs.aws.amazon.com/codebuild/latest/userguide/connections-github-app.html) |
| ECR → Amazon Inspector | Enhanced scanning (registry-level scan filters, scan on push or continuous). [image-scanning-enhanced](https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-scanning-enhanced.html) |
| Inspector → Security Hub | Automatic findings to Security Hub CSPM. [securityhub-integration](https://docs.aws.amazon.com/inspector/latest/user/securityhub-integration.html) |
| ECS / Fargate / Lambda / EC2 / EKS → AppConfig | Feature flags via AppConfig Agent; appconfig:StartConfigurationSession, GetLatestConfiguration on the task role. [containers agent](https://docs.aws.amazon.com/appconfig/latest/userguide/appconfig-integration-containers-agent.html) |
| CodeCommit / CodeBuild / CodeDeploy / CodePipeline / ECR → CloudTrail | API calls recorded as management events. [CodeDeploy](https://docs.aws.amazon.com/codedeploy/latest/userguide/monitoring-cloudtrail.html), [CodeBuild](https://docs.aws.amazon.com/codebuild/latest/userguide/cloudtrail.html) |
| CloudTrail → Audit Manager | Custom-control evidence. AWS Audit Manager is no longer open to new customers. [data sources](https://docs.aws.amazon.com/audit-manager/latest/userguide/control-data-sources.html) |

## Rejected (NON_INTEGRATIONS)

- GitHub / GitLab / Bitbucket → EventBridge: CodeConnections sends only GitSync sync-status events
  ([events reference](https://docs.aws.amazon.com/eventbridge/latest/ref/events-ref-codeconnections.html)).
  Connect the repository to CodePipeline or CodeBuild.
- AWS Signer → CodeDeploy: no integration; order sign → deploy with CodePipeline or CreateDeployment
  ([create a deployment](https://docs.aws.amazon.com/codedeploy/latest/userguide/deployments-create.html)).

## Audit of the student "secure CI/CD" diagram (2026-10-22)

Valid as drawn: Developer → CodeCommit, CodeCommit approval rules (PR), CodeCommit → EventBridge →
CodeBuild, CodeBuild → CodeArtifact / Secrets Manager + Parameter Store / ECR (commit SHA tag via
CODEBUILD_RESOLVED_SOURCE_VERSION) / Signer, ECR → Inspector → Security Hub, CodeDeploy → ECS
blue/green (ALB/NLB, two target groups, CODE_DEPLOY controller) / Lambda canary / EC2 ASG,
ECS → AppConfig, ECS → CloudWatch / X-Ray, metrics → alarm, CloudTrail → audit.

Corrections:
1. "CodeCommit or GitHub via CodeConnections → EventBridge": valid only for CodeCommit. A GitHub
   connection triggers CodePipeline or a CodeBuild webhook directly.
2. Build → Signer → CodeDeploy has no orchestrator. Nothing starts CodeDeploy after an
   EventBridge-started build; add CodePipeline (Source → Build → Deploy) or an explicit
   CreateDeployment call. Signer does not hand off to CodeDeploy.
3. AWS Signer appears twice (CB → SIGN on the right and SIGN below CB); keep one. The Signer box
   uses the Lambda icon.
4. CodeBuild → Security Hub is a custom BatchImportFindings integration, not native.
5. "CloudWatch alarm → automatic rollback → Lambda alias": the alarm must be attached to the
   CodeDeploy deployment group, and CodeDeploy rolls back. An alarm on ECS metrics rolls back the
   ECS deployment group it is attached to, not the Lambda alias. Draw alarm → CodeDeploy.
6. "Audit and compliance" is not a service; if it means AWS Audit Manager, it is closed to new
   customers. CloudTrail alone answers "who deployed what, when".
7. Notes: X-Ray SDKs/daemon entered maintenance mode on 2026-02-25 (OpenTelemetry recommended);
   ECS also has native blue/green without CodeDeploy; Security Hub CSPM vs new Security Hub
   naming; CodeCommit reopened to new customers on 2025-11-25.

Corrected version of this diagram: reference `secure-cicd-ecs-bluegreen`
(src/data/references/20-secure-cicd-ecs-bluegreen.json), regression test/secure-cicd-reference.test.ts.

Evidence: tests/aws-conformance/devtools/integrations.test.ts (12 cases); test/secure-cicd-reference.test.ts (6).
Not modeled: event pattern fields other than branch, input transformers, retries/DLQs on targets,
Inspector findings content, Security Hub findings, alarm timing within a canary/linear rollout (an alarm is evaluated once, after traffic shifting),
AppConfig retrieval as a live request, CloudTrail event content.
