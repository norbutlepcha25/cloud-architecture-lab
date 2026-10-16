import type { Edge, Node } from '@xyflow/react';
import { deriveSubnetForNode, getBoundaryRect, getServiceNodeRect, rectCenter, rectContainsPoint } from '../layout/containment.ts';
import { isEksManagementPair } from '../architecture/eksRelationships.ts';

/**
 * Stray component detection - an architecture-hygiene check, not an AWS behavior rule.
 *
 * A component is "stray" when it takes no part in the architecture the simulator evaluates:
 *  - `unconnected`: a service with no connection line and no explicit reference to or from
 *    another component (e.g. ASG membership, target registration, security group attachment
 *    recorded in its data). It can never appear on a request path or in a dependency.
 *  - `outside-subnet`: a service AWS only deploys into a subnet (EC2, RDS, ALB, ...) whose
 *    center is not inside any subnet boundary, i.e. it was dropped loose on the canvas. Uses the
 *    same placement rule as engine/layout/containment.ts.
 *
 * Not every AWS relationship is a line. Two groups are therefore handled explicitly:
 *  - VPC infrastructure (internet/NAT gateways, route tables, gateway/interface endpoints) is
 *    attached to its VPC and used through route tables and subnet associations, so it counts as
 *    connected when placed inside a VPC boundary.
 *  - Configuration-referenced services (IAM, KMS, Secrets Manager, CloudWatch) relate through
 *    policies, ARNs and log/metric configuration this canvas does not model as lines. Whether
 *    they are used is UNKNOWN here, so they are never reported as unconnected.
 * EKS management relationships (eksRelationships.ts) also count as connections, as does sharing
 * an EKS cluster with another component: a Kubernetes Service reaches its pods by label selector
 * inside the cluster, not through a drawn line.
 *
 * Components marked `customConfig.referenceOnly` are deliberate annotations and are skipped.
 * Boundary containers and derived frames are never reported. The result is informational and
 * does not change simulation, validation, or analysis scores.
 */
export type StrayReason = 'unconnected' | 'outside-subnet';

export interface StrayComponent {
  nodeId: string;
  label: string;
  reasons: StrayReason[];
}

export const STRAY_REASON_TEXT: Record<StrayReason, string> = {
  'unconnected': 'Not connected to any component',
  'outside-subnet': 'Placed outside a subnet'
};

const VPC_ATTACHED_SERVICE_IDS = new Set(['internet_gateway', 'nat_gateway', 'route_tables', 's3_gateway_endpoint', 'privatelink']);
const CONFIGURATION_REFERENCED_SERVICE_IDS = new Set(['iam', 'kms', 'secrets_manager', 'cloudwatch']);

function insideVpc(node: Node<any>, boundaries: Node<any>[]): boolean {
  if (node.data?.networkIdentity?.vpcId) return true;
  const center = rectCenter(getServiceNodeRect(node));
  return boundaries.some(b => b.data?.boundaryType === 'vpc' && rectContainsPoint(getBoundaryRect(b), center.x, center.y));
}

/** Collects every string value nested in a node's data, for explicit id references. */
function collectStrings(value: unknown, into: Set<string>, depth = 0): void {
  if (depth > 6 || value === null || value === undefined) return;
  if (typeof value === 'string') { into.add(value); return; }
  if (Array.isArray(value)) { for (const item of value) collectStrings(item, into, depth + 1); return; }
  if (typeof value === 'object') for (const item of Object.values(value as Record<string, unknown>)) collectStrings(item, into, depth + 1);
}

export function detectStrayComponents(nodes: Node<any>[], edges: Edge<any>[]): StrayComponent[] {
  const services = nodes.filter(node => node.type === 'serviceNode');
  const boundaries = nodes.filter(node => node.type === 'boundaryNode');
  const ids = new Set(nodes.map(node => node.id));

  const linked = new Set<string>();
  for (const edge of edges) { linked.add(edge.source); linked.add(edge.target); }

  // Explicit references in node data link both ends. Boundary references (a security group or
  // subnet id) do not count: being inside a container is not a connection to another component.
  const boundaryIds = new Set(boundaries.map(node => node.id));
  for (const node of services) {
    const strings = new Set<string>();
    collectStrings(node.data, strings);
    for (const value of strings) {
      if (value === node.id || !ids.has(value) || boundaryIds.has(value)) continue;
      linked.add(node.id);
      linked.add(value);
    }
  }

  for (const a of services) for (const b of services) {
    if (a.id < b.id && isEksManagementPair(a, b)) { linked.add(a.id); linked.add(b.id); }
  }
  const eksCluster = (node: Node<any>): string | undefined =>
    node.data?.eksClusterName ?? node.data?.customConfig?.eks?.clusterName ?? node.data?.customConfig?.eksNode?.clusterName;
  const clusterSizes = new Map<string, number>();
  for (const node of nodes) { const name = eksCluster(node); if (name) clusterSizes.set(name, (clusterSizes.get(name) ?? 0) + 1); }
  for (const node of services) {
    const serviceId = node.data?.serviceId;
    const cluster = eksCluster(node);
    if (cluster && (clusterSizes.get(cluster) ?? 0) > 1) linked.add(node.id);
    if (CONFIGURATION_REFERENCED_SERVICE_IDS.has(serviceId)) linked.add(node.id);
    if (VPC_ATTACHED_SERVICE_IDS.has(serviceId) && insideVpc(node, boundaries)) linked.add(node.id);
  }

  const result: StrayComponent[] = [];
  for (const node of services) {
    if (node.data?.customConfig?.referenceOnly) continue;
    const reasons: StrayReason[] = [];
    if (!linked.has(node.id)) reasons.push('unconnected');
    if (deriveSubnetForNode(node, boundaries) === 'unassigned') reasons.push('outside-subnet');
    if (reasons.length) result.push({ nodeId: node.id, label: String(node.data?.label || node.data?.serviceId || node.id), reasons });
  }
  return result;
}
