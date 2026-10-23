import type { ServiceModel } from '../service/types.ts';
import { initialRuntime } from '../services/operations.ts';
import { SERVICE_OPERATIONS, operationMode } from './definitions.ts';
import { operationConfigurationIssues, operationSettings } from './runner.ts';
import { OPERATION_HANDLERS } from './handlers.ts';
import { OperationError } from './types.ts';

/** Existing model behavior is preserved outside explicit operation mode. No duplicate handler rules. */
export function withServiceOperations(id:string, base?:ServiceModel):ServiceModel {
  const d=SERVICE_OPERATIONS[id];
  return {
    id,tier:base?.tier ?? 2,description:`${base?.description ?? d.name} Bounded operation slice: ${d.scope}`,
    validateConfiguration:node=>[...(base?.validateConfiguration(node) ?? []),...operationConfigurationIssues({data:node} as any).map(message=>({field:'operationLab',message}))],
    resolveEndpoints:node=>base?.resolveEndpoints(node) ?? ({requiresEni:!d.iam,isIngressProxy:false,isManagedEventTarget:false,isVpcEndpoint:null}),
    canReceive:(node,action)=>operationMode(id,node.customConfig) ? {ok:d.actions.includes(action),reason:d.scope}:base?.canReceive(node,action) ?? {ok:d.actions.includes(action),reason:d.scope},
    canSend:(node,action)=>base?.canSend(node,action) ?? {ok:false,reason:'This resource is not a generic application forwarding hop.'},
    processRequest:input=>{
      if(!operationMode(id,input.target.customConfig) && base) return base.processRequest(input);
      try {
        const target:any={id:input.target.label,data:input.target,position:{x:0,y:0}};
        const settings=operationSettings(target);
        const output=OPERATION_HANDLERS[id]({...settings,id:target.id,runtime:structuredClone(input.target.customConfig?.serviceRuntime ?? initialRuntime()) as ReturnType<typeof initialRuntime>,nodes:[target],edges:[],authorizeKey:()=>{throw new OperationError(501,'KMS dependency authorization requires the live operation dispatcher.');}});
        return {status:'success',detail:`${d.name} service-only handler evaluated. Caller authorization and network reachability require live execution. ${JSON.stringify(output.response)}`};
      }catch(e){return {status:'failure',statusCode:e instanceof OperationError?e.code:400,reason:e instanceof Error?e.message:String(e)};}
    },
    getDependencies:()=>base?.getDependencies() ?? [],getFailureModes:()=>base?.getFailureModes() ?? []
  };
}
