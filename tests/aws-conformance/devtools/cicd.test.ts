import { runConformanceCases, type ConformanceCase } from '../harness.ts';
import type { Node, Edge } from '@xyflow/react';
import { runLiveSimulation } from '../../../src/engine/simulation/liveSimulation.ts';
import { ec2DeploymentSucceeds, validatePipelineStructure, resolvePipelineStages } from '../../../src/engine/cicd/pipeline.ts';
import { checkConnection } from '../../../src/engine/architecture/connectionContracts.ts';
import type { Policy } from '../../../src/engine/iam/types.ts';

// Sources (verified 2026-10-17):
// CodePipeline quotas / action declaration: https://docs.aws.amazon.com/codepipeline/latest/userguide/limits.html
//   https://docs.aws.amazon.com/codepipeline/latest/userguide/action-requirements.html
// S3 source action: https://docs.aws.amazon.com/codepipeline/latest/userguide/action-reference-S3.html
// CodeBuild privilegedMode / VPC: https://docs.aws.amazon.com/codebuild/latest/APIReference/API_ProjectEnvironment.html
//   https://docs.aws.amazon.com/codebuild/latest/userguide/vpc-support.html
// CodeDeploy configs / agent: https://docs.aws.amazon.com/codedeploy/latest/userguide/deployment-configurations.html
//   https://docs.aws.amazon.com/codedeploy/latest/userguide/codedeploy-agent.html

interface Result { outcome: string; detail?: string }

const svc = (id: string, serviceId: string, x = 2000, y = 0, extra: Record<string, unknown> = {}): Node<any> =>
  ({ id, type: 'serviceNode', position: { x, y }, width: 100, height: 90, data: { serviceId, label: id, health: 'healthy', ...extra } } as any);
const box = (id: string, boundaryType: string, x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}): Node<any> =>
  ({ id, type: 'boundaryNode', position: { x, y }, width: w, height: h, data: { boundaryType, label: id, ...extra } } as any);
const edge = (source: string, target: string): Edge<any> => ({ id: `${source}-${target}`, source, target, data: { protocol: 'HTTPS', interactionType: 'synchronous', isCriticalDependency: true, timeoutMs: 1000 } });
const role = (principal: string, actions: string[]) => ({
  id: `${principal}-role`,
  trustPolicy: { id: 't', kind: 'trust', statements: [{ effect: 'Allow', principals: [principal], actions: ['sts:AssumeRole'], resources: ['*'] }] } as Policy,
  identityPolicies: [{ id: 'p', kind: 'identity', statements: [{ effect: 'Allow', actions, resources: ['*'] }] }] as Policy[]
});

/** CodeCommit -> CodePipeline -> CodeBuild -> CodeDeploy -> EC2 instances. */
function pipeline(o: { instances?: { health?: string; agent?: boolean; role?: boolean }[]; config?: string; build?: Record<string, unknown>; pipelineRole?: unknown; pushImage?: boolean } = {}) {
  const instances = (o.instances ?? [{}, {}, {}]).map((spec, i) => svc(`web-${i + 1}`, 'ec2', 2000, 400 + i * 120, {
    health: spec.health ?? 'healthy', ...(spec.role === false ? {} : { iamRole: role('ec2.amazonaws.com', ['s3:GetObject']) }),
    customConfig: spec.agent === false ? { codeDeployAgent: false } : {}
  }));
  const nodes = [
    svc('repo', 'codecommit', 0, 0, { customConfig: { branch: 'main' } }),
    svc('pipe', 'codepipeline', 300, 0, o.pipelineRole === undefined ? {} : { iamRole: o.pipelineRole }),
    svc('build', 'codebuild', 600, 0, { customConfig: { buildspec: 'buildspec.yml', ...(o.build ?? {}) } }),
    svc('deploy', 'codedeploy', 900, 0, { customConfig: o.config ? { deploymentConfig: o.config } : {} }),
    ...instances,
    ...(o.pushImage ? [svc('ecr', 'ecr_registry', 600, 300)] : [])
  ];
  const edges = [edge('repo', 'pipe'), edge('pipe', 'build'), edge('pipe', 'deploy'), ...instances.map(i => edge('deploy', i.id)), ...(o.pushImage ? [edge('build', 'ecr')] : [])];
  return { nodes, edges };
}
const run = ({ nodes, edges }: { nodes: Node<any>[]; edges: Edge<any>[] }, start = 'pipe', extra: Record<string, unknown> = {}): Result => {
  const r: any = runLiveSimulation(nodes as any, edges as any, { id: 's', name: 's', method: 'GET', path: '/', trafficLevel: 'normal', startNodeId: start, ...extra } as any);
  return { outcome: `${r.kind}:${r.outcome}`, detail: r.summary };
};
const outcome = (r: Result) => ({ outcome: r.outcome });

const CASES: ConformanceCase<Result>[] = [
  { id: 'CP-RUN-001', awsBehavior: 'A source change starts the pipeline; stages run in order and the execution succeeds when every action succeeds.',
    reference: 'CodePipeline concepts', scenario: 'CodeCommit -> Pipeline -> CodeBuild -> CodeDeploy (OneAtATime, 3 healthy instances)',
    configuration: {}, request: { start: 'repo (push)' }, expected: { outcome: 'workflow:success' },
    run: () => outcome(run(pipeline(), 'repo')), explain: a => a.outcome },
  { id: 'CP-STRUCT-001', awsBehavior: 'A pipeline needs at least two stages and a source action.',
    reference: 'CodePipeline quotas: number of stages 2-50; action declaration: a source action is required', scenario: 'Pipeline connected only to a build project',
    configuration: {}, request: {}, expected: { outcome: 'workflow:failure' },
    run: () => outcome(run({ nodes: [svc('pipe', 'codepipeline'), svc('build', 'codebuild')], edges: [edge('pipe', 'build')] })), explain: a => a.outcome },
  { id: 'CP-ARTIFACT-001', awsBehavior: 'An input artifact must exactly match an output artifact of a preceding action.',
    reference: 'CodePipeline action declaration: InputArtifacts', scenario: 'Build reads an artifact no action produces',
    configuration: {}, request: {}, expected: { outcome: 'invalid' },
    run: () => {
      const nodes = [svc('repo', 'codecommit'), svc('build', 'codebuild')];
      const issues = validatePipelineStructure([
        { name: 'Source', actions: [{ name: 'Src', category: 'Source', provider: 'CodeCommit', nodeId: 'repo', inputArtifacts: [], outputArtifacts: ['Src'] }] },
        { name: 'Build', actions: [{ name: 'Bld', category: 'Build', provider: 'CodeBuild', nodeId: 'build', inputArtifacts: ['Other'], outputArtifacts: ['Out'] }] }
      ], nodes as any);
      return { outcome: issues.some(i => i.rule.includes('exactly match')) ? 'invalid' : 'valid' };
    }, explain: a => a.outcome },
  { id: 'CP-S3SRC-001', awsBehavior: 'An S3 source action requires a versioned bucket.',
    reference: 'CodePipeline S3 source action reference', scenario: 'S3 source bucket without versioning',
    configuration: { versioning: false }, request: {}, expected: { outcome: 'workflow:failure' },
    run: () => outcome(run({ nodes: [svc('src', 's3', 0, 0, { customConfig: { versioning: false, sourceKey: 'app.zip' } }), svc('pipe', 'codepipeline'), svc('build', 'codebuild')], edges: [edge('src', 'pipe'), edge('pipe', 'build')] })),
    explain: a => a.outcome },
  { id: 'CP-STOP-001', awsBehavior: 'A failed action fails the execution; later stages do not run.',
    reference: 'CodePipeline concepts: pipeline executions', scenario: 'Build command fails',
    configuration: { buildResult: 'FAILED' }, request: {}, expected: { outcome: 'workflow:failure', detail: 'Stage Build failed at build; later stages did not run.' },
    run: () => run(pipeline({ build: { buildResult: 'FAILED' } })), explain: a => String(a.detail) },
  { id: 'CP-IAM-001', awsBehavior: 'The pipeline service role must allow each action it performs (e.g. codebuild:StartBuild).',
    reference: 'CodePipeline service role; IAM policy evaluation logic', scenario: 'Pipeline role trusted by codepipeline.amazonaws.com allows only CodeCommit actions',
    configuration: {}, request: {}, expected: { outcome: 'workflow:denied' },
    run: () => outcome(run(pipeline({ pipelineRole: role('codepipeline.amazonaws.com', ['codecommit:*']) }))), explain: a => a.outcome },
  { id: 'CP-IAM-002', awsBehavior: 'A role that does not trust the CodePipeline service principal cannot be assumed.',
    reference: 'IAM role trust policies', scenario: 'Pipeline role trusts ec2.amazonaws.com',
    configuration: {}, request: {}, expected: { outcome: 'workflow:denied' },
    run: () => outcome(run(pipeline({ pipelineRole: role('ec2.amazonaws.com', ['*']) }))), explain: a => a.outcome },
  { id: 'CB-DOCKER-001', awsBehavior: 'Building Docker images requires privileged mode; otherwise Docker daemon commands fail.',
    reference: 'CodeBuild ProjectEnvironment.privilegedMode', scenario: 'Build pushes to ECR with privileged mode off, then on',
    configuration: {}, request: {}, expected: { outcome: 'workflow:failure|workflow:success' },
    run: () => ({ outcome: `${run(pipeline({ pushImage: true })).outcome}|${run(pipeline({ pushImage: true, build: { privilegedMode: true } })).outcome}` }),
    explain: a => a.outcome },
  { id: 'CB-VPC-001', awsBehavior: 'A VPC build reaches public endpoints only through a NAT gateway; an internet gateway cannot be used because CodeBuild ENIs get no public IP.',
    reference: 'CodeBuild: Use AWS CodeBuild with Amazon VPC', scenario: 'Build in a public subnet (IGW route), then in a private subnet with NAT',
    configuration: {}, request: {}, expected: { outcome: 'workflow:failure|workflow:success' },
    run: () => {
      const vpcNodes = (buildX: number) => {
        const p = pipeline();
        const build = p.nodes.find(n => n.id === 'build')!;
        build.position = { x: buildX, y: 3150 };
        return { nodes: [...p.nodes, box('vpc', 'vpc', 0, 3000, 1200, 500, { cidr: '10.0.0.0/16' }), box('pub', 'public_subnet', 20, 3050, 500, 400, { cidr: '10.0.1.0/24' }),
          box('priv', 'private_subnet', 620, 3050, 500, 400, { cidr: '10.0.2.0/24' }), svc('igw', 'internet_gateway', 560, 3010), svc('nat', 'nat_gateway', 100, 3300)], edges: p.edges };
      };
      return { outcome: `${run(vpcNodes(200)).outcome}|${run(vpcNodes(800)).outcome}` };
    }, explain: a => a.outcome },
  { id: 'CD-CONFIG-001', awsBehavior: 'AllAtOnce succeeds if the revision deploys to one or more instances; HalfAtATime needs at least half (rounded up); OneAtATime fails on any failure except the last instance.',
    reference: 'CodeDeploy predefined deployment configurations (EC2/on-premises)', scenario: 'Result patterns over 9 / 3 instances',
    configuration: {}, request: {}, expected: { outcome: 'true,false,true,false,true,false,true' },
    run: () => ({ outcome: [
      ec2DeploymentSucceeds('CodeDeployDefault.AllAtOnce', [false, false, true]).success,
      ec2DeploymentSucceeds('CodeDeployDefault.AllAtOnce', [false, false, false]).success,
      ec2DeploymentSucceeds('CodeDeployDefault.HalfAtATime', [true, true, true, true, true, false, false, false, false]).success,
      ec2DeploymentSucceeds('CodeDeployDefault.HalfAtATime', [true, true, true, true, false, false, false, false, false]).success,
      ec2DeploymentSucceeds('CodeDeployDefault.OneAtATime', [true, true, false]).success,
      ec2DeploymentSucceeds('CodeDeployDefault.OneAtATime', [true, false, true]).success,
      ec2DeploymentSucceeds('CodeDeployDefault.OneAtATime', [true]).success
    ].join(',') }), explain: a => a.outcome },
  { id: 'CD-LIVE-001', awsBehavior: 'Instance failures count against the deployment configuration.',
    reference: 'CodeDeploy deployment configurations', scenario: 'First of 3 instances failed: OneAtATime fails, AllAtOnce succeeds',
    configuration: {}, request: {}, expected: { outcome: 'workflow:failure|workflow:success' },
    run: () => {
      const specs = [{ health: 'failed' }, {}, {}];
      return { outcome: `${run(pipeline({ instances: specs })).outcome}|${run(pipeline({ instances: specs, config: 'CodeDeployDefault.AllAtOnce' })).outcome}` };
    }, explain: a => a.outcome },
  { id: 'CD-AGENT-001', awsBehavior: 'EC2 targets need the CodeDeploy agent and an instance profile to read the revision.',
    reference: 'Working with the CodeDeploy agent', scenario: 'Single instance without the agent; single instance without an instance profile',
    configuration: {}, request: {}, expected: { outcome: 'workflow:failure|workflow:failure' },
    run: () => ({ outcome: `${run(pipeline({ instances: [{ agent: false }] })).outcome}|${run(pipeline({ instances: [{ role: false }] })).outcome}` }),
    explain: a => a.outcome },
  { id: 'CD-ECS-NLB-001', awsBehavior: 'With a Network Load Balancer only CodeDeployDefault.ECSAllAtOnce is supported.',
    reference: 'CodeDeploy deployment configurations (Amazon ECS)', scenario: 'ECS blue/green behind an NLB with a canary config, then AllAtOnce',
    configuration: {}, request: {}, expected: { outcome: 'workflow:failure|workflow:success' },
    run: () => {
      const g = (config: string) => ({
        nodes: [svc('repo', 'codecommit'), svc('pipe', 'codepipeline'), svc('deploy', 'codedeploy', 900, 0, { customConfig: { deploymentConfig: config } }), svc('nlb', 'nlb'), svc('svc', 'ecs')],
        edges: [edge('repo', 'pipe'), edge('pipe', 'deploy'), edge('deploy', 'svc'), edge('deploy', 'nlb')]
      });
      return { outcome: `${run(g('CodeDeployDefault.ECSCanary10Percent5Minutes')).outcome}|${run(g('CodeDeployDefault.ECSAllAtOnce')).outcome}` };
    }, explain: a => a.outcome },
  { id: 'CICD-CONNECT-001', awsBehavior: 'CI/CD services connect to their sources, artifact stores, registries and deployment targets as control-plane relationships.',
    reference: 'docs/behavior/codepipeline.md - relationships', scenario: 'Contract check for typical links and one unrelated link',
    configuration: {}, request: {}, expected: { outcome: 'valid,valid,valid,valid,valid,unknown' },
    run: () => {
      const n = (s: string) => svc(s, s);
      const pairs: [string, string][] = [['codecommit', 'codepipeline'], ['codepipeline', 'codebuild'], ['codebuild', 'ecr_registry'], ['codedeploy', 'ec2'], ['codepipeline', 'ecs'], ['codebuild', 'sqs']];
      return { outcome: pairs.map(([a, b]) => checkConnection(n(a), n(b), { protocol: 'HTTPS' } as any).status).join(',') };
    }, explain: a => a.outcome },
  { id: 'CICD-DERIVE-001', awsBehavior: 'Simulator: stages are derived from canvas relationships when not configured explicitly.',
    reference: 'docs/behavior/codepipeline.md', scenario: 'CodeCommit -> Pipeline -> CodeBuild -> CodeDeploy',
    configuration: {}, request: {}, expected: { outcome: 'Source:CodeCommit>Build:CodeBuild>Deploy:CodeDeploy' },
    run: () => {
      const p = pipeline();
      return { outcome: resolvePipelineStages(p.nodes.find(n => n.id === 'pipe') as any, p.nodes as any, p.edges as any).map(s => `${s.name}:${s.actions.map(a => a.provider).join('+')}`).join('>') };
    }, explain: a => a.outcome }
];

runConformanceCases(CASES);
