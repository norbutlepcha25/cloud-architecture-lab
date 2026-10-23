import { runConformanceCases, type ConformanceCase } from '../harness.ts';
import type { Node, Edge } from '@xyflow/react';
import { runLiveSimulation } from '../../../src/engine/simulation/liveSimulation.ts';
import { checkConnection, isManagementPair } from '../../../src/engine/architecture/connectionContracts.ts';
import type { Policy } from '../../../src/engine/iam/types.ts';

// Documented AWS integrations in a secure CI/CD diagram (sources verified 2026-10-22; full list in
// docs/behavior/service_integrations.md):
// https://docs.aws.amazon.com/codecommit/latest/userguide/monitoring-events.html
// https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-targets.html
// https://docs.aws.amazon.com/codebuild/latest/userguide/build-spec-ref.html
// https://docs.aws.amazon.com/codeartifact/latest/ug/tokens-authentication.html
// https://docs.aws.amazon.com/signer/latest/developerguide/image-signing-prerequisites.html
// https://docs.aws.amazon.com/eventbridge/latest/ref/events-ref-codeconnections.html
// https://docs.aws.amazon.com/codedeploy/latest/userguide/deployments-create.html

interface Result { outcome: string; build?: string; detail?: string }

const svc = (id: string, serviceId: string, extra: Record<string, unknown> = {}): Node<any> =>
  ({ id, type: 'serviceNode', position: { x: 2000, y: 0 }, width: 100, height: 90, data: { serviceId, label: id, health: 'healthy', subnet: 'global', ...extra } } as any);
const edge = (source: string, target: string): Edge<any> => ({ id: `${source}-${target}`, source, target, data: { protocol: 'Event', relationship: 'manages', interactionType: 'asynchronous', isCriticalDependency: false, timeoutMs: 1000 } });
const role = (principal: string, actions: string[]) => ({
  id: `${principal}-role`,
  trustPolicy: { id: 't', kind: 'trust', statements: [{ effect: 'Allow', principals: [principal], actions: ['sts:AssumeRole'], resources: ['*'] }] } as Policy,
  identityPolicies: [{ id: 'p', kind: 'identity', statements: [{ effect: 'Allow', actions, resources: ['*'] }] }] as Policy[]
});
const BUILD_BASE = ['codecommit:GitPull', 'logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'];
const DEPENDENCY_ACTIONS = ['secretsmanager:GetSecretValue', 'ssm:GetParameters', 'codeartifact:GetAuthorizationToken', 'codeartifact:GetRepositoryEndpoint', 'codeartifact:ReadFromRepository', 'sts:GetServiceBearerToken', 'signer:SignPayload', 'signer:GetRevocationStatus'];

/** Developer -> CodeCommit -> EventBridge rule -> CodeBuild -> {Secrets, Parameter Store, CodeArtifact, Signer} [-> CodeDeploy]. */
function diagram(o: { buildActions?: string[]; ruleActions?: string[]; rule?: Record<string, unknown>; dev?: Record<string, unknown>; failed?: string; signer?: Record<string, unknown>; deploy?: boolean } = {}) {
  const health = (id: string) => (o.failed === id ? { health: 'failed' } : {});
  const nodes = [
    svc('dev', 'developer', { customConfig: o.dev ?? {} }),
    svc('repo', 'codecommit', { customConfig: { branch: 'main' }, ...health('repo') }),
    svc('rule', 'eventbridge', { customConfig: o.rule ?? {}, ...(o.ruleActions ? { iamRole: role('events.amazonaws.com', o.ruleActions) } : {}), ...health('rule') }),
    svc('build', 'codebuild', { customConfig: { buildspec: 'buildspec.yml' }, iamRole: role('codebuild.amazonaws.com', o.buildActions ?? [...BUILD_BASE, ...DEPENDENCY_ACTIONS]) }),
    svc('secrets', 'secrets_manager', health('secrets')),
    svc('params', 'systems_manager', health('params')),
    svc('packages', 'codeartifact', health('packages')),
    svc('signer', 'signer', { customConfig: o.signer ?? {}, ...health('signer') }),
    ...(o.deploy ? [svc('deploy', 'codedeploy')] : [])
  ];
  const edges = [edge('dev', 'repo'), edge('repo', 'rule'), edge('rule', 'build'), edge('build', 'secrets'), edge('build', 'params'), edge('build', 'packages'), edge('build', 'signer'), ...(o.deploy ? [edge('build', 'deploy')] : [])];
  return { nodes, edges };
}
const run = ({ nodes, edges }: { nodes: Node<any>[]; edges: Edge<any>[] }, start = 'dev'): Result => {
  const r: any = runLiveSimulation(nodes as any, edges as any, { id: 's', name: 's', method: 'GET', path: '/', trafficLevel: 'normal', startNodeId: start } as any);
  const built = r.steps.some((s: any) => s.action === 'Build: CodeBuild' && s.status === 'success');
  const attempted = r.steps.some((s: any) => s.action?.startsWith('Build (project)'));
  return { outcome: `${r.kind}:${r.outcome}`, build: built ? 'succeeded' : attempted ? 'failed' : 'not started', detail: r.summary };
};
const brief = (r: Result) => ({ outcome: r.outcome, build: r.build });
const status = (a: string, b: string) => {
  const s = svc('a', a), t = svc('b', b);
  return checkConnection(s, t, { protocol: 'Event', relationship: isManagementPair(s, t) ? 'manages' : 'request' } as any).status;
};

const DOCUMENTED = [['codecommit', 'eventbridge'], ['eventbridge', 'codebuild'], ['eventbridge', 'codepipeline'], ['codebuild', 'codeartifact'], ['codebuild', 'secrets_manager'],
  ['codebuild', 'systems_manager'], ['codebuild', 'signer'], ['codebuild', 'security_hub'], ['ecr_registry', 'inspector'], ['inspector', 'security_hub'], ['cloudwatch', 'codedeploy'],
  ['ecs', 'appconfig'], ['codedeploy', 'cloudtrail'], ['cloudtrail', 'audit_manager'], ['github', 'codebuild']];

const CASES: ConformanceCase<Result>[] = [
  { id: 'INT-LINK-001', awsBehavior: 'Each documented integration is a valid, drawable non-request relationship.',
    reference: 'Service integration pages listed in service_integrations.md', scenario: `${DOCUMENTED.length} documented pairs`,
    configuration: {}, request: {}, expected: { outcome: DOCUMENTED.map(() => 'valid').join(',') },
    run: () => ({ outcome: DOCUMENTED.map(([a, b]) => status(a, b)).join(',') }), explain: a => a.outcome },
  { id: 'INT-LINK-002', awsBehavior: 'CodeConnections publishes only GitSync sync-status events to EventBridge (no push events); Signer has no CodeDeploy integration.',
    reference: 'EventBridge events reference: CodeConnections; AWS Signer integrated services', scenario: 'GitHub -> EventBridge, Signer -> CodeDeploy',
    configuration: {}, request: {}, expected: { outcome: 'invalid,invalid' },
    run: () => ({ outcome: [status('github', 'eventbridge'), status('signer', 'codedeploy')].join(',') }), explain: a => a.outcome },
  { id: 'INT-EB-001', awsBehavior: 'A push emits a CodeCommit Repository State Change event; a matching rule starts the CodeBuild target, which reads its secrets, parameters, packages and signs the artifact.',
    reference: 'CodeCommit events in EventBridge; EventBridge targets; buildspec env', scenario: 'Developer push -> rule (role allows StartBuild) -> build with dependencies',
    configuration: { ruleActions: ['codebuild:StartBuild'] }, request: { start: 'dev' }, expected: { outcome: 'workflow:success', build: 'succeeded' },
    run: () => brief(run(diagram({ ruleActions: ['codebuild:StartBuild'] }))), explain: a => a.detail ?? '' },
  { id: 'INT-EB-002', awsBehavior: 'The rule execution role must allow the target action.',
    reference: 'EventBridge targets: execution role', scenario: 'Rule role allows only sqs:SendMessage',
    configuration: { ruleActions: ['sqs:SendMessage'] }, request: { start: 'dev' }, expected: { outcome: 'workflow:denied', build: 'not started' },
    run: () => brief(run(diagram({ ruleActions: ['sqs:SendMessage'] }))), explain: a => a.detail ?? '' },
  { id: 'INT-EB-003', awsBehavior: 'An event that does not match the rule pattern invokes no target.',
    reference: 'CodeCommit events: referenceName in event detail', scenario: 'Push to feature/x; rule matches main',
    configuration: { dev: { branch: 'feature/x' } }, request: { start: 'dev' }, expected: { outcome: 'workflow:success', build: 'not started' },
    run: () => brief(run(diagram({ dev: { branch: 'feature/x' } }))), explain: a => a.detail ?? '' },
  { id: 'INT-EB-004', awsBehavior: 'An unavailable rule delivers nothing (teaching failure).',
    reference: 'Failure injection', scenario: 'EventBridge rule marked failed', configuration: { failed: 'rule' }, request: { start: 'dev' },
    expected: { outcome: 'workflow:failure', build: 'not started' }, run: () => brief(run(diagram({ failed: 'rule' }))), explain: a => a.detail ?? '' },
  { id: 'INT-EB-005', awsBehavior: 'The repository Push commit entry point uses the same rule path as a developer push.',
    reference: 'CodeCommit events in EventBridge', scenario: 'Start at the repository', configuration: {}, request: { start: 'repo' },
    expected: { outcome: 'workflow:success', build: 'succeeded' }, run: () => brief(run(diagram(), 'repo')), explain: a => a.detail ?? '' },
  { id: 'INT-DEP-001', awsBehavior: 'buildspec secrets-manager references need secretsmanager:GetSecretValue on the project role.',
    reference: 'Buildspec reference: env/secrets-manager', scenario: 'Project role without GetSecretValue',
    configuration: {}, request: { start: 'dev' }, expected: { outcome: 'workflow:denied', build: 'failed' },
    run: () => brief(run(diagram({ buildActions: [...BUILD_BASE, ...DEPENDENCY_ACTIONS.filter(a => a !== 'secretsmanager:GetSecretValue')] }))), explain: a => a.detail ?? '' },
  { id: 'INT-DEP-002', awsBehavior: 'CodeArtifact access requires sts:GetServiceBearerToken in addition to codeartifact:GetAuthorizationToken.',
    reference: 'CodeArtifact authentication and tokens', scenario: 'Project role without sts:GetServiceBearerToken',
    configuration: {}, request: { start: 'dev' }, expected: { outcome: 'workflow:denied', build: 'failed' },
    run: () => brief(run(diagram({ buildActions: [...BUILD_BASE, ...DEPENDENCY_ACTIONS.filter(a => a !== 'sts:GetServiceBearerToken')] }))), explain: a => a.detail ?? '' },
  { id: 'INT-DEP-003', awsBehavior: 'Signing Lambda code uses a signing job (StartSigningJob); container signing permissions do not cover it.',
    reference: 'AWS Signer: StartSigningJob; Notation prerequisites', scenario: 'Signer platform lambda, role has only SignPayload/GetRevocationStatus',
    configuration: { signingPlatform: 'lambda' }, request: { start: 'dev' }, expected: { outcome: 'workflow:denied', build: 'failed' },
    run: () => brief(run(diagram({ signer: { signingPlatform: 'lambda' } }))), explain: a => a.detail ?? '' },
  { id: 'INT-DEP-004', awsBehavior: 'An unavailable build dependency fails the build (teaching failure); healthy dependencies recover it.',
    reference: 'Failure injection', scenario: 'CodeArtifact marked failed', configuration: { failed: 'packages' }, request: { start: 'dev' },
    expected: { outcome: 'workflow:failure', build: 'failed' }, run: () => brief(run(diagram({ failed: 'packages' }))), explain: a => a.detail ?? '' },
  { id: 'INT-HANDOFF-001', awsBehavior: 'A build started by EventBridge does not start CodeDeploy; a deployment starts only from CreateDeployment (CodePipeline or an explicit call).',
    reference: 'CodeDeploy: create a deployment; EventBridge targets (CodeDeploy not listed)', scenario: 'Build connected to CodeDeploy, no pipeline',
    configuration: { deploy: true }, request: { start: 'dev' }, expected: { outcome: 'workflow:success', build: 'succeeded' },
    run: () => {
      const r: any = runLiveSimulation(diagram({ deploy: true }).nodes as any, diagram({ deploy: true }).edges as any, { id: 's', name: 's', method: 'GET', path: '/', trafficLevel: 'normal', startNodeId: 'dev' } as any);
      const deployed = r.steps.some((s: any) => s.targetNodeId === 'deploy');
      return { outcome: `${r.kind}:${r.outcome}`, build: deployed ? 'deployment started' : 'succeeded' };
    }, explain: a => a.build ?? '' }
];

runConformanceCases(CASES);
