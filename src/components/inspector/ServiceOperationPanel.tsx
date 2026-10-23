import React from 'react';
import type { Node, Edge } from '@xyflow/react';
import type { ServiceNodeData, ConnectionData, SimulationResult } from '../../types/index.ts';
import { SERVICE_OPERATIONS, operationSample } from '../../engine/serviceOperations/definitions.ts';
import { operationCallers, operationConfigurationIssues } from '../../engine/serviceOperations/runner.ts';

/** Shared presentation for service-owned operation schemas. Rules remain in serviceOperations. */
export function ServiceOperationPanel({ node,nodes,edges,result,onConfig,onRun }: {
  node:Node<ServiceNodeData>;nodes:Node<ServiceNodeData>[];edges:Edge<ConnectionData>[];result:SimulationResult|null;
  onConfig:(patch:Record<string,unknown>)=>void;onRun:()=>void;
}) {
  const d=SERVICE_OPERATIONS[node.data.serviceId];
  const settings=node.data.customConfig?.operationLab;
  const patch=(values:Record<string,unknown>)=>onConfig({operationLab:{action:d.actions[0],resource:'{}',request:'{}',...settings,...values}});
  const text=(value:unknown)=>typeof value==='string'?value:JSON.stringify(value??{},null,2);
  const response=[...(result?.steps??[])].reverse().find(step=>step.targetNodeId===node.id && step.details?.operationResponse)?.details?.operationResponse;
  return <section className="space-y-3 text-xs">
    <p>{d.scope}</p>
    <p className="text-slate-500">Author an explicit operation below. Existing service configuration and legacy teaching scenarios remain separate. Example values are synthetic training data.</p>
    <button type="button" className="rounded border px-2 py-1" onClick={()=>onConfig({operationLab:operationSample(node.data.serviceId)})}>Load operation example</button>
    <label className="block font-semibold">Operation
      <select aria-label="Service operation" className="mt-1 block w-full rounded border p-2" value={settings?.action??d.actions[0]} onChange={e=>patch({action:e.target.value})}>
        {d.actions.map(action=><option key={action}>{action}</option>)}
      </select>
    </label>
    <label className="block font-semibold">Connected caller
      <select aria-label="Operation caller" className="mt-1 block w-full rounded border p-2" value={settings?.callerId??''} onChange={e=>patch({callerId:e.target.value||undefined})}>
        <option value="">Use single connected caller</option>{operationCallers(node,nodes,edges).map(n=><option key={n.id} value={n.id}>{n.data.label}</option>)}
      </select>
    </label>
    <p className="text-slate-500">Connect EC2, Lambda, ECS or Fargate using {d.protocol}. {d.iam?'The caller needs its own role. Configure permissions on the caller’s existing role panel.':'Private connection checks require subnet placement. Credential validity is a training input; actual passwords and authentication handshakes are not simulated.'}</p>
    <label className="block font-semibold">Resource settings (JSON)
      <textarea aria-label="Operation resource settings" rows={7} className="mt-1 block w-full rounded border p-2 font-mono" value={text(settings?.resource)} onChange={e=>patch({resource:e.target.value})}/>
    </label>
    <label className="block font-semibold">Request settings (JSON)
      <textarea aria-label="Operation request settings" rows={7} className="mt-1 block w-full rounded border p-2 font-mono" value={text(settings?.request)} onChange={e=>patch({request:e.target.value})}/>
    </label>
    {operationConfigurationIssues(node).map(message=><p key={message} role="alert" className="text-rose-700">{message}</p>)}
    <button type="button" disabled={!settings} className="rounded bg-slate-800 px-3 py-2 text-white disabled:opacity-40" onClick={onRun}>Run service operation</button>
    {response !== undefined && <pre aria-label="Service operation response" className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded border p-2">{JSON.stringify(response,null,2)}</pre>}
    <p className="text-slate-500">Stored records: {node.data.customConfig?.serviceRuntime?.records?.length??0}. Run actions preserve the saved request start. More information explains this evaluator’s decisions.</p>
    <a className="text-blue-700 underline" href={d.source} target="_blank" rel="noreferrer">AWS operation documentation</a>
  </section>;
}
