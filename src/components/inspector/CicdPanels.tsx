import React from 'react';
import type { Node, Edge } from '@xyflow/react';
import { Play, GitCommit } from 'lucide-react';
import type { ServiceNodeData } from '../../types/index.ts';
import {
  resolvePipelineStages, validatePipelineStructure, PIPELINE_ROLE_ACTIONS, CODEBUILD_ROLE_ACTIONS, CODEBUILD_ECR_PUSH_ACTIONS,
  EC2_DEPLOYMENT_CONFIGS, ECS_DEPLOYMENT_CONFIGS, LAMBDA_DEPLOYMENT_CONFIGS, pipelinesTriggeredBy, connectionStatus, alarmState
} from '../../engine/cicd/pipeline.ts';
import { DEVELOPER_POLICY_PRESETS, pushTargets } from '../../engine/cicd/gitPush.ts';
import { isIntegrationLink } from '../../engine/architecture/serviceIntegrations.ts';
import { isCicdWorkflowLink } from '../../engine/architecture/cicdRelationships.ts';
import { servicePrincipalFor } from '../../engine/iam/servicePrincipals.ts';

/** Configuration surfaces only; behavior lives in engine/cicd/pipeline.ts. */
type Props = {
  node: Node<ServiceNodeData>;
  nodes: Node<any>[];
  edges: Edge<any>[];
  onConfig: (patch: Record<string, unknown>) => void;
};

const field = 'mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900';
const button = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#232F3E] hover:bg-[#1A232E] text-white text-xs font-medium disabled:opacity-40';
const cfg = (node: Node<any>) => (node.data.customConfig ?? {}) as Record<string, any>;

export function CodePipelinePanel({ node, nodes, edges, onRun }: Omit<Props, 'onConfig'> & { onRun: () => void }) {
  const stages = resolvePipelineStages(node, nodes, edges);
  const issues = validatePipelineStructure(stages, nodes);
  const store = edges.map(e => e.source === node.id ? nodes.find(n => n.id === e.target) : undefined).find(n => n?.data.serviceId === 's3');
  return <section className="space-y-3 text-xs">
    <div className="space-y-1.5">
      <span className="font-semibold text-slate-700">Stages</span>
      {stages.length === 0 && <p className="text-slate-500">Connect a source (CodeCommit, S3 or ECR) to this pipeline, then the pipeline to CodeBuild and a deploy target.</p>}
      <ol className="space-y-1">{stages.map((stage, i) => <li key={stage.name} className="flex gap-2">
        <span className="text-slate-400 font-mono">{i + 1}</span>
        <span className="font-medium text-slate-800 w-14 shrink-0">{stage.name}</span>
        <span className="text-slate-600">{stage.actions.map(a => `${a.provider} · ${nodes.find(n => n.id === a.nodeId)?.data.label ?? a.nodeId}`).join(', ')}</span>
      </li>)}</ol>
    </div>
    <p className="text-slate-500">Artifact store: {store ? store.data.label : 'AWS-created default bucket (not drawn)'}.</p>
    {issues.map(i => <p key={i.problem} role="alert" className="text-rose-700">{i.problem} {i.rule}</p>)}
    <button type="button" className={button} disabled={stages.length === 0} onClick={onRun}><Play className="w-3.5 h-3.5" />Run pipeline</button>
    <p className="text-slate-500">Stages run in order. A failed action stops the execution and later stages do not run.</p>
  </section>;
}

export function CodeCommitPanel({ node, nodes, edges, onConfig, onRun }: Props & { onRun: () => void }) {
  const pipelines = pipelinesTriggeredBy(node, nodes, edges);
  return <section className="space-y-3 text-xs">
    <label className="block font-semibold text-slate-700">Branch
      <input className={field} value={cfg(node).branch ?? 'main'} onChange={e => onConfig({ branch: e.target.value })} />
    </label>
    <button type="button" className={button} onClick={onRun}><GitCommit className="w-3.5 h-3.5" />Push commit</button>
    <p className="text-slate-500">{pipelines.length ? `A push runs ${[...pipelines].sort((a, b) => a.id < b.id ? -1 : 1)[0].data.label}. Multi-pipeline fan-out is not modeled.` : 'A push records a simulated commit event. Connect a pipeline to trigger a workflow.'}</p>
  </section>;
}

/** Developer outside AWS: Git push settings only; decisions live in engine/cicd/gitPush.ts. */
export function DeveloperPanel({ node, nodes, edges, onConfig, onRun }: Props & { onRun: () => void }) {
  const targets = pushTargets(node, nodes, edges);
  const c = cfg(node);
  const repo = targets.find(n => n.id === c.targetRepoId) ?? targets[0];
  return <section className="space-y-3 text-xs">
    {targets.length === 0 && <p className="text-slate-500">Connect this developer to a CodeCommit, GitHub, GitLab or Bitbucket repository to push commits.</p>}
    {targets.length > 1 && <label className="block font-semibold text-slate-700">Repository
      <select className={field} value={repo?.id} onChange={e => onConfig({ targetRepoId: e.target.value })}>
        {targets.map(t => <option key={t.id} value={t.id}>{t.data.label}</option>)}
      </select>
    </label>}
    <label className="block font-semibold text-slate-700">Branch
      <input className={field} value={c.branch ?? 'main'} onChange={e => onConfig({ branch: e.target.value })} />
    </label>
    <label className="flex items-center gap-2 text-slate-700">
      <input type="checkbox" checked={c.gitCredentials !== false} onChange={e => onConfig({ gitCredentials: e.target.checked })} />
      Git credentials configured (HTTPS Git credentials or SSH key)
    </label>
    {repo?.data.serviceId === 'codecommit' && <label className="block font-semibold text-slate-700">IAM permissions
      <select className={field} value={c.iamPolicy ?? 'power-user'} onChange={e => onConfig({ iamPolicy: e.target.value })}>
        {Object.entries(DEVELOPER_POLICY_PRESETS).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
      </select>
    </label>}
    <button type="button" className={button} disabled={!repo} onClick={onRun}><GitCommit className="w-3.5 h-3.5" />git push</button>
    <p className="text-slate-500">The push goes over the internet to the public Git endpoint; no VPC gateway is involved. A push to the branch a pipeline watches starts it.</p>
  </section>;
}

/** Third-party Git host used through a CodeConnections connection. */
export function GitProviderPanel({ node, nodes, edges, onConfig, onRun }: Props & { onRun: () => void }) {
  const c = cfg(node);
  const pipelines = pipelinesTriggeredBy(node, nodes, edges);
  return <section className="space-y-3 text-xs">
    <label className="block font-semibold text-slate-700">Repository (owner/name)
      <input className={field} value={c.fullRepositoryId ?? 'owner/repo'} onChange={e => onConfig({ fullRepositoryId: e.target.value })} />
    </label>
    <label className="block font-semibold text-slate-700">Branch the pipeline watches
      <input className={field} value={c.branch ?? 'main'} onChange={e => onConfig({ branch: e.target.value })} />
    </label>
    <label className="block font-semibold text-slate-700">Connection status
      <select className={field} value={connectionStatus(node)} onChange={e => onConfig({ connectionStatus: e.target.value })}>
        <option value="AVAILABLE">AVAILABLE (handshake completed)</option>
        <option value="PENDING">PENDING (handshake not completed)</option>
        <option value="ERROR">ERROR</option>
      </select>
    </label>
    <label className="flex items-center gap-2 text-slate-700">
      <input type="checkbox" checked={c.detectChanges !== false} onChange={e => onConfig({ detectChanges: e.target.checked })} />
      Start the pipeline on new commits (DetectChanges)
    </label>
    <button type="button" className={button} onClick={onRun}><GitCommit className="w-3.5 h-3.5" />Simulate push event</button>
    <p className="text-slate-500">{pipelines.length ? `Source for ${[...pipelines].sort((a, b) => a.id < b.id ? -1 : 1)[0].data.label}. The pipeline role needs codeconnections:UseConnection.` : 'Connect this repository to a CodePipeline to use it as a source.'}</p>
  </section>;
}

/** EventBridge rule matching CodeCommit push events; delivery decisions live in engine/cicd/gitPush.ts. */
export function EventRulePanel({ node, onConfig }: Pick<Props, 'node' | 'onConfig'>) {
  return <section className="space-y-3 text-xs">
    <label className="block font-semibold text-slate-700">Branch in event pattern (detail.referenceName)
      <input className={field} value={cfg(node).referenceName ?? 'main'} onChange={e => onConfig({ referenceName: e.target.value })} />
    </label>
    <p className="text-slate-500">Matches CodeCommit Repository State Change events from connected repositories and starts the connected CodeBuild project or pipeline. The rule's role needs the target action.</p>
  </section>;
}

/** Signing platform decides which Signer permissions the calling build role needs. */
export function SignerPanel({ node, onConfig }: Pick<Props, 'node' | 'onConfig'>) {
  return <section className="space-y-3 text-xs">
    <label className="block font-semibold text-slate-700">What is signed
      <select className={field} value={cfg(node).signingPlatform ?? 'container'} onChange={e => onConfig({ signingPlatform: e.target.value })}>
        <option value="container">Container image (Notation: SignPayload)</option>
        <option value="lambda">Lambda code (signing job: StartSigningJob)</option>
      </select>
    </label>
    <p className="text-slate-500">Lambda signing jobs also need versioned S3 source and destination buckets (not modeled).</p>
  </section>;
}

export function CodeBuildPanel({ node, nodes, edges, onConfig, onRun }: Props & { onRun: () => void }) {
  const c = cfg(node);
  const pushes = edges.some(e => e.source === node.id && nodes.find(n => n.id === e.target)?.data.serviceId === 'ecr_registry' && isCicdWorkflowLink(node, nodes.find(n => n.id === e.target), e.data));
  const sources = nodes.filter(n => ['codecommit', 's3'].includes(n.data.serviceId) && edges.some(e => e.source === n.id && e.target === node.id && isCicdWorkflowLink(n, node, e.data)));
  return <section className="space-y-3 text-xs">
    <label className="block font-semibold text-slate-700">Source type
      <select className={field} value={c.sourceType ?? ''} onChange={e => onConfig({ sourceType: e.target.value || undefined, ...(e.target.value === 'NO_SOURCE' && !c.buildspec?.includes('\n') ? { buildspec: 'version: 0.2\nphases:\n  build:\n    commands:\n      - echo hello' } : {}) })}>
        <option value="">From connected source</option><option value="CODECOMMIT">CodeCommit</option><option value="S3">S3</option><option value="NO_SOURCE">No source (inline buildspec)</option><option value="CODEPIPELINE">CodePipeline (run through pipeline)</option>
      </select>
    </label>
    {c.sourceType !== 'NO_SOURCE' && <>
      <label className="block font-semibold text-slate-700">Source resource
        <select className={field} value={c.sourceNodeId ?? ''} onChange={e => onConfig({ sourceNodeId: e.target.value || undefined })}>
          <option value="">From single connected source</option>{sources.map(n => <option key={n.id} value={n.id}>{n.data.label}</option>)}
        </select>
      </label>
      <label className="block font-semibold text-slate-700">S3 source object key (when using S3)
        <input className={field} value={c.sourceKey ?? ''} onChange={e => onConfig({ sourceKey: e.target.value })} placeholder="source.zip" />
      </label>
    </>}
    <label className="block font-semibold text-slate-700">Buildspec
      <textarea className={field} rows={c.sourceType === 'NO_SOURCE' ? 6 : 2} value={c.buildspec ?? 'buildspec.yml'} onChange={e => onConfig({ buildspec: e.target.value })} />
    </label>
    <label className="block font-semibold text-slate-700">Compute type
      <select className={field} value={c.computeType ?? 'BUILD_GENERAL1_SMALL'} onChange={e => onConfig({ computeType: e.target.value })}>
        {['BUILD_GENERAL1_SMALL', 'BUILD_GENERAL1_MEDIUM', 'BUILD_GENERAL1_LARGE', 'BUILD_GENERAL1_XLARGE', 'BUILD_GENERAL1_2XLARGE'].map(t => <option key={t}>{t}</option>)}
      </select>
    </label>
    <label className="flex items-center gap-2"><input type="checkbox" checked={c.privilegedMode === true} onChange={e => onConfig({ privilegedMode: e.target.checked })} />
      Privileged mode (required to build Docker images)</label>
    {pushes && c.privilegedMode !== true && <p role="alert" className="text-rose-700">This project pushes to ECR, so Docker builds need privileged mode.</p>}
    <label className="block font-semibold text-slate-700">Simulated build result
      <select className={field} value={c.buildResult ?? 'SUCCEEDED'} onChange={e => onConfig({ buildResult: e.target.value })}>
        <option value="SUCCEEDED">Commands succeed</option><option value="FAILED">A command fails</option>
      </select>
    </label>
    <button type="button" className={button} onClick={onRun}><Play className="w-3.5 h-3.5" />Start build</button>
    <p className="text-slate-500">Runs this project only. Buildspec commands and artifacts are simulated; connected deployments are not started.</p>
    <p className="text-slate-500">Inside a VPC, a build reaches the internet only through a NAT gateway: CodeBuild network interfaces never get public IPs.</p>
  </section>;
}

export function CodeDeployPanel({ node, nodes, edges, onConfig, onInstance, onRun }: Props & { onRun: () => void; onInstance: (id: string, patch: Record<string, unknown>) => void }) {
  const c = cfg(node);
  const targets = edges.filter(e => e.source === node.id && isCicdWorkflowLink(node, nodes.find(n => n.id === e.target), e.data)).map(e => nodes.find(n => n.id === e.target)).filter(Boolean) as Node<any>[];
  const inferred = targets.some(t => ['ecs', 'fargate'].includes(t.data.serviceId)) ? 'ECS' : targets.some(t => t.data.serviceId === 'lambda') ? 'Lambda' : 'Server';
  const platform = c.computePlatform ?? inferred;
  const configs = platform === 'ECS' ? ECS_DEPLOYMENT_CONFIGS : platform === 'Lambda' ? LAMBDA_DEPLOYMENT_CONFIGS : EC2_DEPLOYMENT_CONFIGS;
  const instances = nodes.filter(n => n.data.serviceId === 'ec2' && targets.some(t => t.id === n.id || (t.data.serviceId === 'ec2_auto_scaling' && n.data.customConfig?.asgInstance?.groupId === t.id)));
  const alarms = edges.filter(e => e.target === node.id && isIntegrationLink(nodes.find(n => n.id === e.source), node, e.data, 'codedeploy-alarm')).map(e => nodes.find(n => n.id === e.source)!);
  return <section className="space-y-3 text-xs">
    {alarms.map(alarm => <label key={alarm.id} className="block font-semibold text-slate-700">Alarm during rollout: {alarm.data.label}
      <select className={field} value={alarmState(alarm as any)} onChange={e => onInstance(alarm.id, { deploymentAlarmState: e.target.value })}>
        <option value="OK">OK</option><option value="ALARM">ALARM (stops the deployment)</option>
      </select>
    </label>)}
    <label className="block font-semibold text-slate-700">Revision S3 bucket (standalone deployment)
      <select className={field} value={c.revisionBucketId ?? ''} onChange={e => onConfig({ revisionBucketId: e.target.value || undefined })}>
        <option value="">Select bucket or connect one</option>{nodes.filter(n => n.data.serviceId === 's3').map(n => <option key={n.id} value={n.id}>{n.data.label}</option>)}
      </select>
    </label>
    <label className="block font-semibold text-slate-700">Revision object key
      <input className={field} value={c.revisionKey ?? ''} onChange={e => onConfig({ revisionKey: e.target.value })} placeholder="application.zip" />
    </label>
    <button type="button" className={button} onClick={onRun}><Play className="w-3.5 h-3.5" />Create deployment</button>
    <p className="text-slate-500">Deploys an existing revision. Builds are not run automatically. AppSpec contents and hook scripts are not simulated.</p>
    <label className="block font-semibold text-slate-700">Compute platform
      <select className={field} value={c.computePlatform ?? ''} onChange={e => onConfig({ computePlatform: e.target.value || undefined, deploymentConfig: undefined })}>
        <option value="">From targets ({inferred === 'Server' ? 'EC2/on-premises' : inferred})</option>
        <option value="Server">EC2/on-premises</option><option value="ECS">Amazon ECS</option><option value="Lambda">AWS Lambda</option>
      </select>
    </label>
    <label className="block font-semibold text-slate-700">Deployment configuration
      <select className={field} value={c.deploymentConfig ?? configs[0]} onChange={e => onConfig({ deploymentConfig: e.target.value })}>
        {configs.map(name => <option key={name} value={name}>{name.replace('CodeDeployDefault.', '')}</option>)}
      </select>
    </label>
    <label className="flex items-center gap-2"><input type="checkbox" checked={c.autoRollback === true} onChange={e => onConfig({ autoRollback: e.target.checked })} />
      Roll back automatically when a deployment fails</label>
    {platform === 'Server' && <div className="space-y-1">
      <span className="font-semibold text-slate-700">Instances ({instances.length})</span>
      {instances.length === 0 && <p className="text-slate-500">Connect EC2 instances or an Auto Scaling group to this deployment group.</p>}
      {instances.map(i => <label key={i.id} className="flex items-center gap-2">
        <input type="checkbox" checked={i.data.customConfig?.codeDeployAgent !== false} onChange={e => onInstance(i.id, { codeDeployAgent: e.target.checked })} />
        <span className="flex-1">{i.data.label} · agent installed</span>
        {!i.data.iamRole && <span className="text-amber-700">no instance profile</span>}
      </label>)}
    </div>}
    <p className="text-slate-500">{platform === 'Server' ? 'Instances need the CodeDeploy agent, outbound HTTPS 443 and an instance profile that can read the revision.' : platform === 'ECS' ? 'Blue/green needs a load balancer; with an NLB only ECSAllAtOnce is supported.' : 'Traffic shifts between Lambda alias versions.'}</p>
  </section>;
}

const ROLE_ACTIONS: Record<string, string[]> = {
  codepipeline: [...new Set(Object.values(PIPELINE_ROLE_ACTIONS).flat())],
  codebuild: ['codecommit:GitPull', ...CODEBUILD_ROLE_ACTIONS, ...CODEBUILD_ECR_PUSH_ACTIONS],
  // EventBridge rule execution role for CodeBuild / CodePipeline targets.
  eventbridge: ['codebuild:StartBuild', 'codepipeline:StartPipelineExecution'],
  codedeploy: ['ec2:DescribeInstances', 'autoscaling:DescribeAutoScalingGroups', 'ecs:CreateTaskSet', 'ecs:UpdateServicePrimaryTaskSet', 'elasticloadbalancing:ModifyListener', 'lambda:GetAlias', 'lambda:UpdateAlias']
};
export const CICD_ROLE_SERVICE_IDS = Object.keys(ROLE_ACTIONS);

export function CicdRolePanel({ node, onRole }: { node: Node<ServiceNodeData>; onRole: (role: ServiceNodeData['iamRole']) => void }) {
  const principal = servicePrincipalFor(node.data.serviceId);
  const actions = ROLE_ACTIONS[node.data.serviceId] ?? [];
  const role = node.data.iamRole;
  return <section className="space-y-2 text-xs">
    <p>{role ? `Attached: ${role.id}` : 'No service role modeled: permissions are reported as not evaluated.'}</p>
    {role
      ? <>
        <details><summary className="cursor-pointer">View policies</summary><pre className="overflow-auto max-h-48 whitespace-pre-wrap">{JSON.stringify(role, null, 2)}</pre></details>
        <button type="button" className="rounded border border-slate-300 px-2 py-1" onClick={() => onRole(undefined)}>Detach role</button>
      </>
      : <button type="button" className="rounded border border-slate-300 px-2 py-1" onClick={() => onRole({
        id: `${node.data.label ?? node.id}-service-role`.replace(/[^A-Za-z0-9+=,.@_-]/g, '-'),
        trustPolicy: { id: 'trust', kind: 'trust', statements: [{ effect: 'Allow', principals: [principal], actions: ['sts:AssumeRole'], resources: [] }] },
        identityPolicies: [{ id: 'permissions', kind: 'identity', statements: [{ effect: 'Allow', actions, resources: ['*'] }] }]
      })}>Create role with required permissions</button>}
    <p className="text-slate-500">Trusted by {principal}.</p>
  </section>;
}
