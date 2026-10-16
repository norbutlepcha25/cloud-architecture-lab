import test from 'node:test';
import assert from 'node:assert/strict';
import { runLiveSimulation, traceFromSimulation } from '../src/engine/simulation/liveSimulation.ts';
import { ecsModel } from '../src/engine/service/models/ecs.ts';
import { validateIam } from '../src/engine/validation/iam.ts';
import { REFERENCE_ARCHITECTURES } from '../src/data/referenceArchitectures.ts';
import type { Node, Edge } from '@xyflow/react';
import type { ServiceNodeData, ConnectionData, SimulationScenario } from '../src/types/index.ts';

// AWS rules: task role authorizes app APIs; execution role does not.
// https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html
// https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html
const node = (id: string, serviceId: string, extra = {}): Node<ServiceNodeData> => ({ id, type: 'serviceNode', position: { x: 0, y: 0 }, data: {
  serviceId, label: id, category: 'Compute', health: 'healthy', subnet: 'private', az: 'AZ-A', replicas: 1, multiAz: false, ...extra
} });
const edge = (source: string, target: string, protocol = 'HTTPS'): Edge<ConnectionData> => ({ id: `${source}-${target}`, source, target, data: { protocol: protocol as any, interactionType: 'synchronous', isCriticalDependency: true, timeoutMs: 1000 } });
const scenario: SimulationScenario = { id: 'ecs', name: 'ECS application request', startNodeId: 'app', method: 'GET', path: '/', trafficLevel: 'normal' };
const role: NonNullable<ServiceNodeData['iamRole']> = { id: 'task-role', trustPolicy: { id: 'trust', kind: 'trust', statements: [{ effect: 'Allow', principals: ['ecs-tasks.amazonaws.com'], actions: ['sts:AssumeRole'], resources: ['*'] }] }, identityPolicies: [{ id: 'read', kind: 'identity', statements: [{ effect: 'Allow', actions: ['s3:GetObject'], resources: ['arn:aws:s3:::orders/item'] }] }] };
function topology(iamRole?: ServiceNodeData['iamRole']) {
  return [node('app', 'ecs', { iamRole }), node('endpoint', 's3_gateway_endpoint'), node('bucket', 's3', { subnet: 'global', customConfig: { resourceArn: 'arn:aws:s3:::orders/item' } })];
}
const edges = [edge('app', 'endpoint'), edge('endpoint', 'bucket')];

test('ECS-LIVE-001: endpoint retains task identity; missing role denies request and captured explanation', () => {
  const result = runLiveSimulation(topology(), edges, scenario);
  assert.equal(result.success, false); assert.equal(result.statusCode, 403);
  const trace = traceFromSimulation(result);
  assert.equal(trace.final, 'DENIED'); assert.equal(trace.why, result.summary);
  assert.match(trace.entries.find(e => e.component === 'IAM')!.reason, /no IAM role/);
  assert.ok(!result.steps.some(s => /S3.*Completed|Object.*Retrieved/.test(s.action)));
});
test('ECS-LIVE-002: scoped task role permits S3; deterministic evidence preserved', () => {
  const nodes = topology(role);
  const result = runLiveSimulation(nodes, edges, scenario);
  assert.equal(result.success, true, result.summary);
  assert.deepEqual(runLiveSimulation(nodes, edges, scenario), result);
  assert.equal(traceFromSimulation(result).final, 'SUCCESS');
  assert.ok(result.steps.some(s => s.details?.decision?.metadata.steps));
  assert.equal(validateIam([nodes[0], nodes[2]], [edge('app', 'bucket')]).length, 0);
});
test('ECS-LIVE-003: explicit deny, wrong trust, boundary and execution-only role cannot authorize S3', () => {
  const denied = structuredClone(role); denied.identityPolicies![0].statements.push({ effect: 'Deny', actions: ['s3:*'], resources: ['*'] });
  const untrusted = structuredClone(role); untrusted.trustPolicy!.statements[0].principals = ['lambda.amazonaws.com'];
  const bounded = structuredClone(role); bounded.permissionsBoundary = { id: 'boundary', kind: 'boundary', statements: [] };
  for (const candidate of [denied, untrusted, bounded]) assert.equal(runLiveSimulation(topology(candidate), edges, scenario).success, false);
  const nodes = topology(); nodes[0].data.customConfig = { executionRole: role };
  assert.equal(runLiveSimulation(nodes, edges, scenario).success, false);
});
test('ECS-LIVE-004: SQL needs network access, not a task IAM role; failed DB remains failed', () => {
  const nodes = [node('app', 'ecs'), node('db', 'rds')]; const links = [edge('app', 'db', 'SQL')];
  assert.equal(runLiveSimulation(nodes, links, scenario).success, true);
  nodes[1].data.health = 'failed';
  const failed = runLiveSimulation(nodes, links, scenario);
  assert.equal(failed.success, false); assert.equal(traceFromSimulation(failed).final, 'FAILURE');
});
test('ECS-LIVE-005: Fargate requires awsvpc, invalid counts rejected, desired count does not imply running tasks', () => {
  const app = node('app', 'ecs', { customConfig: { ecs: { launchType: 'FARGATE', networkMode: 'bridge', desiredCount: -1 } } });
  assert.equal(ecsModel.validateConfiguration(app.data).length, 2);
  app.data.customConfig = { ecs: { launchType: 'FARGATE', networkMode: 'awsvpc', desiredCount: 2, runningCount: 0 } };
  assert.equal(runLiveSimulation([app], [], scenario).success, false);
  app.data.customConfig.ecs.runningCount = 1;
  const result = runLiveSimulation([app], [], { ...scenario, trafficLevel: '100x' });
  assert.equal(result.success, true); assert.ok(!result.steps.some(s => /Scale-Out/.test(s.action)));
});
test('ECS-LIVE-006: ALB bypasses zero-running ECS target, fails when none remain', () => {
  const nodes = [node('alb', 'alb', { subnet: 'public' }), node('a', 'ecs', { customConfig: { ecs: { runningCount: 0 } } }), node('b', 'ecs')];
  const links = [edge('alb', 'a'), edge('alb', 'b')]; const request = { ...scenario, startNodeId: 'alb' };
  const success = runLiveSimulation(nodes, links, request);
  assert.equal(success.success, true); assert.ok(success.steps.some(s => s.sourceNodeId === 'alb' && s.targetNodeId === 'b'));
  nodes[2].data.health = 'failed'; assert.equal(runLiveSimulation(nodes, links, request).success, false);
});
test('ECS-LIVE-007: configured SG denial blocks before service execution', () => {
  const nodes: Node<any>[] = [node('app', 'ecs'), node('db', 'rds', { securityGroupIds: ['sg'] }), { id: 'sg', type: 'boundaryNode', position: { x: 1000, y: 1000 }, data: { boundaryType: 'security_group', label: 'DB-SG', allowedProtocols: ['HTTPS'] } }];
  const result = runLiveSimulation(nodes, [edge('app', 'db', 'SQL')], scenario);
  assert.equal(result.success, false); assert.match(result.summary, /Security Group/);
});
test('LIVE-008: all reference runs have one verdict; explanation survives later model edits', () => {
  for (const template of REFERENCE_ARCHITECTURES) {
    const result = runLiveSimulation(template.nodes, template.edges, scenario);
    const trace = traceFromSimulation(result);
    assert.equal(trace.final === 'SUCCESS', result.success);
    assert.equal(trace.why, result.summary);
  }
  const nodes = topology(role); const result = runLiveSimulation(nodes, edges, scenario);
  const before = traceFromSimulation(result); nodes[0].data.health = 'failed';
  assert.deepEqual(traceFromSimulation(result), before);
});
