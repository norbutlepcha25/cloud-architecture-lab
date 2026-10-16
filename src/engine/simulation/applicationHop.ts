import type { Node, Edge } from '@xyflow/react';
import type { ServiceNodeData, ConnectionData } from '../../types/index.ts';
import { evaluateLiveRoute } from '../network/liveRouting.ts';
import { checkNetworkFirewalls } from './networkFirewalls.ts';
import { authorizeApplicationHop } from '../iam/applicationHop.ts';
import { IAM_CALLER_SERVICE_IDS, IAM_AUTHENTICATED_ACTIONS } from '../capability/iamCoverage.ts';
import type { SimulationTrace } from './adapters/types.ts';

interface ApplicationHopInput {
  source: Node<ServiceNodeData>;
  target: Node<ServiceNodeData>;
  protocol: string;
  nodes: Node<ServiceNodeData>[];
  path: Node<ServiceNodeData>[];
  enforceIam?: boolean;
  trace: SimulationTrace;
  connection?: Edge<ConnectionData>;
}

/** Shared live route/inbound-firewall/IAM gate. False means no configured gate blocked;
 * it does not certify unmodeled network controls. Callers supply the evidence sink so an
 * optional child operation cannot overwrite the parent verdict. */
export function evaluateApplicationHop({ source, target, protocol, nodes, path, enforceIam, trace, connection }: ApplicationHopInput): boolean {
  const boundaryNodes = nodes.filter(node => node.type === 'boundaryNode');
  const edge = connection;
  const routing = evaluateLiveRoute(source, target, nodes);
  if (routing.outcome !== 'legacy') {
    const allowed = routing.outcome === 'allowed';
    trace.pushStep({ sourceNodeId: source.id, targetNodeId: target.id,
      sourceNodeName: source.data.label, targetNodeName: target.data.label,
      protocol: protocol as any, action: `Route evaluation: ${routing.outcome}`,
      status: allowed ? 'success' : 'failed', explanation: routing.reason,
      targetHealth: target.data.health, latencyMs: 0 });
    if (!allowed) {
      trace.fail(routing.outcome === 'unsupported' ? 501 : routing.outcome === 'invalid' ? 400 : 504, routing.reason);
      return true;
    }
  }
  const firewall = checkNetworkFirewalls(protocol, target, boundaryNodes, source, { destinationPort: edge?.data?.destinationPort });

  for (const layer of [
    { name: 'Network ACL' as const, result: firewall.nacl },
    { name: 'Security Group' as const, result: firewall.securityGroup }
  ]) {
    if (!layer.result.evaluated) continue;
    const packetContext = { sourceIp: source.data.networkIdentity?.privateIp ?? 'UNKNOWN', destinationPort: edge?.data?.destinationPort ?? 'UNSPECIFIED', protocol };
    const reason = `${layer.result.note} Packet context: source ${packetContext.sourceIp}, destination port ${packetContext.destinationPort}.`;

    trace.pushStep({
      sourceNodeId: source.id,
      targetNodeId: target.id,
      sourceNodeName: source.data.label,
      targetNodeName: target.data.label,
      protocol: protocol as any,
      action: layer.result.blocked ? `${layer.name} Blocked Traffic` : `${layer.name}: Traffic Allowed`,
      status: layer.result.blocked ? 'failed' : 'success',
      explanation: layer.result.blocked ? `PACKET BLOCKED: ${reason}` : reason,
      targetHealth: layer.result.blocked ? 'failed' : target.data.health,
      latencyMs: layer.result.blocked ? 5 : 2,
      details: { statusCode: layer.result.blocked ? 403 : undefined, failureReason: layer.result.blocked ? reason : undefined,
        decision: { order: trace.steps.length + 1, component: layer.name === 'Network ACL' ? 'NACL' : 'Security Group',
          resource: layer.result.boundaryLabel ?? target.data.label, operation: 'evaluate-inbound-firewall',
          input: packetContext, decision: layer.result.blocked ? 'DENY' : 'ALLOW', reason, simpleExplanation: reason,
          awsRule: layer.name === 'Network ACL'
            ? 'NACL inbound rules evaluate protocol, port and source CIDR in rule-number order. https://docs.aws.amazon.com/vpc/latest/userguide/nacl-rules.html'
            : 'Security group inbound rules allow matching protocol, port and source. https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html',
          metadata: { coverage: 'inbound-only', addressEvaluated: packetContext.sourceIp !== 'UNKNOWN', portEvaluated: packetContext.destinationPort !== 'UNSPECIFIED' }
        } }
    });

    if (layer.result.blocked) {
      trace.fail(403, `Request blocked by ${layer.name} on ${layer.result.boundaryLabel}: ${target.data.label} never received the ${protocol} request.`);
      return true;
    }

    trace.advanceTime(2);
  }

  if (enforceIam && IAM_AUTHENTICATED_ACTIONS[target.data.serviceId]) {
    // Preserve the application identity through transparent NAT/endpoint hops.
    const caller = IAM_CALLER_SERVICE_IDS.includes(source.data.serviceId) ? source
      : [...path].reverse().find(n => IAM_CALLER_SERVICE_IDS.includes(n.data.serviceId));
    if (caller) {
      const decision = authorizeApplicationHop(caller, target, protocol, edge?.data?.action as string | undefined);
      trace.pushStep({ sourceNodeId: source.id, targetNodeId: target.id,
        sourceNodeName: source.data.label, targetNodeName: target.data.label,
        protocol: protocol as any, action: 'IAM authorization',
        status: decision.decision === 'DENY' ? 'failed' : 'success',
        explanation: decision.reason, targetHealth: target.data.health, latencyMs: 0,
        details: { decision, statusCode: decision.decision === 'DENY' ? 403 : undefined } });
      if (decision.decision === 'DENY') { trace.fail(403, decision.reason); return true; }
    }
  }
  return false;

}
