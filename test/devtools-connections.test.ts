import test from 'node:test';
import assert from 'node:assert/strict';
import { checkConnection, isManagementPair } from '../src/engine/architecture/connectionContracts.ts';
import { runLiveSimulation } from '../src/engine/simulation/liveSimulation.ts';
import { resolvePipelineStages, pipelinesTriggeredBy } from '../src/engine/cicd/pipeline.ts';
import { runLabReference } from '../src/engine/labs/runLabReference.ts';

const node = (id: string, serviceId = id): any => ({ id, type: 'serviceNode', position: { x: 2000, y: 0 }, data: { serviceId, label: id, health: 'healthy', subnet: 'global' } });
const edge = (source: string, target: string, data = {}): any => ({ id: `${source}-${target}`, source, target, data: { protocol: 'HTTPS', ...data } });
const scenario: any = { id: 'devtools', name: 'devtools', startNodeId: 'pipe', method: 'GET', path: '/', trafficLevel: 'normal' };
const graph = () => ({ nodes: [node('repo', 'codecommit'), node('pipe', 'codepipeline'), node('build', 'codebuild')], edges: [edge('repo', 'pipe'), edge('pipe', 'build')] });

test('developer tool links have management contracts usable by the canvas', () => {
  for (const [a, b] of [['codecommit', 'codepipeline'], ['s3', 'codebuild'], ['codepipeline', 'codebuild'], ['codepipeline', 'codedeploy'], ['codepipeline', 's3'], ['codebuild', 'codedeploy'], ['codebuild', 'ecr_registry'], ['codedeploy', 'ec2'], ['iam', 'codepipeline']]) {
    assert.equal(isManagementPair(node(a), node(b)), true, `${a} -> ${b}`);
    assert.equal(checkConnection(node(a), node(b), { relationship: 'manages', protocol: 'Event' }).status, 'valid');
    assert.equal(checkConnection(node(a), node(b), { protocol: 'SQL' }).status, 'invalid');
  }
});

test('annotations, response drawings and authorization links never trigger or add pipeline actions', () => {
  for (const data of [{ referenceAnnotation: 'lab', relationship: 'manages' }, { signalType: 'outbound_response' }, { relationship: 'authorization' }, { relationship: 'dependency' }, { protocol: 'SQL' }]) {
    const g = graph();
    const excluded = edge('repo', 'pipe', data);
    assert.deepEqual(pipelinesTriggeredBy(g.nodes[0], g.nodes, [excluded]), [], JSON.stringify(data));
    const stages = resolvePipelineStages(g.nodes[1], g.nodes, [g.edges[0], edge('pipe', 'build', data)]);
    assert.equal(stages.some(s => s.name === 'Build'), false, JSON.stringify(data));
  }
});

test('legacy and explicit management links execute identically through live and lab dispatchers', () => {
  const g = graph();
  const before = structuredClone(g);
  const expected = runLiveSimulation(g.nodes, g.edges, scenario);
  assert.equal(expected.success, true);
  const edges = g.edges.map(e => ({ ...e, data: { ...e.data, relationship: 'manages', protocol: 'Event' } }));
  assert.deepEqual(runLiveSimulation(g.nodes, edges, scenario), expected);
  assert.deepEqual(runLabReference({ ...g, edges, scenario } as any), expected);
  assert.deepEqual(runLiveSimulation([...g.nodes].reverse(), [...edges].reverse(), scenario), expected);
  assert.deepEqual(g, before);
});

test('deployment artifact follows its connected build rather than the first build on the canvas', () => {
  const g = graph();
  const build2 = node('build2', 'codebuild'), deploy = node('deploy', 'codedeploy');
  const nodes = [...g.nodes, build2, deploy];
  const edges = [...g.edges, edge('pipe', 'build2'), edge('build2', 'deploy')];
  const stages = resolvePipelineStages(g.nodes[1], nodes, edges);
  const producer = stages.find(s => s.name === 'Build')!.actions.find(a => a.nodeId === 'build2')!;
  assert.deepEqual(stages.find(s => s.name === 'Deploy')!.actions[0].inputArtifacts, producer.outputArtifacts);
});

test('legacy CI/CD drawings attached to an application do not forward application traffic', () => {
  const nodes = [node('user'), node('s3'), node('codepipeline')];
  const result = runLiveSimulation(nodes, [edge('user', 's3'), edge('s3', 'codepipeline')], { ...scenario, startNodeId: 'user' });
  assert.equal(result.success, true, result.summary);
  assert.ok(!result.steps.some(s => s.targetNodeId === 'codepipeline'));
});

test('ECS uses the image definitions of the consumed artifact, ignoring unrelated build definitions', () => {
  const g = graph();
  const second = node('build2', 'codebuild'), service = node('service', 'ecs');
  g.nodes[2].data.customConfig = { imageDefinitions: [{ name: 'wrong' }] };
  second.data.customConfig = { imageDefinitions: [{ name: 'app' }] };
  service.data.customConfig = { containerName: 'app' };
  g.nodes[1].data.customConfig = { pipeline: { stages: [
    { name: 'Source', actions: [{ name: 'Source', category: 'Source', provider: 'CodeCommit', nodeId: 'repo', inputArtifacts: [], outputArtifacts: ['Src'] }] },
    { name: 'Build', actions: ['build', 'build2'].map(id => ({ name: id, category: 'Build', provider: 'CodeBuild', nodeId: id, inputArtifacts: ['Src'], outputArtifacts: [id] })) },
    { name: 'Deploy', actions: [{ name: 'Deploy', category: 'Deploy', provider: 'ECS', nodeId: 'service', inputArtifacts: ['build2'], outputArtifacts: [] }] }
  ] } };
  const nodes = [...g.nodes, second, service];
  const success = runLiveSimulation(nodes, g.edges, scenario);
  assert.equal(success.success, true, success.summary);
  second.data.customConfig.imageDefinitions = [{ name: 'wrong' }];
  const failed = runLiveSimulation(nodes, g.edges, scenario);
  assert.equal(failed.success, false);
  assert.match(failed.steps.find(s => s.status === 'failed')!.explanation, /container is app/);
  second.data.customConfig.imageDefinitions = [{ name: 'app' }];
  assert.equal(runLiveSimulation(nodes, g.edges, scenario).success, true);
});
