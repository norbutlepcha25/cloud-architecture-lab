import test from 'node:test';
import assert from 'node:assert/strict';
import { REFERENCE_ARCHITECTURES } from '../src/data/referenceArchitectures.ts';
import { runLiveSimulation } from '../src/engine/simulation/liveSimulation.ts';

const fixture = () => structuredClone(REFERENCE_ARCHITECTURES.find(ref => ref.id === 'ecs-architecture-high-performance-image-processing')!);
const call = (ref: ReturnType<typeof fixture>) => ref.edges.find(edge => edge.source === 'node-ecs' && edge.target === 'node-dynamodb-admin')!;
const run = (ref: ReturnType<typeof fixture>) => runLiveSimulation(ref.nodes, ref.edges, { id: 'child-test', name: 'Child test', startNodeId: 'node-client', method: 'GET', path: '/image.png', trafficLevel: 'normal' });

// IAM-DDB-CHILD-001: explicit deny must deny the operation; application required/optional
// error handling determines whether the parent continues. AWS source:
// https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html
for (const required of [true, false]) {
  test(`Child IAM denial remains isolated; required=${required}`, () => {
    const ref = fixture(); call(ref).data!.dependencyRequired = required;
    ref.nodes.find(node => node.id === 'node-ecs')!.data.iamRole.identityPolicies.push({ id: 'deny-ddb', kind: 'identity', statements: [{ effect: 'Deny', actions: ['dynamodb:*'], resources: ['*'] }] });
    const result = run(ref);
    assert.equal(result.success, !required, result.summary);
    assert.equal(result.steps.some(step => step.targetNodeId === 'node-s3-its'), !required);
    const denial = result.steps.find(step => step.details?.decision?.component === 'IAM' && step.details.decision.decision === 'DENY')!;
    assert.ok(denial);
    assert.ok(denial.details?.callId);
    assert.equal(denial.status, required ? 'failed' : 'bypassed');
  });
  test(`Missing child target is reported rather than silently skipped; required=${required}`, () => {
    const ref = fixture(); call(ref).data!.dependencyRequired = required;
    ref.nodes = ref.nodes.filter(node => node.id !== 'node-dynamodb-admin');
    const result = run(ref);
    assert.equal(result.success, !required, result.summary);
    assert.ok(result.steps.some(step => step.targetNodeId === 'node-dynamodb-admin' && /missing/i.test(step.explanation)));
  });
}

test('Child call and application response share correlation; no reverse packet claim is fabricated', () => {
  const result = run(fixture());
  assert.equal(result.success, true, result.summary);
  const start = result.steps.find(step => step.details?.phase === 'call')!;
  const response = result.steps.find(step => step.details?.phase === 'response')!;
  assert.ok(start && response);
  assert.equal(start.details!.callId, response.details!.callId);
  assert.equal(response.details!.parentCallId, 'child-test');
  assert.equal(response.sourceNodeId, 'node-dynamodb-admin');
  assert.equal(response.targetNodeId, 'node-ecs');
  assert.equal(response.details!.returnPathEvaluated, false);
  assert.ok(response.timestampMs >= start.timestampMs);
});

for (const required of [true, false]) {
  test(`Child SG denial follows required/optional application handling; required=${required}`, () => {
    const ref = fixture(); call(ref).data!.dependencyRequired = required;
    ref.nodes.find(node => node.id === 'node-dynamodb-admin')!.data.securityGroupIds = ['child-sg'];
    ref.nodes.push({ id: 'child-sg', type: 'boundaryNode', position: { x: -2000, y: -2000 },
      data: { label: 'Child SG', boundaryType: 'security_group', allowedProtocols: [] } } as any);
    const result = run(ref);
    assert.equal(result.success, !required, result.summary);
    assert.ok(result.steps.some(step => /Security Group Blocked/.test(step.action) && step.status === (required ? 'failed' : 'bypassed')));
  });
}

test('Invalid optional child protocol is handled by the child; required invalid protocol stops parent', () => {
  for (const required of [true, false]) {
    const ref = fixture(); call(ref).data!.dependencyRequired = required;
    call(ref).data!.protocol = 'SQL';
    const result = run(ref);
    assert.equal(result.success, !required, result.summary);
    assert.ok(result.steps.some(step => /invalid/i.test(step.explanation) && step.details?.dependencyCall));
  }
});

test('Explicit child action governs IAM rather than a default or a parallel edge', () => {
  const ref = fixture(); call(ref).data!.action = 'dynamodb:PutItem';
  // The reference task role grants GetItem, not PutItem.
  const result = run(ref);
  assert.equal(result.success, false);
  const iam = result.steps.find(step => step.details?.decision?.component === 'IAM' && step.details.callId);
  assert.equal(iam?.details?.decision?.input.action, 'dynamodb:PutItem');
});
