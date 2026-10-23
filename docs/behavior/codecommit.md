# AWS CodeCommit — codecommit

Status: VERIFIED FOR LISTED OPERATIONS (as a CodePipeline source). Last reviewed 2026-10-17.
Implementation: src/engine/cicd/pipeline.ts `sourceAction`; UI Push commit in CicdPanels.tsx.

| Field | Default | Effect |
| --- | --- | --- |
| `customConfig.branch` | main | trace |
| repository health | healthy | failed repository fails the source action |

Push commit runs one connected pipeline selected by stable resource ID (CodeCommit → CodePipeline
relationship), an educational approximation of EventBridge change detection. Fan-out to all
connected pipelines and event filters are not modeled. Annotation/response links do not trigger runs. The pipeline service role
needs codecommit:GetBranch, GetCommit, UploadArchive, GetUploadArchiveStatus.
Source: [CodePipeline CodeCommit source action](https://docs.aws.amazon.com/codepipeline/latest/userguide/action-reference-CodeCommit.html),
[What is CodeCommit](https://docs.aws.amazon.com/codecommit/latest/userguide/welcome.html) (no
availability notice on 2026-10-17). Not modeled: Git operations, branches/merges, pull requests,
user Git credentials, approval rules, triggers to SNS/Lambda.

## Repository-only entry point — 2026-10-18

A push with no connected executable pipeline records a simulated commit event as a workflow;
it no longer enters the application-request engine. Repository failure fails that operation.
This does not evaluate Git credentials or model/persist repository contents. Existing connected
pipeline dispatch remains unchanged (one pipeline selected by stable ID). The Push commit button
is available without a pipeline. Standalone walkthroughs display the same recorded operation.
Source: [Create commits](https://docs.aws.amazon.com/codecommit/latest/userguide/how-to-create-commit.html)
(verified 2026-10-18). Test: all developer-tool entry points in devtools/standalone.test.ts.

## Developer git push — 2026-10-22

A `developer` node linked to the repository runs a git push through engine/cicd/gitPush.ts:
public Git endpoint (no VPC gateways), Git credentials, `codecommit:GitPush` on the repository ARN
via the IAM engine, repository health, then the pipeline trigger when the pushed branch matches
the repository branch. The existing repository-only Push commit button is unchanged. Spec and
sources: [external_actors.md](external_actors.md). Tests: devtools/git-push.test.ts GIT-PUSH-*.
