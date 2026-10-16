import type { Node, Edge } from '@xyflow/react';
import type { ServiceNodeData, ConnectionData } from '../../types/index.ts';
import { makeFinding, type Finding } from '../findings.ts';
import { requestEdges } from '../failure/dependencyGraph.ts';
import { evaluateAuthorization } from '../iam/evaluate.ts';
import { assumeRole } from '../iam/roleAssumption.ts';
import type { Principal } from '../iam/types.ts';
import { IAM_AUTHENTICATED_ACTIONS, IAM_CALLER_SERVICE_IDS as COMPUTE_SERVICE_IDS } from '../capability/iamCoverage.ts';
import { normalizeTrustPolicy, servicePrincipalFor } from '../iam/servicePrincipals.ts';

/**
 * Validates IAM configuration using the real, standalone IAM engine (`engine/iam/`) - never a
 * shallow "does the allow-list contain this string" check. Two checks compose:
 *
 * 1. Coarse (always available, no authoring required): a compute resource calling an
 *    IAM-authenticated AWS API with literally no role attached at all.
 * 2. Precise (only when a `data.iamRole` has actually been authored on the node): real trust-policy
 *    evaluation via `assumeRole`, and real permission evaluation via `evaluateAuthorization` for
 *    each IAM-authenticated dependency.
 */
export function validateIam(
  nodes: Node<ServiceNodeData>[],
  edges: Edge<ConnectionData>[]
): Finding[] {
  const findings: Finding[] = [];
  const serviceNodes = nodes.filter(n => n.type !== 'boundaryNode');
  const rEdges = requestEdges(edges);

  for (const node of serviceNodes) {
    if (!COMPUTE_SERVICE_IDS.includes(node.data.serviceId)) continue;

    const iamTargets = rEdges
      .filter(e => e.source === node.id)
      .map(e => serviceNodes.find(n => n.id === e.target))
      .filter((t): t is Node<ServiceNodeData> => Boolean(t) && (t as Node<ServiceNodeData>).data.serviceId in IAM_AUTHENTICATED_ACTIONS);

    if (iamTargets.length === 0) continue;

    if (!node.data.iamRole) {
      findings.push(makeFinding('validation', 'iam', {
        severity: 'MEDIUM',
        resource: node.data.label,
        resourceId: node.id,
        problem: `${node.data.label} calls ${iamTargets.map(t => t.data.label).join(', ')} but has no IAM role attached.`,
        whyItMatters: 'Every AWS SDK/API call to an IAM-authenticated service (S3, DynamoDB, SQS, SNS, Lambda, KMS, Secrets Manager) is signed with credentials from an attached role - with none attached, every one of these calls is denied at the authentication step, before any policy is even evaluated.',
        awsRule: 'Compute resources (EC2 instance profile, ECS task role, Lambda execution role) must have an IAM role attached to call any IAM-authenticated AWS API.',
        recommendation: `Attach an IAM role to ${node.data.label} with permissions for ${iamTargets.map(t => t.data.label).join(', ')}.`
      }));
      continue;
    }

    const role = node.data.iamRole;
    const roleId = role.id || `${node.data.label}-role`;

    const rolePrincipal: Principal = {
      id: roleId,
      kind: 'role',
      accountId: '000000000000',
      trustPolicy: normalizeTrustPolicy(role.trustPolicy, node.data.serviceId),
      identityPolicies: role.identityPolicies || [],
      permissionsBoundary: role.permissionsBoundary
    };
    const callerPrincipal: Principal = {
      id: servicePrincipalFor(node.data.serviceId),
      kind: 'service',
      accountId: '000000000000',
      identityPolicies: []
    };

    const assumeResult = assumeRole(callerPrincipal, rolePrincipal);
    if (!assumeResult.allowed) {
      findings.push(makeFinding('validation', 'iam', {
        severity: role.trustPolicy ? 'HIGH' : 'MEDIUM',
        resource: node.data.label,
        resourceId: node.id,
        problem: `${node.data.label} cannot assume its own attached role "${roleId}": ${assumeResult.reason}`,
        whyItMatters: 'A role that its own resource cannot assume is unusable - every call made through it will fail at authentication, before any identity policy is checked.',
        awsRule: 'A role\'s trust policy must explicitly name the principal (or service) that will assume it via an Allow statement for sts:AssumeRole.',
        recommendation: `Add a trust policy statement on "${roleId}" allowing ${node.data.serviceId} to assume it.`
      }));
      continue;
    }

    for (const target of iamTargets) {
      const action = IAM_AUTHENTICATED_ACTIONS[target.data.serviceId];
      const decision = evaluateAuthorization({
        principal: assumeResult.sessionPrincipal!,
        action,
        resource: { arn: String(target.data.customConfig?.resourceArn || `arn:aws:${target.data.serviceId}:::${target.id}`), accountId: '000000000000' }
      });

      if (decision.effect === 'Deny') {
        findings.push(makeFinding('validation', 'iam', {
          severity: 'HIGH',
          resource: node.data.label,
          resourceId: node.id,
          problem: `${node.data.label}'s role "${roleId}" is denied ${action} on ${target.data.label}.`,
          whyItMatters: decision.finalReason,
          awsRule: 'An IAM principal needs an explicit Allow (with no overriding explicit Deny, and within any attached permissions boundary/SCP) for a specific action on a specific resource - having a role at all is not the same as having permission.',
          recommendation: `Add an Allow statement for ${action} on ${target.data.label} to "${roleId}"'s identity policy.`
        }));
      }
    }
  }

  return findings;
}
