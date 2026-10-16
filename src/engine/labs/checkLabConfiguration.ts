import type { LabReference, LabConfigurationCheck } from '../../data/courseLabShared.ts';
import type { SimulationResult } from '../../types/index.ts';

function valueAt(value: unknown, path: string[]): unknown {
  for (const key of path) {
    if (value === null || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, key)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

/** Check the stated course configuration contracts, not service execution or deployment. */
export function checkLabConfiguration(ref: LabReference): SimulationResult {
  const checks = ref.configurationChecks ?? [];
  const steps = checks.map((check: LabConfigurationCheck, index) => {
    const node = ref.nodes.find(n => n.id === check.nodeId);
    const other = ref.nodes.find(n => n.id === check.otherNodeId);
    const actual = check.operator === 'connection' ? `${check.nodeId} → ${check.otherNodeId}` : valueAt(node?.data, check.path);
    const expected = check.otherPath ? valueAt(other?.data, check.otherPath) : check.expected;
    let passed = false;
    if (node) switch (check.operator) {
      case 'equals': passed = actual !== undefined && expected !== undefined && JSON.stringify(actual) === JSON.stringify(expected); break;
      case 'includes': passed = Array.isArray(actual) && actual.includes(expected); break;
      case 'numberedVersion': passed = typeof actual === 'string' && /^[1-9]\d*$/.test(actual); break;
      case 'connection': passed = Boolean(other && ref.edges.some(e => e.source === node.id && e.target === other.id)); break;
    }
    const explanation = `${passed ? 'PASS' : 'FAIL'}: ${check.reason} Actual: ${JSON.stringify(actual) ?? 'missing'}${check.operator === 'equals' || check.operator === 'includes' ? `; expected: ${JSON.stringify(expected) ?? 'missing'}` : ''}. Configuration evidence only.`;
    return {
      id: check.id, stepNumber: index + 1, timestampMs: 0,
      sourceNodeId: check.nodeId, targetNodeId: check.nodeId,
      sourceNodeName: node?.data.label ?? check.nodeId, targetNodeName: node?.data.label ?? check.nodeId,
      protocol: 'HTTPS' as const, action: 'Check reference configuration',
      status: passed ? 'success' as const : 'failed' as const, explanation,
      targetHealth: node?.data.health ?? 'healthy', latencyMs: 0,
      details: { decision: {
        order: index + 1, component: 'Service' as const, resource: node?.data.label ?? check.nodeId,
        operation: check.id, input: { field: check.path.join('.'), actual: actual ?? null, expected: expected ?? null },
        decision: passed ? 'SUCCESS' as const : 'FAILURE' as const,
        reason: explanation, simpleExplanation: check.reason, awsRule: check.source,
        metadata: { evidence: 'configuration-only', runtimeExecuted: false }
      } }
    };
  });
  const failed = steps.filter(step => step.status === 'failed');
  const success = checks.length > 0 && failed.length === 0;
  return { kind: 'configuration-check', outcome: success ? 'success' : 'failure', scenario: ref.scenario, steps, success, statusCode: success ? 200 : 400,
    totalLatencyMs: 0, path: [], bottlenecksDetected: [], cascadeOccurred: false,
    summary: `Configuration ${success ? 'PASS' : 'FAIL'}: ${steps.length - failed.length}/${steps.length} stated course checks passed. No request, function, build, deployment, metric evaluation or notification was executed.${failed.length ? ` ${failed[0].explanation}` : ''} ${ref.simulationScope ?? ''}` };
}
