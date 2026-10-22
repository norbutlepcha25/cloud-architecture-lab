# Third-party and external actors — developer, github, gitlab, bitbucket, docker_hub, on_premises

Status: PARTIAL. Last reviewed 2026-10-22.
Implementation: src/engine/architecture/externalActors.ts (shared registry), src/engine/cicd/gitPush.ts
(Git push), src/engine/cicd/pipeline.ts (CodeStarSourceConnection source). UI: palette category
"Third-Party & External"; inspector DeveloperPanel / GitProviderPanel in CicdPanels.tsx.

Actors outside AWS are never VPC resources. They are internet origins (like `user`/`api_client`)
and external egress destinations: a VPC resource reaches them only through IGW/NAT routing. The
previously duplicated `['user', 'client_ui', 'api_client']` lists now use `isExternalActor` /
`isExternalTarget` / `INTERNET_CLIENT_IDS`, so the new actors get the same network rules.
New nodes of any external actor (including `api_client`/`client_ui`) default to subnet `global`.

| Actor | Behavior beyond generic internet origin/target |
| --- | --- |
| developer | Git push to CodeCommit / GitHub / GitLab / Bitbucket (live workflow) |
| github, gitlab, bitbucket | CodePipeline source via an AWS CodeConnections connection |
| docker_hub | none (external HTTPS target; private subnets need NAT egress) |
| on_premises | none (internet origin; VPN / Direct Connect private paths not modeled) |

## Git push (developer → repository)

| Field (developer `customConfig`) | Default | Effect |
| --- | --- | --- |
| `branch` | repository branch, else main | behavior: pipeline trigger matching |
| `gitCredentials` | true | behavior: false = authentication failure (403) |
| `iamPolicy` | power-user | behavior (CodeCommit only): power-user / read-only / deny-push / none |
| `targetRepoId` | first push target by ID | behavior: which repository receives the push |

Rules (verified 2026-10-22):
- HTTPS Git uses IAM Git credentials (or SSH keys) against the regional public Git endpoint,
  e.g. `git-codecommit.us-east-2.amazonaws.com`; the push is not a VPC flow, so no IGW/NAT/route
  table is evaluated. [Setup for HTTPS users](https://docs.aws.amazon.com/codecommit/latest/userguide/setting-up-gc.html),
  [Regions and Git connection endpoints](https://docs.aws.amazon.com/codecommit/latest/userguide/regions.html)
- `codecommit:GitPush` on the repository ARN is required for git push; `GitPull` covers fetch/clone.
  Evaluated by the IAM engine (explicit deny > allow > implicit deny).
  [Permissions reference: Git client commands](https://docs.aws.amazon.com/codecommit/latest/userguide/auth-and-access-control-permissions-reference.html)
- A push to the branch the pipeline source watches (`customConfig.branch` on the repository)
  starts the connected pipeline; other branches record the commit only.

## CodeStarSourceConnection (GitHub / GitLab / Bitbucket → CodePipeline)

| Field (git host `customConfig`) | Default | Effect |
| --- | --- | --- |
| `connectionStatus` | AVAILABLE | behavior: PENDING/ERROR = no automatic start; manual run fails at source |
| `detectChanges` | true | behavior: false = pushes do not start the pipeline |
| `branch` | main | behavior: BranchName watched by the source action |
| `fullRepositoryId` | owner/repo | trace |
| `connectionArn` | arn:aws:codeconnections:us-east-1:000000000000:connection/<node id> | IAM resource |

Rules (verified 2026-10-22, [action reference](https://docs.aws.amazon.com/codepipeline/latest/userguide/action-reference-CodestarConnectionSource.html)):
providers Bitbucket Cloud, GitHub / GitHub Enterprise Cloud, GitHub Enterprise Server, GitLab.com,
GitLab self-managed; 0 input / 1 output artifact; pipeline service role needs both
`codeconnections:UseConnection` and `codestar-connections:UseConnection`; a connection that has not
gone through the installation handshake does not trigger the pipeline; DetectChanges false disables
automatic starts. The role creator in the pipeline inspector includes both actions.

Evidence: tests/aws-conformance/devtools/git-push.test.ts (16 cases: success, branch mismatch,
IAM read-only / explicit deny / none, missing credentials, repository failure, gateway
independence, connection PENDING/DetectChanges/role permissions, connection contracts);
test/ui/ui-integration.test.ts "Third-party actors" (draw link, inspector push, IAM preset deny).

Not modeled: repository contents, merges, pull requests, branch-condition policies
(`codecommit:References`), third-party repository permissions, webhook delivery failures,
CODEBUILD_CLONE_REF, GitHub Enterprise Server / GitLab self-managed host networking, Region
availability of connections, multi-pipeline fan-out, Docker Hub rate limits, VPN/Direct Connect.

Icons: GitHub, GitLab, Bitbucket and Docker marks from Simple Icons 16.35.0 (CC0 1.0); trademarks
belong to their owners. Slack was not added (no Simple Icons mark).
