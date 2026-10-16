import type { Node, Edge } from '@xyflow/react';
import type { ServiceNodeData, ConnectionData, SimulationScenario, SimulationResult, SimulationStep } from '../../types/index.ts';
import type { TraceEntry } from '../trace/types.ts';
import { assumeRole } from '../iam/roleAssumption.ts';
import { evaluateAuthorization } from '../iam/evaluate.ts';
import { normalizeTrustPolicy, servicePrincipalFor } from '../iam/servicePrincipals.ts';
import { evaluateInternetEgress } from '../network/subnetRouting.ts';
import { findContainingSubnetBoundary } from '../layout/containment.ts';

/**
 * CI/CD workflow behavior for AWS CodeCommit, CodeBuild, CodeDeploy and CodePipeline.
 * Specs: docs/behavior/{codepipeline,codebuild,codedeploy,codecommit}.md (sources verified 2026-10-17).
 *
 * A pipeline execution is a control-plane workflow, not a network request: stages run in order,
 * an action failure stops the execution, and later stages are not run. Each action is evaluated
 * against configuration rules, the service role (IAM engine), resource health and, where the
 * action runs inside a VPC, the route-table engine.
 */

type N = Node<ServiceNodeData>;
type E = Edge<ConnectionData>;

export type ActionCategory = 'Source' | 'Build' | 'Test' | 'Deploy';
export type ActionProvider = 'CodeCommit' | 'S3' | 'ECR' | 'CodeBuild' | 'CodeDeploy' | 'ECS';

export interface PipelineAction {
  name: string;
  category: ActionCategory;
  provider: ActionProvider;
  nodeId: string;
  inputArtifacts: string[];
  outputArtifacts: string[];
}
export interface PipelineStage { name: string; actions: PipelineAction[] }

/** Valid providers per category (CodePipeline "Valid action providers"), limited to modeled ones. */
export const VALID_PROVIDERS: Record<ActionCategory, ActionProvider[]> = {
  Source: ['CodeCommit', 'S3', 'ECR'],
  Build: ['CodeBuild'],
  Test: ['CodeBuild'],
  Deploy: ['CodeDeploy', 'ECS']
};

const PROVIDER_SERVICE: Record<ActionProvider, string[]> = {
  CodeCommit: ['codecommit'], S3: ['s3'], ECR: ['ecr_registry'], CodeBuild: ['codebuild'],
  CodeDeploy: ['codedeploy'], ECS: ['ecs', 'fargate']
};

/** Service-role permissions each action needs (documented AWS managed-policy actions, subset). */
export const PIPELINE_ROLE_ACTIONS: Record<ActionProvider, string[]> = {
  CodeCommit: ['codecommit:GetBranch', 'codecommit:GetCommit', 'codecommit:UploadArchive', 'codecommit:GetUploadArchiveStatus'],
  S3: ['s3:GetObject', 's3:GetObjectVersion'],
  ECR: ['ecr:DescribeImages'],
  CodeBuild: ['codebuild:StartBuild', 'codebuild:BatchGetBuilds'],
  CodeDeploy: ['codedeploy:CreateDeployment', 'codedeploy:GetDeployment', 'codedeploy:GetDeploymentConfig', 'codedeploy:GetApplicationRevision', 'codedeploy:RegisterApplicationRevision'],
  ECS: ['ecs:DescribeServices', 'ecs:RegisterTaskDefinition', 'ecs:UpdateService', 'iam:PassRole']
};
export const CODEBUILD_ROLE_ACTIONS = ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents', 's3:GetObject', 's3:PutObject'];
/** From the CodeBuild "Publish Docker image to Amazon ECR" sample policy. */
export const CODEBUILD_ECR_PUSH_ACTIONS = ['ecr:BatchCheckLayerAvailability', 'ecr:CompleteLayerUpload', 'ecr:GetAuthorizationToken', 'ecr:InitiateLayerUpload', 'ecr:PutImage', 'ecr:UploadLayerPart'];

export const EC2_DEPLOYMENT_CONFIGS = ['CodeDeployDefault.OneAtATime', 'CodeDeployDefault.HalfAtATime', 'CodeDeployDefault.AllAtOnce'] as const;
export const ECS_DEPLOYMENT_CONFIGS = ['CodeDeployDefault.ECSAllAtOnce', 'CodeDeployDefault.ECSLinear10PercentEvery1Minutes', 'CodeDeployDefault.ECSLinear10PercentEvery3Minutes', 'CodeDeployDefault.ECSCanary10Percent5Minutes', 'CodeDeployDefault.ECSCanary10Percent15Minutes'] as const;
export const LAMBDA_DEPLOYMENT_CONFIGS = ['CodeDeployDefault.LambdaAllAtOnce', 'CodeDeployDefault.LambdaCanary10Percent5Minutes', 'CodeDeployDefault.LambdaCanary10Percent10Minutes', 'CodeDeployDefault.LambdaCanary10Percent15Minutes', 'CodeDeployDefault.LambdaCanary10Percent30Minutes', 'CodeDeployDefault.LambdaLinear10PercentEvery1Minute', 'CodeDeployDefault.LambdaLinear10PercentEvery2Minutes', 'CodeDeployDefault.LambdaLinear10PercentEvery3Minutes', 'CodeDeployDefault.LambdaLinear10PercentEvery10Minutes'] as const;

const cfg = (node: N | undefined): Record<string, any> => (node?.data.customConfig ?? {}) as Record<string, any>;
const sid = (node: N | undefined) => node?.data.serviceId;
const label = (node: N | undefined) => String(node?.data.label ?? node?.id ?? 'unknown');

/** EC2 instances an Auto Scaling group or deployment group reaches. */
function instancesOf(target: N, nodes: N[]): N[] {
  if (sid(target) === 'ec2') return [target];
  if (sid(target) === 'ec2_auto_scaling') {
    return nodes.filter(n => sid(n) === 'ec2' && cfg(n).asgInstance?.groupId === target.id);
  }
  return [];
}

/** Stages from explicit `customConfig.pipeline.stages`, otherwise derived from canvas relationships. */
export function resolvePipelineStages(pipeline: N, nodes: N[], edges: E[]): PipelineStage[] {
  const explicit = cfg(pipeline).pipeline?.stages;
  if (Array.isArray(explicit) && explicit.length && typeof explicit[0] === 'object') return explicit as PipelineStage[];

  const byId = new Map(nodes.map(n => [n.id, n]));
  const into = edges.filter(e => e.target === pipeline.id).map(e => byId.get(e.source)).filter(Boolean) as N[];
  const from = edges.filter(e => e.source === pipeline.id).map(e => byId.get(e.target)).filter(Boolean) as N[];
  const sources = into.filter(n => ['codecommit', 's3', 'ecr_registry'].includes(sid(n)!));
  const builds = from.filter(n => sid(n) === 'codebuild');
  const deployTargets = [
    ...from.filter(n => ['codedeploy', 'ecs', 'fargate'].includes(sid(n)!)),
    ...builds.flatMap(b => edges.filter(e => e.source === b.id).map(e => byId.get(e.target)).filter(n => sid(n) === 'codedeploy') as N[])
  ].filter((n, i, all) => all.findIndex(m => m.id === n.id) === i);

  const stages: PipelineStage[] = [];
  const sourceOut = sources.map((_, i) => i === 0 ? 'SourceArtifact' : `SourceArtifact${i + 1}`);
  if (sources.length) stages.push({ name: 'Source', actions: sources.map((n, i) => ({
    name: label(n).replace(/[^A-Za-z0-9.@_-]/g, '-'), category: 'Source',
    provider: sid(n) === 'codecommit' ? 'CodeCommit' : sid(n) === 's3' ? 'S3' : 'ECR',
    nodeId: n.id, inputArtifacts: [], outputArtifacts: [sourceOut[i]]
  })) });
  if (builds.length) stages.push({ name: 'Build', actions: builds.map((n, i) => ({
    name: label(n).replace(/[^A-Za-z0-9.@_-]/g, '-'), category: 'Build', provider: 'CodeBuild', nodeId: n.id,
    inputArtifacts: sourceOut.length ? [sourceOut[0]] : [], outputArtifacts: [i === 0 ? 'BuildArtifact' : `BuildArtifact${i + 1}`]
  })) });
  if (deployTargets.length) stages.push({ name: 'Deploy', actions: deployTargets.map(n => ({
    name: label(n).replace(/[^A-Za-z0-9.@_-]/g, '-'), category: 'Deploy',
    provider: sid(n) === 'codedeploy' ? 'CodeDeploy' : 'ECS', nodeId: n.id,
    inputArtifacts: builds.length ? ['BuildArtifact'] : sourceOut.length ? [sourceOut[0]] : [], outputArtifacts: []
  })) });
  return stages;
}

export interface PipelineIssue { problem: string; rule: string; source: string }

/** Pipeline structure rules (CodePipeline quotas and action declaration reference). */
export function validatePipelineStructure(stages: PipelineStage[], nodes: N[]): PipelineIssue[] {
  const issues: PipelineIssue[] = [];
  const quotas = 'https://docs.aws.amazon.com/codepipeline/latest/userguide/limits.html';
  const actionRef = 'https://docs.aws.amazon.com/codepipeline/latest/userguide/action-requirements.html';
  if (stages.length < 2 || stages.length > 50) issues.push({ problem: `The pipeline has ${stages.length} stage(s).`, rule: 'A pipeline needs between 2 and 50 stages.', source: quotas });
  for (const stage of stages) if (stage.actions.length < 1 || stage.actions.length > 50) {
    issues.push({ problem: `Stage ${stage.name} has ${stage.actions.length} action(s).`, rule: 'Each stage needs between 1 and 50 actions.', source: quotas });
  }
  const all = stages.flatMap(s => s.actions);
  if (!all.some(a => a.category === 'Source')) issues.push({ problem: 'No source action.', rule: 'A source action is required for each pipeline.', source: actionRef });
  const produced = new Set<string>();
  const outputs = new Set<string>();
  for (const stage of stages) {
    for (const action of stage.actions) {
      if (!VALID_PROVIDERS[action.category]?.includes(action.provider)) {
        issues.push({ problem: `${action.name}: ${action.provider} is not a valid ${action.category} provider.`, rule: 'Each action category has a fixed set of valid providers.', source: 'https://docs.aws.amazon.com/codepipeline/latest/userguide/actions-valid-providers.html' });
      }
      const node = nodes.find(n => n.id === action.nodeId);
      if (!node || !PROVIDER_SERVICE[action.provider].includes(sid(node)!)) {
        issues.push({ problem: `${action.name}: the ${action.provider} resource is missing.`, rule: 'An action must reference an existing resource of its provider type.', source: actionRef });
      }
      if (action.category === 'Source' && action.inputArtifacts.length) issues.push({ problem: `${action.name} has input artifacts.`, rule: 'Source actions do not have input artifacts.', source: actionRef });
      if (action.category === 'Deploy' && action.outputArtifacts.length) issues.push({ problem: `${action.name} has output artifacts.`, rule: 'Deploy actions do not have output artifacts.', source: actionRef });
      for (const input of action.inputArtifacts) if (!produced.has(input)) {
        issues.push({ problem: `${action.name} reads ${input}, which no earlier action produces.`, rule: 'An input artifact must exactly match an output artifact of a preceding action.', source: actionRef });
      }
      for (const output of action.outputArtifacts) {
        if (outputs.has(output)) issues.push({ problem: `Output artifact ${output} is declared twice.`, rule: 'Output artifact names must be unique in a pipeline.', source: actionRef });
        outputs.add(output);
      }
    }
    for (const action of stage.actions) action.outputArtifacts.forEach(o => produced.add(o));
  }
  return issues;
}

interface RoleCheck { decision: 'ALLOW' | 'DENY' | 'NOT_EVALUATED'; reason: string }

/** Evaluates the resource's own service role for each action through the IAM engine. */
export function evaluateServiceRole(owner: N, actions: string[], resourceArn = '*'): RoleCheck {
  const role = owner.data.iamRole;
  if (!role) return { decision: 'NOT_EVALUATED', reason: `${label(owner)} has no service role modeled, so its permissions were not evaluated. AWS requires a service role; attach one in the IAM role panel to evaluate it.` };
  const principal = servicePrincipalFor(sid(owner)!);
  const assumed = assumeRole({ id: principal, kind: 'service', accountId: '000000000000', identityPolicies: [] }, {
    id: role.id, kind: 'role', accountId: '000000000000',
    trustPolicy: normalizeTrustPolicy(role.trustPolicy, sid(owner)!), identityPolicies: role.identityPolicies ?? [], permissionsBoundary: role.permissionsBoundary
  });
  if (!assumed.allowed) return { decision: 'DENY', reason: assumed.reason };
  for (const action of actions) {
    const decision = evaluateAuthorization({ principal: assumed.sessionPrincipal!, action, resource: { arn: resourceArn, accountId: '000000000000' } });
    if (decision.effect !== 'Allow') return { decision: 'DENY', reason: `${role.id} does not allow ${action}. ${decision.finalReason}` };
  }
  return { decision: 'ALLOW', reason: `${role.id} (trusted by ${principal}) allows ${actions.join(', ')}.` };
}

class Run {
  steps: SimulationStep[] = [];
  time = 0;
  private n = 0;
  private pipeline: N;
  constructor(pipeline: N) { this.pipeline = pipeline; }
  push(target: N | undefined, action: string, ok: boolean | 'skipped', explanation: string, decision?: Partial<TraceEntry>) {
    this.n += 1;
    this.time += ok === 'skipped' ? 0 : 5;
    this.steps.push({
      id: `pipeline-step-${this.n}`, stepNumber: this.n, timestampMs: this.time,
      sourceNodeId: this.pipeline.id, targetNodeId: target?.id ?? this.pipeline.id,
      sourceNodeName: label(this.pipeline), targetNodeName: label(target ?? this.pipeline),
      protocol: 'HTTPS', action, status: ok === 'skipped' ? 'bypassed' : ok ? 'success' : 'failed',
      explanation, targetHealth: target?.data.health ?? 'healthy', latencyMs: ok === 'skipped' ? 0 : 5,
      details: decision ? { decision: {
        order: this.n, component: 'Service', resource: label(target), operation: action,
        input: {}, decision: ok === true ? 'ALLOW' : ok === 'skipped' ? 'INFO' : 'DENY',
        reason: explanation, simpleExplanation: explanation, awsRule: '', metadata: {}, ...decision
      } as TraceEntry } : undefined
    });
  }
}

/** One role check step; false when it denied. */
function roleStep(run: Run, owner: N, actions: string[], what: string, resourceArn?: string): boolean {
  const check = evaluateServiceRole(owner, actions, resourceArn);
  run.push(owner, `${what}: service role`, check.decision === 'DENY' ? false : true,
    check.decision === 'NOT_EVALUATED' ? `Not evaluated: ${check.reason}` : check.reason,
    { component: 'IAM', operation: 'evaluate-service-role', decision: check.decision === 'NOT_EVALUATED' ? 'INFO' : check.decision,
      awsRule: 'A service assumes its service role (trust policy) and needs an explicit Allow for each API action. https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html' });
  return check.decision !== 'DENY';
}

function sourceAction(run: Run, pipeline: N, action: PipelineAction, node: N): boolean {
  if (node.data.health === 'failed') { run.push(node, `Source: ${action.provider}`, false, `${label(node)} is unavailable.`); return false; }
  if (action.provider === 'S3') {
    const c = cfg(node);
    if (c.versioning !== true) {
      run.push(node, 'Source: S3', false, `${label(node)} does not have versioning enabled. An S3 source action requires a versioned bucket.`,
        { component: 'Service', awsRule: 'S3 source actions require bucket versioning. https://docs.aws.amazon.com/codepipeline/latest/userguide/action-reference-S3.html' });
      return false;
    }
    if (!c.sourceKey && !c.objectKey) { run.push(node, 'Source: S3', false, `${label(node)} has no source object key configured.`); return false; }
    const arn = `arn:aws:s3:::${c.bucketName ?? node.id}/${c.sourceKey ?? c.objectKey}`;
    if (!roleStep(run, pipeline, PIPELINE_ROLE_ACTIONS.S3, 'Source', arn)) return false;
    run.push(node, 'Source: S3', true, `Read ${c.sourceKey ?? c.objectKey} (latest version) from ${label(node)} as ${action.outputArtifacts.join(', ')}.`);
    return true;
  }
  if (!roleStep(run, pipeline, PIPELINE_ROLE_ACTIONS[action.provider], 'Source')) return false;
  const detail = action.provider === 'CodeCommit' ? `branch ${cfg(node).branch ?? 'main'}` : `image tag ${cfg(node).imageTag ?? 'latest'}`;
  run.push(node, `Source: ${action.provider}`, true, `Fetched ${detail} from ${label(node)} as ${action.outputArtifacts.join(', ')}.`);
  return true;
}

function buildAction(run: Run, pipeline: N, action: PipelineAction, build: N, nodes: N[], edges: E[], options: { assumeRouteTables?: boolean }): boolean {
  if (build.data.health === 'failed') { run.push(build, 'Build: CodeBuild', false, `${label(build)} is unavailable.`); return false; }
  if (!roleStep(run, pipeline, PIPELINE_ROLE_ACTIONS.CodeBuild, 'Build (start)')) return false;
  const c = cfg(build);
  const pushes = c.pushesImage === true || edges.some(e => e.source === build.id && sid(nodes.find(n => n.id === e.target)) === 'ecr_registry');
  if (!roleStep(run, build, pushes ? [...CODEBUILD_ROLE_ACTIONS, ...CODEBUILD_ECR_PUSH_ACTIONS] : CODEBUILD_ROLE_ACTIONS, 'Build (project)')) return false;

  // Builds in a VPC reach public endpoints only through NAT: CodeBuild ENIs never get public IPs.
  if (findContainingSubnetBoundary(build, nodes)) {
    const egress = evaluateInternetEgress(build, 'internet', nodes, { assume: options.assumeRouteTables });
    const ok = egress.outcome === 'legacy' || (egress.outcome === 'allowed' && egress.via === 'nat');
    const reason = egress.outcome === 'allowed' && egress.via === 'igw'
      ? `${label(build)} runs in a subnet routed to an internet gateway. CodeBuild network interfaces never get a public IP, so it cannot use the internet gateway; use a private subnet with a NAT gateway.`
      : egress.reason;
    run.push(build, 'Build: VPC network access', ok, ok ? (egress.outcome === 'legacy' ? 'VPC placement without explicit routing; NAT access assumed.' : reason) : reason,
      { component: 'Route', awsRule: 'A VPC-enabled CodeBuild project needs a NAT gateway or NAT instance; an internet gateway cannot be used. https://docs.aws.amazon.com/codebuild/latest/userguide/vpc-support.html' });
    if (!ok) return false;
  }
  if (pushes && c.privilegedMode !== true) {
    run.push(build, 'Build: Docker image', false, `${label(build)} builds and pushes a Docker image but privileged mode is off, so commands that use the Docker daemon fail.`,
      { awsRule: 'privilegedMode must be true to build Docker images. https://docs.aws.amazon.com/codebuild/latest/APIReference/API_ProjectEnvironment.html' });
    return false;
  }
  if (c.buildResult === 'FAILED') {
    run.push(build, 'Build: buildspec', false, `A command in ${c.buildspec ?? 'buildspec.yml'} exited with an error (simulated build input). No output artifact was produced.`);
    return false;
  }
  run.push(build, 'Build: CodeBuild', true, `Ran ${c.buildspec ?? 'buildspec.yml'} on ${c.computeType ?? 'BUILD_GENERAL1_SMALL'}${pushes ? ', pushed the image to ECR' : ''} and produced ${action.outputArtifacts.join(', ') || 'no artifact'}.`);
  return true;
}


/** Why the revision cannot be installed on one EC2 target (empty = it can). */
export function instanceDeploymentProblems(instance: N, nodes: N[], options: { assumeRouteTables?: boolean }): string[] {
  const reasons: string[] = [];
  if (instance.data.health === 'failed') reasons.push('instance is unavailable');
  if (cfg(instance).codeDeployAgent === false) reasons.push('the CodeDeploy agent is not installed');
  if (!instance.data.iamRole) reasons.push('no instance profile to download the revision from the artifact bucket');
  if (findContainingSubnetBoundary(instance, nodes)) {
    const egress = evaluateInternetEgress(instance, 'codedeploy', nodes, { assume: options.assumeRouteTables });
    if (egress.outcome === 'denied' || egress.outcome === 'invalid') reasons.push(`the agent cannot reach the CodeDeploy endpoint over HTTPS 443 (${egress.reason})`);
  }
  return reasons;
}

/** EC2 instances a CodeDeploy deployment group targets (direct EC2 or Auto Scaling group members). */
export function deploymentInstances(deploy: N, nodes: N[], edges: E[]): N[] {
  const targets = edges.filter(e => e.source === deploy.id).map(e => nodes.find(n => n.id === e.target)).filter(Boolean) as N[];
  return targets.flatMap(t => instancesOf(t, nodes)).filter((n, i, all) => all.findIndex(m => m.id === n.id) === i);
}

/** EC2/on-premises deployment success rule for a predefined configuration (CodeDeploy docs). */
export function ec2DeploymentSucceeds(config: string, results: boolean[]): { success: boolean; rule: string } {
  const total = results.length, ok = results.filter(Boolean).length;
  if (total === 0) return { success: false, rule: 'The deployment group has no instances.' };
  if (config === 'CodeDeployDefault.AllAtOnce') return { success: ok >= 1, rule: 'AllAtOnce succeeds if the revision is deployed to one or more instances.' };
  if (config === 'CodeDeployDefault.HalfAtATime') {
    const need = Math.ceil(total / 2);
    return { success: ok >= need, rule: `HalfAtATime succeeds if at least half of the instances (rounded up: ${need} of ${total}) succeed.` };
  }
  if (total === 1) return { success: results[0], rule: 'OneAtATime with one instance succeeds only if that instance succeeds.' };
  const firstFailure = results.findIndex(r => !r);
  const success = firstFailure === -1 || firstFailure === total - 1;
  return { success, rule: firstFailure === -1 ? 'OneAtATime deployed one instance at a time to every instance.'
    : success ? 'OneAtATime still succeeds when only the last instance fails.' : 'OneAtATime fails as soon as any instance but the last fails.' };
}

function codeDeployAction(run: Run, pipeline: N, deploy: N, nodes: N[], edges: E[], options: { assumeRouteTables?: boolean }): boolean {
  if (deploy.data.health === 'failed') { run.push(deploy, 'Deploy: CodeDeploy', false, `${label(deploy)} is unavailable.`); return false; }
  if (!roleStep(run, pipeline, PIPELINE_ROLE_ACTIONS.CodeDeploy, 'Deploy (start)')) return false;
  const c = cfg(deploy);
  const targets = edges.filter(e => e.source === deploy.id).map(e => nodes.find(n => n.id === e.target)).filter(Boolean) as N[];
  const platform: string = c.computePlatform ?? (targets.some(t => ['ecs', 'fargate'].includes(sid(t)!)) ? 'ECS' : targets.some(t => sid(t) === 'lambda') ? 'Lambda' : 'Server');
  const groupActions = platform === 'Server' ? ['ec2:DescribeInstances', 'autoscaling:DescribeAutoScalingGroups']
    : platform === 'ECS' ? ['ecs:CreateTaskSet', 'ecs:UpdateServicePrimaryTaskSet', 'elasticloadbalancing:ModifyListener'] : ['lambda:GetAlias', 'lambda:UpdateAlias'];
  if (!roleStep(run, deploy, groupActions, 'Deploy (deployment group)')) return false;

  if (platform === 'Server') {
    const config = c.deploymentConfig ?? 'CodeDeployDefault.OneAtATime';
    const instances = targets.flatMap(t => instancesOf(t, nodes)).filter((n, i, all) => all.findIndex(m => m.id === n.id) === i);
    const attempt = (instance: N): boolean => {
      const reasons = instanceDeploymentProblems(instance, nodes, options);
      run.push(instance, 'Deploy: instance', reasons.length === 0, reasons.length ? `Deployment to ${label(instance)} failed: ${reasons.join('; ')}.` : `Revision installed on ${label(instance)} (lifecycle hooks completed).`,
        { awsRule: 'EC2/on-premises targets need the CodeDeploy agent, outbound HTTPS 443 and an instance profile that can read the revision. https://docs.aws.amazon.com/codedeploy/latest/userguide/codedeploy-agent.html' });
      return reasons.length === 0;
    };
    const results: boolean[] = [];
    for (const [index, instance] of instances.entries()) {
      const ok = attempt(instance);
      results.push(ok);
      // OneAtATime stops at the first failure on any instance but the last.
      if (!ok && config === 'CodeDeployDefault.OneAtATime' && index < instances.length - 1) {
        instances.slice(index + 1).forEach(rest => run.push(rest, 'Deploy: instance', 'skipped', `Not attempted: OneAtATime stopped after ${label(instance)} failed.`));
        break;
      }
    }
    const verdict = results.length < instances.length
      ? { success: false, rule: 'OneAtATime fails as soon as any instance but the last fails.' }
      : ec2DeploymentSucceeds(config, results);
    const attempted = results.length < instances.length ? ` (${instances.length - results.length} not attempted)` : '';
    run.push(deploy, `Deploy: ${config}`, verdict.success, `${results.filter(Boolean).length} of ${instances.length} instance(s) succeeded${attempted}. ${verdict.rule}`,
      { awsRule: 'https://docs.aws.amazon.com/codedeploy/latest/userguide/deployment-configurations.html' });
    if (!verdict.success && c.autoRollback === true) run.push(deploy, 'Deploy: automatic rollback', true, 'Automatic rollback is enabled: CodeDeploy redeploys the last known good revision as a new deployment.');
    return verdict.success;
  }

  if (platform === 'ECS') {
    const config = c.deploymentConfig ?? 'CodeDeployDefault.ECSAllAtOnce';
    const lb = targets.find(t => ['alb', 'nlb'].includes(sid(t)!)) ?? nodes.find(n => ['alb', 'nlb'].includes(sid(n)!) && edges.some(e => e.source === n.id && targets.some(t => t.id === e.target)));
    if (!lb) { run.push(deploy, 'Deploy: ECS blue/green', false, 'An ECS blue/green deployment needs a load balancer with production and test listeners; none is connected.'); return false; }
    if (sid(lb) === 'nlb' && config !== 'CodeDeployDefault.ECSAllAtOnce') {
      run.push(deploy, 'Deploy: ECS blue/green', false, `${config} is not supported with a Network Load Balancer; only CodeDeployDefault.ECSAllAtOnce is.`,
        { awsRule: 'https://docs.aws.amazon.com/codedeploy/latest/userguide/deployment-configurations.html' });
      return false;
    }
    const services = targets.filter(t => ['ecs', 'fargate'].includes(sid(t)!));
    const healthy = services.length > 0 && services.every(s => s.data.health !== 'failed');
    run.push(deploy, `Deploy: ${config}`, healthy, healthy ? `Replacement task set started and traffic shifted through ${label(lb)} (${config}).` : 'The replacement task set did not become healthy, so traffic was not shifted.');
    if (!healthy && c.autoRollback === true) run.push(deploy, 'Deploy: automatic rollback', true, 'Traffic stays on, or returns to, the original task set.');
    return healthy;
  }

  const config = c.deploymentConfig ?? 'CodeDeployDefault.LambdaAllAtOnce';
  const fns = targets.filter(t => sid(t) === 'lambda');
  const ok = fns.length > 0 && fns.every(f => f.data.health !== 'failed');
  run.push(deploy, `Deploy: ${config}`, ok, ok ? `Alias traffic shifted to the new version (${config}).` : 'No healthy Lambda function target; traffic stays on the current version.');
  return ok;
}

function ecsAction(run: Run, pipeline: N, target: N, nodes: N[], stages: PipelineStage[]): boolean {
  if (!roleStep(run, pipeline, PIPELINE_ROLE_ACTIONS.ECS, 'Deploy (start)')) return false;
  const build = stages.flatMap(s => s.actions).filter(a => a.provider === 'CodeBuild').map(a => nodes.find(n => n.id === a.nodeId)).find(Boolean);
  const definitions: { name?: string }[] = Array.isArray(cfg(build).imageDefinitions) ? cfg(build).imageDefinitions : [];
  const container = cfg(target).ecs?.containerName ?? cfg(target).containerName;
  if (definitions.length && container && !definitions.some(d => d.name === container)) {
    run.push(target, 'Deploy: ECS', false, `imagedefinitions.json names ${definitions.map(d => d.name).join(', ')}, but the service's container is ${container}.`,
      { awsRule: 'Each name in imagedefinitions.json must match a container name in the task definition. https://docs.aws.amazon.com/codepipeline/latest/userguide/file-reference.html' });
    return false;
  }
  const ok = target.data.health !== 'failed';
  run.push(target, 'Deploy: ECS', ok, ok ? `Registered a new task definition revision and updated ${label(target)}; tasks are replaced by the service's rolling update.` : `${label(target)} is unavailable.`);
  return ok;
}

/** Runs one pipeline execution. */
export function runPipelineExecution(pipeline: N, nodes: N[], edges: E[], scenario: SimulationScenario): SimulationResult {
  const run = new Run(pipeline);
  const stages = resolvePipelineStages(pipeline, nodes, edges);
  const finish = (success: boolean, statusCode: number, summary: string): SimulationResult => ({
    kind: 'workflow', outcome: success ? 'success' : statusCode === 403 ? 'denied' : 'failure',
    scenario, steps: run.steps, success, statusCode, summary, totalLatencyMs: run.time,
    bottlenecksDetected: [], cascadeOccurred: false,
    path: [pipeline.id, ...stages.flatMap(s => s.actions.map(a => a.nodeId))]
  });

  if (pipeline.data.health === 'failed') { run.push(pipeline, 'Start execution', false, `${label(pipeline)} is unavailable.`); return finish(false, 503, 'Pipeline execution could not start.'); }
  const issues = validatePipelineStructure(stages, nodes);
  if (issues.length) {
    issues.forEach(i => run.push(pipeline, 'Pipeline structure', false, `${i.problem} ${i.rule}`, { awsRule: i.source }));
    return finish(false, 400, `Pipeline definition is invalid: ${issues[0].problem} ${issues[0].rule}`);
  }
  run.push(pipeline, 'Start execution', true, `Execution started with ${stages.length} stages: ${stages.map(s => s.name).join(' → ')}.`);

  for (let index = 0; index < stages.length; index++) {
    const stage = stages[index];
    for (const action of stage.actions) {
      const node = nodes.find(n => n.id === action.nodeId)!;
      const ok = action.category === 'Source' ? sourceAction(run, pipeline, action, node)
        : action.category === 'Build' || action.category === 'Test' ? buildAction(run, pipeline, action, node, nodes, edges, scenario)
        : action.provider === 'CodeDeploy' ? codeDeployAction(run, pipeline, node, nodes, edges, scenario)
        : ecsAction(run, pipeline, node, nodes, stages);
      if (!ok) {
        const denied = run.steps.some(s => s.status === 'failed' && s.details?.decision?.component === 'IAM');
        for (const later of stages.slice(index + 1)) run.push(pipeline, `Stage ${later.name}`, 'skipped', `Not run: stage ${stage.name} failed.`);
        return finish(false, denied ? 403 : 500, `Stage ${stage.name} failed at ${action.name}; later stages did not run.`);
      }
    }
    run.push(pipeline, `Stage ${stage.name}`, true, `Stage ${stage.name} succeeded.`);
  }
  return finish(true, 200, `Pipeline execution succeeded: ${stages.map(s => s.name).join(' → ')}.`);
}

/** Pipelines started by a change to `source` (CodeCommit push, S3 upload, ECR image push). */
export function pipelinesTriggeredBy(source: N, nodes: N[], edges: E[]): N[] {
  return edges.filter(e => e.source === source.id).map(e => nodes.find(n => n.id === e.target)).filter(n => sid(n) === 'codepipeline') as N[];
}
