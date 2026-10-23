import { SERVICE_OPERATIONS, OPERATION_CALLERS, operationMode } from '../serviceOperations/definitions.ts';
import { XRAY_PUBLISHERS } from '../observability/xrayDocuments.ts';
import { cicdRelationship } from './cicdRelationships.ts';
import { nonIntegrationReason, serviceIntegration } from './serviceIntegrations.ts';
export { cicdRelationship } from './cicdRelationships.ts';
import { isEksManagementPair } from './eksRelationships.ts';
import type { Node } from '@xyflow/react';
import type { ConnectionData, ProtocolType } from '../../types/index.ts';
import { relationshipKind } from './relationships.ts';
import { SERVICE_ACTIONS } from '../iam/roleBuilder.ts';
import { isExternalActor } from './externalActors.ts';
/** Explicit educational interaction contracts. Missing services are UNKNOWN, never inferred from metadata. */
const inputs: Record<string, ProtocolType[]> = {
  kms: ['HTTPS'], secrets_manager: ['HTTPS'], acm: ['HTTPS'], kinesis: ['HTTPS'], neptune: ['HTTPS'], redshift: ['SQL','TCP'],
  xray: ['HTTPS'],
  amplify: ['HTTPS', 'HTTP'],
  s3: ['HTTPS', 'HTTP', 'Object access'], sqs: ['HTTPS', 'Message'], sns: ['HTTPS', 'Message', 'Event'],
  rds: ['SQL', 'TCP'], aurora: ['SQL', 'TCP'], dynamodb: ['HTTPS'], elasticache: ['TCP'],
  internet_gateway: ['TCP', 'HTTP', 'HTTPS'], nat_gateway: ['TCP', 'HTTP', 'HTTPS'],
  eks: ['HTTP', 'HTTPS', 'TCP', 'gRPC'],
  ec2: ['HTTPS', 'HTTP', 'TCP', 'SQL', 'gRPC'], ecs: ['HTTPS', 'HTTP', 'TCP', 'gRPC'],
  fargate: ['HTTPS', 'HTTP', 'TCP', 'gRPC'], alb: ['HTTPS', 'HTTP', 'gRPC'], nlb: ['TCP', 'HTTPS'],
  cloudfront: ['HTTPS', 'HTTP'], api_gateway: ['HTTPS', 'HTTP'], route53: ['DNS', 'HTTPS'],
  lambda: ['HTTPS', 'Event', 'Message'], cloudwatch: ['HTTPS', 'Event'], cloudtrail: ['HTTPS', 'Event'],
  s3_gateway_endpoint: ['HTTPS', 'Object access'], privatelink: ['HTTPS', 'TCP'],
  user: ['HTTPS', 'HTTP', 'TCP'], api_client: ['HTTPS', 'HTTP', 'TCP'], client_ui: ['HTTPS', 'HTTP'],
  // Third-party actors outside AWS (engine/architecture/externalActors.ts).
  developer: ['HTTPS', 'HTTP', 'TCP'], github: ['HTTPS'], gitlab: ['HTTPS'], bitbucket: ['HTTPS'], docker_hub: ['HTTPS'], on_premises: ['HTTPS', 'HTTP', 'TCP'],
  waf: ['HTTPS', 'HTTP'], eventbridge: ['HTTPS', 'Event'], step_functions: ['HTTPS', 'Event']
};
/** Supported operations per target: shared with the IAM role builder (engine/iam/roleBuilder.ts). */
const operations: Record<string, string[]> = { ...SERVICE_ACTIONS, ...Object.fromEntries(Object.entries(SERVICE_OPERATIONS).filter(([,d])=>!d.iam).map(([id,d])=>[id,d.actions])) };
/** Explicit bounded interaction coverage, independent of catalog metadata. */
export function hasConnectionContract(serviceId: string): boolean { return Object.prototype.hasOwnProperty.call(inputs, serviceId); }
/** Canvas defaults must distinguish control-plane links from application traffic. */
/** Policy-association illustration, not a credential exchange or forwarding hop.
 * AWS: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html
 */
export function isAuthorizationPair(source?: Node<any>, target?: Node<any>): boolean {
  return !!source && !!target && (((isExternalActor(source.data.serviceId) || ['ec2', 'lambda', 'ecs', 'fargate'].includes(source.data.serviceId)) && target.data.serviceId === 'iam') || (source.data.serviceId === 'iam' && target.data.serviceId === 's3'));
}
export function isManagementPair(source?: Node<any>, target?: Node<any>): boolean {
  if (!source || !target) return false;
  if (isEksManagementPair(source, target) || cicdRelationship(source, target) || serviceIntegration(source, target)) return true;
  const from = source.data.serviceId, to = target.data.serviceId;
  return (from === 'secrets_manager' && to === 'kms') || (['auto_scaling', 'ec2_auto_scaling'].includes(from) && to === 'ec2')
    || (from === 'cloudwatch' && to === 'ec2_auto_scaling')
    || (from === 'alb' && to === 'cloudwatch');
}
export function connectionProtocols(source?: Node<any>, target?: Node<any>): ProtocolType[] {
  if (!source || !target) return [];
  if (nonIntegrationReason(source, target)) return [];
  if (serviceIntegration(source, target)) return ['Event', 'HTTPS'];
  if (operationMode(target.data.serviceId,target.data.customConfig)) return OPERATION_CALLERS.includes(source.data.serviceId) ? [SERVICE_OPERATIONS[target.data.serviceId].protocol] : [];
  if (source.data.serviceId === 'xray') return [];
  if (target.data.serviceId === 'xray') return XRAY_PUBLISHERS.includes(source.data.serviceId) ? ['HTTPS'] : [];
  if (cicdRelationship(source, target)) return ['Event', 'HTTPS'];
  const result = inputs[target.data.serviceId] ?? [];
  if (['internet_gateway', 'nat_gateway'].includes(source.data.serviceId)) return result.filter(p => ['TCP', 'HTTP', 'HTTPS', 'Object access'].includes(p));
  if (source.data.serviceId === 'sqs' && ['ec2', 'ecs', 'fargate', 'lambda'].includes(target.data.serviceId)) return ['Message'];
  if (source.data.serviceId === 's3' && !['lambda', 'sns', 'sqs', 'eventbridge', 'cloudtrail', 'cloudwatch'].includes(target.data.serviceId) && !isExternalActor(target.data.serviceId)) return [];
  if (source.data.serviceId === 'sns') return ['sqs', 'lambda'].includes(target.data.serviceId) ? result.filter(p => ['Message', 'Event', 'HTTPS'].includes(p)) : [];
  return result;
}
export function connectionOperations(target?: Node<any>): string[] { return operations[target?.data.serviceId] ?? []; }
export function checkConnection(source: Node<any> | undefined, target: Node<any> | undefined, data?: Partial<ConnectionData>): { status: 'valid' | 'invalid' | 'unknown'; reason: string } {
  const bad = (reason: string) => ({ status: 'invalid' as const, reason });
  if (!source || !target) return bad('Connection references a missing resource.');
  if (source.id === target.id) return bad('A resource cannot connect to itself.');
  if (data?.destinationPort !== undefined && (!Number.isInteger(data.destinationPort) || data.destinationPort < 1 || data.destinationPort > 65535)) return bad('Destination port must be an integer from 1 to 65535.');
  const kind = relationshipKind(data);
  if (operationMode(target.data.serviceId,target.data.customConfig) && kind === 'dependency') return bad('This operation slice uses explicit request links; dependency-call execution is not modeled.');
  if (target.data.serviceId === 'xray' && kind === 'dependency') return bad('X-Ray supports explicit PutTraceSegments request links; automatic telemetry/dependency execution is not modeled.');
  if (kind === 'authorization') return isAuthorizationPair(source, target) ? { status: 'valid', reason: 'Authorization illustration, not a network hop. This line does not grant access; configured policies determine permission. Send the actual request directly to S3.' } : bad('Unsupported authorization illustration for this pair.');
  if (data?.referenceAnnotation && kind === 'manages') return { status: 'unknown', reason: 'Lab configuration link only. This relationship is editable but does not execute application traffic or prove AWS behavior.' };
  const nonIntegration = nonIntegrationReason(source, target);
  if (nonIntegration) return bad(nonIntegration);
  const integration = serviceIntegration(source, target);
  if (integration && (kind === 'request' || kind === 'manages')) {
    if (data?.protocol !== undefined && !['HTTPS', 'Event'].includes(data.protocol)) return bad('AWS service integrations use HTTPS or the Event teaching label, not application protocols.');
    if (data?.action || data?.destinationPort !== undefined) return bad('Configure this integration on the services; the relationship does not carry application requests or destination ports.');
    const scope = integration.executes ? 'Evaluated when the workflow runs.' : 'Documented relationship; the simulator does not execute it yet.';
    return { status: 'valid', reason: `AWS integration: ${integration.meaning}${integration.permissions && !integration.meaning.includes(integration.permissions[0]) ? ` Needs ${integration.permissions.join(', ')}.` : ''} ${scope}` };
  }
  const cicd = cicdRelationship(source, target);
  if (cicd && (kind === 'request' || kind === 'manages')) {
    if (data?.protocol !== undefined && !['HTTPS', 'Event'].includes(data.protocol)) return bad('CI/CD relationships use HTTPS or the Event teaching label, not application protocols.');
    if (data?.action || data?.destinationPort !== undefined) return bad('Configure CI/CD actions on the service; this relationship does not carry application requests or destination ports.');
    return { status: 'valid', reason: `Control-plane relationship: ${cicd} It is evaluated by its service, not as a network request.` };
  }
  if (kind === 'manages') return isManagementPair(source, target) ? { status: 'valid', reason: 'Management relationship; not request traffic.' } : { status: 'unknown', reason: 'Management relationship behavior is not modeled for this pair.' };
  if (kind === 'route-association' || kind === 'target-registration') return { status: 'unknown', reason: 'Structural relationship is not executable request traffic.' };
  if (source.type === 'boundaryNode' || target.type === 'boundaryNode') return bad('Boundary containers cannot send or receive application requests.');
  if (source.data.serviceId === 'sqs' && ['sqs', 'sqs_dlq'].includes(target.data.serviceId)) return { status: 'valid', reason: 'Dead-letter queue redrive relationship, evaluated by the queue service.' };
  if (target.data.serviceId === 'xray' && data?.destinationPort !== undefined && data.destinationPort !== 443) return bad('X-Ray API submission uses HTTPS port 443.');
  if (!inputs[source.data.serviceId] || !inputs[target.data.serviceId]) return { status: 'unknown', reason: 'Behavior not modeled: this service pair has no verified connection contract.' };
  if (data?.protocol === undefined) return { status: 'unknown', reason: 'Specify an interaction before running this connection.' };
  if (String(data.protocol) === 'S3 API' && target.data.serviceId === 's3') return { status: 'valid', reason: 'Legacy S3 API alias for HTTPS object access.' };
  if (String(data.protocol) === 'Replication' && source.data.serviceId === target.data.serviceId && ['rds', 'aurora'].includes(target.data.serviceId)) return { status: 'unknown', reason: 'Database replication is structural, not an executable client request.' };
  const allowed = connectionProtocols(source, target);
  const operation = SERVICE_OPERATIONS[target.data.serviceId];
  if (operationMode(target.data.serviceId,target.data.customConfig) && data?.action && !operation.actions.includes(data.action)) return {status:'unknown',reason:`Operation ${data.action} is outside this bounded service slice.`};
  if (!allowed.length) return bad('This source/destination interaction is not supported.');
  if (!allowed.includes(data?.protocol as ProtocolType)) return bad(`${source.data.label} → ${target.data.label}: ${data?.protocol ?? 'unspecified'} is invalid. Choose ${allowed.join(', ')}. Gateways forward packets; they do not execute application operations.`);
  if (data?.action && !connectionOperations(target).includes(data.action)) return bad(`Operation ${data.action} is not supported for ${target.data.serviceId}.`);
  if (data?.transport && data.transport !== (['HTTP', 'HTTPS', 'TCP'].includes(String(data.protocol)) ? data.protocol : data.protocol === 'DNS' ? 'UDP' : data.protocol === 'SQL' || data.protocol === 'gRPC' ? 'TCP' : 'HTTPS')) return bad('Transport does not match the selected interaction.');
  return { status: 'valid', reason: 'Interaction supported. Routing, security and IAM are evaluated separately.' };
}

export function interactionTransport(protocol: string): 'HTTP' | 'HTTPS' | 'TCP' | 'UDP' {
  if (protocol === 'HTTP' || protocol === 'HTTPS' || protocol === 'TCP') return protocol;
  if (protocol === 'DNS') return 'UDP';
  return protocol === 'SQL' || protocol === 'gRPC' ? 'TCP' : 'HTTPS';
}
