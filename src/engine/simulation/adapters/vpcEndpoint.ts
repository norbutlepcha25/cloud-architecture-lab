import type { AdapterContext, AdapterSignal } from './types.ts';
import { CONTINUE, TERMINATE, advanceTo } from './types.ts';

import { evaluateEndpoint, isVpcEndpoint } from '../../network/vpcEndpoint.ts';
import { evaluateGatewayEndpointAssociation } from '../../network/subnetRouting.ts';

const ENDPOINT_SERVICE_IDS = ['s3_gateway_endpoint', 'privatelink'];

/**
 * Explicit VPC Endpoint hop: a private-subnet resource wired directly to a Gateway/Interface
 * Endpoint node on the canvas (rather than straight to S3/DynamoDB), the architecturally correct
 * way to draw it.
 */
export const vpcEndpointAdapter = (ctx: AdapterContext): AdapterSignal => {
  const { trace, node, downstreamNodes, pushFirewallBlockIfAny } = ctx;

  // Validate endpoint egress before generic forwarding can treat it as a router.
  if (isVpcEndpoint(node.data)) {
    const destination = downstreamNodes.find(candidate => !ctx.visited.has(candidate.id)) || downstreamNodes[0];
    if (!destination) return CONTINUE;
    const decision = evaluateEndpoint(node.data, destination.data.serviceId);
    if (!decision.allowed) {
      trace.pushStep({ sourceNodeId: node.id, targetNodeId: destination.id,
        sourceNodeName: node.data.label, targetNodeName: destination.data.label,
        protocol: 'HTTPS', action: 'VPC endpoint service validation', status: 'failed',
        explanation: decision.reason, targetHealth: destination.data.health, latencyMs: 0 });
      trace.fail(400, decision.reason);
      return TERMINATE;
    }
  }

  const endpointTarget = downstreamNodes.find(n => ENDPOINT_SERVICE_IDS.includes(n.data.serviceId));
  const sourceIsPrivate = node.data.subnet === 'private' || node.data.subnet === 'isolated';

  if (!endpointTarget || !sourceIsPrivate || (ctx.orderedConnections && endpointTarget.id !== downstreamNodes[0]?.id)) {
    return CONTINUE;
  }

  const isGatewayEndpoint = endpointTarget.data.serviceId === 's3_gateway_endpoint';

  // With an explicit route table, a gateway endpoint is reachable only from subnets whose route
  // table is associated with it (that association is what adds the prefix-list route).
  if (isGatewayEndpoint) {
    const association = evaluateGatewayEndpointAssociation(node, endpointTarget, ctx.nodes, { assume: ctx.scenario.assumeRouteTables });
    if (association.outcome !== 'legacy' && association.outcome !== 'allowed') {
      trace.pushStep({ sourceNodeId: node.id, targetNodeId: endpointTarget.id,
        sourceNodeName: node.data.label, targetNodeName: endpointTarget.data.label,
        protocol: 'HTTPS', action: 'Route table: gateway endpoint not associated', status: 'failed',
        explanation: association.reason, targetHealth: endpointTarget.data.health, latencyMs: 0,
        details: { statusCode: association.outcome === 'invalid' ? 400 : 504, failureReason: association.reason } });
      trace.fail(association.outcome === 'invalid' ? 400 : 504, association.reason);
      return TERMINATE;
    }
  }

  // A Gateway VPC Endpoint has no ENI at all (a route-table/prefix-list construct) - nothing for
  // a Security Group to attach to, so no firewall check applies. An Interface VPC Endpoint
  // (privatelink) IS ENI-based and is subject to Security Groups exactly like any other
  // ENI-backed resource, same as real AWS PrivateLink.
  if (!isGatewayEndpoint && pushFirewallBlockIfAny(node, endpointTarget, 'HTTPS')) {
    return TERMINATE;
  }

  trace.pushStep({
    sourceNodeId: node.id,
    targetNodeId: endpointTarget.id,
    sourceNodeName: node.data.label,
    targetNodeName: endpointTarget.data.label,
    protocol: 'HTTPS',
    action: isGatewayEndpoint ? 'AWS VPC Gateway Endpoint Route' : 'AWS VPC Interface Endpoint Route',
    status: 'success',
    explanation: `${node.data.label} in a private subnet routed directly to ${endpointTarget.data.label} over the AWS private backbone. Zero internet exposure, and no NAT Gateway data-processing charges.`,
    targetHealth: endpointTarget.data.health,
    latencyMs: 4
  });
  trace.advanceTime(4);
  return advanceTo(endpointTarget);
};
