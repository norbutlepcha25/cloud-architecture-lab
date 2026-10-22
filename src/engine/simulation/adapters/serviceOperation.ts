import { operationMode } from '../../serviceOperations/definitions.ts';
import { runServiceOperation } from '../../serviceOperations/runner.ts';
import { CONTINUE, TERMINATE, type Adapter } from './types.ts';
export const serviceOperationAdapter:Adapter=ctx=>{
  const target=ctx.downstreamNodes[0];
  if(!target || !operationMode(target.data.serviceId,target.data.customConfig)) return CONTINUE;
  const result=runServiceOperation(target,ctx.nodes,ctx.allEdges,ctx.scenario,ctx.node);
  for(const step of result.steps){const {id:_id,stepNumber:_step,timestampMs:_time,...fields}=step;ctx.trace.pushStep(fields);}
  Object.assign(ctx.trace.serviceStates,result.serviceStates);
  if(result.success) ctx.trace.succeed(result.statusCode,result.summary);else ctx.trace.fail(result.statusCode,result.summary);
  return TERMINATE;
};
