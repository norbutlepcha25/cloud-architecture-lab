import test from 'node:test';
import assert from 'node:assert/strict';
import type { Node } from '@xyflow/react';
import { routingConfigurationIssues, igwAttachedVpc } from '../src/engine/network/subnetRouting.ts';
import { REFERENCE_ARCHITECTURES } from '../src/data/referenceArchitectures.ts';
import { COURSE_LABS } from '../src/data/courseLabs.ts';

// AWS: one internet gateway per VPC; a route table and its targets belong to one VPC.
// https://docs.aws.amazon.com/vpc/latest/userguide/amazon-vpc-limits.html
// https://docs.aws.amazon.com/vpc/latest/userguide/working-with-igw.html
const box = (id: string, boundaryType: string, x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}): Node<any> =>
  ({ id, type: 'boundaryNode', position: { x, y }, width: w, height: h, data: { boundaryType, label: id, ...extra } } as any);
const svc = (id: string, serviceId: string, x: number, y: number, extra: Record<string, unknown> = {}): Node<any> =>
  ({ id, type: 'serviceNode', position: { x, y }, width: 100, height: 90, data: { serviceId, label: id, ...extra } } as any);
const table = (id: string, routes: unknown[]) => svc(id, 'route_tables', 300, 600, { customConfig: { routeTable: { routes } } });

test('ROUTE-VAL-001: two internet gateways attached to one VPC are reported', () => {
  const nodes = [box('vpc', 'vpc', 0, 0, 800, 800), svc('igw-a', 'internet_gateway', 100, 100), svc('igw-b', 'internet_gateway', 300, 100)];
  assert.deepEqual(routingConfigurationIssues(nodes).map(i => i.field), ['igw-per-vpc']);
  nodes[2].data.customConfig = { attachment: 'detached' };
  assert.deepEqual(routingConfigurationIssues(nodes), []);
});

test('ROUTE-VAL-002: a route to an internet gateway of another VPC, or a missing target, is reported', () => {
  const nodes = [
    box('vpc-a', 'vpc', 0, 0, 800, 800), box('subnet-a', 'public_subnet', 50, 50, 300, 300, { networkIdentity: { routeTableId: 'rt' } }),
    box('vpc-b', 'vpc', 1000, 0, 800, 800), svc('igw-b', 'internet_gateway', 1100, 100),
    table('rt', [{ destinationCidr: '0.0.0.0/0', target: { type: 'igw', targetId: 'igw-b' } }, { destinationCidr: '10.9.0.0/16', target: { type: 'nat', targetId: 'missing' } }])
  ];
  assert.deepEqual(routingConfigurationIssues(nodes).map(i => i.field).sort(), ['route-target', 'route-target-vpc']);
});

test('ROUTE-VAL-003: one route table cannot serve subnets in two VPCs; duplicate destinations are reported', () => {
  const nodes = [
    box('vpc-a', 'vpc', 0, 0, 800, 800), box('subnet-a', 'private_subnet', 50, 50, 300, 300, { networkIdentity: { routeTableId: 'rt' } }),
    box('vpc-b', 'vpc', 1000, 0, 800, 800), box('subnet-b', 'private_subnet', 1050, 50, 300, 300, { networkIdentity: { routeTableId: 'rt' } }),
    table('rt', [{ destinationCidr: '10.0.0.0/16', target: { type: 'local' } }, { destinationCidr: '10.0.0.0/16', target: { type: 'local' } }])
  ];
  assert.deepEqual(routingConfigurationIssues(nodes).map(i => i.field).sort(), ['route-duplicate', 'route-table-vpc']);
});

test('ROUTE-VAL-004: an internet gateway drawn on the VPC border is attached to that VPC', () => {
  const vpc = box('vpc', 'vpc', 100, 100, 600, 400);
  assert.equal(igwAttachedVpc(svc('igw', 'internet_gateway', 50, 250), [vpc])?.id, 'vpc');
  const other = box('vpc-2', 'vpc', 2000, 2000, 300, 300);
  assert.equal(igwAttachedVpc(svc('igw', 'internet_gateway', 1200, 1200), [vpc, other]), null, 'ambiguous placement is not attached');
});

test('ROUTE-VAL-005: shipped references and labs have no AWS routing configuration errors', () => {
  const diagrams = [...REFERENCE_ARCHITECTURES.map(r => ({ name: r.name, nodes: r.nodes })),
    ...COURSE_LABS.flatMap(l => l.references.map(r => ({ name: `Lab ${l.number}: ${r.title}`, nodes: r.nodes })))];
  const issues = diagrams.flatMap(d => routingConfigurationIssues(d.nodes as any).map(i => `${d.name}: ${i.problem}`));
  assert.deepEqual(issues, []);
});
