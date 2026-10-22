import { runConformanceCases, type ConformanceCase } from '../harness.ts';
import type { Node, Edge } from '@xyflow/react';
import { runLiveSimulation } from '../../../src/engine/simulation/liveSimulation.ts';

// "Assume gateways" is a simulator convenience, not AWS behavior: it stands in for an internet
// gateway / NAT gateway the student chose not to draw. The AWS rules it must not bend
// (verified 2026-10-22):
// https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html (IGW must be attached; routes required)
// https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-scenarios.html (private egress via NAT)

interface Result { outcome: string; via?: string }

const boundary = (id: string, boundaryType: string, x: number, y: number, width: number, height: number, extra: Record<string, unknown> = {}): Node<any> =>
  ({ id, type: 'boundaryNode', position: { x, y }, width, height, data: { boundaryType, label: id, ...extra } } as any);
const svc = (id: string, serviceId: string, x: number, y: number, extra: Record<string, unknown> = {}): Node<any> =>
  ({ id, type: 'serviceNode', position: { x, y }, width: 100, height: 90, data: { serviceId, label: id, health: 'healthy', ...extra } } as any);
const edge = (source: string, target: string, protocol = 'HTTPS'): Edge<any> =>
  ({ id: `${source}-${target}`, source, target, data: { protocol, interactionType: 'synchronous', isCriticalDependency: true, timeoutMs: 1000 } });

/** VPC with public + private subnet and no route table nodes (assumed tables). Gateways optional. */
function vpc(o: { igw?: Record<string, unknown> | false; nat?: Record<string, unknown> | false; privateRoutes?: unknown[] } = {}) {
  return [
    boundary('vpc', 'vpc', 0, 0, 1200, 800, { cidr: '10.0.0.0/16' }),
    boundary('public', 'public_subnet', 50, 100, 500, 300, { cidr: '10.0.1.0/24' }),
    boundary('private', 'private_subnet', 650, 100, 500, 300, { cidr: '10.0.2.0/24', ...(o.privateRoutes ? { networkIdentity: { routeTableId: 'rt-private' } } : {}) }),
    ...(o.igw ? [svc('igw', 'internet_gateway', 560, 600, o.igw)] : []),
    ...(o.nat ? [svc('nat', 'nat_gateway', 100, 250, { subnet: 'public', ...o.nat })] : []),
    ...(o.privateRoutes ? [svc('rt-private', 'route_tables', 1500, 900, { customConfig: { routeTable: { routes: o.privateRoutes } } })] : []),
    svc('alb', 'alb', 300, 200, { subnet: 'public' }),
    svc('app', 'ec2', 800, 200, { subnet: 'private' }),
    svc('user', 'user', 1400, 100, { subnet: 'global' }),
    svc('api', 'api_client', 1400, 300, { subnet: 'global' })
  ];
}
function run(nodes: Node<any>[], edges: Edge<any>[], start: string, scenario: Record<string, unknown> = {}): Result {
  const result: any = runLiveSimulation(nodes as any, edges as any, { id: 'x', name: 'x', method: 'GET', path: '/', trafficLevel: 'normal', startNodeId: start, ...scenario } as any);
  const via = result.steps.find((s: any) => /^(Route table: |Internet gateway|NAT gateway)/.test(s.action) && s.status === 'success')?.action;
  return { outcome: result.outcome, ...(via ? { via } : {}) };
}
const ingress = [edge('user', 'alb'), edge('alb', 'app', 'HTTP')];
const egress = [edge('app', 'api')];
const on = { assumeGateways: true };

const CASES: ConformanceCase<Result>[] = [
  { id: 'AGW-IGW-000', awsBehavior: 'Without an attached internet gateway the VPC has no internet path (default: gateways are not assumed).',
    reference: 'VPC internet gateways', scenario: 'User -> ALB, no IGW drawn, toggle off', configuration: {}, request: { start: 'user' },
    expected: { outcome: 'failure' }, run: () => run(vpc(), ingress, 'user'), explain: a => a.outcome },
  { id: 'AGW-IGW-001', awsBehavior: 'Simulator convenience: with Assume gateways the VPC behaves as if an IGW were attached.',
    reference: 'Simulator option (stand-in for VPC_Internet_Gateway.html attachment)', scenario: 'User -> ALB, no IGW drawn, toggle on', configuration: on, request: { start: 'user' },
    expected: { outcome: 'success', via: 'Route table: internet gateway' }, run: () => run(vpc(), ingress, 'user', on), explain: a => a.outcome },
  { id: 'AGW-IGW-002', awsBehavior: 'A drawn internet gateway that is not attached still blocks traffic; the toggle never overrides drawn gateways.',
    reference: 'VPC internet gateways: attach the gateway to the VPC', scenario: 'Detached IGW drawn, toggle on', configuration: { ...on, igw: 'detached' }, request: { start: 'user' },
    expected: { outcome: 'failure' }, run: () => run(vpc({ igw: { customConfig: { attachment: 'detached' } } }), ingress, 'user', on), explain: a => a.outcome },
  { id: 'AGW-IGW-003', awsBehavior: 'A drawn internet gateway marked failed (teaching scenario) still blocks traffic.',
    reference: 'Failure injection', scenario: 'Failed IGW drawn, toggle on', configuration: { ...on, igw: 'failed' }, request: { start: 'user' },
    expected: { outcome: 'failure' }, run: () => run(vpc({ igw: { health: 'failed' } }), ingress, 'user', on), explain: a => a.outcome },
  { id: 'AGW-NAT-000', awsBehavior: 'A private subnet without a NAT gateway has no internet egress.',
    reference: 'NAT gateway scenarios', scenario: 'Private EC2 -> external API, no NAT, toggle off', configuration: {}, request: { start: 'app' },
    expected: { outcome: 'failure' }, run: () => run(vpc(), egress, 'app'), explain: a => a.outcome },
  { id: 'AGW-NAT-001', awsBehavior: 'Simulator convenience: with Assume gateways the generated private table routes 0.0.0.0/0 to an assumed NAT gateway.',
    reference: 'Simulator option (stand-in for nat-gateway-scenarios.html)', scenario: 'Private EC2 -> external API, no NAT or IGW drawn, toggle on', configuration: on, request: { start: 'app' },
    expected: { outcome: 'success', via: 'Route table: NAT gateway (SNAT)' }, run: () => run(vpc(), egress, 'app', on), explain: a => a.outcome },
  { id: 'AGW-NAT-002', awsBehavior: 'A drawn NAT gateway that is failed still blocks egress.',
    reference: 'Failure injection', scenario: 'Failed NAT drawn, toggle on', configuration: { ...on, nat: 'failed' }, request: { start: 'app' },
    expected: { outcome: 'failure' }, run: () => run(vpc({ nat: { health: 'failed' } }), egress, 'app', on), explain: a => a.outcome },
  { id: 'AGW-ROUTE-001', awsBehavior: 'The toggle supplies gateways, not routes: an explicit private table with only the local route has no egress.',
    reference: 'VPC route tables', scenario: 'Explicit local-only private table, toggle on', configuration: { ...on, privateRoutes: 'local only' }, request: { start: 'app' },
    expected: { outcome: 'failure' }, run: () => run(vpc({ privateRoutes: [{ destinationCidr: '10.0.0.0/16', target: { type: 'local' } }] }), egress, 'app', on), explain: a => a.outcome },
  { id: 'AGW-ROUTE-002', awsBehavior: 'Strict route tables (main table, local route only) stay without internet even when gateways are assumed.',
    reference: 'VPC main route table', scenario: 'assumeRouteTables false, toggle on', configuration: { ...on, assumeRouteTables: false }, request: { start: 'app' },
    expected: { outcome: 'failure' }, run: () => run(vpc(), egress, 'app', { ...on, assumeRouteTables: false }), explain: a => a.outcome },
  { id: 'AGW-PRIVATE-001', awsBehavior: 'Assumed gateways do not make a private subnet reachable from the internet.',
    reference: 'NAT gateways do not accept inbound connections', scenario: 'User -> private EC2 directly, toggle on', configuration: on, request: { start: 'user' },
    expected: { outcome: 'denied' }, run: () => run(vpc(), [edge('user', 'app', 'HTTP')], 'user', on), explain: a => a.outcome },
  { id: 'AGW-LEGACY-001', awsBehavior: 'Resources outside any subnet use the legacy placement rules; the toggle supplies the missing IGW there too.',
    reference: 'Simulator option', scenario: 'User -> EC2 marked public, no VPC/IGW drawn, toggle on', configuration: on, request: { start: 'user' },
    expected: { outcome: 'success', via: 'Internet gateway (assumed)' },
    run: () => run([svc('user', 'user', 0, 0, { subnet: 'global' }), svc('web', 'ec2', 300, 0, { subnet: 'public' })], [edge('user', 'web', 'HTTP')], 'user', on), explain: a => a.outcome }
];

runConformanceCases(CASES);
