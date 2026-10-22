import type { Node, Edge } from '@xyflow/react';
import type { ServiceNodeData, ConnectionData } from '../../types/index.ts';
import { makeFinding, type Finding } from '../findings.ts';
import { SUBNET_REQUIRED_SERVICE_IDS } from '../layout/containment.ts';
import { validateNatGatewayPlacement } from '../network/nat.ts';
import { requestEdges } from '../failure/dependencyGraph.ts';
import { isIgwDetached, routingConfigurationIssues } from '../network/subnetRouting.ts';
import { INTERNET_CLIENT_IDS } from '../architecture/externalActors.ts';

const VPC_HOSTED_INGRESS_SERVICE_IDS = ['alb', 'nlb', 'ec2', 'ecs', 'fargate', 'api_gateway'];
const ENDPOINT_SERVICE_IDS = ['privatelink', 's3_gateway_endpoint'];

/**
 * Structural network validity: can each resource actually be placed where it is, and does a real
 * route exist between it and what it needs to reach? None of this asks whether the design is
 * *good* - a perfectly reachable architecture can still be a SPOF-ridden mess (that's
 * `engine/analysis`'s job).
 */
export function validateNetwork(
  nodes: Node<ServiceNodeData>[],
  edges: Edge<ConnectionData>[]
): Finding[] {
  const findings: Finding[] = [];
  const serviceNodes = nodes.filter(n => n.type !== 'boundaryNode');

  // Invalid subnet placement: a resource that must live inside a VPC subnet, but doesn't.
  for (const node of serviceNodes) {
    if (node.data.serviceId === 'nat_gateway') continue; // has its own more specific check below
    if (SUBNET_REQUIRED_SERVICE_IDS.includes(node.data.serviceId) && node.data.subnet === 'unassigned') {
      findings.push(makeFinding('validation', 'placement', {
        severity: 'CRITICAL',
        resource: node.data.label,
        resourceId: node.id,
        problem: `${node.data.label} is not placed inside any Public or Private subnet boundary.`,
        whyItMatters: 'Every VPC-hosted resource needs a network interface inside exactly one subnet - AWS has nowhere to assign it an IP address or a route table otherwise.',
        awsRule: 'An ENI-attached resource (EC2, ECS/Fargate task, RDS/Aurora, ElastiCache, ALB/NLB, Interface VPC Endpoint) must be launched inside a subnet.',
        recommendation: `Drag ${node.data.label} inside a Public or Private subnet boundary on the canvas.`
      }));
    }
  }

  // NAT Gateway must itself sit in a public subnet.
  const natGateways = serviceNodes.filter(n => n.data.serviceId === 'nat_gateway');
  for (const nat of natGateways) {
    const decision = validateNatGatewayPlacement(nat.data.label, nat.data.subnet);
    if (decision.outcome === 'misplaced') {
      findings.push(makeFinding('validation', 'placement', {
        severity: 'CRITICAL',
        resource: nat.data.label,
        resourceId: nat.id,
        problem: `${nat.data.label} is deployed in a private subnet.`,
        whyItMatters: 'A NAT Gateway with no route to an Internet Gateway cannot translate any outbound traffic - every private-subnet resource depending on it for egress silently loses internet access.',
        awsRule: 'A NAT Gateway must be deployed in a public subnet with a route table entry sending 0.0.0.0/0 to an Internet Gateway.',
        recommendation: `Move ${nat.data.label} into a Public Subnet boundary.`
      }));
    }
  }

  // Missing route to the internet: a VPC-hosted, public-subnet resource with no Internet Gateway
  // anywhere in the architecture at all (independent of its health - that's a runtime concern).
  const hasPublicIngressResource = serviceNodes.some(n =>
    n.data.subnet === 'public' && VPC_HOSTED_INGRESS_SERVICE_IDS.includes(n.data.serviceId)
  );
  const hasIgw = serviceNodes.some(n => n.data.serviceId === 'internet_gateway' && !isIgwDetached(n));
  if (hasPublicIngressResource && !hasIgw) {
    const example = serviceNodes.find(n => n.data.subnet === 'public' && VPC_HOSTED_INGRESS_SERVICE_IDS.includes(n.data.serviceId))!;
    findings.push(makeFinding('validation', 'routing', {
      severity: 'CRITICAL',
      resource: example.data.label,
      resourceId: example.id,
      problem: `${example.data.label} sits in a public subnet, but no attached Internet Gateway exists in the VPC.`,
      whyItMatters: 'Without an Internet Gateway, a public route table has no target for a 0.0.0.0/0 route - the VPC has no path to or from the internet at all, regardless of subnet placement or Security Group rules.',
      awsRule: 'A public subnet is only "public" because its route table sends 0.0.0.0/0 to an attached Internet Gateway - the subnet designation alone grants no connectivity.',
      recommendation: 'Add an Internet Gateway and attach it to the VPC.'
    }));
  }

  // Missing route for private-subnet egress: a private/isolated resource with an edge toward an
  // external ('global') target, but no NAT Gateway and no VPC Endpoint anywhere to carry it.
  const hasNat = natGateways.length > 0;
  const hasEndpoint = serviceNodes.some(n => ENDPOINT_SERVICE_IDS.includes(n.data.serviceId));
  if (!hasNat && !hasEndpoint) {
    const rEdges = requestEdges(edges);
    const egressEdge = rEdges.find(e => {
      const source = serviceNodes.find(n => n.id === e.source);
      const target = serviceNodes.find(n => n.id === e.target);
      if (!source || !target) return false;
      const sourceIsPrivate = source.data.subnet === 'private' || source.data.subnet === 'isolated';
      const targetIsExternal = target.data.subnet === 'global' && !(INTERNET_CLIENT_IDS as readonly string[]).includes(target.data.serviceId);
      return sourceIsPrivate && targetIsExternal;
    });
    if (egressEdge) {
      const source = serviceNodes.find(n => n.id === egressEdge.source)!;
      findings.push(makeFinding('validation', 'routing', {
        severity: 'HIGH',
        resource: source.data.label,
        resourceId: source.id,
        problem: `${source.data.label} is in a private subnet and needs external connectivity, but no NAT Gateway or VPC Endpoint exists in the architecture.`,
        whyItMatters: 'A private subnet\'s route table has no default route to the internet by design - without a NAT Gateway (or a VPC Endpoint for the specific AWS service being reached), outbound requests have nowhere to go.',
        awsRule: 'Private subnet egress requires an explicit route: 0.0.0.0/0 to a NAT Gateway (general internet) or a VPC Endpoint route (S3/DynamoDB/other supported services, kept entirely on the AWS backbone).',
        recommendation: `Add a NAT Gateway in a public subnet (or a VPC Endpoint, if ${source.data.label} only needs to reach a supported AWS service) and route ${source.data.label}'s subnet to it.`
      }));
    }
  }


  // Route table and internet gateway configuration that AWS rejects or forbids.
  for (const issue of routingConfigurationIssues(nodes)) {
    findings.push(makeFinding('validation', 'routing', {
      severity: 'HIGH', resource: issue.label, resourceId: issue.nodeId,
      problem: issue.problem,
      whyItMatters: 'AWS would refuse this configuration, so the simulated route may not exist in a real VPC.',
      awsRule: issue.awsRule,
      recommendation: issue.recommendation
    }));
  }
  return findings;
}
