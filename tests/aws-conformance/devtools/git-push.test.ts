import { runConformanceCases, type ConformanceCase } from '../harness.ts';
import type { Node, Edge } from '@xyflow/react';
import { runLiveSimulation } from '../../../src/engine/simulation/liveSimulation.ts';
import { checkConnection } from '../../../src/engine/architecture/connectionContracts.ts';
import type { Policy } from '../../../src/engine/iam/types.ts';

// Sources (verified 2026-10-22):
// CodeCommit HTTPS Git credentials: https://docs.aws.amazon.com/codecommit/latest/userguide/setting-up-gc.html
// codecommit:GitPush / GitPull: https://docs.aws.amazon.com/codecommit/latest/userguide/auth-and-access-control-permissions-reference.html
// Git endpoints: https://docs.aws.amazon.com/codecommit/latest/userguide/regions.html
// CodeStarSourceConnection (GitHub/GitLab/Bitbucket): https://docs.aws.amazon.com/codepipeline/latest/userguide/action-reference-CodestarConnectionSource.html

interface Result { outcome: string; pipeline?: string; detail?: string }

const svc = (id: string, serviceId: string, x = 2000, y = 0, extra: Record<string, unknown> = {}): Node<any> =>
  ({ id, type: 'serviceNode', position: { x, y }, width: 100, height: 90, data: { serviceId, label: id, health: 'healthy', ...extra } } as any);
const box = (id: string, boundaryType: string, x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}): Node<any> =>
  ({ id, type: 'boundaryNode', position: { x, y }, width: w, height: h, data: { boundaryType, label: id, ...extra } } as any);
const edge = (source: string, target: string, protocol = 'HTTPS'): Edge<any> => ({ id: `${source}-${target}`, source, target, data: { protocol, interactionType: 'synchronous', isCriticalDependency: true, timeoutMs: 1000 } });
const pipelineRole = (actions: string[]) => ({
  id: 'pipeline-role',
  trustPolicy: { id: 't', kind: 'trust', statements: [{ effect: 'Allow', principals: ['codepipeline.amazonaws.com'], actions: ['sts:AssumeRole'], resources: ['*'] }] } as Policy,
  identityPolicies: [{ id: 'p', kind: 'identity', statements: [{ effect: 'Allow', actions, resources: ['*'] }] }] as Policy[]
});

/** Developer -> repository [-> pipeline -> build]. A VPC with no gateways is drawn to show it is irrelevant. */
function diagram(o: { host?: string; dev?: Record<string, unknown>; repo?: Record<string, unknown>; repoHealth?: string; pipeline?: boolean; role?: unknown } = {}) {
  const host = o.host ?? 'codecommit';
  const nodes = [
    box('vpc', 'vpc', 0, 600, 600, 400, { cidr: '10.0.0.0/16' }),
    box('private', 'private_subnet', 50, 650, 500, 300, { cidr: '10.0.1.0/24' }),
    svc('dev', 'developer', 2000, 0, { subnet: 'global', customConfig: o.dev ?? {} }),
    svc('repo', host, 2300, 0, { subnet: 'global', health: o.repoHealth ?? 'healthy', customConfig: { branch: 'main', ...(o.repo ?? {}) } }),
    ...(o.pipeline === false ? [] : [
      svc('pipe', 'codepipeline', 2600, 0, o.role === undefined ? {} : { iamRole: o.role }),
      svc('build', 'codebuild', 2900, 0, { customConfig: { buildspec: 'buildspec.yml' } })
    ])
  ];
  const edges = [edge('dev', 'repo'), ...(o.pipeline === false ? [] : [edge('repo', 'pipe'), edge('pipe', 'build')])];
  return { nodes, edges };
}
const run = ({ nodes, edges }: { nodes: Node<any>[]; edges: Edge<any>[] }, start = 'dev', extra: Record<string, unknown> = {}): Result => {
  const r: any = runLiveSimulation(nodes as any, edges as any, { id: 's', name: 's', method: 'GET', path: '/', trafficLevel: 'normal', startNodeId: start, ...extra } as any);
  const started = r.steps.some((s: any) => s.action === 'Start execution' && s.status === 'success');
  return { outcome: `${r.kind}:${r.outcome}`, pipeline: started ? (r.success ? 'succeeded' : 'failed') : 'not started', detail: r.summary };
};
const brief = (r: Result) => ({ outcome: r.outcome, pipeline: r.pipeline });

const CASES: ConformanceCase<Result>[] = [
  { id: 'GIT-PUSH-001', awsBehavior: 'A developer outside AWS pushes to the CodeCommit public Git endpoint over HTTPS; no VPC gateway is on the path.',
    reference: 'CodeCommit setup for HTTPS users; Regions and Git connection endpoints', scenario: 'Developer -> CodeCommit, no pipeline, VPC with no IGW/NAT drawn',
    configuration: { iamPolicy: 'power-user' }, request: { start: 'dev' }, expected: { outcome: 'workflow:success', pipeline: 'not started' },
    run: () => brief(run(diagram({ pipeline: false }))), explain: a => a.detail ?? '' },
  { id: 'GIT-PUSH-002', awsBehavior: 'A push to the branch a CodeCommit source action watches starts the pipeline.',
    reference: 'CodePipeline CodeCommit source action', scenario: 'Developer -> CodeCommit -> CodePipeline -> CodeBuild',
    configuration: {}, request: { start: 'dev', branch: 'main' }, expected: { outcome: 'workflow:success', pipeline: 'succeeded' },
    run: () => brief(run(diagram())), explain: a => a.detail ?? '' },
  { id: 'GIT-PUSH-IAM-001', awsBehavior: 'git push requires codecommit:GitPush; GitPull alone (read-only) is an implicit deny.',
    reference: 'CodeCommit permissions reference: Git client commands', scenario: 'Developer with AWSCodeCommitReadOnly',
    configuration: { iamPolicy: 'read-only' }, request: { start: 'dev' }, expected: { outcome: 'workflow:denied', pipeline: 'not started' },
    run: () => brief(run(diagram({ dev: { iamPolicy: 'read-only' } }))), explain: a => a.detail ?? '' },
  { id: 'GIT-PUSH-IAM-002', awsBehavior: 'An explicit Deny on codecommit:GitPush for the repository overrides an Allow.',
    reference: 'IAM policy evaluation logic', scenario: 'Power user + Deny GitPush on the repository ARN',
    configuration: { iamPolicy: 'deny-push' }, request: { start: 'dev' }, expected: { outcome: 'workflow:denied', pipeline: 'not started' },
    run: () => brief(run(diagram({ dev: { iamPolicy: 'deny-push' } }))), explain: a => a.detail ?? '' },
  { id: 'GIT-PUSH-IAM-003', awsBehavior: 'An identity with no CodeCommit permissions cannot push.',
    reference: 'IAM implicit deny', scenario: 'Developer with no policies',
    configuration: { iamPolicy: 'none' }, request: { start: 'dev' }, expected: { outcome: 'workflow:denied', pipeline: 'not started' },
    run: () => brief(run(diagram({ dev: { iamPolicy: 'none' } }))), explain: a => a.detail ?? '' },
  { id: 'GIT-PUSH-AUTH-001', awsBehavior: 'HTTPS Git access requires Git credentials (or an SSH key) for an IAM identity.',
    reference: 'CodeCommit setup for HTTPS users using Git credentials', scenario: 'Developer without Git credentials',
    configuration: { gitCredentials: false }, request: { start: 'dev' }, expected: { outcome: 'workflow:denied', pipeline: 'not started' },
    run: () => brief(run(diagram({ dev: { gitCredentials: false } }))), explain: a => a.detail ?? '' },
  { id: 'GIT-PUSH-BRANCH-001', awsBehavior: 'A push to a branch other than the source action BranchName does not start the pipeline.',
    reference: 'CodePipeline CodeCommit source action: BranchName', scenario: 'Push to feature/login; pipeline watches main',
    configuration: { branch: 'feature/login' }, request: { start: 'dev' }, expected: { outcome: 'workflow:success', pipeline: 'not started' },
    run: () => brief(run(diagram({ dev: { branch: 'feature/login' } }))), explain: a => a.detail ?? '' },
  { id: 'GIT-PUSH-HEALTH-001', awsBehavior: 'An unavailable repository rejects the push (teaching failure).',
    reference: 'Simulator failure injection', scenario: 'CodeCommit marked failed',
    configuration: { repoHealth: 'failed' }, request: { start: 'dev' }, expected: { outcome: 'workflow:failure', pipeline: 'not started' },
    run: () => brief(run(diagram({ repoHealth: 'failed' }))), explain: a => a.detail ?? '' },
  { id: 'GIT-PUSH-GATEWAY-001', awsBehavior: 'The Git endpoint is not a VPC resource, so the result does not depend on gateways.',
    reference: 'CodeCommit Git connection endpoints', scenario: 'Same push with Assume gateways on',
    configuration: { assumeGateways: true }, request: { start: 'dev' }, expected: { outcome: 'workflow:success', pipeline: 'succeeded' },
    run: () => brief(run(diagram(), 'dev', { assumeGateways: true })), explain: a => a.detail ?? '' },
  { id: 'CONN-SRC-001', awsBehavior: 'A push to GitHub starts a pipeline whose CodeStarSourceConnection source uses an AVAILABLE connection.',
    reference: 'CodeStarSourceConnection action reference', scenario: 'Developer -> GitHub -> CodePipeline -> CodeBuild',
    configuration: { connectionStatus: 'AVAILABLE' }, request: { start: 'dev' }, expected: { outcome: 'workflow:success', pipeline: 'succeeded' },
    run: () => brief(run(diagram({ host: 'github' }))), explain: a => a.detail ?? '' },
  { id: 'CONN-SRC-002', awsBehavior: 'A connection that has not completed the handshake does not trigger the pipeline.',
    reference: 'CodeStarSourceConnection: connection must have gone through the installation handshake', scenario: 'GitLab connection PENDING',
    configuration: { connectionStatus: 'PENDING' }, request: { start: 'dev' }, expected: { outcome: 'workflow:success', pipeline: 'not started' },
    run: () => brief(run(diagram({ host: 'gitlab', repo: { connectionStatus: 'PENDING' } }))), explain: a => a.detail ?? '' },
  { id: 'CONN-SRC-003', awsBehavior: 'A manual run with a PENDING connection fails at the source action.',
    reference: 'CodeStarSourceConnection action reference', scenario: 'Run pipeline; Bitbucket connection PENDING',
    configuration: { connectionStatus: 'PENDING' }, request: { start: 'pipe' }, expected: { outcome: 'workflow:failure', pipeline: 'failed' },
    run: () => brief(run(diagram({ host: 'bitbucket', repo: { connectionStatus: 'PENDING' } }), 'pipe')), explain: a => a.detail ?? '' },
  { id: 'CONN-SRC-004', awsBehavior: 'The pipeline service role needs codeconnections:UseConnection and codestar-connections:UseConnection.',
    reference: 'CodeStarSourceConnection: Service role permissions', scenario: 'Pipeline role allows only codebuild actions',
    configuration: { role: ['codebuild:StartBuild', 'codebuild:BatchGetBuilds'] }, request: { start: 'dev' }, expected: { outcome: 'workflow:denied', pipeline: 'failed' },
    run: () => brief(run(diagram({ host: 'github', role: pipelineRole(['codebuild:StartBuild', 'codebuild:BatchGetBuilds']) }))), explain: a => a.detail ?? '' },
  { id: 'CONN-SRC-005', awsBehavior: 'With both UseConnection actions allowed the source action succeeds.',
    reference: 'CodeStarSourceConnection: Service role permissions', scenario: 'Pipeline role with UseConnection + CodeBuild actions',
    configuration: {}, request: { start: 'dev' }, expected: { outcome: 'workflow:success', pipeline: 'succeeded' },
    run: () => brief(run(diagram({ host: 'github', role: pipelineRole(['codeconnections:UseConnection', 'codestar-connections:UseConnection', 'codebuild:StartBuild', 'codebuild:BatchGetBuilds']) }))), explain: a => a.detail ?? '' },
  { id: 'CONN-SRC-006', awsBehavior: 'DetectChanges=false stops automatic starts on new commits.',
    reference: 'CodeStarSourceConnection: DetectChanges', scenario: 'Bitbucket source with DetectChanges false',
    configuration: { detectChanges: false }, request: { start: 'dev' }, expected: { outcome: 'workflow:success', pipeline: 'not started' },
    run: () => brief(run(diagram({ host: 'bitbucket', repo: { detectChanges: false } }))), explain: a => a.detail ?? '' },
  { id: 'CONN-LINK-001', awsBehavior: 'Developer -> CodeCommit, developer -> GitHub and GitHub -> CodePipeline are valid workflow relationships, not application requests.',
    reference: 'CodePipeline source integrations', scenario: 'Connection contract checks',
    configuration: {}, request: {}, expected: { outcome: 'valid,valid,valid' },
    run: () => ({ outcome: [['developer', 'codecommit'], ['developer', 'github'], ['github', 'codepipeline']]
      .map(([a, b]) => checkConnection(svc('a', a), svc('b', b), { protocol: 'HTTPS' } as any).status).join(',') }), explain: a => a.outcome }
];

runConformanceCases(CASES);
