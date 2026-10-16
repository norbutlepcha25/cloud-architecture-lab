import test from 'node:test';
import assert from 'node:assert/strict';
import type { Node, Edge } from '@xyflow/react';
import { buildRole, calledServices, grantedActions } from '../src/engine/iam/roleBuilder.ts';
import { authorizeApplicationHop } from '../src/engine/iam/applicationHop.ts';

// AWS: a role grants only the actions/resources its identity policy allows (implicit deny
// otherwise), and is assumable only by the principal its trust policy names.
// https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html
const svc = (id: string, serviceId: string, extra: Record<string, unknown> = {}): Node<any> =>
  ({ id, type: 'serviceNode', position: { x: 0, y: 0 }, data: { serviceId, label: id, health: 'healthy', ...extra } });
const edge = (source: string, target: string, data: Record<string, unknown> = {}): Edge<any> =>
  ({ id: `${source}-${target}`, source, target, data: { protocol: 'HTTPS', ...data } });

test('IAM-ROLE-001: permissions come from what the component calls, through endpoints, honoring edge actions', () => {
  const nodes = [svc('app', 'ec2'), svc('ep', 's3_gateway_endpoint'), svc('bucket', 's3'), svc('table', 'dynamodb'), svc('db', 'rds')];
  const edges = [edge('app', 'ep'), edge('ep', 'bucket'), edge('app', 'table', { action: 'dynamodb:PutItem' }), edge('app', 'db', { protocol: 'SQL' })];
  const called = calledServices(nodes[0] as any, nodes as any, edges);
  assert.deepEqual(called.map(c => [c.target.id, c.used]).sort(), [['bucket', ['s3:GetObject']], ['table', ['dynamodb:PutItem']]]);
});

test('IAM-ROLE-002: a built role allows exactly the granted actions on exactly those resources', () => {
  const app = svc('app', 'ec2'), bucket = svc('bucket', 's3'), table = svc('table', 'dynamodb'), other = svc('other', 's3');
  app.data.iamRole = buildRole('ec2', 'AppRole', [{ target: bucket, actions: ['s3:GetObject'] }, { target: table, actions: ['dynamodb:PutItem'] }]);
  const decide = (target: Node<any>, action: string) => authorizeApplicationHop(app as any, target as any, 'HTTPS', action).decision;
  assert.equal(decide(bucket, 's3:GetObject'), 'ALLOW');
  assert.equal(decide(table, 'dynamodb:PutItem'), 'ALLOW');
  assert.equal(decide(bucket, 's3:PutObject'), 'DENY');
  assert.equal(decide(table, 'dynamodb:GetItem'), 'DENY');
  assert.equal(decide(other, 's3:GetObject'), 'DENY');
  assert.deepEqual(grantedActions(app.data.iamRole, bucket), ['s3:GetObject']);
});

test('IAM-ROLE-003: each caller type gets its own service principal; a role built for one cannot be used by another', () => {
  const queue = svc('queue', 'sqs'), key = svc('key', 'kms');
  const fn = svc('fn', 'lambda', { iamRole: buildRole('lambda', 'FnRole', [{ target: queue, actions: ['sqs:SendMessage'] }, { target: key, actions: ['kms:Decrypt'] }]) });
  assert.equal(authorizeApplicationHop(fn as any, queue as any, 'HTTPS').decision, 'ALLOW');
  assert.equal(authorizeApplicationHop(fn as any, key as any, 'HTTPS').decision, 'ALLOW');
  const task = svc('task', 'ecs', { iamRole: fn.data.iamRole });
  assert.equal(authorizeApplicationHop(task as any, queue as any, 'HTTPS').decision, 'DENY', 'a Lambda execution role is not trusted by ecs-tasks.amazonaws.com');
  task.data.iamRole = buildRole('ecs', 'TaskRole', [{ target: queue, actions: ['sqs:SendMessage'] }]);
  assert.equal(authorizeApplicationHop(task as any, queue as any, 'HTTPS').decision, 'ALLOW');
});
