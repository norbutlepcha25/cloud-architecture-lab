import type { RequestTrace } from './types.ts';

export type ExplanationMode = 'simple' | 'detailed';

/**
 * Renders a `RequestTrace` as the numbered, student-readable block the spec's own worked example
 * uses - `'detailed'` shows the full AWS reasoning + rule (`reason`/`awsRule`), `'simple'` shows
 * only the plain-English one-liner (`simpleExplanation`). Two view modes over ONE data model, per
 * this phase's "Educational Mode" requirement - no UI redesign, just a pure formatting function
 * either mode (or a future UI reading the `RequestTrace` object directly) can call.
 */
export function renderTrace(trace: RequestTrace, mode: ExplanationMode = 'detailed'): string {
  const lines: string[] = [];

  trace.entries.forEach((e, i) => {
    lines.push(`${i + 1}.`);
    lines.push(`${e.component}:`);
    lines.push(e.resource !== 'N/A' ? e.resource : '');
    if (mode === 'detailed') {
      lines.push(formatInput(e.input));
    }
    lines.push('');
    lines.push('DECISION:');
    lines.push(e.decision);
    if (mode === 'simple') {
      lines.push(e.simpleExplanation);
    } else {
      lines.push(e.reason);
      lines.push(`AWS RULE: ${e.awsRule}`);
    }
    lines.push('');
  });

  lines.push('FINAL:');
  lines.push(trace.final);
  if (trace.final !== 'SUCCESS') {
    lines.push('');
    lines.push('WHY:');
    lines.push(trace.why);
  }

  return lines.filter((line, i, arr) => !(line === '' && arr[i - 1] === '')).join('\n').trim();
}

function formatInput(input: Record<string, unknown>): string {
  const parts = Object.entries(input)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`);
  return parts.join(' ');
}

/** Every entry, reduced to just its plain-English sentence - the simplest possible "Simple
 *  explanation" view, e.g. for a student-facing summary list. */
export function toSimpleSummary(trace: RequestTrace): string[] {
  return trace.entries.map(e => e.simpleExplanation);
}

/** Every entry, as its full detailed AWS explanation with the rule that grounds it - the
 *  "Detailed AWS explanation" view. */
export function toDetailedSummary(trace: RequestTrace): { resource: string; reason: string; awsRule: string }[] {
  return trace.entries.map(e => ({ resource: e.resource, reason: e.reason, awsRule: e.awsRule }));
}
