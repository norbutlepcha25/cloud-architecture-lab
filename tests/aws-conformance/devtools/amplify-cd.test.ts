import { runConformanceCases, type ConformanceCase } from '../harness.ts';
import type { Node, Edge } from '@xyflow/react';
import { runLiveSimulation } from '../../../src/engine/simulation/liveSimulation.ts';
import { checkConnection } from '../../../src/engine/architecture/connectionContracts.ts';

// Amplify Hosting continuous deployment (verified 2026-10-23):
// https://docs.aws.amazon.com/amplify/latest/userguide/welcome.html - "Git-based workflow ... with continuous
//   deployment"; repositories on GitHub, BitBucket, GitLab or AWS CodeCommit; atomic deployments.
// https://docs.aws.amazon.com/amplify/latest/APIReference/API_Branch.html - enableAutoBuild: "Enables
//   auto-building on push for a branch of an Amplify app."

interface Result { outcome: string; amplify: string; pipeline?: string }

const svc = (id: string, serviceId: string, extra: Record<string, unknown> = {}): Node<any> =>
  ({ id, type: 'serviceNode', position: { x: 2000, y: 0 }, width: 100, height: 90, data: { serviceId, label: id, health: 'healthy', subnet: 'global', ...extra } } as any);
const edge = (source: string, target: string): Edge<any> => ({ id: `${source}-${target}`, source, target, data: { protocol: 'Event', relationship: 'manages', interactionType: 'asynchronous', isCriticalDependency: false, timeoutMs: 1000 } });

function diagram(o: { host?: string; app?: Record<string, unknown>; appHealth?: string; dev?: Record<string, unknown>; pipeline?: boolean } = {}) {
  const nodes = [
    svc('dev', 'developer', { customConfig: o.dev ?? {} }),
    svc('repo', o.host ?? 'codecommit', { customConfig: { branch: 'main' } }),
    svc('web', 'amplify', { health: o.appHealth ?? 'healthy', customConfig: { branch: 'main', ...(o.app ?? {}) } }),
    ...(o.pipeline ? [svc('pipe', 'codepipeline'), svc('build', 'codebuild', { customConfig: { buildspec: 'buildspec.yml' } })] : [])
  ];
  const edges = [edge('dev', 'repo'), edge('repo', 'web'), ...(o.pipeline ? [edge('repo', 'pipe'), edge('pipe', 'build')] : [])];
  return { nodes, edges };
}
const run = ({ nodes, edges }: { nodes: Node<any>[]; edges: Edge<any>[] }, start = 'dev'): Result => {
  const r: any = runLiveSimulation(nodes as any, edges as any, { id: 's', name: 's', method: 'GET', path: '/', trafficLevel: 'normal', startNodeId: start } as any);
  const last = [...r.steps].reverse().find((s: any) => s.targetNodeId === 'web');
  const amplify = !last ? 'not reached' : last.status === 'success' ? 'deployed' : last.status === 'failed' ? 'failed' : 'not built';
  const pipeline = r.steps.some((s: any) => s.action === 'Start execution') ? (r.steps.some((s: any) => s.action === 'Stage Build' && s.status === 'success') ? 'succeeded' : 'failed') : undefined;
  return { outcome: `${r.kind}:${r.outcome}`, amplify, ...(pipeline ? { pipeline } : {}) };
};

const CASES: ConformanceCase<Result>[] = [
  { id: 'AMP-CD-001', awsBehavior: 'A push to the connected branch builds and deploys the Amplify app (continuous deployment).',
    reference: 'Amplify Hosting user guide: welcome', scenario: 'Developer -> CodeCommit -> Amplify app (main)',
    configuration: {}, request: { start: 'dev' }, expected: { outcome: 'workflow:success', amplify: 'deployed' },
    run: () => run(diagram()), explain: a => a.amplify },
  { id: 'AMP-CD-002', awsBehavior: 'One push reaches every subscriber: the pipeline and the Amplify app both run.',
    reference: 'Amplify continuous deployment; CodePipeline source change detection', scenario: 'Repository connected to a pipeline and an Amplify app',
    configuration: { pipeline: true }, request: { start: 'dev' }, expected: { outcome: 'workflow:success', amplify: 'deployed', pipeline: 'succeeded' },
    run: () => run(diagram({ pipeline: true })), explain: a => JSON.stringify(a) },
  { id: 'AMP-CD-003', awsBehavior: 'The repository Push commit entry point fans out the same way.',
    reference: 'Amplify continuous deployment', scenario: 'Start at the repository (pipeline + Amplify)',
    configuration: { pipeline: true }, request: { start: 'repo' }, expected: { outcome: 'workflow:success', amplify: 'deployed', pipeline: 'succeeded' },
    run: () => run(diagram({ pipeline: true }), 'repo'), explain: a => JSON.stringify(a) },
  { id: 'AMP-CD-004', awsBehavior: 'enableAutoBuild = false: a push does not start a job.',
    reference: 'Amplify API Branch.enableAutoBuild', scenario: 'Auto build disabled',
    configuration: { enableAutoBuild: false }, request: { start: 'dev' }, expected: { outcome: 'workflow:success', amplify: 'not built' },
    run: () => run(diagram({ app: { enableAutoBuild: false } })), explain: a => a.amplify },
  { id: 'AMP-CD-005', awsBehavior: 'A push to a branch that is not connected to the app does not build it.',
    reference: 'Amplify Branch maps to a repository branch', scenario: 'Push to feature/x; app connected to main',
    configuration: { dev: { branch: 'feature/x' } }, request: { start: 'dev' }, expected: { outcome: 'workflow:success', amplify: 'not built' },
    run: () => run(diagram({ dev: { branch: 'feature/x' } })), explain: a => a.amplify },
  { id: 'AMP-CD-006', awsBehavior: 'A failed build fails the job; atomic deployment keeps the previous version serving.',
    reference: 'Amplify Hosting: atomic deployments', scenario: 'Build result FAILED',
    configuration: { buildResult: 'FAILED' }, request: { start: 'dev' }, expected: { outcome: 'workflow:failure', amplify: 'failed' },
    run: () => run(diagram({ app: { buildResult: 'FAILED' } })), explain: a => a.amplify },
  { id: 'AMP-CD-007', awsBehavior: 'GitHub-hosted repositories deploy to Amplify the same way.',
    reference: 'Amplify Hosting: GitHub, BitBucket, GitLab, CodeCommit', scenario: 'Developer -> GitHub -> Amplify',
    configuration: { host: 'github' }, request: { start: 'dev' }, expected: { outcome: 'workflow:success', amplify: 'deployed' },
    run: () => run(diagram({ host: 'github' })), explain: a => a.amplify },
  { id: 'AMP-CD-008', awsBehavior: 'A denied push never reaches Amplify.',
    reference: 'CodeCommit codecommit:GitPush', scenario: 'Developer read-only',
    configuration: { iamPolicy: 'read-only' }, request: { start: 'dev' }, expected: { outcome: 'workflow:denied', amplify: 'not reached' },
    run: () => run(diagram({ dev: { iamPolicy: 'read-only' } })), explain: a => a.amplify },
  { id: 'AMP-LINK-001', awsBehavior: 'Repository -> Amplify is a valid hosting relationship, not an application request.',
    reference: 'Amplify Hosting user guide', scenario: 'Contract check for CodeCommit/GitHub/GitLab/Bitbucket -> Amplify',
    configuration: {}, request: {}, expected: { outcome: 'valid,valid,valid,valid', amplify: 'n/a' },
    run: () => ({ outcome: ['codecommit', 'github', 'gitlab', 'bitbucket'].map(id => checkConnection(svc('a', id), svc('b', 'amplify'), { protocol: 'Event', relationship: 'manages' } as any).status).join(','), amplify: 'n/a' }),
    explain: a => a.outcome }
];

runConformanceCases(CASES);
