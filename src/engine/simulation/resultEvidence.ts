import type { SimulationResult, SimulationResultKind, SimulationOutcome } from '../../types/index.ts';

/** Presentation of stored evidence only: never re-evaluate the current architecture here. */
export function resultEvidence(result: SimulationResult): { kind: SimulationResultKind; outcome: SimulationOutcome } {
  return {
    kind: result.kind ?? 'request',
    outcome: result.outcome ?? (result.success ? 'success' : result.statusCode === 501 ? 'unsupported' : result.statusCode === 403 ? 'denied' : 'failure')
  };
}

export function resultLabel(result: SimulationResult): string {
  const { kind, outcome } = resultEvidence(result);
  if (kind !== 'request') return `${kind === 'configuration-check' ? 'Configuration' : 'Policy'} ${outcome === 'success' ? 'PASS' : 'FAIL'}`;
  return outcome === 'unsupported' ? 'Behavior not modeled' : `HTTP ${result.statusCode}`;
}
