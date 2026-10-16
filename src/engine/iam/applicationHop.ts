import type { Node } from '@xyflow/react';
import type { ServiceNodeData } from '../../types/index.ts';
import type { TraceEntry } from '../trace/types.ts';
import { IAM_AUTHENTICATED_ACTIONS } from '../capability/iamCoverage.ts';
import { evaluateAuthorization } from './evaluate.ts';
import { assumeRole } from './roleAssumption.ts';
import { normalizeTrustPolicy, servicePrincipalFor } from './servicePrincipals.ts';
import { targetResourceArn } from './roleBuilder.ts';
import type { Principal } from './types.ts';

/** Shared application API authorization. Network/database connections need no IAM decision. */
export function authorizeApplicationHop(source: Node<ServiceNodeData>, target: Node<ServiceNodeData>, protocol: string, action?: string): TraceEntry {
  const entries: TraceEntry[] = [];
  const iamAction = action || IAM_AUTHENTICATED_ACTIONS[target.data.serviceId];
  if (!iamAction) {
    entries.push({
      order: 1,
      component: 'IAM',
      resource: 'N/A',
      operation: 'evaluate-iam',
      input: { protocol },
      decision: 'NOT_REQUIRED',
      reason: 'Not required for this network connection itself.',
      simpleExplanation: 'This is a network-level connection, not an AWS API call, so IAM does not apply here.',
      awsRule: 'IAM authorizes AWS API calls (e.g. S3, DynamoDB, Lambda); a raw network/database-protocol connection is authorized by Security Groups and NACLs, not IAM.',
      metadata: {}
    });
  } else if (!source.data.iamRole) {
    entries.push({
      order: 1,
      component: 'IAM',
      resource: source.data.label,
      operation: 'evaluate-iam',
      input: { action: iamAction },
      decision: 'DENY',
      reason: `${source.data.label} has no IAM role attached, so ${iamAction} is denied at authentication - no policy is even evaluated.`,
      simpleExplanation: `${source.data.label} has no permissions attached at all, so this call is rejected before AWS even checks what it's allowed to do.`,
      awsRule: 'Every AWS SDK/API call must be signed with credentials from an IAM principal (role, user, or service) - with none attached, authentication itself fails.',
      metadata: {}
    });
  } else {
    const role = source.data.iamRole;
    const rolePrincipal: Principal = {
      id: role.id, kind: 'role', accountId: '000000000000',
      trustPolicy: normalizeTrustPolicy(role.trustPolicy, source.data.serviceId), identityPolicies: role.identityPolicies || [], permissionsBoundary: role.permissionsBoundary
    };
    const callerPrincipal: Principal = { id: servicePrincipalFor(source.data.serviceId), kind: 'service', accountId: '000000000000', identityPolicies: [] };
    const assumeResult = assumeRole(callerPrincipal, rolePrincipal);

    if (!assumeResult.allowed) {
      entries.push({
        order: 1,
        component: 'IAM',
        resource: role.id,
        operation: 'evaluate-iam',
        input: { action: iamAction, role: role.id },
        decision: 'DENY',
        reason: assumeResult.reason,
        simpleExplanation: `${source.data.label} can't even use its own attached role - its trust policy doesn't allow it.`,
        awsRule: 'A role\'s trust policy must explicitly name the principal (or AWS service) allowed to assume it via sts:AssumeRole.',
        metadata: {}
      });
    } else {
      let resourceArn = targetResourceArn(target);
      // Object-level S3 actions are authorized against an object ARN (bucket/key), whoever calls.
      // https://docs.aws.amazon.com/service-authorization/latest/reference/list_amazons3.html
      if (target.data.serviceId === 's3' && ['s3:GetObject', 's3:PutObject'].includes(iamAction) && !resourceArn.includes('/')) resourceArn += '/simulated-object';
      const decision = evaluateAuthorization({
        principal: assumeResult.sessionPrincipal!,
        action: iamAction,
        resource: { arn: resourceArn, accountId: '000000000000' }
      });
      entries.push({
        order: 1,
        component: 'IAM',
        resource: role.id,
        operation: 'evaluate-iam',
        input: { action: iamAction, role: role.id },
        decision: decision.effect === 'Allow' ? 'ALLOW' : 'DENY',
        reason: decision.finalReason,
        simpleExplanation: decision.effect === 'Allow'
          ? `${source.data.label}'s role has permission to do this.`
          : `${source.data.label}'s role does not have permission to do this.`,
        awsRule: 'An IAM principal needs an explicit Allow (with no overriding explicit Deny, within any permissions boundary/SCP) for the specific action and resource - having a role at all is not the same as having permission.',
        metadata: { steps: decision.steps, matchedStatements: decision.matchedStatements }
      });
    }
  }

  return entries[0];
}
