import type { Node, Edge } from '@xyflow/react';
import type { ServiceNodeData } from '../../types/index.ts';
import type { PolicyStatement } from './types.ts';
import { IAM_AUTHENTICATED_ACTIONS } from '../capability/iamCoverage.ts';
import { servicePrincipalFor } from './servicePrincipals.ts';

/**
 * Least-privilege roles derived from what a component actually calls. A role is per caller: an
 * EC2 instance that reads S3 and writes DynamoDB needs both, a Lambda that only sends to SQS needs
 * only sqs:SendMessage. Actions from the Service Authorization Reference
 * (https://docs.aws.amazon.com/service-authorization/latest/reference/reference_policies_actions-resources-contextkeys.html).
 */
export const SERVICE_ACTIONS: Record<string, string[]> = {
  s3: ['s3:GetObject', 's3:PutObject', 's3:ListBucket', 's3:DeleteObject'],
  dynamodb: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Query', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem'],
  sqs: ['sqs:SendMessage', 'sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes'],
  sns: ['sns:Publish'],
  lambda: ['lambda:InvokeFunction'],
  kms: ['kms:Decrypt', 'kms:Encrypt', 'kms:GenerateDataKey'],
  secrets_manager: ['secretsmanager:GetSecretValue']
};

const TRANSPARENT_HOPS = ['s3_gateway_endpoint', 'privatelink', 'nat_gateway', 'internet_gateway'];
/** Object-level S3 actions are authorized on bucket/key; bucket-level ones on the bucket. */
const S3_OBJECT_ACTIONS = ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'];

/** The ARN a target is authorized against - shared with engine/iam/applicationHop.ts. */
export function targetResourceArn(target: Node<any>): string {
  return String(target.data?.customConfig?.resourceArn || `arn:aws:${target.data?.serviceId}:::${target.id}`);
}

/** The resource string a policy statement needs for `action` on `target`. */
export function policyResource(target: Node<any>, action: string): string {
  const arn = targetResourceArn(target);
  return target.data?.serviceId === 's3' && S3_OBJECT_ACTIONS.includes(action) && !arn.includes('/') ? `${arn}/*` : arn;
}

export interface CalledService {
  target: Node<ServiceNodeData>;
  /** Actions the connections declare (edge `action`), else the service's default. */
  used: string[];
  available: string[];
}

/** IAM-governed services `source` calls, following through endpoints and NAT/IGW hops. */
export function calledServices(source: Node<ServiceNodeData>, nodes: Node<ServiceNodeData>[], edges: Edge<any>[]): CalledService[] {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const found = new Map<string, CalledService>();
  const visit = (fromId: string, depth: number) => {
    for (const edge of edges.filter(e => e.source === fromId)) {
      const target = byId.get(edge.target);
      if (!target) continue;
      const serviceId = target.data.serviceId;
      if (TRANSPARENT_HOPS.includes(serviceId) && depth < 2) { visit(target.id, depth + 1); continue; }
      if (!IAM_AUTHENTICATED_ACTIONS[serviceId]) continue;
      const action = (edge.data?.action as string | undefined) ?? IAM_AUTHENTICATED_ACTIONS[serviceId];
      const entry = found.get(target.id) ?? { target, used: [], available: SERVICE_ACTIONS[serviceId] ?? [IAM_AUTHENTICATED_ACTIONS[serviceId]] };
      if (!entry.used.includes(action)) entry.used.push(action);
      found.set(target.id, entry);
    }
  };
  visit(source.id, 0);
  return [...found.values()];
}

export interface Grant { target: Node<any>; actions: string[] }

/** A role trusted by the caller's service principal with one least-privilege statement per action group. */
export function buildRole(callerServiceId: string, name: string, grants: Grant[]): NonNullable<ServiceNodeData['iamRole']> {
  if (!name.trim()) throw new Error('Enter a role name.');
  const statements: PolicyStatement[] = [];
  for (const grant of grants) {
    const byResource = new Map<string, string[]>();
    for (const action of grant.actions) {
      const resource = policyResource(grant.target, action);
      byResource.set(resource, [...(byResource.get(resource) ?? []), action]);
    }
    for (const [resource, actions] of byResource) statements.push({ effect: 'Allow', actions, resources: [resource] });
  }
  return {
    id: name.trim(),
    trustPolicy: { id: `${name.trim()}-trust`, kind: 'trust', statements: [{ effect: 'Allow', actions: ['sts:AssumeRole'], resources: [], principals: [servicePrincipalFor(callerServiceId)] }] },
    identityPolicies: [{ id: `${name.trim()}-permissions`, kind: 'identity', statements }]
  };
}

/** Actions currently granted to `target` by the role, read from its statements. */
export function grantedActions(role: ServiceNodeData['iamRole'], target: Node<any>): string[] {
  if (!role) return [];
  const actions = SERVICE_ACTIONS[target.data?.serviceId] ?? [];
  return actions.filter(action => role.identityPolicies?.some(p => p.statements.some(s =>
    s.effect === 'Allow' && s.actions.includes(action) && s.resources.includes(policyResource(target, action)))));
}
