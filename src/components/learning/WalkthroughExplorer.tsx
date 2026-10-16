import React, { useMemo, useState } from 'react';
import type { Node, Edge } from '@xyflow/react';
import type { ServiceNodeData, SimulationScenario } from '../../types/index.ts';
import { Modal } from '../ui/Modal.tsx';
import { WalkthroughView } from './WalkthroughView.tsx';
import { pipelineWalkthrough, codeDeployWalkthrough, networkPathWalkthrough } from '../../engine/explain/walkthrough.ts';
import { EC2_DEPLOYMENT_CONFIGS, ECS_DEPLOYMENT_CONFIGS, LAMBDA_DEPLOYMENT_CONFIGS, deploymentInstances, pipelinesTriggeredBy } from '../../engine/cicd/pipeline.ts';

/** Services whose multi-step behavior is explained by an engine-built walkthrough overlay. */
export const WALKTHROUGH_SERVICES = ['codepipeline', 'codecommit', 'codebuild', 'codedeploy', 'route_tables', 'nat_gateway', 'internet_gateway'];

export function WalkthroughExplorer({ node, nodes, edges, scenario, onClose }: {
  node: Node<ServiceNodeData>; nodes: Node<ServiceNodeData>[]; edges: Edge<any>[]; scenario: SimulationScenario; onClose: () => void;
}) {
  const service = node.data.serviceId;
  const [buildFails, setBuildFails] = useState<boolean | undefined>(undefined);
  const [config, setConfig] = useState<string | undefined>(undefined);
  const [failInstanceId, setFailInstanceId] = useState('');
  const [strict, setStrict] = useState(scenario.assumeRouteTables === false);

  const pipeline = service === 'codepipeline' ? node
    : service === 'codecommit' ? pipelinesTriggeredBy(node, nodes, edges)[0]
    : service === 'codebuild' ? nodes.find(n => n.data.serviceId === 'codepipeline' && edges.some(e => e.source === n.id && e.target === node.id)) : undefined;

  const walkthrough = useMemo(() => {
    if (service === 'codedeploy') return codeDeployWalkthrough(node, nodes, edges, { config, failInstanceId: failInstanceId || undefined }, scenario);
    if (['route_tables', 'nat_gateway', 'internet_gateway'].includes(service)) return networkPathWalkthrough(nodes, { assumeRouteTables: !strict });
    if (pipeline) return pipelineWalkthrough(pipeline, nodes, edges, scenario, { buildFails });
    return undefined;
  }, [service, node, nodes, edges, scenario, config, failInstanceId, strict, pipeline, buildFails]);

  const configs = codeDeployConfigs(node, nodes, edges);
  return <Modal isOpen onClose={onClose} title={node.data.label} meta="How it works · what-if changes do not edit your diagram" size="xl" closeLabel="Close walkthrough">
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 text-xs text-slate-700">
        {pipeline && <label className="flex items-center gap-2"><input type="checkbox" checked={buildFails === true} onChange={e => setBuildFails(e.target.checked ? true : undefined)} />What if the build fails</label>}
        {service === 'codedeploy' && <>
          <label className="flex items-center gap-2">Deployment configuration
            <select className="rounded border border-slate-300 px-1 py-0.5" value={config ?? ''} onChange={e => setConfig(e.target.value || undefined)}>
              <option value="">Configured</option>{configs.map(c => <option key={c} value={c}>{c.replace('CodeDeployDefault.', '')}</option>)}
            </select>
          </label>
          {deploymentInstances(node, nodes, edges).length > 0 && <label className="flex items-center gap-2">What if this instance fails
            <select className="rounded border border-slate-300 px-1 py-0.5" value={failInstanceId} onChange={e => setFailInstanceId(e.target.value)}>
              <option value="">None</option>{deploymentInstances(node, nodes, edges).map(i => <option key={i.id} value={i.id}>{i.data.label}</option>)}
            </select>
          </label>}
        </>}
        {['route_tables', 'nat_gateway', 'internet_gateway'].includes(service) && <label className="flex items-center gap-2"><input type="checkbox" checked={strict} onChange={e => setStrict(e.target.checked)} />Strict routing (only configured route tables)</label>}
      </div>
      {walkthrough
        ? <WalkthroughView walkthrough={walkthrough} ariaLabel={`${node.data.label} walkthrough`} />
        : <p className="text-sm text-slate-500">Connect this resource to a pipeline to see how an execution flows through it.</p>}
    </div>
  </Modal>;
}

function codeDeployConfigs(node: Node<ServiceNodeData>, nodes: Node<ServiceNodeData>[], edges: Edge<any>[]): readonly string[] {
  if (node.data.serviceId !== 'codedeploy') return [];
  const targets = edges.filter(e => e.source === node.id).map(e => nodes.find(n => n.id === e.target)?.data.serviceId);
  const platform = node.data.customConfig?.computePlatform ?? (targets.some(t => t === 'ecs' || t === 'fargate') ? 'ECS' : targets.includes('lambda') ? 'Lambda' : 'Server');
  return platform === 'ECS' ? ECS_DEPLOYMENT_CONFIGS : platform === 'Lambda' ? LAMBDA_DEPLOYMENT_CONFIGS : EC2_DEPLOYMENT_CONFIGS;
}
