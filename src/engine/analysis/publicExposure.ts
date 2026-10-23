import type { Node, Edge } from '@xyflow/react';
import type { ServiceNodeData, ConnectionData } from '../../types/index.ts';
import { makeFinding, type Finding } from '../findings.ts';
import { getAttachedSecurityGroups } from '../layout/containment.ts';
import { parseCidr } from '../network/cidr.ts';
import { requestEdges } from '../failure/dependencyGraph.ts';
import { isExternalActor } from '../architecture/externalActors.ts';

const DATA_TIER_SERVICE_IDS = ['rds', 'aurora', 'dynamodb', 'elasticache'];

/** A CIDR whose prefix is /0 matches the entire IPv4 address space - literally "from anywhere",
 *  the exact condition the spec's own worked example (`RDS is accessible from 0.0.0.0/0`) means. */
function isWideOpen(cidr: string): boolean {
  const parsed = parseCidr(cidr);
  return parsed !== null && parsed.prefix === 0;
}

/**
 * Public exposure is an ARCHITECTURAL judgment, not a configuration error: a Security Group rule
 * allowing 0.0.0.0/0 into a database is syntactically and structurally VALID AWS config (it will
 * save and evaluate exactly as configured) - it is simply a bad design decision. This is the
 * canonical case the "valid configuration" vs "good architecture" distinction is about, so this
 * detector must never appear in `engine/validation`.
 */
export function detectPublicExposure(
  nodes: Node<ServiceNodeData>[],
  edges: Edge<ConnectionData>[]
): Finding[] {
  const findings: Finding[] = [];
  const serviceNodes = nodes.filter(n => n.type !== 'boundaryNode');
  const boundaries = nodes.filter(n => n.type === 'boundaryNode');
  const dataTierNodes = serviceNodes.filter(n => DATA_TIER_SERVICE_IDS.includes(n.data.serviceId));

  for (const node of dataTierNodes) {
    if (node.data.subnet === 'public') {
      findings.push(makeFinding('architecture', 'public_exposure', {
        severity: 'HIGH',
        resource: node.data.label,
        resourceId: node.id,
        problem: `${node.data.label} is placed in a public subnet.`,
        whyItMatters: 'A public subnet routes to an Internet Gateway - a database with a public IP in this subnet is reachable directly from the internet if its Security Group permits any inbound access at all, bypassing the application tier entirely.',
        awsRule: 'A public subnet\'s route table sends 0.0.0.0/0 to an Internet Gateway - any resource placed there is one Security Group rule away from being internet-reachable.',
        recommendation: `Move ${node.data.label} into a private (or isolated) subnet with no route to an Internet Gateway.`
      }));
    }

    for (const sg of getAttachedSecurityGroups(node, boundaries)) {
      const rules = (sg.data as any)?.securityGroupRules;
      if (!rules?.inbound) continue;
      const wideOpenRule = rules.inbound.find((r: any) => r.source?.type === 'cidr' && isWideOpen(r.source.cidr));
      if (wideOpenRule) {
        findings.push(makeFinding('architecture', 'public_exposure', {
          severity: 'HIGH',
          resource: node.data.label,
          resourceId: node.id,
          problem: `${node.data.label} is accessible from 0.0.0.0/0 via ${(sg.data as any)?.label || 'its Security Group'} (${wideOpenRule.protocol} ${wideOpenRule.portRange}).`,
          whyItMatters: 'Database network access is publicly exposed - anyone on the internet can attempt to connect directly, turning every future credential/CVE on this engine into an internet-facing attack surface instead of one reachable only from trusted application servers.',
          awsRule: 'A database Security Group should never have an inbound rule with a 0.0.0.0/0 (or ::/0) source - AWS permits it, but it defeats network-layer isolation entirely.',
          recommendation: `Restrict ${(sg.data as any)?.label || 'this Security Group'}'s inbound rule to the application tier's own Security Group instead of 0.0.0.0/0.`
        }));
      }
    }
  }

  // Direct client -> data-tier connection, bypassing any application/API tier entirely.
  const rEdges = requestEdges(edges);
  for (const edge of rEdges) {
    const source = serviceNodes.find(n => n.id === edge.source);
    const target = serviceNodes.find(n => n.id === edge.target);
    if (!source || !target) continue;
    if (isExternalActor(source.data.serviceId) && DATA_TIER_SERVICE_IDS.includes(target.data.serviceId)) {
      findings.push(makeFinding('architecture', 'public_exposure', {
        severity: 'CRITICAL',
        resource: target.data.label,
        resourceId: target.id,
        problem: `${source.data.label} connects directly to ${target.data.label}, with no application tier in between.`,
        whyItMatters: 'A client application talking straight to a database has no place to enforce authentication, input validation, rate limiting, or query authorization - every one of those becomes the database\'s own problem, or nobody\'s.',
        awsRule: 'A database should only ever be reached from a controlled application/API tier, never directly from a client.',
        recommendation: `Introduce an application tier (e.g. API Gateway + Lambda, or an ALB + compute tier) between ${source.data.label} and ${target.data.label}.`
      }));
    }
  }

  return findings;
}
