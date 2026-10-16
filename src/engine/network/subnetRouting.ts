import type { Node } from '@xyflow/react';
import { findContainingSubnetBoundary, findContainingVpc, getBoundaryRect, getServiceNodeRect, rectCenter, rectContainsPoint } from '../layout/containment.ts';
import { parseCidr } from './cidr.ts';
import { resolveRoute, type Route, type RouteTable } from './routeTable.ts';
import { endpointService } from './vpcEndpoint.ts';

/**
 * Route-table driven internet ingress, internet egress and gateway-endpoint routing.
 *
 * AWS rules (verified 2026-10-17):
 * - A subnet is public only if its route table has a route to an internet gateway attached to
 *   the VPC; instances also need a public IPv4 address.
 *   https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html
 * - A public NAT gateway lives in a public subnet; private subnets route 0.0.0.0/0 to it. The
 *   internet cannot initiate connections to private instances through it.
 *   https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-scenarios.html
 * - Associating a route table with a gateway endpoint adds a prefix-list route to S3/DynamoDB that
 *   wins over 0.0.0.0/0 (longest prefix match). Subnets on other route tables use the public
 *   service endpoint instead.
 *   https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html
 *
 * Subnets explicitly associated with a route table node always use it. For subnets without one:
 * - assume = true (default): a standard table is generated and evaluated by the same rules -
 *   public subnet: local + 0.0.0.0/0 -> the internet gateway attached to its VPC; private subnet:
 *   local + 0.0.0.0/0 -> a NAT gateway in a public subnet of the same VPC (same AZ preferred);
 *   gateway endpoints that were never configured are treated as associated.
 * - assume = false (strict): the subnet uses the VPC main route table, which in a new VPC has only
 *   the local route, so it has no internet, NAT or gateway endpoint path.
 * Resources that are not inside any subnet keep the legacy placement rules.
 * Assumptions: resources in a subnet with an internet gateway route have a public IPv4 address
 * (or are internet-facing load balancers); IPv6 and egress-only gateways are not modeled.
 */

/** A documentation-range public address (RFC 5737 TEST-NET-3) standing in for "the internet". */
export const INTERNET_PROBE_ADDRESS = '203.0.113.10';

export type RoutingOutcome = 'legacy' | 'allowed' | 'denied' | 'invalid';

export interface RoutingDecision {
  outcome: RoutingOutcome;
  reason: string;
  /** How the traffic leaves or enters, when allowed. */
  via?: 'igw' | 'nat' | 'gateway-endpoint' | 'interface-endpoint';
  /** Ingress denied because the subnet has no internet gateway route (a private subnet): the
   *  simulator reports this as 403 (blocked), distinct from a missing/failed gateway (504). */
  privateSubnet?: boolean;
  /** Node the route points at (IGW, NAT gateway or endpoint), when one was resolved. */
  hopNodeId?: string;
  routeTableId?: string;
}

interface ResolvedTable { node: Node<any>; table: RouteTable }

const ROUTE_TARGETS = ['local', 'igw', 'nat', 'vpce', 'peering', 'tgw'];

function validTable(node: Node<any> | undefined): RouteTable | undefined {
  const table = node?.data?.customConfig?.routeTable as RouteTable | undefined;
  if (!table || !Array.isArray(table.routes)) return undefined;
  const ok = table.routes.every((route: Route) => route && typeof route.destinationCidr === 'string'
    && parseCidr(route.destinationCidr) && route.target && ROUTE_TARGETS.includes(route.target.type));
  return ok ? { ...table, id: node!.id, label: node!.data.label ?? table.label } : undefined;
}

function tableNode(id: string | undefined, nodes: Node<any>[]): Node<any> | undefined {
  return id === undefined ? undefined : nodes.find(n => n.id === id && n.data?.serviceId === 'route_tables');
}

/** The route table a subnet is explicitly associated with, or undefined for legacy subnets. */
export function associatedTableId(subnet: Node<any> | null | undefined): string | undefined {
  return subnet?.data?.networkIdentity?.routeTableId;
}

/** Resource override first (simulator convenience), then its subnet association. */
export function routeTableIdFor(resource: Node<any>, nodes: Node<any>[]): string | undefined {
  return resource.data?.networkIdentity?.routeTableId ?? associatedTableId(findContainingSubnetBoundary(resource, nodes));
}

export interface RoutingOptions { assume?: boolean }

const ASSUMED_PREFIX = 'assumed:';

function syntheticTable(id: string, label: string, routes: Route[]): ResolvedTable {
  return { node: { id, position: { x: 0, y: 0 }, data: { label } } as Node<any>, table: { id, label, routes } };
}

/** The table that governs `resource`: explicit association, generated (assumed) table, strict main
 *  table, or undefined (legacy) when the resource is not inside a subnet. */
function governingTable(resource: Node<any>, nodes: Node<any>[], options: RoutingOptions): ResolvedTable | RoutingDecision | undefined {
  const id = routeTableIdFor(resource, nodes);
  if (id !== undefined) return resolveTable(id, nodes);
  const subnet = findContainingSubnetBoundary(resource, nodes);
  if (!subnet) return undefined;
  const vpc = findContainingVpc(subnet, nodes);
  const cidr = vpc?.data?.cidr && parseCidr(vpc.data.cidr) ? vpc.data.cidr : '10.0.0.0/16';
  const local: Route = { destinationCidr: cidr, target: { type: 'local' } };
  if (options.assume === false) {
    return syntheticTable(`main:${vpc?.id ?? 'vpc'}`, 'the main route table (local route only)', [local]);
  }
  // A subnet drawn outside every VPC has no VPC to attach gateways to; keep the legacy rules.
  if (!vpc) return undefined;
  if (subnet.data.boundaryType === 'public_subnet') {
    const igw = nodes.find(n => n.data?.serviceId === 'internet_gateway' && vpc && igwAttachedVpc(n, nodes)?.id === vpc.id);
    return syntheticTable(`${ASSUMED_PREFIX}${subnet.id}`, `the assumed public route table of ${subnet.data.label ?? subnet.id}`,
      [local, { destinationCidr: '0.0.0.0/0', target: { type: 'igw', ...(igw ? { targetId: igw.id } : {}) } }]);
  }
  const nats = nodes.filter(n => n.data?.serviceId === 'nat_gateway' && vpc
    && findContainingSubnetBoundary(n, nodes)?.data?.boundaryType === 'public_subnet'
    && findContainingVpc(findContainingSubnetBoundary(n, nodes)!, nodes)?.id === vpc.id);
  const nat = nats.find(n => n.data.az && n.data.az === resource.data?.az) ?? nats[0];
  return syntheticTable(`${ASSUMED_PREFIX}${subnet.id}`, `the assumed private route table of ${subnet.data.label ?? subnet.id}`,
    nat ? [local, { destinationCidr: '0.0.0.0/0', target: { type: 'nat', targetId: nat.id } }] : [local]);
}

/** Gateway endpoint association: explicit list, or (generated tables only) never configured. */
function endpointAssociated(endpoint: Node<any>, tableId: string): boolean {
  const ids = endpoint.data?.customConfig?.routeTableIds;
  if (Array.isArray(ids)) return ids.includes(tableId);
  return tableId.startsWith(ASSUMED_PREFIX);
}

function resolveTable(id: string, nodes: Node<any>[]): ResolvedTable | RoutingDecision {
  const node = tableNode(id, nodes);
  if (!node) return { outcome: 'invalid', reason: `Associated route table ${id} does not exist.`, routeTableId: id };
  const table = validTable(node);
  if (!table) return { outcome: 'invalid', reason: `Route table ${node.data.label ?? id} has missing or invalid routes.`, routeTableId: id };
  if (new Set(table.routes.map(r => r.destinationCidr)).size !== table.routes.length) {
    return { outcome: 'invalid', reason: `Route table ${table.label} has duplicate destinations.`, routeTableId: id };
  }
  return { node, table };
}

function vpcOf(resource: Node<any>, nodes: Node<any>[]): Node<any> | null {
  const explicit = resource.data?.networkIdentity?.vpcId;
  if (explicit) return nodes.find(n => n.id === explicit && n.data?.boundaryType === 'vpc') ?? null;
  const subnet = findContainingSubnetBoundary(resource, nodes);
  if (subnet) return findContainingVpc(subnet, nodes);
  const center = rectCenter(getServiceNodeRect(resource));
  const vpcs = nodes.filter(n => n.type === 'boundaryNode' && n.data?.boundaryType === 'vpc')
    .filter(n => rectContainsPoint(getBoundaryRect(n), center.x, center.y));
  return vpcs[0] ?? null;
}

/** An internet gateway marked not attached belongs to no VPC (never attached, or detached). */
export function isIgwDetached(igw: Node<any>): boolean {
  return igw.data?.customConfig?.attachment === 'detached';
}

function rectsIntersect(a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean {
  return a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;
}

/** The VPC an internet gateway is attached to. AWS diagrams draw it on the VPC border, so the
 *  inferred attachment is: explicit networkIdentity.vpcId, else the VPC containing or touching it,
 *  else the only VPC on the canvas. Null when marked not attached or ambiguous. */
export function igwAttachedVpc(igw: Node<any>, nodes: Node<any>[]): Node<any> | null {
  if (isIgwDetached(igw)) return null;
  const vpcs = nodes.filter(n => n.type === 'boundaryNode' && n.data?.boundaryType === 'vpc');
  const explicit = igw.data?.networkIdentity?.vpcId;
  if (explicit) return vpcs.find(v => v.id === explicit) ?? null;
  const inside = vpcOf(igw, nodes);
  if (inside) return inside;
  const rect = getServiceNodeRect(igw);
  const touching = vpcs.filter(v => rectsIntersect(rect, getBoundaryRect(v)));
  if (touching.length === 1) return touching[0];
  return touching.length === 0 && vpcs.length === 1 ? vpcs[0] : null;
}

function igwAttached(igw: Node<any>, vpc: Node<any> | null, nodes: Node<any>[]): boolean {
  return Boolean(vpc) && igwAttachedVpc(igw, nodes)?.id === vpc!.id;
}

function resolveIgw(route: Route, vpc: Node<any> | null, nodes: Node<any>[]): Node<any> | string {
  const candidates = route.target.targetId
    ? nodes.filter(n => n.id === route.target.targetId)
    : nodes.filter(n => n.data?.serviceId === 'internet_gateway' && igwAttached(n, vpc, nodes));
  const igw = candidates[0];
  if (!igw || igw.data?.serviceId !== 'internet_gateway') return route.target.targetId
    ? `Route target ${route.target.targetId} is not an internet gateway.`
    : 'The route points at an internet gateway, but none is attached to this VPC.';
  if (!igwAttached(igw, vpc, nodes)) return isIgwDetached(igw) ? `${igw.data.label} is not attached to any VPC.` : `${igw.data.label} is not attached to this subnet's VPC.`;
  if (igw.data.health === 'failed') return `${igw.data.label} is marked failed (teaching scenario: AWS internet gateways are horizontally scaled and highly available, and AWS documents no outage mode).`;
  return igw;
}

function tableLabel(resolved: ResolvedTable): string { return resolved.table.label ?? resolved.node.id; }

/**
 * Can a client on the internet reach `target`? Requires the target subnet's route table to send
 * internet traffic to a healthy internet gateway attached to the VPC (return traffic uses that
 * same route).
 */
export function evaluateInternetIngress(target: Node<any>, nodes: Node<any>[], options: RoutingOptions = {}): RoutingDecision {
  const resolved = governingTable(target, nodes, options);
  if (!resolved) return { outcome: 'legacy', reason: 'Subnet has no explicit route table association.' };
  if (!('table' in resolved)) return resolved;
  const tableId = resolved.node.id;
  const route = resolveRoute(resolved.table, INTERNET_PROBE_ADDRESS).selectedRoute;
  const label = tableLabel(resolved);
  if (!route || route.target.type !== 'igw') {
    const where = route ? `sends internet traffic to ${route.target.type}, not to an internet gateway` : 'has no route to an internet gateway';
    return { outcome: 'denied', routeTableId: tableId, privateSubnet: true,
      reason: `${label} ${where}, so ${target.data.label} is in a private subnet and cannot be reached from the internet.` };
  }
  const igw = resolveIgw(route, vpcOf(target, nodes), nodes);
  if (typeof igw === 'string') return { outcome: 'denied', routeTableId: tableId, reason: `${label}: ${igw}` };
  return { outcome: 'allowed', via: 'igw', hopNodeId: igw.id, routeTableId: tableId,
    reason: `${label} routes ${route.destinationCidr} to ${igw.data.label}, which is attached to the VPC. Internet clients can reach ${target.data.label} through its public address.` };
}

/** Which gateway endpoint (if any) serves `destinationService` for a route table. */
function endpointRouteFor(tableId: string, destinationService: string, nodes: Node<any>[]): Node<any> | undefined {
  return nodes.find(n => n.data?.serviceId === 's3_gateway_endpoint'
    && endpointAssociated(n, tableId) && endpointService(n.data) === destinationService);
}

/** Is a gateway endpoint associated with the route table `source` uses? */
export function evaluateGatewayEndpointAssociation(source: Node<any>, endpoint: Node<any>, nodes: Node<any>[], options: RoutingOptions = {}): RoutingDecision {
  const resolved = governingTable(source, nodes, options);
  if (!resolved) return { outcome: 'legacy', reason: 'Subnet has no explicit route table association.' };
  if (!('table' in resolved)) return resolved;
  const tableId = resolved.node.id;
  const associated = endpointAssociated(endpoint, tableId);
  return associated
    ? { outcome: 'allowed', via: 'gateway-endpoint', hopNodeId: endpoint.id, routeTableId: tableId,
        reason: `${endpoint.data.label} is associated with ${tableLabel(resolved)}, which adds the ${endpointService(endpoint.data)} prefix-list route.` }
    : { outcome: 'denied', routeTableId: tableId,
        reason: `${endpoint.data.label} is not associated with ${tableLabel(resolved)}, so ${source.data.label}'s subnet has no prefix-list route to it. Associate the route table with the endpoint.` };
}

/**
 * Can `source` reach a destination outside the VPC? `destinationService` enables the gateway
 * endpoint prefix-list route for S3 and DynamoDB.
 */
export function evaluateInternetEgress(source: Node<any>, destinationService: string, nodes: Node<any>[], options: RoutingOptions = {}, depth = 0): RoutingDecision {
  const resolved = governingTable(source, nodes, options);
  if (!resolved) return { outcome: 'legacy', reason: 'Subnet has no explicit route table association.' };
  if (!('table' in resolved)) return resolved;
  const tableId = resolved.node.id;
  const label = tableLabel(resolved);

  // Interface endpoints (PrivateLink) with private DNS resolve the service name to endpoint ENIs in
  // this VPC, so the call stays on the local route. https://docs.aws.amazon.com/vpc/latest/privatelink/create-interface-endpoint.html
  const sourceVpc = vpcOf(source, nodes);
  const iface = sourceVpc && nodes.find(n => n.data?.serviceId === 'privatelink' && endpointService(n.data) === destinationService
    && vpcOf(n, nodes)?.id === sourceVpc.id);
  if (iface) {
    if (iface.data.health === 'failed') return { outcome: 'denied', routeTableId: tableId, reason: `The ${destinationService} interface endpoint ${iface.data.label} is unavailable.` };
    return { outcome: 'allowed', via: 'interface-endpoint', hopNodeId: iface.id, routeTableId: tableId,
      reason: `Private DNS resolves ${destinationService} to interface endpoint ${iface.data.label} in this VPC; the call uses the local route, no NAT or internet gateway.` };
  }

  const endpoint = ['s3', 'dynamodb'].includes(destinationService) ? endpointRouteFor(tableId, destinationService, nodes) : undefined;
  if (endpoint) {
    if (endpoint.data.health === 'failed') return { outcome: 'denied', routeTableId: tableId, reason: `${label} sends ${destinationService} traffic to ${endpoint.data.label}, which is unavailable.` };
    return { outcome: 'allowed', via: 'gateway-endpoint', hopNodeId: endpoint.id, routeTableId: tableId,
      reason: `${label} has the ${destinationService} prefix-list route to ${endpoint.data.label}; it takes precedence over any 0.0.0.0/0 route.` };
  }

  const route = resolveRoute(resolved.table, INTERNET_PROBE_ADDRESS).selectedRoute;
  if (!route) return { outcome: 'denied', routeTableId: tableId, reason: `${label} has no route for internet traffic. Packets from ${source.data.label} are dropped.` };

  if (route.target.type === 'igw') {
    const igw = resolveIgw(route, vpcOf(source, nodes), nodes);
    if (typeof igw === 'string') return { outcome: 'denied', routeTableId: tableId, reason: `${label}: ${igw}` };
    return { outcome: 'allowed', via: 'igw', hopNodeId: igw.id, routeTableId: tableId,
      reason: `${label} routes ${route.destinationCidr} to ${igw.data.label}. ${source.data.label} leaves through it using its public address.` };
  }

  if (route.target.type === 'nat') {
    const nat = route.target.targetId ? nodes.find(n => n.id === route.target.targetId) : undefined;
    if (!nat || nat.data?.serviceId !== 'nat_gateway') return { outcome: 'denied', routeTableId: tableId, reason: `${label} points at a NAT gateway that does not exist on the canvas.` };
    if (nat.data.health === 'failed') return { outcome: 'denied', routeTableId: tableId, reason: `${label} sends internet traffic to ${nat.data.label}, which is unavailable.` };
    if (depth > 0) return { outcome: 'denied', routeTableId: tableId, reason: `${nat.data.label}'s subnet routes internet traffic to another NAT gateway; a NAT gateway needs a route to an internet gateway.` };
    // The NAT gateway's own subnet must reach the internet gateway.
    const upstream = evaluateInternetEgress(nat, 'internet', nodes, options, depth + 1);
    if (upstream.outcome === 'legacy') {
      return { outcome: 'denied', routeTableId: tableId, reason: `${label} routes to ${nat.data.label}, but it is not inside a subnet, so it has no route to an internet gateway.` };
    }
    if (upstream.outcome !== 'allowed' || upstream.via !== 'igw') {
      return { outcome: 'denied', routeTableId: tableId, reason: `${label} routes to ${nat.data.label}, but ${upstream.reason}` };
    }
    return { outcome: 'allowed', via: 'nat', hopNodeId: nat.id, routeTableId: tableId,
      reason: `${label} routes ${route.destinationCidr} to ${nat.data.label}, which translates the private source address (SNAT); ${upstream.reason}` };
  }

  return { outcome: 'denied', routeTableId: tableId,
    reason: `${label} sends internet traffic to a ${route.target.type} target, which does not lead to the internet in this simulator.` };
}

export interface RoutingIssue {
  nodeId: string;
  label: string;
  field: string;
  problem: string;
  awsRule: string;
  recommendation: string;
}

/**
 * Configuration AWS itself rejects or forbids (checked independently of any request):
 * - one internet gateway per VPC at a time
 *   (https://docs.aws.amazon.com/vpc/latest/userguide/amazon-vpc-limits.html);
 * - a route table belongs to one VPC, so its subnets and route targets must be in that VPC;
 * - routes must have a valid destination CIDR, a unique destination and an existing target.
 */
export function routingConfigurationIssues(nodes: Node<any>[]): RoutingIssue[] {
  const issues: RoutingIssue[] = [];
  const label = (n: Node<any>) => String(n.data?.label ?? n.id);

  const byVpc = new Map<string, Node<any>[]>();
  for (const igw of nodes.filter(n => n.data?.serviceId === 'internet_gateway')) {
    const vpc = igwAttachedVpc(igw, nodes);
    if (vpc) byVpc.set(vpc.id, [...(byVpc.get(vpc.id) ?? []), igw]);
  }
  for (const [vpcId, igws] of byVpc) if (igws.length > 1) {
    const vpc = nodes.find(n => n.id === vpcId)!;
    issues.push({ nodeId: igws[1].id, label: label(igws[1]), field: 'igw-per-vpc',
      problem: `${igws.map(label).join(' and ')} are both attached to ${label(vpc)}.`,
      awsRule: 'You can attach only one internet gateway to a VPC at a time.',
      recommendation: 'Remove the extra internet gateway or mark it not attached.' });
  }

  for (const table of nodes.filter(n => n.data?.serviceId === 'route_tables')) {
    const subnets = nodes.filter(n => n.type === 'boundaryNode' && n.data?.networkIdentity?.routeTableId === table.id);
    const vpcs = [...new Set(subnets.map(s => findContainingVpc(s, nodes)?.id).filter(Boolean))] as string[];
    if (vpcs.length > 1) issues.push({ nodeId: table.id, label: label(table), field: 'route-table-vpc',
      problem: `${label(table)} is associated with subnets in ${vpcs.length} different VPCs.`,
      awsRule: 'A route table belongs to one VPC and can only be associated with subnets in that VPC.',
      recommendation: 'Use a separate route table for each VPC.' });
    const tableVpc = vpcs.length === 1 ? vpcs[0] : undefined;
    const routes: Route[] = Array.isArray(table.data?.customConfig?.routeTable?.routes) ? table.data.customConfig.routeTable.routes : [];
    const seen = new Set<string>();
    routes.forEach((route, index) => {
      const where = `Route ${index + 1} of ${label(table)}`;
      if (!route || typeof route.destinationCidr !== 'string' || !parseCidr(route.destinationCidr)) {
        issues.push({ nodeId: table.id, label: label(table), field: 'route-cidr', problem: `${where} has an invalid destination.`,
          awsRule: 'A route destination must be a valid CIDR block.', recommendation: 'Enter a destination such as 0.0.0.0/0 or 10.0.0.0/16.' });
        return;
      }
      if (seen.has(route.destinationCidr)) issues.push({ nodeId: table.id, label: label(table), field: 'route-duplicate',
        problem: `${where} repeats destination ${route.destinationCidr}.`,
        awsRule: 'A route table cannot contain two routes with the same destination.', recommendation: 'Remove one of the duplicate routes.' });
      seen.add(route.destinationCidr);
      const kind = route.target?.type;
      if (kind !== 'igw' && kind !== 'nat') return;
      const target = route.target.targetId ? nodes.find(n => n.id === route.target.targetId) : undefined;
      const expected = kind === 'igw' ? 'internet_gateway' : 'nat_gateway';
      if (!target || target.data?.serviceId !== expected) {
        issues.push({ nodeId: table.id, label: label(table), field: 'route-target',
          problem: `${where} points at a ${kind === 'igw' ? 'internet gateway' : 'NAT gateway'} that does not exist.`,
          awsRule: 'A route target must be an existing gateway; otherwise AWS rejects the route (or marks it blackhole after deletion).',
          recommendation: 'Select an existing target for the route.' });
        return;
      }
      const targetVpc = kind === 'igw' ? igwAttachedVpc(target, nodes)?.id
        : (() => { const s = findContainingSubnetBoundary(target, nodes); return s ? findContainingVpc(s, nodes)?.id : undefined; })();
      if (tableVpc && targetVpc !== tableVpc) issues.push({ nodeId: table.id, label: label(table), field: 'route-target-vpc',
        problem: `${where} points at ${label(target)}, which is ${kind === 'igw' && isIgwDetached(target) ? 'not attached to any VPC' : 'not in this route table\'s VPC'}.`,
        awsRule: kind === 'igw' ? 'A route can target only the internet gateway attached to the same VPC.' : 'A route can target only a NAT gateway in the same VPC.',
        recommendation: 'Point the route at a gateway in the same VPC.' });
    });
  }
  return issues;
}
