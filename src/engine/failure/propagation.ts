import type { Node, Edge } from '@xyflow/react';
import type { ServiceNodeData, ConnectionData } from '../../types/index.ts';
import type {
  Failure,
  FailureInput,
  FailureImpactAnalysis,
  DependentImpact
} from './types.ts';
import { isEdgeBlockingFailureType } from './types.ts';
import {
  requestEdges,
  getUpstreamCallers,
  getDownstreamTargets,
  findNode,
  isNetworkInfraNode
} from './dependencyGraph.ts';
import { checkRedundancy } from './redundancy.ts';
import { INTERNET_CLIENT_IDS } from '../architecture/externalActors.ts';

function generateId(): string {
  const g: any = globalThis as any;
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `failure-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Fills in `id`/`state`/`triggeredAtMs`/`affectedDependencies` so callers only supply the fields
 *  that actually describe the injected fault. */
export function createFailure(input: FailureInput): Failure {
  return {
    id: input.id || generateId(),
    targetResourceId: input.targetResourceId,
    failureType: input.failureType,
    severity: input.severity,
    trigger: input.trigger,
    state: 'active',
    triggeredAtMs: input.triggeredAtMs ?? Date.now(),
    durationMs: input.durationMs,
    reason: input.reason,
    deniedAction: input.deniedAction,
    affectedDependencies: []
  };
}

interface CascadeResult {
  cascadingFailedNodeIds: string[];
  degradedNodeIds: string[];
  survivingNodeIds: string[];
  dependentImpacts: DependentImpact[];
  redundancyNotes: string[];
}

/**
 * Walks upstream from an already-failed seed set, asking of every caller in turn: does it have
 * real redundancy for whichever of its dependencies just went down? Stops at the first survivor
 * on each branch (a node with full redundancy does not drag its own callers down with it) and
 * never crosses into pure network/routing infrastructure (see `isNetworkInfraNode`) - AWS never
 * takes an ALB/IGW/NAT/CloudFront/Route 53 itself offline because something it routes to failed.
 */
function runCascade(
  seedFailedIds: string[],
  nodes: Node<ServiceNodeData>[],
  edges: Edge<ConnectionData>[]
): CascadeResult {
  const failedSet = new Set(seedFailedIds);
  const cascadingFailedNodeIds: string[] = [];
  const degradedNodeIds: string[] = [];
  const survivingNodeIds: string[] = [];
  const dependentImpacts: DependentImpact[] = [];
  const redundancyNotes: string[] = [];

  const visited = new Set<string>(seedFailedIds);
  const queue: string[] = [...new Set(seedFailedIds.flatMap(id => getUpstreamCallers(id, edges)))]
    .filter(id => !visited.has(id));

  while (queue.length > 0) {
    const dependentId = queue.shift()!;
    if (visited.has(dependentId)) continue;
    visited.add(dependentId);

    const dependentNode = findNode(nodes, dependentId);
    if (!dependentNode || dependentNode.type === 'boundaryNode') continue;

    const failedTargets = getDownstreamTargets(dependentId, edges).filter(id => failedSet.has(id));
    if (failedTargets.length === 0) continue;

    const redundancy = checkRedundancy(dependentNode, failedTargets, failedSet, nodes, edges);
    redundancyNotes.push(`${dependentNode.data.label}: ${redundancy.note}`);

    if (redundancy.fullyCovered) {
      survivingNodeIds.push(dependentId);
      dependentImpacts.push({
        nodeId: dependentId, survived: true, cascaded: false,
        reason: redundancy.note, redundancyApplied: redundancy.mechanism
      });
      continue;
    }

    if (isNetworkInfraNode(dependentNode) || redundancy.partiallyCovered) {
      // Infra never goes fully down (worst case it just errors on the affected path, exactly
      // like an ALB returning 503 for a dead target group); a partially-covered app-tier node is
      // still functioning via its other path - neither case propagates further upstream.
      degradedNodeIds.push(dependentId);
      dependentImpacts.push({
        nodeId: dependentId, survived: redundancy.partiallyCovered, cascaded: false, reason: redundancy.note
      });
      continue;
    }

    cascadingFailedNodeIds.push(dependentId);
    dependentImpacts.push({ nodeId: dependentId, survived: false, cascaded: true, reason: redundancy.note });
    failedSet.add(dependentId);

    queue.push(...getUpstreamCallers(dependentId, edges).filter(id => !visited.has(id)));
  }

  return { cascadingFailedNodeIds, degradedNodeIds, survivingNodeIds, dependentImpacts, redundancyNotes };
}

const AZ_TARGETABLE = new Set(['AZ-A', 'AZ-B', 'AZ-C']);

/** Node-health failure types: the failure directly makes one (or, for `az_failure`, several)
 *  node(s) unhealthy, then cascades to callers exactly like a live `health: 'failed'` node would. */
function analyzeNodeHealthFailure(
  failure: Failure,
  nodes: Node<ServiceNodeData>[],
  edges: Edge<ConnectionData>[]
): FailureImpactAnalysis {
  const directTargets = failure.failureType === 'az_failure'
    ? nodes.filter(n => n.type !== 'boundaryNode' && n.data.az === failure.targetResourceId).map(n => n.id)
    : nodes.some(n => n.id === failure.targetResourceId) ? [failure.targetResourceId] : [];

  const cascade = runCascade(directTargets, nodes, edges);
  const affectedNodeIds = [...new Set([...directTargets, ...cascade.cascadingFailedNodeIds, ...cascade.degradedNodeIds])];

  return {
    failure: { ...failure, affectedDependencies: affectedNodeIds.filter(id => !directTargets.includes(id)) },
    directlyFailedNodeIds: directTargets,
    cascadingFailedNodeIds: cascade.cascadingFailedNodeIds,
    degradedNodeIds: cascade.degradedNodeIds,
    survivingNodeIds: cascade.survivingNodeIds,
    affectedNodeIds,
    blockedEdgeIds: [],
    dependentImpacts: cascade.dependentImpacts,
    redundancyNotes: cascade.redundancyNotes,
    summary: buildSummary(failure, directTargets, cascade.cascadingFailedNodeIds, cascade.degradedNodeIds, cascade.survivingNodeIds, nodes)
  };
}

/** Resolves which specific edges a NAT Gateway failure severs: a private/isolated-subnet node's
 *  egress toward the internet, mirroring `networkPathAdapter`'s own NAT-egress reasoning - and
 *  nothing else. A request from that same private node to another node in the VPC (e.g. its
 *  database) never touched the NAT Gateway and is completely unaffected. */
function resolveNatFailureBlockedEdges(
  natNodeId: string,
  nodes: Node<ServiceNodeData>[],
  edges: Edge<ConnectionData>[]
): string[] {
  const alternateHealthyNat = nodes.some(n =>
    n.data.serviceId === 'nat_gateway' && n.id !== natNodeId && n.data.health !== 'failed'
  );
  if (alternateHealthyNat) return [];

  return requestEdges(edges)
    .filter(e => {
      const source = findNode(nodes, e.source);
      const target = findNode(nodes, e.target);
      if (!source || !target) return false;
      const sourceIsPrivate = source.data.subnet === 'private' || source.data.subnet === 'isolated';
      const targetIsExternal = target.data.subnet === 'global' && !(INTERNET_CLIENT_IDS as readonly string[]).includes(target.data.serviceId);
      return sourceIsPrivate && targetIsExternal;
    })
    .map(e => e.id);
}

/** Edge-blocking failure types: the failure severs specific request paths (a hop, or an entire
 *  resource's reachability) without making the target itself unhealthy - real AWS never marks a
 *  resource "down" because a Security Group/NACL/route/DNS/IAM policy denies one caller. */
function analyzeEdgeBlockingFailure(
  failure: Failure,
  nodes: Node<ServiceNodeData>[],
  edges: Edge<ConnectionData>[]
): FailureImpactAnalysis {
  const rEdges = requestEdges(edges);
  const isNat = failure.failureType === 'nat_failure';

  const blockedEdgeIds = isNat
    ? resolveNatFailureBlockedEdges(failure.targetResourceId, nodes, edges)
    : rEdges.filter(e => e.target === failure.targetResourceId).map(e => e.id);

  const directlyFailedNodeIds = isNat
    ? [failure.targetResourceId]
    : [...new Set(blockedEdgeIds.map(id => rEdges.find(e => e.id === id)!.target))];

  const blockedSet = new Set(blockedEdgeIds);
  const affectedTargetIds = new Set(blockedEdgeIds.map(id => rEdges.find(e => e.id === id)!.target));

  // Sources whose traffic was actually cut by one of the blocked edges - the direct casualties of
  // this specific failure, evaluated one at a time since each may lose a different target.
  const seedSources = [...new Set(blockedEdgeIds.map(id => rEdges.find(e => e.id === id)!.source))];

  const degradedNodeIds: string[] = [];
  const survivingSeedIds: string[] = [];
  const deadEndSeeds: string[] = [];
  const dependentImpacts: DependentImpact[] = [];
  const redundancyNotes: string[] = [];

  for (const sourceId of seedSources) {
    const sourceNode = findNode(nodes, sourceId);
    if (!sourceNode || sourceNode.type === 'boundaryNode') continue;

    const blockedTargetsForSource = [...new Set(
      blockedEdgeIds
        .map(id => rEdges.find(e => e.id === id)!)
        .filter(e => e.source === sourceId)
        .map(e => e.target)
    )];

    const redundancy = checkRedundancy(sourceNode, blockedTargetsForSource, affectedTargetIds, nodes, edges);
    redundancyNotes.push(`${sourceNode.data.label}: ${redundancy.note}`);

    if (redundancy.fullyCovered) {
      survivingSeedIds.push(sourceId);
      dependentImpacts.push({
        nodeId: sourceId, survived: true, cascaded: false,
        reason: redundancy.note, redundancyApplied: redundancy.mechanism
      });
      continue;
    }

    // Does this source retain any OTHER working outgoing path unrelated to this failure at all?
    const remainingOutgoing = getDownstreamTargets(sourceId, edges).filter(id => {
      if (blockedTargetsForSource.includes(id)) return false;
      const edgeExists = rEdges.find(e => e.source === sourceId && e.target === id && !blockedSet.has(e.id));
      if (!edgeExists) return false;
      const targetNode = findNode(nodes, id);
      return targetNode ? targetNode.data.health !== 'failed' : false;
    });

    if (remainingOutgoing.length > 0 || isNetworkInfraNode(sourceNode)) {
      degradedNodeIds.push(sourceId);
      dependentImpacts.push({ nodeId: sourceId, survived: remainingOutgoing.length > 0, cascaded: false, reason: redundancy.note });
      continue;
    }

    // No redundancy, and no other path at all - this application-tier node cannot do its job.
    deadEndSeeds.push(sourceId);
  }

  const cascade = runCascade(deadEndSeeds, nodes, edges);
  const allDegraded = [...new Set([...degradedNodeIds, ...cascade.degradedNodeIds])];
  const affectedNodeIds = [...new Set([
    ...directlyFailedNodeIds,
    ...deadEndSeeds,
    ...cascade.cascadingFailedNodeIds,
    ...allDegraded
  ])];

  return {
    failure: { ...failure, affectedDependencies: affectedNodeIds.filter(id => !directlyFailedNodeIds.includes(id)) },
    directlyFailedNodeIds,
    cascadingFailedNodeIds: [...deadEndSeeds, ...cascade.cascadingFailedNodeIds],
    degradedNodeIds: allDegraded,
    survivingNodeIds: [...survivingSeedIds, ...cascade.survivingNodeIds],
    affectedNodeIds,
    blockedEdgeIds,
    dependentImpacts: [...dependentImpacts, ...cascade.dependentImpacts],
    redundancyNotes: [...redundancyNotes, ...cascade.redundancyNotes],
    summary: buildSummary(failure, directlyFailedNodeIds, [...deadEndSeeds, ...cascade.cascadingFailedNodeIds], allDegraded, cascade.survivingNodeIds, nodes)
  };
}

function buildSummary(
  failure: Failure,
  directIds: string[],
  cascadingIds: string[],
  degradedIds: string[],
  survivingIds: string[],
  nodes: Node<ServiceNodeData>[]
): string {
  const label = (id: string) => findNode(nodes, id)?.data.label || id;
  const parts: string[] = [
    `${failure.failureType} on ${label(failure.targetResourceId)}: ${directIds.length} resource(s) directly failed.`
  ];
  if (cascadingIds.length > 0) {
    parts.push(`${cascadingIds.length} cascaded with no redundancy (${cascadingIds.map(label).join(', ')}).`);
  }
  if (degradedIds.length > 0) {
    parts.push(`${degradedIds.length} degraded but still functioning via an alternate path (${degradedIds.map(label).join(', ')}).`);
  }
  if (survivingIds.length > 0) {
    parts.push(`${survivingIds.length} dependent(s) fully survived via redundancy (${survivingIds.map(label).join(', ')}).`);
  }
  return parts.join(' ');
}

/**
 * Analyzes the concrete blast radius of one injected `Failure` against the architecture's real
 * dependency graph: which nodes are directly affected, who depends on them, whether redundancy
 * (Multi-AZ failover, cache fallback, target-group/sibling failover, an alternate NAT/route) saves
 * each dependent, and - only when it doesn't - which failures cascade further upstream. Never
 * marks every downstream resource failed by default; a node only fails because a specific,
 * checked mechanism says it has no other way to do its job.
 */
export function analyzeFailureImpact(
  nodes: Node<ServiceNodeData>[],
  edges: Edge<ConnectionData>[],
  failure: Failure
): FailureImpactAnalysis {
  return isEdgeBlockingFailureType(failure.failureType)
    ? analyzeEdgeBlockingFailure(failure, nodes, edges)
    : analyzeNodeHealthFailure(failure, nodes, edges);
}
