import type { LabReference } from '../../data/courseLabs.ts';
import type { SimulationResult } from '../../types/index.ts';
import { runLiveSimulation } from '../simulation/liveSimulation.ts';
import { checkLabConfiguration } from './checkLabConfiguration.ts';
import { evaluateAuthorization } from '../iam/evaluate.ts';

/** Execute supplied course evidence, without inventing deployment or scaling behavior. */
export function runLabReference(reference: LabReference): SimulationResult {
  const ref = structuredClone(reference);
  if (ref.configurationChecks) return checkLabConfiguration(ref);
  if (!ref.authorization) {
    const result = runLiveSimulation(ref.nodes, ref.edges, ref.scenario);
    if (ref.simulationScope) result.summary += ` Reference scope: ${ref.simulationScope}`;
    return result;
  }
  const { principal, action, resourceArn } = ref.authorization;
  const result = evaluateAuthorization({ principal, action, resource: { arn: resourceArn, accountId: principal.accountId } });
  const success = result.effect === 'Allow';
  return { kind: 'authorization-check', outcome: success ? 'success' : 'denied', scenario: ref.scenario, success, statusCode: success ? 200 : 403, totalLatencyMs: 0,
    summary: `${result.finalReason} Scope: IAM policy evaluation only; no S3 network request or deployment was executed.`,
    path: ['lab-user', 'lab-bucket'], bottlenecksDetected: [], cascadeOccurred: false,
    steps: result.steps.map((step, i) => ({ id: `iam-${i}`, stepNumber: i + 1, timestampMs: 0,
      sourceNodeId: 'lab-user', targetNodeId: 'lab-bucket', sourceNodeName: principal.id,
      targetNodeName: 'S3 policy-test resource', protocol: 'Object access', action: step.stage,
      status: step.outcome === 'deny' ? 'failed' : 'success', explanation: step.detail,
      targetHealth: 'healthy', latencyMs: 0, details: { decision: {
        order: i + 1, component: 'IAM', resource: resourceArn, operation: step.stage,
        input: { principal: principal.id, action, resource: resourceArn },
        decision: step.outcome === 'deny' ? 'DENY' : step.outcome === 'allow' ? 'ALLOW' : 'INFO',
        reason: step.detail, simpleExplanation: step.detail,
        awsRule: 'IAM evaluation: implicit deny by default; applicable allows grant access; explicit deny overrides allow. https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html',
        metadata: { policiesConsidered: result.policiesConsidered }
      } }
    })) };
}
