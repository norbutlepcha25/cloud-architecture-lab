import { runConformanceCases, type ConformanceCase } from '../harness.ts';
import type { Node, Edge } from '@xyflow/react';
import { runLiveSimulation } from '../../../src/engine/simulation/liveSimulation.ts';
import { createServiceS3Role } from '../../../src/engine/iam/ec2Role.ts';

// Route tables decide internet ingress, internet egress and gateway endpoint use once a subnet is
// explicitly associated with one. Sources (verified 2026-10-17):
// https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html
// https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-scenarios.html
// https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html

interface Result { outcome: string; via?: string }

const boundary = (id: string, boundaryType: string, x: number, y: number, width: number, height: number, extra: Record<string, unknown> = {}): Node<any> =>
  ({ id, type: 'boundaryNode', position: { x, y }, width, height, data: { boundaryType, label: id, ...extra } } as any);
const svc = (id: string, serviceId: string, x: number, y: number, extra: Record<string, unknown> = {}): Node<any> =>
  ({ id, type: 'serviceNode', position: { x, y }, width: 100, height: 90, data: { serviceId, label: id, health: 'healthy', ...extra } } as any);
const table = (id: string, routes: unknown[]): Node<any> => svc(id, 'route_tables', 1500, 900, { customConfig: { routeTable: { routes } } });
const edge = (source: string, target: string, protocol = 'HTTPS'): Edge<any> =>
  ({ id: `${source}-${target}`, source, target, data: { protocol, interactionType: 'synchronous', isCriticalDependency: true, timeoutMs: 1000 } });

/** VPC with a public and a private subnet, IGW, NAT in the public subnet, route tables. */
function vpc(options: { publicRoutes?: unknown[]; privateRoutes?: unknown[]; associate?: boolean; igwInVpc?: boolean; igwDetached?: boolean; natHealth?: string; endpointTables?: string[] } = {}) {
  const associate = options.associate ?? true;
  const nodes: Node<any>[] = [
    boundary('vpc', 'vpc', 0, 0, 1200, 800, { cidr: '10.0.0.0/16' }),
    boundary('public', 'public_subnet', 50, 100, 500, 300, { cidr: '10.0.1.0/24', ...(associate ? { networkIdentity: { routeTableId: 'rt-public' } } : {}) }),
    boundary('private', 'private_subnet', 650, 100, 500, 300, { cidr: '10.0.2.0/24', ...(associate ? { networkIdentity: { routeTableId: 'rt-private' } } : {}) }),
    ...(options.igwInVpc === false ? [boundary('vpc-2', 'vpc', 1300, 1000, 400, 300, { cidr: '10.1.0.0/16' })] : []),
    svc('igw', 'internet_gateway', options.igwInVpc === false ? 1400 : 560, options.igwInVpc === false ? 1100 : 600, options.igwDetached ? { customConfig: { attachment: 'detached' } } : {}),
    svc('nat', 'nat_gateway', 100, 250, { subnet: 'public', health: options.natHealth ?? 'healthy' }),
    svc('alb', 'alb', 300, 200, { subnet: 'public' }),
    svc('app', 'ec2', 800, 200, { subnet: 'private', iamRole: createServiceS3Role('ec2', 'AppReader', 'arn:aws:s3:::bucket', false) }),
    svc('user', 'user', 1400, 100, { subnet: 'global' }),
    svc('api', 'api_client', 1400, 300, { subnet: 'global' }),
    svc('bucket', 's3', 1400, 500, { subnet: 'global' }),
    svc('endpoint', 's3_gateway_endpoint', 700, 600, { customConfig: { endpointService: 's3', routeTableIds: options.endpointTables ?? [] } }),
    table('rt-public', options.publicRoutes ?? [{ destinationCidr: '10.0.0.0/16', target: { type: 'local' } }, { destinationCidr: '0.0.0.0/0', target: { type: 'igw', targetId: 'igw' } }]),
    table('rt-private', options.privateRoutes ?? [{ destinationCidr: '10.0.0.0/16', target: { type: 'local' } }, { destinationCidr: '0.0.0.0/0', target: { type: 'nat', targetId: 'nat' } }])
  ];
  return nodes;
}

function run(nodes: Node<any>[], edges: Edge<any>[], start: string, assumeRouteTables?: boolean): Result {
  const result: any = runLiveSimulation(nodes as any, edges as any, { id: 'x', name: 'x', method: 'GET', path: '/', trafficLevel: 'normal', startNodeId: start, assumeRouteTables });
  const via = result.steps.find((s: any) => /^Route table: /.test(s.action) && s.status === 'success')?.action;
  return { outcome: result.outcome, ...(via ? { via } : {}) };
}

const ingress = [edge('user', 'alb'), edge('alb', 'app', 'HTTP')];
const egress = [edge('app', 'api')];
const toBucket = [edge('app', 'bucket')];

const CASES: ConformanceCase<Result>[] = [
  {
    id: 'RT-IGW-INGRESS-001', awsBehavior: 'A subnet whose route table sends 0.0.0.0/0 to an attached internet gateway is public; internet clients reach its internet-facing resources.',
    reference: 'VPC User Guide - Enable internet access using an internet gateway', scenario: 'User -> ALB (public subnet, 0.0.0.0/0 -> igw) -> EC2',
    configuration: { 'rt-public': ['10.0.0.0/16 local', '0.0.0.0/0 igw'] }, request: { start: 'user' },
    expected: { outcome: 'success', via: 'Route table: internet gateway' },
    run: () => run(vpc(), ingress, 'user'), explain: a => `Outcome ${a.outcome}.`
  },
  {
    id: 'RT-IGW-INGRESS-002', awsBehavior: 'Without a route to an internet gateway the subnet is private, even if it is labeled public; the internet cannot reach it.',
    reference: 'VPC User Guide - Internet gateway basics: routing configuration', scenario: 'Public-labeled subnet route table has only the local route',
    configuration: { 'rt-public': ['10.0.0.0/16 local'] }, request: { start: 'user' },
    expected: { outcome: 'denied' },
    run: () => run(vpc({ publicRoutes: [{ destinationCidr: '10.0.0.0/16', target: { type: 'local' } }] }), ingress, 'user'), explain: a => `Outcome ${a.outcome}.`
  },
  {
    id: 'RT-IGW-INGRESS-003', awsBehavior: 'An internet gateway must be attached to the VPC; a route to a gateway that belongs elsewhere does not provide access.',
    reference: 'VPC User Guide - "To use an internet gateway, you must attach it to a VPC and configure routing."', scenario: 'Route points at an IGW attached to a different VPC',
    configuration: { igw: 'outside VPC' }, request: { start: 'user' },
    expected: { outcome: 'failure' },
    run: () => run(vpc({ igwInVpc: false }), ingress, 'user'), explain: a => `Outcome ${a.outcome}.`
  },
  {
    id: 'RT-IGW-INGRESS-004', awsBehavior: 'A detached internet gateway carries no traffic, even when a route still names it.',
    reference: 'VPC User Guide - Internet gateways: attach to a VPC', scenario: 'IGW detached; rt-public still routes 0.0.0.0/0 to it, and the same in assumed routing',
    configuration: { igw: 'detached' }, request: { start: 'user' },
    expected: { outcome: 'failure|failure' },
    run: () => ({ outcome: `${run(vpc({ igwDetached: true }), ingress, 'user').outcome}|${run(vpc({ igwDetached: true, associate: false }), ingress, 'user').outcome}` }),
    explain: a => `Outcomes ${a.outcome}.`
  },
  {
    id: 'RT-NAT-EGRESS-001', awsBehavior: 'A private subnet reaches the internet through a NAT gateway in a public subnet that routes to the internet gateway.',
    reference: 'VPC User Guide - NAT gateway use cases: access the internet from a private subnet', scenario: 'Private EC2 -> external API, 0.0.0.0/0 -> nat; NAT subnet 0.0.0.0/0 -> igw',
    configuration: { 'rt-private': ['10.0.0.0/16 local', '0.0.0.0/0 nat'] }, request: { start: 'app' },
    expected: { outcome: 'success', via: 'Route table: NAT gateway (SNAT)' },
    run: () => run(vpc(), egress, 'app'), explain: a => `Outcome ${a.outcome}.`
  },
  {
    id: 'RT-NAT-EGRESS-002', awsBehavior: 'A private subnet with only the local route has no internet access.',
    reference: 'VPC User Guide - NAT gateway use cases: routing (private subnet in AZ A)', scenario: 'rt-private has only the local route',
    configuration: { 'rt-private': ['10.0.0.0/16 local'] }, request: { start: 'app' },
    expected: { outcome: 'failure' },
    run: () => run(vpc({ privateRoutes: [{ destinationCidr: '10.0.0.0/16', target: { type: 'local' } }] }), egress, 'app'), explain: a => `Outcome ${a.outcome}.`
  },
  {
    id: 'RT-NAT-EGRESS-003', awsBehavior: "A NAT gateway forwards to the internet only if its own subnet routes to an internet gateway.",
    reference: 'VPC User Guide - NAT gateway use cases: routing (public subnet in AZ B)', scenario: 'NAT subnet route table has only the local route',
    configuration: { 'rt-public': ['10.0.0.0/16 local'] }, request: { start: 'app' },
    expected: { outcome: 'failure' },
    run: () => run(vpc({ publicRoutes: [{ destinationCidr: '10.0.0.0/16', target: { type: 'local' } }] }), egress, 'app'), explain: a => `Outcome ${a.outcome}.`
  },
  {
    id: 'RT-NAT-EGRESS-004', awsBehavior: 'An unavailable NAT gateway drops private-subnet internet traffic.',
    reference: 'VPC User Guide - NAT gateways', scenario: 'NAT gateway failed',
    configuration: { nat: 'failed' }, request: { start: 'app' },
    expected: { outcome: 'failure' },
    run: () => run(vpc({ natHealth: 'failed' }), egress, 'app'), explain: a => `Outcome ${a.outcome}.`
  },
  {
    id: 'RT-VPCE-001', awsBehavior: 'Associating a route table with an S3 gateway endpoint adds a prefix-list route that wins over 0.0.0.0/0; S3 traffic uses the endpoint.',
    reference: 'PrivateLink Guide - Gateway endpoints: routing', scenario: 'Private EC2 -> S3 with endpoint associated to rt-private',
    configuration: { endpointRouteTables: ['rt-private'] }, request: { start: 'app' },
    expected: { outcome: 'success', via: 'Route table: gateway endpoint (prefix list)' },
    run: () => run(vpc({ endpointTables: ['rt-private'], privateRoutes: [{ destinationCidr: '10.0.0.0/16', target: { type: 'local' } }] }), toBucket, 'app'), explain: a => `Outcome ${a.outcome}.`
  },
  {
    id: 'RT-VPCE-002', awsBehavior: "Subnets whose route table isn't associated with the gateway endpoint don't use it; with no other route, S3 is unreachable.",
    reference: 'PrivateLink Guide - Gateway endpoints: considerations', scenario: 'Endpoint exists but is not associated; private table has only local',
    configuration: { endpointRouteTables: [] }, request: { start: 'app' },
    expected: { outcome: 'failure' },
    run: () => run(vpc({ privateRoutes: [{ destinationCidr: '10.0.0.0/16', target: { type: 'local' } }] }), toBucket, 'app'), explain: a => `Outcome ${a.outcome}.`
  },
  {
    id: 'RT-VPCE-003', awsBehavior: 'An explicitly drawn hop to a gateway endpoint requires the source route table to be associated with it.',
    reference: 'PrivateLink Guide - Gateway endpoints: routing', scenario: 'EC2 -> endpoint -> S3, endpoint not associated with rt-private',
    configuration: { endpointRouteTables: [] }, request: { start: 'app' },
    expected: { outcome: 'failure' },
    run: () => run(vpc(), [edge('app', 'endpoint'), edge('endpoint', 'bucket', 'Object access')], 'app'), explain: a => `Outcome ${a.outcome}.`
  },
  {
    id: 'RT-LEGACY-001', awsBehavior: 'Simulator compatibility: subnets with no explicit route table keep the existing placement rules.',
    reference: 'docs/behavior/route_tables.md - opt-in scope', scenario: 'Same diagram without subnet associations; IGW and NAT present',
    configuration: { associations: 'none' }, request: { start: 'user / app' },
    expected: { outcome: 'success|success' },
    run: () => ({ outcome: `${run(vpc({ associate: false }), ingress, 'user').outcome}|${run(vpc({ associate: false }), egress, 'app').outcome}` }),
    explain: a => `Outcomes ${a.outcome}.`
  },
  {
    id: 'RT-STRICT-001', awsBehavior: "A subnet without an explicit association uses the VPC main route table; in a new VPC it has only the local route, so there is no internet ingress, NAT egress or gateway endpoint path.",
    reference: 'VPC User Guide - Internet access for default and nondefault VPCs; route tables: main route table', scenario: 'No associations, "Assume route tables" off',
    configuration: { associations: 'none', assumeRouteTables: false }, request: { start: 'user / app / app' },
    expected: { outcome: 'denied|failure|failure' },
    run: () => ({ outcome: [
      run(vpc({ associate: false }), ingress, 'user', false).outcome,
      run(vpc({ associate: false }), egress, 'app', false).outcome,
      run(vpc({ associate: false, endpointTables: [] }), [edge('app', 'endpoint'), edge('endpoint', 'bucket', 'Object access')], 'app', false).outcome
    ].join('|') }),
    explain: a => `Outcomes ${a.outcome}.`
  },
  {
    id: 'RT-STRICT-002', awsBehavior: 'Explicit associations work the same whether or not unconfigured subnets are assumed.',
    reference: 'VPC User Guide - Subnet route tables', scenario: 'Fully configured tables, "Assume route tables" off',
    configuration: { assumeRouteTables: false }, request: { start: 'user / app' },
    expected: { outcome: 'success|success' },
    run: () => ({ outcome: `${run(vpc(), ingress, 'user', false).outcome}|${run(vpc(), egress, 'app', false).outcome}` }),
    explain: a => `Outcomes ${a.outcome}.`
  }
];

runConformanceCases(CASES);
