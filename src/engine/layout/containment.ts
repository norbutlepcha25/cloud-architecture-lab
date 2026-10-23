import type { Node } from '@xyflow/react';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Real service nodes are auto-sized to their label/icon and never carry an explicit
// width/height, so a fixed estimate is used for the purposes of finding their center point.
const DEFAULT_SERVICE_NODE_WIDTH = 120;
const DEFAULT_SERVICE_NODE_HEIGHT = 80;

// Mirrors the width/height fallback chain BoundaryNode.tsx itself renders with, so containment
// math always agrees with what the student actually sees on screen.
const DEFAULT_BOUNDARY_WIDTH = 400;
const DEFAULT_BOUNDARY_HEIGHT = 300;

export function getServiceNodeRect(node: Node<any>): Rect {
  const width = node.measured?.width ?? (node as any).width ?? DEFAULT_SERVICE_NODE_WIDTH;
  const height = node.measured?.height ?? (node as any).height ?? DEFAULT_SERVICE_NODE_HEIGHT;
  return { x: node.position.x, y: node.position.y, width, height };
}

export function getBoundaryRect(node: Node<any>): Rect {
  const width =
    node.measured?.width ?? (node as any).width ?? (node.style as any)?.width ?? node.data?.width ?? DEFAULT_BOUNDARY_WIDTH;
  const height =
    node.measured?.height ?? (node as any).height ?? (node.style as any)?.height ?? node.data?.height ?? DEFAULT_BOUNDARY_HEIGHT;
  return { x: node.position.x, y: node.position.y, width, height };
}

export function rectContainsPoint(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

export function rectCenter(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export function rectArea(rect: Rect): number {
  return rect.width * rect.height;
}

/**
 * AWS resources whose ENI must live in exactly one subnet. Dragging one of these outside
 * every public/private subnet boundary is not a cosmetic mistake - it is not something AWS
 * would ever let you deploy, so it is modeled as a hard placement failure rather than being
 * silently reinterpreted as "public internet" like a managed/serverless service would be.
 *
 * `api_gateway` is deliberately excluded: an HTTP API (the common case, and what this app
 * models) is a fully-managed regional/edge endpoint with no VPC placement at all, unlike an
 * ALB/NLB which always lives in a subnet you own.
 *
 * `privatelink` (an Interface VPC Endpoint) IS included: real Interface VPC Endpoints create
 * actual ENIs in customer-chosen subnets, unlike a Gateway VPC Endpoint (`s3_gateway_endpoint`,
 * a route-table/prefix-list construct with no ENI at all) - the two endpoint types are
 * structurally different on exactly this axis and must not share a placement rule.
 */
export const SUBNET_REQUIRED_SERVICE_IDS = [
  'alb', 'nlb', 'elb', 'app_runner',
  'ec2', 'ecs', 'fargate',
  'rds', 'aurora', 'elasticache', 'neptune', 'redshift',
  'privatelink'
];

export type DerivedSubnet = 'public' | 'private' | 'unassigned' | 'global';

/**
 * Finds the smallest (most specific/innermost) boundary of the given type(s) whose rect
 * contains a point, using the same center-point + smallest-area-wins rule used throughout this
 * module. Shared by subnet, VPC, and security group containment lookups so they all agree on
 * what "inside" means.
 */
function findSmallestContainingBoundary(
  point: { x: number; y: number },
  boundaryNodes: Node<any>[],
  boundaryTypes: string[],
  excludeId?: string
): Node<any> | null {
  const matches = boundaryNodes
    .filter(b => b.id !== excludeId && boundaryTypes.includes((b.data as any)?.boundaryType))
    .map(b => ({ node: b, rect: getBoundaryRect(b) }))
    .filter(({ rect }) => rectContainsPoint(rect, point.x, point.y))
    .sort((a, b) => rectArea(a.rect) - rectArea(b.rect));

  return matches.length > 0 ? matches[0].node : null;
}

/**
 * Finds the Public/Private subnet boundary a service node's center point actually sits inside,
 * or null if it isn't inside any. This is the same lookup `deriveSubnetForNode` uses to produce
 * the 'public'/'private' string, but returns the boundary node itself so callers (e.g. the
 * simulator's NACL check) can read rule data off it.
 */
export function findContainingSubnetBoundary(node: Node<any>, boundaryNodes: Node<any>[]): Node<any> | null {
  const subnetId = node.data?.networkIdentity?.subnetId;
  if (subnetId !== undefined) {
    return boundaryNodes.find(b => b.id === subnetId && b.type === 'boundaryNode' &&
      ['public_subnet', 'private_subnet'].includes(b.data?.boundaryType)) ?? null;
  }
  const center = rectCenter(getServiceNodeRect(node));
  return findSmallestContainingBoundary(center, boundaryNodes, ['public_subnet', 'private_subnet']);
}

/**
 * Resolves the Security Group boundary node(s) attached to a service node, exactly like real
 * AWS: attachment is an explicit reference (`data.securityGroupIds`) an instance carries, not a
 * function of where it happens to sit on the canvas. This deliberately differs from subnet/VPC
 * placement, whose legacy canvas representation uses geometry. AWS membership itself is explicit.
 */
export function getAttachedSecurityGroups(node: Node<any>, allNodes: Node<any>[]): Node<any>[] {
  const ids: string[] = (node.data as any)?.securityGroupIds || [];
  if (ids.length === 0) return [];

  return ids
    .map(id => allNodes.find(n => n.id === id && n.type === 'boundaryNode' && (n.data as any)?.boundaryType === 'security_group'))
    .filter((n): n is Node<any> => Boolean(n));
}

/**
 * Determines which subnet (if any) a service node actually sits inside, using only the
 * geometry of the boundary containers currently on the canvas - never the node's own
 * previously-recorded `subnet` field, which is exactly the value being validated here.
 *
 * A node's center point is tested against every public/private subnet boundary; when the
 * center falls inside more than one (nested boundaries), the smallest-area match wins, since
 * that is the most specific/innermost container. `nat_gateway` is intentionally excluded from
 * `SUBNET_REQUIRED_SERVICE_IDS`: it already has its own dedicated "must be in a public subnet"
 * failure message in the simulator keyed off `subnet === 'public'`, so it falls back to
 * 'private' (not 'unassigned') when it is not inside a subnet box, letting that existing,
 * more specific message fire instead of the generic placement failure.
 */
export function deriveSubnetForNode(
  node: Node<any>,
  boundaryNodes: Node<any>[]
): DerivedSubnet {
  const serviceId = (node.data as any)?.serviceId;

  const containingSubnet = findContainingSubnetBoundary(node, boundaryNodes);
  if (containingSubnet) {
    return (containingSubnet.data as any).boundaryType === 'public_subnet' ? 'public' : 'private';
  }

  if (SUBNET_REQUIRED_SERVICE_IDS.includes(serviceId)) {
    return 'unassigned';
  }

  if (serviceId === 'nat_gateway') {
    return 'private';
  }

  return 'global';
}

/**
 * Finds which VPC boundary a Public/Private subnet boundary is actually drawn inside, using
 * the same center-point + smallest-area-wins rule as `deriveSubnetForNode`. Returns null for a
 * subnet box that isn't inside any VPC boundary - it has no address space to be carved from.
 */
export function findContainingVpc(
  subnetBoundaryNode: Node<any>,
  boundaryNodes: Node<any>[]
): Node<any> | null {
  const vpcId = subnetBoundaryNode.data?.networkIdentity?.vpcId;
  if (vpcId !== undefined) {
    return boundaryNodes.find(b => b.id === vpcId && b.type === 'boundaryNode' && b.data?.boundaryType === 'vpc') ?? null;
  }
  const subnetRect = getBoundaryRect(subnetBoundaryNode);
  const center = rectCenter(subnetRect);

  const containingVpcs = boundaryNodes
    .filter(b => b.id !== subnetBoundaryNode.id && (b.data as any)?.boundaryType === 'vpc')
    .map(b => ({ node: b, rect: getBoundaryRect(b) }))
    .filter(({ rect }) => rectContainsPoint(rect, center.x, center.y))
    .sort((a, b) => rectArea(a.rect) - rectArea(b.rect));

  return containingVpcs.length > 0 ? containingVpcs[0].node : null;
}

/**
 * Tests whether boundary `parentNode` geometrically contains boundary `childNode`.
 * `parentNode` contains `childNode` if `parentNode` has a strictly larger area than `childNode`,
 * and either `childNode`'s center point falls inside `parentNode`'s rectangle, or `childNode`
 * has significant (>= 40%) geometric area overlap within `parentNode`.
 */
export function isBoundaryContained(childNode: Node<any>, parentNode: Node<any>): boolean {
  if (!childNode || !parentNode || childNode.id === parentNode.id) return false;
  const childRect = getBoundaryRect(childNode);
  const parentRect = getBoundaryRect(parentNode);

  const childArea = rectArea(childRect);
  const parentArea = rectArea(parentRect);
  if (parentArea <= childArea) return false;

  const childCenter = rectCenter(childRect);
  if (rectContainsPoint(parentRect, childCenter.x, childCenter.y)) {
    return true;
  }

  // Also check intersection area overlap
  const xOverlap = Math.max(0, Math.min(parentRect.x + parentRect.width, childRect.x + childRect.width) - Math.max(parentRect.x, childRect.x));
  const yOverlap = Math.max(0, Math.min(parentRect.y + parentRect.height, childRect.y + childRect.height) - Math.max(parentRect.y, childRect.y));
  const overlapArea = xOverlap * yOverlap;

  return childArea > 0 && overlapArea >= 0.4 * childArea;
}

/**
 * Returns the count of enclosing ancestor boundaries that contain `targetBoundary`.
 * 0 means a top-level boundary (e.g. root Region or Account or freestanding VPC).
 */
export function getBoundaryContainmentDepth(
  targetBoundary: Node<any>,
  allBoundaryNodes: Node<any>[]
): number {
  return allBoundaryNodes.filter(other => isBoundaryContained(targetBoundary, other)).length;
}

/**
 * Computes stacking z-index for a boundary node based on its containment hierarchy.
 * Inner boundaries (children) receive a strictly higher z-index than outer boundaries (ancestors),
 * ensuring that containers never visually cover or intercept clicks meant for their contents.
 *
 * Base mapping:
 * - Depth 0 (outermost container, e.g. Region or Account): -4
 * - Depth 1 (e.g. AZ or VPC inside Region): -3
 * - Depth 2 (e.g. VPC inside AZ, or AZ inside VPC): -2
 * - Depth 3 (e.g. Subnet inside VPC): -1
 * - Depth 4 (e.g. Security Group inside Subnet): 0
 * - Depth 5+: 1, 2...
 */
export function calculateBoundaryZIndex(
  boundaryNode: Node<any>,
  allBoundaryNodes: Node<any>[]
): number {
  const depth = getBoundaryContainmentDepth(boundaryNode, allBoundaryNodes);
  return -4 + depth;
}

