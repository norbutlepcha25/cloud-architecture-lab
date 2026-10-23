# AWS CodePipeline — codepipeline

Status: VERIFIED FOR LISTED OPERATIONS. Verified does not mean full AWS fidelity.
Last reviewed: 2026-10-18. Implementation: src/engine/cicd/pipeline.ts (shared with CodeCommit,
CodeBuild, CodeDeploy); dispatch in src/engine/simulation/liveSimulation.ts; UI
src/components/inspector/CicdPanels.tsx.

## Scope and resource roles

One operation: a pipeline execution (result kind `workflow`). Started by Run pipeline, by
Push commit on a connected CodeCommit repository, or by a run whose start node is the pipeline.
Modeled providers: Source = CodeCommit, S3, ECR; Build/Test = CodeBuild; Deploy = CodeDeploy, ECS.
Excluded: approval, invoke, CloudFormation/Elastic Beanstalk/S3 deploy, cross-Region and
cross-account actions, parallel runOrder, triggers/filters, execution modes, timeouts, variables.

## Configuration contract

| Field | Default | Effect |
| --- | --- | --- |
| `customConfig.pipeline.stages[]` (`{name, actions:[{name, category, provider, nodeId, inputArtifacts, outputArtifacts, primarySource?}]}`) | derived from canvas: sources → pipeline, pipeline → CodeBuild, pipeline/build → CodeDeploy or ECS | behavior |
| `iamRole` (service role, trusted by codepipeline.amazonaws.com) | none = permissions reported NOT_EVALUATED | behavior |
| pipeline → S3 edge | artifact store; none = AWS-created default bucket (not drawn) | descriptive |

## Behavior and evidence matrix (tests/aws-conformance/devtools/cicd.test.ts)

| Rule | Expected | Source (verified 2026-10-17) | Test |
| --- | --- | --- | --- |
| Stages run in order; all succeed → execution succeeds | workflow:success | [Concepts](https://docs.aws.amazon.com/codepipeline/latest/userguide/concepts.html) | CP-RUN-001 |
| 2–50 stages, 1–50 actions per stage; a source action is required | invalid definition | [Quotas](https://docs.aws.amazon.com/codepipeline/latest/userguide/limits.html), [Action declaration](https://docs.aws.amazon.com/codepipeline/latest/userguide/action-requirements.html) | CP-STRUCT-001 |
| Input artifact must match an earlier output; source has no inputs; deploy has no outputs; output names unique | invalid | Action declaration | CP-ARTIFACT-001 |
| Valid providers per category | invalid | [Valid providers](https://docs.aws.amazon.com/codepipeline/latest/userguide/actions-valid-providers.html) | structure check |
| S3 source needs a versioned bucket and object key | failure | [S3 source action](https://docs.aws.amazon.com/codepipeline/latest/userguide/action-reference-S3.html) | CP-S3SRC-001 |
| An action failure stops the execution; later stages do not run | failure, later stages bypassed | Concepts | CP-STOP-001 |
| Service role must be assumable (trust) and allow each action | denied (403) | [IAM evaluation logic](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html) | CP-IAM-001/002 |
| ECS deploy: imagedefinitions.json names must match container names | failure | [File reference](https://docs.aws.amazon.com/codepipeline/latest/userguide/file-reference.html) | engine rule |

UNKNOWN / not enforced: "source actions only in the first stage" (not stated in the pages read).

## Relationships

Control-plane only (`architecture/cicdRelationships.ts` CICD_PAIRS): CodeCommit/S3/ECR → pipeline (source),
pipeline → CodeBuild / CodeDeploy / ECS (actions), pipeline → S3 (artifact store), IAM → pipeline
(role illustration). Never a request hop.

## Integration and verification

Reference 18 "CI/CD: CodeCommit → CodePipeline → CodeBuild → CodeDeploy". Labs 11/12 remain
configuration-check exercises (unchanged). Commands: `npm test`, `npm run build`.

## Remaining work

Manual approval, parallel actions, CloudFormation/S3 deploy, execution modes, artifact-store
permissions per action, cross-Region actions.

## Explanation overlay

More information on a pipeline, repository or build project shows the execution stage by stage
(pipelineWalkthrough, built from runPipelineExecution) with a "build fails" what-if.

## Connection consistency increment — 2026-10-18

Canvas-created developer-tool relationships use `relationship: manages` and an Event teaching
label. Legacy HTTPS links are normalized only in the live execution copy, preserving persistence.
Neither label represents an application forwarding hop. Port/API-operation controls do not apply.
Annotations (`referenceAnnotation`), response lines, authorization illustrations, dependency calls,
and incompatible protocols cannot discover actions, select deployment targets, request image
pushes, or trigger pipelines. IAM drawing lines still grant no permissions.

Derived deployments connected to a particular build consume that build's artifact; ECS image
names are evaluated from the consumed artifact's producer. Where no producer is specified,
legacy derivation still uses the first build by stable resource ID. Use explicit stages for
multiple sources/producers or more complex ordering; canvas edges are an educational shorthand,
not the complete AWS pipeline definition. Existing multi-step walkthroughs reuse this engine.

Official sources checked 2026-10-18:
- [Artifact flow and matching](https://docs.aws.amazon.com/codepipeline/latest/userguide/welcome-introducing-artifacts.html).
- [Per-provider artifact counts](https://docs.aws.amazon.com/codepipeline/latest/userguide/reference-action-artifacts.html):
  modeled sources produce one; CodeBuild accepts 1–5 inputs and 0–5 outputs; modeled deploy actions consume one.
- [CodeBuild action](https://docs.aws.amazon.com/codepipeline/latest/userguide/action-reference-CodeBuild.html):
  multiple inputs require `primarySource`, naming an input artifact.
- [Deployment groups](https://docs.aws.amazon.com/codedeploy/latest/userguide/deployment-groups.html):
  deployment targets/load balancers are configured deployment relationships.

Evidence: `test/devtools-connections.test.ts` (legacy compatibility, excluded links, producer
selection, live/lab equivalence, immutability, reorder invariance, ECS failure/recovery),
`tests/aws-conformance/devtools/connections.test.ts` (CICD-ARTIFACT-COUNT-001,
CICD-PRIMARY-001, CICD-SOURCE-COUNT-001), and the developer-tools canvas/reconnection UI test.
Existing CI/CD conformance tests retain IAM denial, VPC network denial and target failure coverage.
Artifact configuration checks do not execute network/IAM calls; those cases are inapplicable there.

Scope remains partial: detailed trigger filters,
artifact-store permissions/health, full target-group/listener configuration and fan-out to all
pipelines from one source run remain unmodeled. `runLiveSimulation` selects one connected pipeline
by stable ID; a source connection alone is not a model of all AWS event configuration.

Standalone entry points now run bounded StartBuild/CreateDeployment operations; see
[CodeBuild](codebuild.md#standalone-startbuild--2026-10-18) and
[CodeDeploy](codedeploy.md#standalone-createdeployment--2026-10-18).
Existing pipeline actions retain compatibility, including missing-role NOT_EVALUATED traces;
standalone runs require their own service role. No synthetic pipeline role is introduced.

## CodeStarSourceConnection source — 2026-10-22

GitHub, GitLab and Bitbucket nodes connected to a pipeline become `CodeStarSourceConnection`
source actions (valid Source provider). The source requires connection status AVAILABLE and a
service role allowing `codeconnections:UseConnection` and `codestar-connections:UseConnection` on
the connection ARN (missing role stays NOT_EVALUATED, as for other actions). Pushes respect
DetectChanges and BranchName. Spec: [external_actors.md](external_actors.md). Tests: CONN-SRC-*.
