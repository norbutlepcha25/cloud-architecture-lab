# AWS CodeCommit — codecommit

Status: VERIFIED FOR LISTED OPERATIONS (as a CodePipeline source). Last reviewed 2026-10-17.
Implementation: src/engine/cicd/pipeline.ts `sourceAction`; UI Push commit in CicdPanels.tsx.

| Field | Default | Effect |
| --- | --- | --- |
| `customConfig.branch` | main | trace |
| repository health | healthy | failed repository fails the source action |

Push commit starts every pipeline the repository is connected to (CodeCommit → CodePipeline
relationship), modeling the default EventBridge change detection. The pipeline service role
needs codecommit:GetBranch, GetCommit, UploadArchive, GetUploadArchiveStatus.
Source: [CodePipeline CodeCommit source action](https://docs.aws.amazon.com/codepipeline/latest/userguide/action-reference-CodeCommit.html),
[What is CodeCommit](https://docs.aws.amazon.com/codecommit/latest/userguide/welcome.html) (no
availability notice on 2026-10-17). Not modeled: Git operations, branches/merges, pull requests,
user Git credentials, approval rules, triggers to SNS/Lambda.
