import test from 'node:test';
import assert from 'node:assert/strict';
import { REFERENCE_ARCHITECTURES } from '../src/data/referenceArchitectures.ts';
import { runLiveSimulation } from '../src/engine/simulation/liveSimulation.ts';
import { detectStrayComponents } from '../src/engine/analysis/strayComponents.ts';

test('X-Ray reference executes the authored API interaction, with honest IAM denial and no stray components', () => {
  const ref = structuredClone(REFERENCE_ARCHITECTURES.find(r => r.id === 'xray-segment-ingestion')!);
  assert.ok(ref);
  assert.deepEqual(detectStrayComponents(ref.nodes, ref.edges), []);
  const result = runLiveSimulation(ref.nodes, ref.edges, ref.scenario!);
  assert.equal(result.success, true, result.summary);
  assert.equal(result.serviceStates?.traces.records.length, 1);
  assert.equal(runLiveSimulation(ref.nodes, ref.edges, { ...ref.scenario!, startNodeId: 'traces' }).success, true);
  ref.nodes.find(n => n.id === 'orders')!.data.iamRole = undefined;
  const denied = runLiveSimulation(ref.nodes, ref.edges, ref.scenario!);
  assert.equal(denied.statusCode, 403);
  assert.match(denied.steps.find(s => s.status === 'failed')!.explanation, /no IAM role/);
});
