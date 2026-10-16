import type { Node } from '@xyflow/react';
import { getAttachedSecurityGroups, findContainingSubnetBoundary } from '../layout/containment.ts';

import type { SubnetNaclConfig } from '../../types/index.ts';
import { evaluateNaclRules } from '../network/nacl.ts';
import { evaluateSecurityGroup, legacyAllowedProtocolsToRules, type SecurityGroupRules } from '../network/securityGroup.ts';

export interface FirewallLayerResult {
  /** True only when this boundary has explicit rules configured - an undecorated boundary
   *  (the vast majority of diagrams) is not evaluated at all and produces no step. */
  evaluated: boolean;
  blocked: boolean;
  boundaryLabel?: string;
  note?: string;
}

export interface FirewallCheckResult {
  /** Network ACL: stateless, subnet-wide, evaluated first - checked against an explicit
   *  DENY list, so anything not listed passes through. */
  nacl: FirewallLayerResult;
  /** Security Group: stateful, instance-level, evaluated second (only reached if the NACL let
   *  the packet through) - checked against an explicit ALLOW list. */
  securityGroup: FirewallLayerResult;
}

const NOT_EVALUATED: FirewallLayerResult = { evaluated: false, blocked: false };

/**
 * Checks return traffic (SYN-ACK / response data) against the client's subnet Network ACL.
 * Because NACLs are stateless, return packets destined to client ephemeral ports (1024-65535)
 * must be explicitly permitted by an inbound rule in the client's subnet NACL.
 */
export function checkCustomNaclReturn(
  sourceNode: Node<any>,
  targetNode: Node<any>,
  boundaryNodes: Node<any>[]
): FirewallLayerResult {
  const sourceSubnet = findContainingSubnetBoundary(sourceNode, boundaryNodes);
  if (!sourceSubnet) return NOT_EVALUATED;

  const customNacl: SubnetNaclConfig | undefined = (sourceSubnet.data as any)?.customNacl;
  if (!customNacl) return NOT_EVALUATED;

  const naclLabel = customNacl.naclName || (sourceSubnet.data as any)?.label || 'Public Subnet NACL';
  const sortedInbound = [...(customNacl.inboundRules || [])].sort((a, b) => a.ruleNumber - b.ruleNumber);

  const ephemeralRule = sortedInbound.find(r =>
    r.portRange.includes('1024-65535') ||
    r.portRange.toLowerCase().includes('ephemeral') ||
    r.type.toLowerCase().includes('ephemeral')
  );

  if (!ephemeralRule || ephemeralRule.isMissingReturn) {
    return {
      evaluated: true,
      blocked: true,
      boundaryLabel: naclLabel,
      note: `${naclLabel} has NO inbound rule allowing ephemeral ports (1024-65535) from ${targetNode.data?.label || 'Database'}. NACLs are stateless and do not automatically permit return traffic. Default Rule * DENY dropped the response packet upon return. Result: Connection Timeout (HTTP 504).`
    };
  }

  if (ephemeralRule.action === 'ALLOW') {
    return {
      evaluated: true,
      blocked: false,
      boundaryLabel: naclLabel,
      note: `${naclLabel} Rule ${ephemeralRule.ruleNumber} explicitly ALLOWs inbound ephemeral ports (${ephemeralRule.portRange}) for return traffic. Response delivered to ${sourceNode.data?.label || 'Web Server'}.`
    };
  }

  return {
    evaluated: true,
    blocked: true,
    boundaryLabel: naclLabel,
    note: `${naclLabel} Rule ${ephemeralRule.ruleNumber} DENYs ephemeral return traffic.`
  };
}

/**
 * Evaluates the two independent firewall layers AWS puts between a request and its target, in
 * the order a real packet actually crosses them: the subnet's Network ACL first, then the
 * target's own Security Group. Each layer's result is returned separately (rather than
 * collapsed into one blocked/allowed flag) so the caller can show both being evaluated even
 * when only one of them ends up blocking the traffic.
 */
export function checkNetworkFirewalls(
  protocol: string,
  targetNode: Node<any>,
  boundaryNodes: Node<any>[],
  sourceNode?: Node<any>,
  packet?: { destinationPort?: number }
): FirewallCheckResult {
  const ip = sourceNode?.data.networkIdentity?.privateIp;
  const sourceCidr = typeof ip === 'string' ? `${ip}/32` : undefined;
  const subnet = findContainingSubnetBoundary(targetNode, boundaryNodes);
  const denyInbound: string[] | undefined = subnet && (subnet.data as any)?.naclDenyInbound;
  const customNacl: SubnetNaclConfig | undefined = subnet && (subnet.data as any)?.customNacl;
  const naclLabel = (customNacl && customNacl.naclName) || (subnet && ((subnet.data as any)?.label || 'Network ACL'));

  let nacl: FirewallLayerResult = NOT_EVALUATED;

  if (customNacl && customNacl.inboundRules) {
    // Delegates to the shared, independently-tested NACL evaluator (first-match, ascending rule
    // order, implicit final DENY) - see src/engine/network/nacl.ts. Behavior is unchanged from
    // the inline version this replaced.
    const evaluation = evaluateNaclRules(customNacl.inboundRules, protocol, { port: packet?.destinationPort, sourceCidr });
    const isImplicitDeny = evaluation.decidingRule.ruleNumber === 32767;
    nacl = {
      evaluated: true,
      blocked: evaluation.blocked,
      boundaryLabel: naclLabel,
      note: isImplicitDeny
        ? `${naclLabel} evaluated ${protocol} traffic against custom rules: no explicit rule matched, so the implicit final DENY (Rule 32767, matches all traffic) applies. NACLs deny by default.`
        : evaluation.blocked
          ? `${naclLabel} Rule ${evaluation.decidingRule.ruleNumber} explicitly DENYs inbound ${protocol} traffic.`
          : `${naclLabel} Rule ${evaluation.decidingRule.ruleNumber} evaluated ${protocol} inbound: ALLOW (${evaluation.decidingRule.cidr}, port ${evaluation.decidingRule.portRange}).`
    };
  } else if (denyInbound && denyInbound.length > 0) {
    nacl = denyInbound.includes(protocol)
      ? {
          evaluated: true,
          blocked: true,
          boundaryLabel: naclLabel,
          note: `${naclLabel}'s Network ACL has an explicit DENY rule for ${protocol} traffic. NACLs are stateless and evaluate every packet against numbered rules regardless of connection state - unlike a Security Group, an explicit deny here cannot be overridden by any other rule.`
        }
      : {
          evaluated: true,
          blocked: false,
          boundaryLabel: naclLabel,
          note: `${naclLabel}'s Network ACL evaluated ${protocol} traffic against its DENY rules (${denyInbound.join(', ')}) and let it through - no matching rule.`
        };
  }

  // A NACL deny stops the packet before it ever reaches the instance's Security Group.
  if (nacl.blocked) {
    return { nacl, securityGroup: NOT_EVALUATED };
  }

  // An instance can have several Security Groups attached at once, exactly like real AWS - the
  // rules are unioned (allowed if ANY attached group permits it), and only groups that have
  // actually been configured (either the legacy `allowedProtocols` list or the real
  // `securityGroupRules` shape, even to an empty list) count. A newly-attached, still-default
  // group behaves like the wide-open SG AWS creates for you. Each group is evaluated through
  // `evaluateSecurityGroup` (src/engine/network/securityGroup.ts) - a legacy `allowedProtocols`
  // group is translated via `legacyAllowedProtocolsToRules` first, so both shapes go through one
  // real rule evaluator instead of two independently-maintained matching rules.
  const attachedGroups = getAttachedSecurityGroups(targetNode, boundaryNodes);
  const configuredGroups = attachedGroups.filter(sg => {
    const d = sg.data as any;
    return d?.allowedProtocols !== undefined || d?.securityGroupRules !== undefined;
  });

  let sgResult: FirewallLayerResult = NOT_EVALUATED;
  if (configuredGroups.length > 0) {
    const labels = configuredGroups.map(sg => (sg.data as any)?.label || 'Security Group');
    const boundaryLabel = labels.join(', ');
    // Explicit source IPv4 and destination port participate when supplied. Missing values
    // retain the existing educational abstraction; they are disclosed in live trace evidence.
    const peerSecurityGroupIds: string[] = sourceNode ? ((sourceNode.data as any)?.securityGroupIds || []) : [];

    const decisions = configuredGroups.map(sg => {
      const d = sg.data as any;
      const rules: SecurityGroupRules = d.securityGroupRules ?? legacyAllowedProtocolsToRules(d.allowedProtocols || []);
      return evaluateSecurityGroup(rules, {
        direction: 'inbound',
        protocol,
        port: packet?.destinationPort,
        sourceCidr,
        peerSecurityGroupIds,
        connectionState: 'new'
      });
    });

    if (decisions.some(d => d.allowed)) {
      sgResult = {
        evaluated: true,
        blocked: false,
        boundaryLabel,
        note: `${boundaryLabel} has an inbound rule allowing ${protocol} - traffic permitted.`
      };
    } else {
      const ruleSummary = configuredGroups
        .map(sg => {
          const d = sg.data as any;
          const label = d?.label || 'Security Group';
          const inboundSummary = d.securityGroupRules
            ? (d.securityGroupRules as SecurityGroupRules).inbound.map(r => `${r.protocol} ${r.portRange}`).join(', ') || 'none configured'
            : (d.allowedProtocols as string[]).join(', ') || 'nothing - all inbound denied';
          return `${label} (allows: ${inboundSummary})`;
        })
        .join('; ');
      sgResult = {
        evaluated: true,
        blocked: true,
        boundaryLabel,
        note: `No Security Group attached to ${((targetNode.data as any)?.label) || 'this resource'} allows ${protocol} - ${ruleSummary}. Security Groups are stateful and allow-list only: once a connection is permitted in, its return traffic is automatically allowed back out.`
      };
    }
  }

  return { nacl, securityGroup: sgResult };
}
