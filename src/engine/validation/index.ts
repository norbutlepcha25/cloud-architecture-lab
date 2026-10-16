import { validateNetworkIdentities } from '../architecture/networkIdentity.ts';
import type { Node, Edge } from '@xyflow/react';
import type { ServiceNodeData, ConnectionData } from '../../types/index.ts';
import type { Finding } from '../findings.ts';
import { validateCidrs } from './cidr.ts';
import { validateNetwork } from './network.ts';
import { validateRules } from './rules.ts';
import { validateDependencies } from './dependencies.ts';
import { validateServiceConfigurations } from './serviceConfig.ts';
import { validateIam } from './iam.ts';
import { validateProtocolCompatibility } from './protocol.ts';
import { sqsConfigurationIssues } from '../messaging/sqs.ts';
import { makeFinding } from '../findings.ts';

export type { Finding, FindingSeverity, FindingCategory } from '../findings.ts';
export { validateCidrs, validateNetwork, validateRules, validateDependencies, validateServiceConfigurations, validateIam, validateProtocolCompatibility };

/**
 * Whole-canvas structural configuration validity - "is this legal, well-formed AWS config?"
 * Deliberately answers nothing about whether a simulated request would succeed (`runSimulation`)
 * or whether the design itself is good (`engine/analysis`). A finding here means AWS itself would
 * refuse or malfunction on this exact configuration, regardless of health/traffic/design quality.
 */
export function validateArchitecture(
  nodes: Node<ServiceNodeData>[],
  edges: Edge<ConnectionData>[]
): Finding[] {
  return [
    ...validateNetworkIdentities(nodes),
    ...validateCidrs(nodes),
    ...validateNetwork(nodes, edges),
    ...validateRules(nodes),
    ...validateDependencies(nodes, edges),
    ...validateServiceConfigurations(nodes),
    ...validateIam(nodes, edges),
    ...validateProtocolCompatibility(nodes, edges),
    // SQS queue attributes AWS rejects (engine/messaging/sqs.ts).
    ...sqsConfigurationIssues(nodes, edges).map(issue => makeFinding('validation', 'messaging', {
      severity: 'HIGH', resource: issue.label, resourceId: issue.nodeId, problem: issue.problem,
      whyItMatters: 'AWS would reject this queue configuration.', awsRule: issue.rule,
      recommendation: 'Change the queue setting in the SQS panel.'
    }))
  ];
}
