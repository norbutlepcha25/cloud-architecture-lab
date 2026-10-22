import type { AdapterContext, AdapterSignal } from './types.ts';
import { TERMINATE, advanceTo } from './types.ts';
import { evaluateEndpoint } from '../../network/vpcEndpoint.ts';
import { resolveNatEgress } from '../../network/nat.ts';
import { eksConfiguration } from '../../service/models/eks.ts';
import { evaluateInternetEgress, evaluateInternetIngress, isIgwDetached, type RoutingDecision, routingOptions } from '../../network/subnetRouting.ts';
import { findContainingSubnetBoundary } from '../../layout/containment.ts';
import { isExternalActor, isExternalTarget as reachableExternalActor } from '../../architecture/externalActors.ts';

const VPC_HOSTED_INGRESS_SERVICE_IDS = ['alb', 'nlb', 'api_gateway', 'app_runner', 'ec2', 'ecs', 'fargate'];
const INGRESS_PROXY_SERVICE_IDS = ['alb', 'nlb', 'api_gateway', 'cloudfront'];
const MANAGED_EVENT_TARGET_SERVICE_IDS = ['lambda', 'sns', 'sqs', 'eventbridge', 'step_functions'];
const ENDPOINT_SERVICE_IDS = ['privatelink', 's3_gateway_endpoint'];

/** Records a route-table decision; returns true when it stopped the request. */
function recordRoute(ctx: AdapterContext, from: { id: string; data: any }, to: { id: string; data: any }, decision: RoutingDecision, action: string): boolean {
  const { trace, nodes } = ctx;
  const hop = decision.hopNodeId ? nodes.find(n => n.id === decision.hopNodeId) : undefined;
  const allowed = decision.outcome === 'allowed';
  const status = decision.outcome === 'invalid' ? 400 : decision.privateSubnet ? 403 : 504;
  trace.pushStep({
    sourceNodeId: from.id, targetNodeId: (hop ?? to).id,
    sourceNodeName: from.data.label, targetNodeName: (hop ?? to).data.label,
    protocol: 'TCP', action: allowed ? action : `${action}: no route`,
    status: allowed ? 'success' : 'failed', explanation: decision.reason,
    targetHealth: allowed ? (hop ?? to).data.health : 'failed', latencyMs: allowed ? 2 : 10,
    details: allowed ? undefined : { statusCode: status, failureReason: decision.reason,
      decision: { order: 1, component: 'Route', resource: decision.routeTableId ?? 'N/A', operation: 'evaluate-route',
        input: { action }, decision: 'DENY', reason: decision.reason, simpleExplanation: decision.reason,
        awsRule: 'Traffic leaves or enters a subnet only through routes in its associated route table (longest prefix match). https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Route_Tables.html',
        metadata: { routeTableId: decision.routeTableId } } }
  });
  if (allowed) { trace.advanceTime(2); return false; }
  trace.fail(status, decision.reason);
  return true;
}

/**
 * The generic hop-resolution path: picks the next node, then walks through every structural
 * network-boundary check real AWS would apply between two arbitrary nodes (IGW attachment,
 * managed event-trigger delivery, direct-public-to-private-subnet blocking, private-subnet
 * egress via NAT/VPC-endpoint), then the shared NACL/Security-Group check, then finally forwards
 * the request. Always terminates or advances - this is the final adapter in the pipeline and the
 * catch-all for any hop none of the more specific adapters intercepted.
 */
export const networkPathAdapter = (ctx: AdapterContext): AdapterSignal => {
  const { trace, node, nodes, outgoingEdges, downstreamNodes, visited, pushFirewallBlockIfAny } = ctx;

  const nextNode = downstreamNodes.find(n => !visited.has(n.id)) || downstreamNodes[0];

  if (!nextNode) {
    trace.pushStep({
      sourceNodeId: node.id,
      targetNodeId: node.id,
      sourceNodeName: node.data.label,
      targetNodeName: node.data.label,
      protocol: 'HTTP',
      action: 'Unresolved Downstream Connection',
      status: 'failed',
      explanation: `DEAD END: ${node.data.label} has ${outgoingEdges.length} outgoing connection(s), but none of them lead to an AWS service. Connections drawn to boundary containers (VPC, subnet, Availability Zone) are visual grouping only and cannot carry traffic. Connect ${node.data.label} directly to the downstream service.`,
      targetHealth: 'failed',
      latencyMs: 10,
      details: {
        statusCode: 502,
        failureReason: 'Outgoing connection does not resolve to an AWS service node.'
      }
    });
    trace.fail(502, `Request stopped at ${node.data.label}: its outgoing connection does not lead to an AWS service.`);
    return TERMINATE;
  }

  const edge = outgoingEdges.find(e => e.target === nextNode.id);
  const protocol = edge?.data?.protocol || 'HTTP';

  // A Kubernetes ClusterIP does not become internet-facing by drawing a connection.
  if (isExternalActor(node.data.serviceId) && nextNode.data.serviceId === 'eks'
      && eksConfiguration(nextNode.data).serviceType === 'ClusterIP') {
    const reason = 'Kubernetes ClusterIP is an internal Service endpoint. Use a separately configured ingress or load balancer for external application traffic.';
    trace.pushStep({ sourceNodeId: node.id, targetNodeId: nextNode.id, sourceNodeName: node.data.label,
      targetNodeName: nextNode.data.label, protocol, action: 'ClusterIP external access denied',
      status: 'failed', explanation: reason, targetHealth: nextNode.data.health, latencyMs: 0,
      details: { statusCode: 503 } });
    trace.fail(503, reason); return TERMINATE;
  }


  // Explicit VPC origins require their configured origin and an attached IGW. The IGW
  // is a prerequisite, not a transit hop for CloudFront's private origin connection.
  if (node.data.serviceId === 'cloudfront' && node.data.customConfig?.vpcOriginId) {
    const valid = node.data.customConfig.vpcOriginId === nextNode.id &&
      nextNode.data.customConfig?.scheme === 'internal' &&
      (nodes.some(n => n.data.serviceId === 'internet_gateway' && !isIgwDetached(n))
        || (ctx.scenario.assumeGateways === true && !nodes.some(n => n.data.serviceId === 'internet_gateway')));
    trace.pushStep({ sourceNodeId: node.id, targetNodeId: nextNode.id,
      sourceNodeName: node.data.label, targetNodeName: nextNode.data.label,
      protocol: 'HTTPS', action: 'CloudFront VPC origin prerequisites',
      status: valid ? 'success' : 'failed', targetHealth: nextNode.data.health, latencyMs: 0,
      explanation: valid ? 'Configured internal origin and Internet Gateway prerequisite found. Origin traffic uses a private connection, not the Internet Gateway. Service-managed ENI provisioning is not simulated.' : 'Configured VPC origin must match the internal target and requires an Internet Gateway in the architecture.',
      details: { statusCode: valid ? undefined : 400 } });
    if (!valid) { trace.fail(400, 'CloudFront VPC origin configuration is incomplete.'); return TERMINATE; }
  }

  // 7A: VPC Internet Gateway Attachment Check. A resource sitting in a "public" subnet
  // (ALB/NLB/EC2/ECS/Fargate/API Gateway) is only actually reachable from outside the VPC once
  // an Internet Gateway is attached and a public route table sends 0.0.0.0/0 to it.
  // Fully-managed edge/serverless services (CloudFront, Route 53, Cognito, AppSync, Lambda, S3,
  // DynamoDB, ...) are reached over the AWS backbone and never touch a customer-owned IGW, so
  // they are intentionally excluded here.
  const isPublicOrigin = isExternalActor(node.data.serviceId) || node.data.subnet === 'global';
  const isVpcHostedPublicTarget = nextNode.data.subnet === 'public' && VPC_HOSTED_INGRESS_SERVICE_IDS.includes(nextNode.data.serviceId);

  // Route-table driven ingress when the target's subnet has an explicit route table.
  const inSubnet = Boolean(findContainingSubnetBoundary(nextNode, nodes));
  // Internet clients always; AWS-managed origins only toward public subnets (an internal target
  // reached through a CloudFront VPC origin or similar private integration does not use the IGW).
  const isInternetClient = isExternalActor(node.data.serviceId);
  const privateOrigin = node.data.serviceId === 'cloudfront' && node.data.customConfig?.vpcOriginId === nextNode.id;
  const ingress = inSubnet && !privateOrigin && VPC_HOSTED_INGRESS_SERVICE_IDS.includes(nextNode.data.serviceId)
    && (isInternetClient || (isPublicOrigin && nextNode.data.subnet === 'public'))
    ? evaluateInternetIngress(nextNode, nodes, routingOptions(ctx.scenario)) : undefined;
  const explicitIngress = ingress && ingress.outcome !== 'legacy';
  if (explicitIngress && recordRoute(ctx, node, nextNode, ingress!, 'Route table: internet gateway')) return TERMINATE;

  if (!explicitIngress && isPublicOrigin && isVpcHostedPublicTarget) {
    const igw = nodes.find(n => n.data.serviceId === 'internet_gateway' && !isIgwDetached(n));
    const assumedIgw = !igw && ctx.scenario.assumeGateways === true && !nodes.some(n => n.data.serviceId === 'internet_gateway');

    if (assumedIgw) {
      trace.pushStep({ sourceNodeId: node.id, targetNodeId: nextNode.id, sourceNodeName: node.data.label,
        targetNodeName: nextNode.data.label, protocol: 'TCP', action: 'Internet gateway (assumed)', status: 'success',
        explanation: `Assumed gateways is on: no internet gateway is drawn, so the VPC is treated as having one attached. ${nextNode.data.label} is reached through its public address. Draw an internet gateway to model attachment or failure.`,
        targetHealth: nextNode.data.health, latencyMs: 2 });
      trace.advanceTime(2);
    } else if (!igw) {
      trace.pushStep({
        sourceNodeId: node.id,
        targetNodeId: nextNode.id,
        sourceNodeName: node.data.label,
        targetNodeName: nextNode.data.label,
        protocol: 'TCP',
        action: 'VPC Unreachable: No Internet Gateway Attached',
        status: 'failed',
        explanation: `NO ROUTE TO HOST: The VPC has no Internet Gateway attached. ${nextNode.data.label} sits in a public subnet with a public IP, but without an IGW there is no route between the VPC and the internet at all - public route tables have nowhere to send 0.0.0.0/0 traffic. Add an Internet Gateway to the VPC.`,
        targetHealth: 'failed',
        latencyMs: 10,
        details: {
          statusCode: 504,
          failureReason: 'VPC has no Internet Gateway attached; public subnets are unreachable from the internet.'
        }
      });
      trace.fail(504, `Request failed: VPC has no Internet Gateway attached, so ${nextNode.data.label} cannot be reached from outside the VPC.`);
      trace.addBottleneck('VPC has no Internet Gateway: public subnets are unreachable from the internet.');
      return TERMINATE;
    }

    if (igw && igw.data.health === 'failed') {
      trace.pushStep({
        sourceNodeId: node.id,
        targetNodeId: igw.id,
        sourceNodeName: node.data.label,
        targetNodeName: igw.data.label,
        protocol: 'TCP',
        action: 'Internet Gateway Outage',
        status: 'failed',
        explanation: `Internet Gateway [${igw.data.label}] is marked failed, so ${nextNode.data.label} is unreachable from the internet. Teaching scenario: AWS internet gateways are horizontally scaled and highly available, and AWS documents no outage mode.`,
        targetHealth: 'failed',
        latencyMs: 10,
        details: {
          statusCode: 504,
          failureReason: 'Internet Gateway is failed.'
        }
      });
      trace.fail(504, `Request failed: Internet Gateway ${igw.data.label} is offline.`);
      return TERMINATE;
    }
  }

  // 7B setup + managed event trigger
  const isPrivateTarget = nextNode.data.subnet === 'private' || nextNode.data.subnet === 'isolated';
  const isIngressProxy = INGRESS_PROXY_SERVICE_IDS.includes(nextNode.data.serviceId);
  const isManagedEventTrigger = protocol === 'Event' && MANAGED_EVENT_TARGET_SERVICE_IDS.includes(nextNode.data.serviceId);

  if (isManagedEventTrigger) {
    const isFailed = nextNode.data.health === 'failed';
    trace.pushStep({
      sourceNodeId: node.id,
      targetNodeId: nextNode.id,
      sourceNodeName: node.data.label,
      targetNodeName: nextNode.data.label,
      protocol: 'Event',
      action: 'S3 Event Notification: Trigger Lambda Execution',
      status: isFailed ? 'failed' : 'success',
      explanation: `${node.data.label} emitted an asynchronous s3:ObjectCreated event triggering ${nextNode.data.label} over the AWS event control plane. Lambda dynamically provisions execution context within the private VPC subnet.`,
      targetHealth: nextNode.data.health,
      latencyMs: 35
    });
    trace.advanceTime(35);
    if (isFailed) {
      trace.fail(500, `Request failed: ${nextNode.data.label} is failed and could not process the event notification.`);
      return TERMINATE;
    }
    return advanceTo(nextNode);
  }

  // 7B: Direct Public Ingress into Private Subnet Check
  if (!explicitIngress && isPublicOrigin && isPrivateTarget && !isIngressProxy) {
    trace.pushStep({
      sourceNodeId: node.id,
      targetNodeId: nextNode.id,
      sourceNodeName: node.data.label,
      targetNodeName: nextNode.data.label,
      protocol: 'TCP',
      action: 'VPC Ingress Violation: Direct Public Access to Private Subnet Blocked',
      status: 'failed',
      explanation: `PACKET BLOCKED: Unsolicited public internet traffic cannot reach instances in private subnet [${nextNode.data.subnet}]. Private route tables have no 0.0.0.0/0 route to Internet Gateway. Public ingress must be mediated by an ALB or API Gateway in a public subnet.`,
      targetHealth: 'failed',
      latencyMs: 10,
      details: {
        statusCode: 403,
        failureReason: 'Direct public internet ingress into private subnet is prohibited by VPC route tables.'
      }
    });
    trace.fail(403, `Ingress blocked: Direct public internet access to private instance [${nextNode.data.label}] is prohibited by VPC route tables.`);
    trace.addBottleneck('Instances in private subnets cannot accept direct public internet traffic.');
    return TERMINATE;
  }

  // 7C: Outbound Egress from Private Subnet (NAT Gateway & VPC Endpoint Check)
  const isPrivateSource = (node.data.subnet === 'private' || node.data.subnet === 'isolated') &&
    !ENDPOINT_SERVICE_IDS.includes(node.data.serviceId);
  const isExternalTarget = nextNode.data.subnet === 'global' || reachableExternalActor(nextNode.data.serviceId);

  // Route-table driven egress when the source's subnet has an explicit route table.
  const egress = isExternalTarget && !ENDPOINT_SERVICE_IDS.includes(node.data.serviceId) && !['rds'].includes(nextNode.data.serviceId)
    ? evaluateInternetEgress(node, nextNode.data.serviceId, nodes, routingOptions(ctx.scenario)) : undefined;
  const explicitEgress = egress && egress.outcome !== 'legacy';
  if (explicitEgress) {
    const action = egress!.via === 'interface-endpoint' ? 'Interface VPC endpoint (private DNS)' : egress!.via === 'gateway-endpoint' ? 'Route table: gateway endpoint (prefix list)'
      : egress!.via === 'nat' ? 'Route table: NAT gateway (SNAT)' : 'Route table: internet gateway';
    if (recordRoute(ctx, node, nextNode, egress!, egress!.outcome === 'allowed' ? action : 'Route table: internet egress')) return TERMINATE;
  }

  if (!explicitEgress && isPrivateSource && isExternalTarget && !['rds', 'dynamodb'].includes(nextNode.data.serviceId)) {
    const vpcEndpoint = nodes.find(n => ENDPOINT_SERVICE_IDS.includes(n.data.serviceId) && evaluateEndpoint(n.data, nextNode.data.serviceId).allowed);
    const natGateway = nodes.find(n => n.data.serviceId === 'nat_gateway');
    const assumedNat = !natGateway && ctx.scenario.assumeGateways === true;

    if (assumedNat && !(vpcEndpoint && ['s3', 'dynamodb'].includes(nextNode.data.serviceId))) {
      trace.pushStep({ sourceNodeId: node.id, targetNodeId: nextNode.id, sourceNodeName: node.data.label,
        targetNodeName: nextNode.data.label, protocol: 'TCP', action: 'NAT gateway (assumed)', status: 'success',
        explanation: `Assumed gateways is on: no NAT gateway is drawn, so ${node.data.label}'s private subnet is treated as routing 0.0.0.0/0 to one (SNAT to a public address). Draw a NAT gateway to model its AZ, cost and failure.`,
        targetHealth: 'healthy', latencyMs: 14 });
      trace.advanceTime(14);
    } else if (vpcEndpoint && ['s3', 'dynamodb'].includes(nextNode.data.serviceId)) {
      trace.pushStep({
        sourceNodeId: node.id,
        targetNodeId: vpcEndpoint.id,
        sourceNodeName: node.data.label,
        targetNodeName: vpcEndpoint.data.label,
        protocol: 'HTTPS',
        action: 'AWS VPC Gateway Endpoint Route',
        status: 'success',
        explanation: `Private instance [${node.data.label}] routed directly to ${nextNode.data.label} over AWS Private Backbone via ${vpcEndpoint.data.label}. Zero internet exposure, zero NAT Gateway data processing fees!`,
        targetHealth: 'healthy',
        latencyMs: 4
      });
      trace.advanceTime(4);
    } else {
      const natDecision = resolveNatEgress(
        node.data.label,
        nextNode.data.label,
        natGateway ? { label: natGateway.data.label, health: natGateway.data.health } : undefined
      );

      if (natDecision.outcome === 'missing') {
        trace.pushStep({
          sourceNodeId: node.id,
          targetNodeId: nextNode.id,
          sourceNodeName: node.data.label,
          targetNodeName: nextNode.data.label,
          protocol: 'HTTPS',
          action: 'Outbound Egress Timeout: NAT Gateway Missing',
          status: 'failed',
          explanation: natDecision.explanation,
          targetHealth: 'failed',
          latencyMs: 3000,
          details: {
            statusCode: natDecision.statusCode,
            failureReason: 'Missing NAT Gateway in route table for private subnet.'
          }
        });
        trace.fail(natDecision.statusCode, `Outbound egress failed: No NAT Gateway exists for private subnet instance ${node.data.label}.`);
        trace.addBottleneck('Private subnet instances lack a NAT Gateway for internet egress.');
        return TERMINATE;
      } else if (natDecision.outcome === 'failed') {
        trace.pushStep({
          sourceNodeId: node.id,
          targetNodeId: natGateway!.id,
          sourceNodeName: node.data.label,
          targetNodeName: natGateway!.data.label,
          protocol: 'TCP',
          action: 'NAT Gateway Outage',
          status: 'failed',
          explanation: natDecision.explanation,
          targetHealth: 'failed',
          latencyMs: 2500,
          details: {
            statusCode: natDecision.statusCode,
            failureReason: 'NAT Gateway is failed.'
          }
        });
        trace.fail(natDecision.statusCode, `Egress failed: NAT Gateway ${natGateway!.data.label} is offline.`);
        return TERMINATE;
      } else {
        trace.pushStep({
          sourceNodeId: node.id,
          targetNodeId: natGateway!.id,
          sourceNodeName: node.data.label,
          targetNodeName: natGateway!.data.label,
          protocol: 'TCP',
          action: 'NAT Gateway SNAT: Private IP -> Elastic IP',
          status: 'success',
          explanation: natDecision.explanation,
          targetHealth: 'healthy',
          latencyMs: 14
        });
        trace.advanceTime(14);
      }
    }
  }

  if (pushFirewallBlockIfAny(node, nextNode, protocol)) {
    return TERMINATE;
  }

  trace.pushStep({
    sourceNodeId: node.id,
    targetNodeId: nextNode.id,
    sourceNodeName: node.data.label,
    targetNodeName: nextNode.data.label,
    protocol,
    action: `Forward ${protocol} request`,
    status: nextNode.data.health === 'failed' ? 'failed' : 'success',
    explanation: `${node.data.label} forwarded ${protocol} request to ${nextNode.data.label}.`,
    targetHealth: nextNode.data.health,
    latencyMs: 20
  });
  trace.advanceTime(20);
  return advanceTo(nextNode);
};
