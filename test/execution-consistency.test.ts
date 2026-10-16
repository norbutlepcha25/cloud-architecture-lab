import test from 'node:test';
import assert from 'node:assert/strict';
import { COURSE_LABS } from '../src/data/courseLabs.ts';
import { REFERENCE_ARCHITECTURES } from '../src/data/referenceArchitectures.ts';
import { runLabReference } from '../src/engine/labs/runLabReference.ts';
import { runLiveSimulation, traceFromSimulation } from '../src/engine/simulation/liveSimulation.ts';
import { resultEvidence, resultLabel } from '../src/engine/simulation/resultEvidence.ts';
import { parseReference } from '../src/engine/persistence/references.ts';
import { renderTrace } from '../src/engine/trace/render.ts';

const scenario = { id: 'consistent', name: 'Consistent', method: 'GET', path: '/', startNodeId: 'app', trafficLevel: 'normal' } as const;
const node = (id: string, serviceId: string) => ({ id, type: 'serviceNode', position: { x: 0, y: 0 }, data: {
  serviceId, label: id, health: 'healthy', subnet: serviceId === 'ecs' ? 'private' : 'global'
} }) as any;

for (const lab of COURSE_LABS) for (const ref of lab.references.filter(ref => !ref.configurationChecks && !ref.authorization)) {
  test(`${ref.id}: lab dispatcher and direct design execute identical decisions`, () => {
    const before = structuredClone(ref);
    const direct = runLiveSimulation(ref.nodes, ref.edges, ref.scenario);
    const fromLab = runLabReference(ref);
    assert.deepEqual({ ...fromLab, summary: direct.summary }, direct);
    assert.equal(fromLab.kind, 'request');
    assert.deepEqual(ref, before);
    // Metadata cannot select alternate service behavior.
    const renamed = { ...ref, id: 'unrelated-reference', title: 'Different teaching title' };
    assert.deepEqual(runLabReference(renamed), fromLab);
    const reordered = runLiveSimulation([...ref.nodes].reverse(), [...ref.edges].reverse(), ref.scenario);
    assert.deepEqual(reordered, direct);
  });
}

for (const ref of REFERENCE_ARCHITECTURES.filter(ref => ref.scenario)) {
  test(`${ref.id}: persisted reference and equivalent new design preserve execution`, () => {
    const loaded = parseReference(JSON.stringify(ref));
    assert.deepEqual(runLiveSimulation(loaded.nodes, loaded.edges, loaded.scenario!), runLiveSimulation(ref.nodes, ref.edges, ref.scenario!));
  });
}

test('Checks carry their evidence kind independently of active UI context', () => {
  for (const number of [1, 10]) {
    const ref = structuredClone(COURSE_LABS.find(lab => lab.number === number)!.references[0]);
    const result = runLabReference(ref);
    const copy = JSON.parse(JSON.stringify(result));
    assert.equal(result.kind, number === 1 ? 'authorization-check' : 'configuration-check');
    assert.equal(traceFromSimulation(copy).kind, result.kind);
    assert.match(resultLabel(copy), number === 1 ? /^Policy / : /^Configuration /);
    assert.ok(!resultLabel(copy).includes('HTTP'));
  }
});

test('Missing explicit start resource is a configuration failure, never an alternate request', () => {
  const result = runLiveSimulation([node('some-other-app', 'ecs')], [], scenario);
  assert.equal(result.statusCode, 400);
  assert.equal(result.outcome, 'failure');
  assert.deepEqual(result.path, []);
  assert.equal(traceFromSimulation(result).final, 'FAILURE');
});

test('Healthy catalog-only resource does not prove request success; unsupported evidence survives rendering', () => {
  const result = runLiveSimulation([node('app', 'backup')], [], scenario);
  assert.equal(result.success, false);
  assert.equal(result.statusCode, 501);
  assert.equal(result.outcome, 'unsupported');
  assert.equal(resultLabel(result), 'Behavior not modeled');
  const trace = traceFromSimulation(result);
  assert.equal(trace.final, 'UNSUPPORTED');
  assert.match(renderTrace(trace), /WHY:/);
});

test('Service unavailability is FAILURE, policy denial is DENIED; legacy evidence remains readable', () => {
  const app = node('app', 'ecs'); app.data.health = 'failed';
  const failure = runLiveSimulation([app], [], scenario);
  assert.equal(traceFromSimulation(failure).final, 'FAILURE');
  const policy = runLabReference(COURSE_LABS[0].references.find(ref => ref.id === 'lab1-deny')!);
  assert.equal(traceFromSimulation(policy).final, 'DENIED');
  const legacy = structuredClone(failure); delete legacy.kind; delete legacy.outcome;
  assert.deepEqual(resultEvidence(legacy), { kind: 'request', outcome: 'failure' });
});

test('Live branch selection is stable under array reorder; explicit workload priority still wins', () => {
  const nodes = [node('app', 'ecs'), node('b', 'rds'), node('a', 'rds')];
  const edges: any[] = ['b', 'a'].map(target => ({ id: target, source: 'app', target, data: { protocol: 'SQL' } }));
  const normal = runLiveSimulation(nodes, edges, scenario);
  assert.deepEqual(runLiveSimulation([...nodes].reverse(), [...edges].reverse(), scenario), normal);
  assert.ok(normal.steps.some(step => step.targetNodeId === 'a'));
  edges[0].data.stepNumber = 1;
  const numbered = runLiveSimulation(nodes, edges, scenario);
  assert.ok(numbered.steps.some(step => step.targetNodeId === 'b'));
  assert.ok(!numbered.steps.some(step => step.targetNodeId === 'a'));
});

test('Recorded nested configuration evidence survives later architecture edits', () => {
  const ref = structuredClone(REFERENCE_ARCHITECTURES.find(ref => ref.id === 'eks-architecture')!);
  const result = runLiveSimulation(ref.nodes, ref.edges, ref.scenario!);
  const recorded = structuredClone(result);
  ref.nodes.find(node => node.id === 'eks-workload')!.data.customConfig.eks.readyPods = 0;
  assert.deepEqual(result, recorded);
  assert.equal(runLiveSimulation(ref.nodes, ref.edges, ref.scenario!).success, false);
});

test('Default request entry point is shared and deterministic, including missing explicit-resource handling', async () => {
  const { resolveRequestStart } = await import('../src/engine/simulation/requestStart.ts');
  const nodes = [node('z-client', 'user'), node('a-client', 'user'), node('app', 'ecs')];
  assert.equal(resolveRequestStart(nodes)?.id, 'a-client');
  assert.equal(resolveRequestStart([...nodes].reverse())?.id, 'a-client');
  assert.equal(resolveRequestStart(nodes, 'missing'), undefined);
  assert.equal(resolveRequestStart(nodes, 'app')?.id, 'app');
  const result = runLiveSimulation(nodes, [], { ...scenario, startNodeId: '' });
  assert.equal(result.path[0], 'a-client');
});
