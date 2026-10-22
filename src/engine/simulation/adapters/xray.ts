import { runXraySubmission } from '../../observability/xray.ts';
import { CONTINUE, TERMINATE, type Adapter } from './types.ts';

export const xrayAdapter: Adapter = ctx => {
  const target = ctx.downstreamNodes[0];
  if (target?.data.serviceId !== 'xray') return CONTINUE;
  const result = runXraySubmission(target, ctx.nodes, ctx.allEdges, ctx.scenario, ctx.node);
  for (const step of result.steps) {
    const { id: _id, stepNumber: _number, timestampMs: _time, ...fields } = step;
    ctx.trace.pushStep(fields);
  }
  Object.assign(ctx.trace.serviceStates, result.serviceStates);
  if (result.success) ctx.trace.succeed(result.statusCode, result.summary); else ctx.trace.fail(result.statusCode, result.summary);
  return TERMINATE;
};
