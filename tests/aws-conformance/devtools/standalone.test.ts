import { runConformanceCases } from '../harness.ts';
import { runLiveSimulation } from '../../../src/engine/simulation/liveSimulation.ts';
import { runLabReference } from '../../../src/engine/labs/runLabReference.ts';
import assert from 'node:assert/strict';
import test from 'node:test';

const svc = (id: string, serviceId: string, customConfig: any = {}, actions?: string[]): any => ({ id, type: 'serviceNode', position: { x: 2000, y: 0 }, data: { serviceId, label: id, health: 'healthy', subnet: 'global', customConfig,
  ...(actions ? { iamRole: { id: `${id}-role`, trustPolicy: { id: 't', kind: 'trust', statements: [{ effect: 'Allow', actions: ['sts:AssumeRole'], principals: [serviceId === 'ec2' ? 'ec2.amazonaws.com' : `${serviceId}.amazonaws.com`], resources: ['*'] }] }, identityPolicies: [{ id: 'p', kind: 'identity', statements: [{ effect: 'Allow', actions, resources: ['*'] }] }] } } : {}) } });
const edge = (source: string, target: string, data = {}): any => ({ id: `${source}-${target}`, source, target, data: { relationship: 'manages', protocol: 'Event', ...data } });
const scenario: any = { id: 'standalone', name: 'standalone', startNodeId: 'build', method: 'GET', path: '/', trafficLevel: 'normal' };
const build = () => svc('build', 'codebuild', { sourceType: 'NO_SOURCE', buildspec: 'version: 0.2\nphases:\n  build:\n    commands: [echo hello]' }, ['logs:*']);
const deployment = () => ({ nodes: [svc('deploy', 'codedeploy', { revisionBucketId: 'bucket', revisionKey: 'app.zip' }, ['*']), svc('bucket', 's3'), svc('instance', 'ec2', {}, ['s3:GetObject'])], edges: [edge('deploy', 'instance')] });
function run(nodes: any[], edges: any[] = [], start = 'build') { return runLiveSimulation(nodes, edges, { ...scenario, startNodeId: start }); }
const result = (r: any) => `${r.kind}:${r.outcome}:${r.statusCode}`;
const buildRef = 'https://docs.aws.amazon.com/codebuild/latest/userguide/run-build-cli.html';
const deployRef = 'https://docs.aws.amazon.com/codedeploy/latest/userguide/deployments-create-cli.html';
runConformanceCases([
  { id: 'CB-STANDALONE-001', awsBehavior: 'StartBuild runs a project without requiring a pipeline; NO_SOURCE uses an inline buildspec.', reference: 'https://docs.aws.amazon.com/codebuild/latest/userguide/no-source.html', scenario: 'Run a no-source build with its own service role', configuration: { sourceType: 'NO_SOURCE' }, request: { operation: 'StartBuild' }, expected: 'workflow:success:200', run: () => result(run([build()])), explain: a => a },
  { id: 'CB-STANDALONE-CONFIG-001', awsBehavior: 'NO_SOURCE requires an inline buildspec, not a buildspec file.', reference: 'https://docs.aws.amazon.com/codebuild/latest/userguide/no-source.html', scenario: 'Reject a file buildspec for NO_SOURCE', configuration: {}, request: {}, expected: 'workflow:failure:400', run: () => { const b = build(); b.data.customConfig.buildspec = 'buildspec.yml'; return result(run([b])); }, explain: a => a },
  { id: 'CB-STANDALONE-IAM-001', awsBehavior: 'The build project needs a service role with permission for the APIs used during the build.', reference: buildRef, scenario: 'Missing role and insufficient logging permission deny execution', configuration: {}, request: {}, expected: ['workflow:denied:403', 'workflow:denied:403'], run: () => { const a = build(), b = build(); delete a.data.iamRole; b.data.iamRole.identityPolicies[0].statements[0].actions = ['s3:*']; return [result(run([a])), result(run([b]))]; }, explain: a => JSON.stringify(a) },
  { id: 'CB-STANDALONE-SOURCE-001', awsBehavior: 'CodeBuild reads its configured CodeCommit source using the project role.', reference: 'https://docs.aws.amazon.com/codebuild/latest/APIReference/API_ProjectSource.html', scenario: 'CodeCommit clone succeeds, unavailable source fails, recovery succeeds', configuration: {}, request: {}, expected: ['workflow:success:200', 'workflow:failure:503', 'workflow:success:200'], run: () => { const b = build(), repo = svc('repo', 'codecommit'); b.data.customConfig = { sourceType: 'CODECOMMIT', buildspec: 'buildspec.yml' }; b.data.iamRole.identityPolicies[0].statements[0].actions = ['logs:*', 'codecommit:GitPull']; const edges = [edge('repo', 'build')]; const a = result(run([b, repo], edges)); repo.data.health = 'failed'; const fail = result(run([b, repo], edges)); repo.data.health = 'healthy'; return [a, fail, result(run([b, repo], edges))]; }, explain: a => JSON.stringify(a) },
  { id: 'CD-STANDALONE-001', awsBehavior: 'CreateDeployment deploys an S3 revision to instances in a deployment group without requiring a pipeline.', reference: deployRef, scenario: 'Deploy a configured revision to an EC2 target', configuration: { revisionKey: 'app.zip' }, request: { operation: 'CreateDeployment' }, expected: 'workflow:success:200', run: () => { const g = deployment(); return result(run(g.nodes, g.edges, 'deploy')); }, explain: a => a },
  { id: 'CD-STANDALONE-REVISION-001', awsBehavior: 'An S3 deployment revision identifies a bucket and object key.', reference: deployRef, scenario: 'Missing revision key is a configuration failure', configuration: {}, request: {}, expected: 'workflow:failure:400', run: () => { const g = deployment(); delete g.nodes[0].data.customConfig.revisionKey; return result(run(g.nodes, g.edges, 'deploy')); }, explain: a => a },
  { id: 'CD-STANDALONE-IAM-001', awsBehavior: 'Deployment groups require a service role and instances need access to the application revision.', reference: 'https://docs.aws.amazon.com/codedeploy/latest/userguide/deployment-groups-create.html', scenario: 'Missing service role denies; instance lacking GetObject cannot install revision', configuration: {}, request: {}, expected: ['workflow:denied:403', 'workflow:failure:500'], run: () => { const g = deployment(); delete g.nodes[0].data.iamRole; const missing = result(run(g.nodes, g.edges, 'deploy')); const h = deployment(); h.nodes[2].data.iamRole.identityPolicies[0].statements[0].actions = ['s3:PutObject']; return [missing, result(run(h.nodes, h.edges, 'deploy'))]; }, explain: a => JSON.stringify(a) },
  { id: 'CD-STANDALONE-FAILURE-001', awsBehavior: 'A deployment requires an available revision and installable target; recovery allows a new deployment.', reference: deployRef, scenario: 'Unavailable S3 revision then missing agent then recovery', configuration: {}, request: {}, expected: ['workflow:failure:503', 'workflow:failure:500', 'workflow:success:200'], run: () => { const g = deployment(); g.nodes[1].data.health = 'failed'; const first = result(run(g.nodes, g.edges, 'deploy')); g.nodes[1].data.health = 'healthy'; g.nodes[2].data.customConfig.codeDeployAgent = false; const second = result(run(g.nodes, g.edges, 'deploy')); g.nodes[2].data.customConfig.codeDeployAgent = true; return [first, second, result(run(g.nodes, g.edges, 'deploy'))]; }, explain: a => JSON.stringify(a) }
]);

test('standalone execution is immutable, reorder invariant, lab equivalent and does not trigger a downstream deployment', () => {
  const b = build(), d = svc('deploy', 'codedeploy'), nodes = [b, d], edges = [edge('build', 'deploy')];
  const before = structuredClone({ nodes, edges });
  const expected = run(nodes, edges);
  assert.equal(expected.success, true, expected.summary);
  assert.ok(!expected.steps.some(s => s.targetNodeId === 'deploy'));
  assert.deepEqual(runLabReference({ nodes, edges, scenario } as any), expected);
  assert.deepEqual(run([...nodes].reverse(), [...edges].reverse()), expected);
  assert.deepEqual({ nodes, edges }, before);
});

test('all developer-tool starting points return workflow results with actionable configuration failures', () => {
  for (const service of ['codecommit', 'codebuild', 'codedeploy', 'codepipeline']) {
    const r = run([svc(service, service)], [], service);
    assert.equal(r.kind, 'workflow', service);
    assert.ok(!r.steps.some(s => s.action === 'Unsupported service execution'), service);
  }
});

test('standalone builds preserve documented VPC routing denials and recovery through the shared evaluator', () => {
  const boundary = (id: string, boundaryType: string, x: number, width: number): any => ({ id, type: 'boundaryNode', position: { x, y: 3000 }, width, height: 600, data: { boundaryType, label: id, cidr: boundaryType === 'vpc' ? '10.0.0.0/16' : boundaryType === 'public_subnet' ? '10.0.1.0/24' : '10.0.2.0/24' } });
  const b = build();
  b.position = { x: 200, y: 3200 }; b.width = 100; b.height = 90;
  const nodes = [b, boundary('vpc', 'vpc', 0, 1400), boundary('pub', 'public_subnet', 20, 500), boundary('private', 'private_subnet', 700, 500), svc('igw', 'internet_gateway'), svc('nat', 'nat_gateway')];
  nodes[4].position = { x: 600, y: 3010 }; nodes[5].position = { x: 100, y: 3400 };
  const denied = run(nodes);
  assert.equal(denied.success, false);
  assert.match(denied.steps.find(s => s.status === 'failed')!.explanation, /public IP|internet gateway/);
  b.position = { x: 800, y: 3200 };
  assert.equal(run(nodes).success, true);
  nodes[5].data.health = 'failed';
  assert.equal(run(nodes).success, false);
  nodes[5].data.health = 'healthy';
  assert.equal(run(nodes).success, true);
});
