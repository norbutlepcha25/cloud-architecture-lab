import test from 'node:test';
import assert from 'node:assert/strict';
import { REFERENCE_ARCHITECTURES } from '../src/data/referenceArchitectures.ts';
import { runLiveSimulation } from '../src/engine/simulation/liveSimulation.ts';
import { checkConnection } from '../src/engine/architecture/connectionContracts.ts';
import { detectStrayComponents } from '../src/engine/analysis/strayComponents.ts';

const load = () => structuredClone(REFERENCE_ARCHITECTURES.find(r => r.id === 'secure-cicd-ecs-bluegreen')!);
const node = (ref: ReturnType<typeof load>, id: string) => ref.nodes.find(n => n.id === id)! as any;
const run = (ref: ReturnType<typeof load>, startNodeId?: string) => runLiveSimulation(ref.nodes, ref.edges, { ...ref.scenario!, ...(startNodeId ? { startNodeId } : {}) });
const pipelineActions = (r: ReturnType<typeof run>) => r.steps.slice(r.steps.findIndex(s => s.action === 'Start execution')).map(s => `${s.targetNodeId}:${s.action}:${s.status}`);

test('Secure CI/CD reference: every drawn relationship passes the shared contract and nothing is stray', () => {
  const ref = load();
  assert.ok(ref);
  for (const edge of ref.edges) {
    const result = checkConnection(ref.nodes.find(n => n.id === edge.source), ref.nodes.find(n => n.id === edge.target), edge.data);
    assert.equal(result.status, 'valid', `${edge.id}: ${result.reason}`);
  }
  assert.deepEqual(detectStrayComponents(ref.nodes, ref.edges), []);
});

test('Secure CI/CD reference: developer push runs Source -> Build (dependencies, signing) -> ECS blue/green with alarm monitoring', () => {
  const result = run(load());
  assert.equal(result.kind, 'workflow');
  assert.equal(result.success, true, result.summary);
  const actions = result.steps.map(s => s.action);
  for (const expected of ['Authorize codecommit:GitPush', 'Build dependency: Secrets Manager', 'Build dependency: AWS Signer (Notation profile)', 'Deploy: CodeDeployDefault.ECSCanary10Percent5Minutes', 'Deploy: alarm monitoring']) {
    assert.ok(actions.includes(expected), expected);
  }
  assert.match(result.steps.find(s => s.action.startsWith('Deploy: CodeDeployDefault'))!.explanation, /orders-alb/);
});

test('Secure CI/CD reference: Run pipeline and git push make the same pipeline decisions; reordering does not change them', () => {
  const ref = load();
  const push = run(ref), direct = run(ref, 'node-pipeline');
  assert.deepEqual(pipelineActions(direct), pipelineActions(push));
  const reordered = load();
  reordered.nodes.reverse(); reordered.edges.reverse();
  assert.deepEqual(pipelineActions(run(reordered)), pipelineActions(push));
});

test('Secure CI/CD reference: learning-outcome failures stop at the documented stage', () => {
  let ref = load();
  node(ref, 'node-dev').data.customConfig.iamPolicy = 'read-only';
  assert.equal(run(ref).statusCode, 403);

  ref = load();
  const statement = node(ref, 'node-build').data.iamRole.identityPolicies[0].statements[0];
  statement.actions = statement.actions.filter((a: string) => a !== 'secretsmanager:GetSecretValue');
  const denied = run(ref);
  assert.equal(denied.statusCode, 403);
  assert.match(denied.steps.find(s => s.status === 'failed')!.explanation, /secretsmanager:GetSecretValue/);

  ref = load();
  node(ref, 'node-codeartifact').data.health = 'failed';
  const unavailable = run(ref);
  assert.equal(unavailable.success, false);
  assert.match(unavailable.summary, /Stage Build failed/);
});

test('Secure CI/CD reference: an attached alarm in ALARM stops the deployment; rollback follows the deployment group setting', () => {
  const ref = load();
  node(ref, 'node-alarm').data.customConfig.deploymentAlarmState = 'ALARM';
  const stopped = run(ref);
  assert.equal(stopped.success, false);
  assert.equal(stopped.steps.find(s => s.action === 'Deploy: alarm monitoring')!.status, 'failed');
  assert.equal(stopped.steps.find(s => s.action === 'Deploy: automatic rollback')!.status, 'success');

  node(ref, 'node-deploy').data.customConfig.autoRollback = false;
  assert.equal(run(ref).steps.find(s => s.action === 'Deploy: automatic rollback')!.status, 'bypassed');
});

test('Secure CI/CD reference: customer traffic uses the ALB -> ECS path; CI/CD and integration links carry no requests', () => {
  const result = run(load(), 'node-user');
  assert.equal(result.kind ?? 'request', 'request');
  assert.equal(result.success, true, result.summary);
  assert.ok(!result.path.some(id => ['node-appconfig', 'node-alarm', 'node-cloudtrail'].includes(id)), result.path.join(','));
});
