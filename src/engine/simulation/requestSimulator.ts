import { orderConnections, orderTargets, hasStepNumber } from './connectionOrder.ts';
import { checkConnection, hasConnectionContract } from '../architecture/connectionContracts.ts';
import { resolveRequestStart } from './requestStart.ts';
import { isDedicatedModel } from '../service/registry.ts';
import { evaluateApplicationHop } from './applicationHop.ts';
import { validateNetworkIdentities } from '../architecture/networkIdentity.ts';
import { deriveSubnetForNode } from '../layout/containment.ts';
import { carriesRequest, isDependencyCall } from '../architecture/relationships.ts';
import type { Node, Edge } from '@xyflow/react';
import type { ServiceNodeData, ConnectionData, SimulationScenario, SimulationResult } from '../../types/index.ts';
import { checkCustomNaclReturn } from './networkFirewalls.ts';
import { SimulationTrace, SIMULATION_PIPELINE } from './adapters/index.ts';
import type { AdapterContext } from './adapters/index.ts';

/**
 * Traces one request through the architecture graph, hop by hop, until it terminates
 * (success or failure). Each hop runs the ordered `SIMULATION_PIPELINE` of behavior adapters
 * (WAF inspection, auto-scaling, NAT translation, CloudFront caching, load-balancer routing,
 * data-tier interaction, VPC endpoint routing, and the generic network-path/firewall
 * resolution) - see `src/engine/simulation/adapters/` for each one. This function itself only
 * owns start-node resolution, the loop/cycle guard, the two structural per-hop checks that apply
 * before any adapter runs (node health, subnet placement), and the post-loop stateless-NACL
 * return check and response-journey step, none of which are service-specific.
 */
export function runSimulation(
  nodes: Node<ServiceNodeData>[],
  edges: Edge<ConnectionData>[],
  scenario: SimulationScenario,
  options: { enforceIam?: boolean; legacyCapacity?: boolean } = {}
): SimulationResult {
  const identityIssues = validateNetworkIdentities(nodes);
  if (identityIssues.length) return {
    scenario, steps: [], success: false, totalLatencyMs: 0, statusCode: 400,
    summary: `Invalid network identity: ${identityIssues.map(issue => issue.problem).join(' ')}`,
    bottlenecksDetected: [], path: [], cascadeOccurred: false
  };
  nodes = nodes.map(node => node.data.networkIdentity?.subnetId !== undefined
    ? { ...node, data: { ...node.data, subnet: deriveSubnetForNode(node, nodes) } } : node);
  const trace = new SimulationTrace();

  const boundaryNodes = nodes.filter(n => n.type === 'boundaryNode');

  const startNode = resolveRequestStart(nodes, scenario.startNodeId, !options.enforceIam);
  if (!startNode && options.enforceIam && scenario.startNodeId) return {
    scenario, steps: [], success: false, totalLatencyMs: 0, statusCode: 400,
    summary: `Request start resource "${scenario.startNodeId}" is missing or is not executable. Select a service entry point.`,
    bottlenecksDetected: [], path: [], cascadeOccurred: false
  };

  if (!startNode) {
    return {
      scenario,
      steps: [],
      success: false,
      totalLatencyMs: 0,
      statusCode: 400,
      summary: 'Canvas has no active AWS services. Add services and connect them to simulate requests.',
      bottlenecksDetected: [],
      path: [],
      cascadeOccurred: false
    };
  }

  // Traversal tracker
  const visited = new Set<string>();
  // Hop budget guards against routing cycles. Counting unique visited nodes is not
  // enough: a cycle such as A -> B -> A never grows `visited`, so it would spin forever.
  const MAX_HOPS = 40;
  let hops = 0;
  let currentNode = startNode;
  // The actual ordered sequence of nodes this specific request traversed. Post-loop checks that
  // need "the compute node" or "the database" on THIS run must search this, not the full node
  // list - a canvas can have several compute/DB nodes, and only the ones this request actually
  // hit are relevant to a check about this request's return path.
  const path: Node<ServiceNodeData>[] = [startNode];

  // Step 1: User initiated request
  trace.pushStep({
    sourceNodeId: 'client-env',
    targetNodeId: currentNode.id,
    sourceNodeName: 'Client Application',
    targetNodeName: currentNode.data.label,
    protocol: 'HTTPS',
    action: `Issued ${scenario.method} ${scenario.path}`,
    status: 'success',
    explanation: `Client initiated ${scenario.method} ${scenario.path} under ${scenario.trafficLevel.toUpperCase()} traffic load.`,
    targetHealth: currentNode.data.health,
    latencyMs: 5
  });
  trace.advanceTime(5);

  // All forwarding and child-call adapters share the same gate and may provide their own
  // evidence sink. The selected connection preserves action/port identity.
  const pushFirewallBlockIfAny = (source: Node<ServiceNodeData>, target: Node<ServiceNodeData>, protocol: string, hopTrace = trace, connection?: Edge<ConnectionData>): boolean =>
    evaluateApplicationHop({ source, target, protocol, nodes, path, enforceIam: options.enforceIam,
      trace: hopTrace, connection: connection ?? edges.find(edge => edge.source === source.id && edge.target === target.id) });

  while (currentNode) {
    if (++hops > MAX_HOPS) {
      trace.pushStep({
        sourceNodeId: currentNode.id,
        targetNodeId: currentNode.id,
        sourceNodeName: currentNode.data.label,
        targetNodeName: currentNode.data.label,
        protocol: 'HTTP',
        action: 'Routing Loop Detected',
        status: 'failed',
        explanation: `Loop detected: Request traversed more than ${MAX_HOPS} hops without reaching a terminal service. Check your connections for a cycle (for example A -> B -> A).`,
        targetHealth: 'failed',
        latencyMs: 10,
        details: { statusCode: 508, failureReason: 'Infinite loop in architecture routing.' }
      });
      trace.fail(508, 'Routing loop detected in architecture.');
      break;
    }

    visited.add(currentNode.id);

    // Catalog presence is not request coverage. Preserve existing explicit interaction
    // contracts (including Amplify's frontend abstraction) and the bounded App Runner adapter.
    if (options.enforceIam && !isDedicatedModel(currentNode.data.serviceId)
        && !hasConnectionContract(currentNode.data.serviceId) && currentNode.data.serviceId !== 'app_runner') {
      const reason = `Behavior not modeled for ${currentNode.data.serviceId}: catalog metadata and health alone do not establish request execution.`;
      trace.pushStep({ sourceNodeId: currentNode.id, targetNodeId: currentNode.id,
        sourceNodeName: currentNode.data.label, targetNodeName: currentNode.data.label,
        protocol: 'HTTP', action: 'Unsupported service execution', status: 'failed',
        explanation: reason, targetHealth: currentNode.data.health, latencyMs: 0 });
      trace.fail(501, reason); break;
    }

    // Check if current node is failed
    if (currentNode.data.health === 'failed') {
      const failReason = currentNode.data.failureReason || `${currentNode.data.label} is offline / unresponsive.`;
      trace.pushStep({
        sourceNodeId: currentNode.id,
        targetNodeId: currentNode.id,
        sourceNodeName: currentNode.data.label,
        targetNodeName: currentNode.data.label,
        protocol: 'HTTP',
        action: 'Service Down Failure',
        status: 'failed',
        explanation: `FAILED: Request halted at ${currentNode.data.label}. Reason: ${failReason}`,
        targetHealth: 'failed',
        latencyMs: 100,
        details: {
          statusCode: 503,
          failureReason: failReason
        }
      });
      trace.fail(503, `Request failed at ${currentNode.data.label}: Node is marked as FAILED.`);
      break;
    }

    // Check current node's actual canvas placement. A node's `subnet` is derived live from
    // whichever Public/Private subnet boundary it geometrically sits inside (see
    // engine/layout/containment.ts) - 'unassigned' means it is not inside any subnet at all,
    // which AWS would never allow for a resource that requires an ENI in a subnet.
    if (currentNode.data.subnet === 'unassigned') {
      trace.pushStep({
        sourceNodeId: currentNode.id,
        targetNodeId: currentNode.id,
        sourceNodeName: currentNode.data.label,
        targetNodeName: currentNode.data.label,
        protocol: 'TCP',
        action: 'Invalid Placement: Not Inside Any Subnet',
        status: 'failed',
        explanation: `ARCHITECTURE ERROR: ${currentNode.data.label} is not placed inside any Public or Private subnet boundary on the canvas. Every VPC-hosted resource must have its network interface in exactly one subnet - drag it into a subnet box to make it reachable.`,
        targetHealth: 'failed',
        latencyMs: 0,
        details: {
          statusCode: 400,
          failureReason: `${currentNode.data.label} is not geometrically placed inside a subnet boundary.`
        }
      });
      trace.fail(400, `Request failed: ${currentNode.data.label} is not placed inside any VPC subnet.`);
      break;
    }

    // Find outgoing edges (excluding return signal lines which represent response journeys),
    // and the downstream service nodes they resolve to (boundary containers excluded) - computed
    // once per hop, before running the pipeline, since several adapters need them and none of
    // the adapters that run earlier in the pipeline depend on or mutate them.
    const sourceEdges = orderConnections(edges.filter(e => e.source === currentNode!.id && (e.data as any)?.signalType !== 'outbound_response'));
    const outgoingEdges = sourceEdges.filter(e => carriesRequest(e.data));
    const dependencyEdges = sourceEdges.filter(e => isDependencyCall(e.data));
    const invalid = outgoingEdges.map(edge => ({ edge, result: checkConnection(currentNode, nodes.find(n => n.id === edge.target), edge.data) })).find(item => item.result.status !== 'valid');
    if (invalid && options.enforceIam) {
      trace.pushStep({ sourceNodeId: currentNode.id, targetNodeId: invalid.edge.target,
        sourceNodeName: currentNode.data.label, targetNodeName: nodes.find(n => n.id === invalid.edge.target)?.data.label ?? invalid.edge.target,
        protocol: invalid.edge.data?.protocol ?? 'TCP', action: 'Invalid connection', status: 'failed',
        explanation: invalid.result.reason, targetHealth: 'failed', latencyMs: 0 });
      trace.fail(invalid.result.status === 'unknown' ? 501 : 400, invalid.result.reason); break;
    }
    const downstreamNodeIds = outgoingEdges.map(e => e.target);
    const downstreamNodes = orderTargets(nodes.filter(n => downstreamNodeIds.includes(n.id) && n.type !== 'boundaryNode' && (n.data as any)?.serviceId), outgoingEdges);

    const ctx: AdapterContext = {
      trace,
      nodes,
      node: currentNode,
      outgoingEdges,
      dependencyEdges,
      allEdges: orderConnections(edges),
      orderedConnections: outgoingEdges.some(hasStepNumber),
      downstreamNodes,
      visited,
      scenario,
      enforceIam: options.enforceIam,
      legacyCapacity: options.legacyCapacity,
      pushFirewallBlockIfAny
    };

    let advancedTo: Node<ServiceNodeData> | null = null;
    let terminated = false;

    for (const adapter of SIMULATION_PIPELINE) {
      const signal = adapter(ctx);
      if (signal.type === 'terminate') {
        terminated = true;
        break;
      }
      if (signal.type === 'advance') {
        advancedTo = signal.nextNode;
        break;
      }
      // 'continue' - fall through to the next adapter in the pipeline for this same hop.
    }

    if (terminated) {
      break;
    }

    // networkPathAdapter (always last in the pipeline) always terminates or advances, so
    // `advancedTo` is always set here - but guard defensively rather than assume.
    if (!advancedTo) {
      break;
    }

    currentNode = advancedTo;
    path.push(currentNode);
  }

  // Evaluate stateless NACL return journey (e.g. Database response returning to Web Server).
  // Both nodes are looked up on `path` - the sequence THIS request actually traversed - not the
  // full canvas. A diagram can contain several compute nodes or several databases; only the ones
  // this specific run actually hit are the correct pair to check the return leg for.
  if (trace.overallSuccess) {
    const webComputeNode = path.find(n => ['ec2', 'ecs', 'lambda', 'fargate'].includes(n.data.serviceId)) || startNode;
    const dbNode = path.find(n => ['rds', 'aurora', 'dynamodb'].includes(n.data.serviceId));

    if (webComputeNode && dbNode) {
      const returnCheck = checkCustomNaclReturn(webComputeNode, dbNode, boundaryNodes);
      if (returnCheck.evaluated) {
        if (returnCheck.blocked) {
          trace.pushStep({
            timestampMs: trace.currentTimestamp + 15,
            sourceNodeId: dbNode.id,
            targetNodeId: webComputeNode.id,
            sourceNodeName: dbNode.data.label,
            targetNodeName: webComputeNode.data.label,
            protocol: 'TCP',
            action: 'Stateless Return Blocked: Missing Ephemeral Rule',
            status: 'failed',
            explanation: `PACKET DROPPED (STATELESS BLOCK): ${returnCheck.note}`,
            targetHealth: 'failed',
            latencyMs: 30000,
            details: {
              statusCode: 504,
              failureReason: returnCheck.note
            }
          });
          trace.fail(504, `Connection Timeout (504): ${returnCheck.boundaryLabel} dropped response packet on client ephemeral ports.`);
          // The step itself reports a 30s latencyMs (a real stateless-NACL timeout), so the
          // client-visible total must account for it - not just whatever hop latency had
          // already accumulated before this post-loop check ran.
          trace.advanceTime(30000);
        } else {
          trace.pushStep({
            timestampMs: trace.currentTimestamp + 10,
            sourceNodeId: dbNode.id,
            targetNodeId: webComputeNode.id,
            sourceNodeName: dbNode.data.label,
            targetNodeName: webComputeNode.data.label,
            protocol: 'TCP',
            action: 'Stateless Return Allowed: Ephemeral Rule Present',
            status: 'success',
            explanation: returnCheck.note!,
            targetHealth: 'healthy',
            latencyMs: 10
          });
          trace.advanceTime(10);
        }
      }
    }
  }

  // Response journey step if request was successful
  if (trace.overallSuccess && trace.steps.length > 1) {
    trace.pushStep({
      timestampMs: trace.currentTimestamp + 15,
      sourceNodeId: currentNode ? currentNode.id : 'backend',
      targetNodeId: startNode.id,
      sourceNodeName: currentNode ? currentNode.data.label : 'Origin Backend',
      targetNodeName: startNode.data.label,
      protocol: 'HTTPS',
      action: `HTTP ${trace.finalStatusCode} Response Delivered`,
      status: 'success',
      explanation: `Full roundtrip complete. Client received HTTP ${trace.finalStatusCode} in ${trace.currentTimestamp + 15}ms.`,
      targetHealth: 'healthy',
      latencyMs: 15,
      details: { statusCode: trace.finalStatusCode }
    });
  }

  return {
    scenario,
    serviceStates: trace.serviceStates,
    steps: trace.steps,
    success: trace.overallSuccess,
    totalLatencyMs: trace.currentTimestamp + (trace.overallSuccess ? 15 : 0),
    statusCode: trace.finalStatusCode,
    summary: trace.finalSummary,
    bottlenecksDetected: trace.bottlenecksDetected,
    cascadeOccurred: trace.cascadeOccurred,
    path: path.map(n => n.id)
  };
}
