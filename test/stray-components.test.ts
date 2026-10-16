import test from 'node:test';
import assert from 'node:assert/strict';
import type { Node, Edge } from '@xyflow/react';
import { detectStrayComponents } from '../src/engine/analysis/strayComponents.ts';
import { REFERENCE_ARCHITECTURES } from '../src/data/referenceArchitectures.ts';
import { COURSE_LABS } from '../src/data/courseLabs.ts';

const service = (id: string, serviceId: string, x: number, y: number, data: Record<string, unknown> = {}): Node<any> =>
  ({ id, type: 'serviceNode', position: { x, y }, data: { serviceId, label: id, ...data } });
const boundary = (id: string, boundaryType: string, x: number, y: number, width: number, height: number): Node<any> =>
  ({ id, type: 'boundaryNode', position: { x, y }, style: { width, height }, width, height, data: { boundaryType, label: id } } as any);
const edge = (source: string, target: string): Edge<any> => ({ id: `${source}-${target}`, source, target, data: {} });

const vpc = boundary('vpc', 'vpc', 0, 0, 1000, 800);
const subnet = boundary('subnet', 'private_subnet', 50, 50, 600, 400);

test('STRAY-001: a service with no connection or reference is reported unconnected', () => {
  const nodes = [vpc, subnet, service('fn', 'lambda', 1200, 100), service('a', 'lambda', 1200, 300), service('b', 's3', 1400, 300)];
  const stray = detectStrayComponents(nodes, [edge('a', 'b')]);
  assert.deepEqual(stray.map(s => [s.nodeId, s.reasons]), [['fn', ['unconnected']]]);
});

test('STRAY-002: a subnet-only service dropped outside every subnet is reported as misplaced', () => {
  const nodes = [vpc, subnet, service('web', 'ec2', 1200, 100), service('db', 'rds', 200, 150)];
  const stray = detectStrayComponents(nodes, [edge('web', 'db')]);
  assert.deepEqual(stray.map(s => [s.nodeId, s.reasons]), [['web', ['outside-subnet']]]);
});

test('STRAY-003: explicit id references, VPC attachment, configuration services and reference-only markers are not stray', () => {
  const nodes = [vpc, subnet,
    service('asg', 'auto_scaling', 200, 150), service('i1', 'ec2', 300, 150, { customConfig: { asgInstance: { asgId: 'asg' } } }),
    service('igw', 'internet_gateway', 800, 600), service('role', 'iam', 1500, 100),
    service('note', 'eks', 1500, 400, { customConfig: { referenceOnly: true } })];
  assert.deepEqual(detectStrayComponents(nodes, []), []);
});

test('STRAY-004: boundary attachment alone does not count as a connection', () => {
  const sg = boundary('sg', 'security_group', 100, 100, 200, 200);
  const nodes = [vpc, subnet, sg, service('fn', 'lambda', 1200, 100, { securityGroupIds: ['sg'] })];
  assert.deepEqual(detectStrayComponents(nodes, []).map(s => s.nodeId), ['fn']);
});

test('STRAY-005: shipped reference architectures and course labs contain no stray components', () => {
  const diagrams = [
    ...REFERENCE_ARCHITECTURES.map(ref => ({ name: ref.name, nodes: ref.nodes, edges: ref.edges })),
    ...COURSE_LABS.flatMap(lab => lab.references.map(ref => ({ name: `Lab ${lab.number}: ${ref.title}`, nodes: ref.nodes, edges: ref.edges })))
  ];
  const flagged = diagrams.flatMap(d => detectStrayComponents(d.nodes as any, d.edges as any).map(s => `${d.name} -> ${s.label} (${s.reasons.join(', ')})`));
  assert.deepEqual(flagged, []);
});
