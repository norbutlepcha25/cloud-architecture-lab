import { runServiceOperation, operationCallers } from '../serviceOperations/runner.ts';
import { SERVICE_OPERATIONS } from '../serviceOperations/definitions.ts';
import { runXraySubmission, xrayPublishers } from '../observability/xray.ts';
import type { Node, Edge } from '@xyflow/react';
import type { ServiceNodeData, SimulationScenario } from '../../types/index.ts';
import { queueSettings, queueConsumers, evaluateConsumer } from '../messaging/sqs.ts';
import { runPipelineExecution, runStandaloneDeveloperTool, resolvePipelineStages, deploymentInstances, instanceDeploymentProblems, ec2DeploymentSucceeds } from '../cicd/pipeline.ts';
import { evaluateInternetEgress, routingOptions } from '../network/subnetRouting.ts';
import { findContainingSubnetBoundary } from '../layout/containment.ts';

/**
 * Step-by-step explanations of multi-step AWS behavior, built from the same engine decisions the
 * simulation uses (never re-implemented in React). Each frame names the lane where the "token"
 * (message, artifact, packet, revision) is, what happened, and the AWS rule behind it.
 * "What if" overrides are applied to clones; the architecture is never changed.
 */
export interface WalkthroughLane { id: string; label: string }
export interface WalkthroughFrame {
  lane: string;
  title: string;
  detail: string;
  status: 'ok' | 'fail' | 'wait' | 'info';
  clock?: string;
  source?: string;
}
export interface Walkthrough { title: string; summary: string; lanes: WalkthroughLane[]; frames: WalkthroughFrame[] }

type N = Node<ServiceNodeData>;
type E = Edge<any>;
const label = (n: N | undefined) => String(n?.data.label ?? n?.id ?? '');
const clone = (n: N, patch: Record<string, unknown>): N => ({ ...n, data: { ...n.data, ...patch } });
const DLQ_DOC = 'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html';
const VIS_DOC = 'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html';

/** SQS message lifecycle: send, delay, receive, visibility timeout, delete, retries, redrive. */
export function sqsWalkthrough(queue: N, nodes: N[], edges: E[], whatIf: { consumerFails?: boolean } = {}, options: { assumeRouteTables?: boolean; assumeGateways?: boolean } = {}): Walkthrough {
  const s = queueSettings(queue, nodes, edges);
  const consumer = queueConsumers(queue, nodes, edges)[0];
  const producer = edges.filter(e => e.target === queue.id).map(e => nodes.find(n => n.id === e.source)).find(n => n && n.data.serviceId !== 'sns');
  const lanes: WalkthroughLane[] = [
    { id: 'producer', label: producer ? label(producer) : 'Producer' },
    { id: 'queue', label: label(queue) },
    { id: 'consumer', label: consumer ? label(consumer) : 'Consumer (not connected)' },
    { id: 'dlq', label: s.dlq ? label(s.dlq) : 'No dead-letter queue' }
  ];
  const frames: WalkthroughFrame[] = [];
  const at = (t: number) => `t = ${t}s`;
  frames.push({ lane: 'producer', title: 'SendMessage', status: 'ok', clock: at(0),
    detail: `The producer sends one message (${s.messageBytes} bytes, max 1 MiB). SQS stores it redundantly and returns success; the producer does not wait for processing.` });
  let t = s.delay;
  frames.push({ lane: 'queue', title: s.delay ? 'Delivery delay' : 'Message available', status: s.delay ? 'wait' : 'ok', clock: at(t),
    detail: s.delay ? `DelaySeconds = ${s.delay}: the message stays invisible until ${at(t)}.` : 'The message is visible to consumers immediately.' });
  if (!consumer) {
    frames.push({ lane: 'queue', title: 'Waiting for a consumer', status: 'info', clock: at(t),
      detail: `Nothing polls this queue. The message waits until the retention period (${s.retention}s) expires, then SQS deletes it.` });
    return { title: 'SQS message lifecycle', summary: 'No consumer is connected.', lanes, frames };
  }
  const subject = whatIf.consumerFails === undefined ? consumer : clone(consumer, { customConfig: { ...consumer.data.customConfig, processingResult: whatIf.consumerFails ? 'FAILED' : 'SUCCEEDED' }, health: whatIf.consumerFails === false ? 'healthy' : consumer.data.health });
  const verdict = evaluateConsumer(subject, queue, nodes.map(n => n.id === subject.id ? subject : n), edges, options);
  if (verdict.outcome === 'not-polled') {
    const blocker = verdict.steps.find(step => !step.ok)!;
    frames.push({ lane: 'consumer', title: blocker.action, status: 'fail', clock: at(t), detail: blocker.explanation, source: blocker.awsRule });
    frames.push({ lane: 'queue', title: 'Message not consumed', status: 'info', clock: at(t), detail: `The message stays in the queue until the retention period (${s.retention}s) expires.` });
    return { title: 'SQS message lifecycle', summary: 'The consumer cannot poll this queue.', lanes, frames };
  }
  if (verdict.outcome === 'processed') {
    frames.push({ lane: 'consumer', title: 'ReceiveMessage (receive count 1)', status: 'ok', clock: at(t), source: VIS_DOC,
      detail: `${label(consumer)} receives the message. SQS hides it for the visibility timeout (${s.visibility}s) so no other consumer gets it.` });
    frames.push({ lane: 'consumer', title: 'Processed', status: 'ok', clock: at(t), detail: `${label(consumer)} processes the message within the visibility timeout.` });
    frames.push({ lane: 'queue', title: 'DeleteMessage', status: 'ok', clock: at(t), detail: 'The consumer deletes the message with its receipt handle. Without this delete it would reappear.' });
    return { title: 'SQS message lifecycle', summary: 'Processed and deleted on the first receive.', lanes, frames };
  }
  const max = s.dlq ? s.maxReceiveCount ?? 5 : 3;
  for (let receive = 1; receive <= max; receive++) {
    frames.push({ lane: 'consumer', title: `ReceiveMessage (receive count ${receive})`, status: 'ok', clock: at(t), source: VIS_DOC,
      detail: `${label(consumer)} receives the message; it is hidden for ${s.visibility}s.` });
    frames.push({ lane: 'consumer', title: 'Processing fails', status: 'fail', clock: at(t),
      detail: `${label(consumer)} returns an error, so it does not delete the message.` });
    t += s.visibility;
    frames.push({ lane: 'queue', title: 'Visible again', status: 'wait', clock: at(t),
      detail: `The visibility timeout expired; the message can be received again.${s.dlq ? ` Receives so far: ${receive} of maxReceiveCount ${max}.` : ''}` });
  }
  if (s.dlq) {
    frames.push({ lane: 'dlq', title: 'Moved to dead-letter queue', status: 'fail', clock: at(t), source: DLQ_DOC,
      detail: `The next receive would exceed maxReceiveCount (${max}), so SQS moves the message to ${label(s.dlq)}. Its original enqueue timestamp is kept, so set the DLQ's retention longer than the source queue's.` });
    return { title: 'SQS message lifecycle', summary: `Failed ${max} times, then redriven to the dead-letter queue.`, lanes, frames };
  }
  frames.push({ lane: 'queue', title: 'Retries until retention expires', status: 'info', clock: at(t),
    detail: `Without a dead-letter queue the cycle repeats every ${s.visibility}s until the retention period (${s.retention}s) expires and SQS deletes the message. Add a redrive policy to isolate it instead.` });
  return { title: 'SQS message lifecycle', summary: 'Failing message retried until retention expires (no DLQ).', lanes, frames };
}

/** CodePipeline execution, stage by stage, from the real pipeline run. */
export function pipelineWalkthrough(pipeline: N, nodes: N[], edges: E[], scenario: SimulationScenario, whatIf: { buildFails?: boolean } = {}): Walkthrough {
  const build = resolvePipelineStages(pipeline, nodes, edges).flatMap(s => s.actions).find(a => a.provider === 'CodeBuild');
  const patched = whatIf.buildFails === undefined || !build ? nodes : nodes.map(n => n.id === build.nodeId
    ? clone(n, { customConfig: { ...n.data.customConfig, buildResult: whatIf.buildFails ? 'FAILED' : 'SUCCEEDED' } }) : n);
  const stages = resolvePipelineStages(pipeline, patched, edges);
  const result = runPipelineExecution(pipeline, patched, edges, scenario);
  const lanes = [{ id: 'Pipeline', label: label(pipeline) }, ...stages.map(s => ({ id: s.name, label: `${s.name} · ${s.actions.map(a => a.provider).join(', ')}` }))];
  const laneFor = (action: string) => {
    const stage = stages.find(s => action.startsWith(s.name) || action.startsWith(`Stage ${s.name}`) || (s.name === 'Deploy' && action.startsWith('Deploy')) || (s.name === 'Build' && action.startsWith('Build')));
    return stage?.name ?? 'Pipeline';
  };
  const frames = result.steps.map(step => ({
    lane: laneFor(step.action), title: step.action, detail: step.explanation,
    status: step.status === 'success' ? 'ok' : step.status === 'bypassed' ? 'info' : 'fail',
    source: step.details?.decision?.awsRule?.match(/https?:\/\/\S+/)?.[0]
  }) as WalkthroughFrame);
  return { title: 'CodePipeline execution', summary: result.summary, lanes, frames };
}

const CONFIG_DOC = 'https://docs.aws.amazon.com/codedeploy/latest/userguide/deployment-configurations.html';

/** CodeDeploy rollout: batches per deployment configuration, or traffic shifting for ECS/Lambda. */
export function codeDeployWalkthrough(deploy: N, nodes: N[], edges: E[], whatIf: { config?: string; failInstanceId?: string } = {}, options: { assumeRouteTables?: boolean; assumeGateways?: boolean } = {}): Walkthrough {
  const c = (deploy.data.customConfig ?? {}) as Record<string, any>;
  const targets = edges.filter(e => e.source === deploy.id).map(e => nodes.find(n => n.id === e.target)).filter(Boolean) as N[];
  const platform = c.computePlatform ?? (targets.some(t => ['ecs', 'fargate'].includes(t.data.serviceId)) ? 'ECS' : targets.some(t => t.data.serviceId === 'lambda') ? 'Lambda' : 'Server');
  const config: string = whatIf.config ?? c.deploymentConfig ?? (platform === 'ECS' ? 'CodeDeployDefault.ECSAllAtOnce' : platform === 'Lambda' ? 'CodeDeployDefault.LambdaAllAtOnce' : 'CodeDeployDefault.OneAtATime');

  if (platform !== 'Server') {
    const lanes = [{ id: 'original', label: platform === 'ECS' ? 'Original task set (blue)' : 'Current version' }, { id: 'replacement', label: platform === 'ECS' ? 'Replacement task set (green)' : 'New version' }];
    const frames: WalkthroughFrame[] = [{ lane: 'replacement', title: platform === 'ECS' ? 'Start replacement task set' : 'Publish new version', status: 'ok', detail: 'The new revision starts alongside the current one; no traffic yet.', source: CONFIG_DOC }];
    const canary = config.match(/Canary10Percent(\d+)Minutes?/), linear = config.match(/Linear10PercentEvery(\d+)Minutes?/);
    if (canary) {
      frames.push({ lane: 'replacement', title: 'Shift 10% of traffic', status: 'ok', clock: 't = 0 min', detail: '10% of traffic goes to the new revision; 90% stays on the original.', source: CONFIG_DOC });
      frames.push({ lane: 'replacement', title: 'Shift remaining 90%', status: 'ok', clock: `t = ${canary[1]} min`, detail: `After ${canary[1]} minutes the remaining 90% moves.`, source: CONFIG_DOC });
    } else if (linear) {
      for (let pct = 10; pct <= 100; pct += 10) frames.push({ lane: 'replacement', title: `${pct}% on the new revision`, status: 'ok', clock: `t = ${(pct / 10 - 1) * Number(linear[1])} min`, detail: `Linear: 10% more every ${linear[1]} minute(s).`, source: CONFIG_DOC });
    } else frames.push({ lane: 'replacement', title: 'Shift 100% at once', status: 'ok', detail: 'All traffic moves to the new revision in one step.', source: CONFIG_DOC });
    frames.push({ lane: 'original', title: platform === 'ECS' ? 'Terminate original task set' : 'Old version kept for rollback', status: 'info', detail: c.autoRollback ? 'If the deployment fails, traffic returns to the original revision.' : 'Enable automatic rollback to return traffic on failure.' });
    return { title: `CodeDeploy ${platform} traffic shifting`, summary: config.replace('CodeDeployDefault.', ''), lanes, frames };
  }

  const instances = deploymentInstances(deploy, nodes, edges);
  const lanes = instances.map(i => ({ id: i.id, label: label(i) }));
  const frames: WalkthroughFrame[] = [];
  if (!instances.length) return { title: 'CodeDeploy rollout', summary: 'No instances in the deployment group.', lanes: [{ id: 'none', label: 'No instances' }], frames: [{ lane: 'none', title: 'Nothing to deploy', status: 'fail', detail: 'Connect EC2 instances or an Auto Scaling group.' }] };
  const problems = (i: N) => i.id === whatIf.failInstanceId ? ['instance is unavailable (what-if)'] : instanceDeploymentProblems(i, nodes, options);
  const batchSize = config === 'CodeDeployDefault.AllAtOnce' ? instances.length : config === 'CodeDeployDefault.HalfAtATime' ? Math.max(1, Math.floor(instances.length / 2)) : 1;
  const results: boolean[] = [];
  let stopped = false;
  for (let start = 0; start < instances.length && !stopped; start += batchSize) {
    const batch = instances.slice(start, start + batchSize);
    for (const i of batch) frames.push({ lane: i.id, title: 'Taken offline, revision installing', status: 'wait', detail: `Batch ${start / batchSize + 1} of ${Math.ceil(instances.length / batchSize)} (${config.replace('CodeDeployDefault.', '')}: up to ${batchSize} at a time).`, source: CONFIG_DOC });
    for (const i of batch) {
      const issues = problems(i);
      results.push(issues.length === 0);
      frames.push({ lane: i.id, title: issues.length ? 'Failed' : 'Succeeded, back in service', status: issues.length ? 'fail' : 'ok', detail: issues.length ? issues.join('; ') : 'Lifecycle hooks completed; instance serves traffic again.' });
      if (issues.length && config === 'CodeDeployDefault.OneAtATime' && results.length < instances.length) { stopped = true; break; }
    }
  }
  const verdict = stopped ? { success: false, rule: 'OneAtATime fails as soon as any instance but the last fails, and stops.' } : ec2DeploymentSucceeds(config, results);
  frames.push({ lane: instances[results.length - 1].id, title: verdict.success ? 'Deployment succeeded' : 'Deployment failed', status: verdict.success ? 'ok' : 'fail', detail: `${results.filter(Boolean).length} of ${instances.length} succeeded. ${verdict.rule}${!verdict.success && c.autoRollback ? ' Automatic rollback redeploys the last good revision.' : ''}`, source: CONFIG_DOC });
  return { title: 'CodeDeploy rollout', summary: config.replace('CodeDeployDefault.', ''), lanes, frames };
}

/** For each subnet, how one of its resources reaches the internet (route table → NAT/IGW). */
export function networkPathWalkthrough(nodes: N[], options: { assumeRouteTables?: boolean; assumeGateways?: boolean } = {}): Walkthrough {
  const lanes = [{ id: 'resource', label: 'Resource in subnet' }, { id: 'table', label: 'Route table' }, { id: 'nat', label: 'NAT gateway' }, { id: 'igw', label: 'Internet gateway' }, { id: 'internet', label: 'Internet' }];
  const frames: WalkthroughFrame[] = [];
  const subnets = nodes.filter(n => n.type === 'boundaryNode' && ['public_subnet', 'private_subnet'].includes(n.data.boundaryType as string));
  for (const subnet of subnets) {
    const resource = nodes.find(n => n.type === 'serviceNode' && !['nat_gateway', 'internet_gateway', 'route_tables', 's3_gateway_endpoint', 'privatelink'].includes(n.data.serviceId) && findContainingSubnetBoundary(n, nodes)?.id === subnet.id);
    if (!resource) continue;
    const decision = evaluateInternetEgress(resource, 'internet', nodes, routingOptions(options));
    const name = `${label(resource)} (${label(subnet)})`;
    frames.push({ lane: 'resource', title: name, status: 'info', detail: `Sends a packet to an internet address.` });
    if (decision.outcome === 'legacy') { frames.push({ lane: 'table', title: 'No VPC routing model', status: 'info', detail: 'This subnet is not inside a VPC on the canvas, so placement rules apply.' }); continue; }
    const hop = decision.hopNodeId ? nodes.find(n => n.id === decision.hopNodeId) : undefined;
    frames.push({ lane: 'table', title: 'Route lookup', status: decision.outcome === 'allowed' ? 'ok' : 'fail', detail: decision.reason, source: 'https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Route_Tables.html' });
    if (decision.via === 'nat') {
      frames.push({ lane: 'nat', title: `SNAT at ${label(hop)}`, status: 'ok', detail: 'The NAT gateway replaces the private source address with its Elastic IP and forwards using its own subnet route table.', source: 'https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-scenarios.html' });
      frames.push({ lane: 'igw', title: 'Internet gateway', status: 'ok', detail: 'The NAT subnet routes 0.0.0.0/0 to the internet gateway.' });
    } else if (decision.via === 'igw') {
      frames.push({ lane: 'igw', title: `${label(hop)}`, status: 'ok', detail: 'The internet gateway translates the instance\'s private address to its public IP.', source: 'https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html' });
    }
    if (decision.outcome === 'allowed') frames.push({ lane: 'internet', title: 'Reached the internet', status: 'ok', detail: 'Return traffic follows the same path back.' });
  }
  if (!frames.length) frames.push({ lane: 'resource', title: 'No subnets with resources', status: 'info', detail: 'Place resources inside subnets to see their routes.' });
  return { title: 'Internet paths by subnet', summary: `${options.assumeRouteTables === false ? 'Strict' : 'Assumed'} route tables`, lanes, frames };
}

/** Direct developer-tool explanation from the exact standalone execution engine. */
export function standaloneDeveloperToolWalkthrough(owner: N, nodes: N[], edges: E[], scenario: SimulationScenario, whatIf: { buildFails?: boolean; config?: string; failInstanceId?: string } = {}): Walkthrough {
  const patched = structuredClone(nodes).map(n => n.id === owner.id ? clone(n, { customConfig: { ...n.data.customConfig,
    ...(whatIf.buildFails === undefined ? {} : { buildResult: whatIf.buildFails ? 'FAILED' : 'SUCCEEDED' }),
    ...(whatIf.config ? { deploymentConfig: whatIf.config } : {}) } })
    : n.id === whatIf.failInstanceId ? clone(n, { health: 'failed' }) : n);
  const selected = patched.find(n => n.id === owner.id)!;
  const result = runStandaloneDeveloperTool(selected, patched, edges, { ...scenario, startNodeId: owner.id });
  const ids = [...new Set(result.steps.map(step => step.targetNodeId))];
  return { title: `${label(owner)} operation`, summary: result.summary,
    lanes: ids.map(id => ({ id, label: label(patched.find(n => n.id === id)) })),
    frames: result.steps.map(step => ({ lane: step.targetNodeId, title: step.action, detail: step.explanation,
      status: step.status === 'success' ? 'ok' : step.status === 'bypassed' ? 'info' : 'fail',
      source: step.details?.decision?.awsRule?.match(/https?:\/\/\S+/)?.[0] })) };
}

/** X-Ray API submission walkthrough: role/route checks, per-segment results and batch response. */
export function xrayWalkthrough(target: N, nodes: N[], edges: E[], scenario: SimulationScenario, whatIf: { publisherFails?: boolean } = {}): Walkthrough {
  const publishers = xrayPublishers(target, nodes, edges);
  const id = target.data.customConfig?.publisherNodeId ?? (publishers.length === 1 ? publishers[0].id : undefined);
  const patched = structuredClone(nodes).map(n => whatIf.publisherFails && n.id === id ? clone(n, { health: 'failed' }) : n);
  const selected = patched.find(n => n.id === target.id)!;
  const result = runXraySubmission(selected, patched, edges, { ...scenario, startNodeId: target.id });
  return { title: 'X-Ray segment submission', summary: result.summary,
    lanes: [{ id: 'publisher', label: 'Publisher / credentials' }, { id: 'endpoint', label: 'X-Ray ingestion' }],
    frames: result.steps.map(step => ({ lane: step.action.includes('route') || step.action.includes('IAM') || step.action.includes('publisher') ? 'publisher' : 'endpoint',
      title: step.action, detail: step.explanation, status: step.status === 'failed' ? 'fail' : step.status === 'bypassed' ? 'info' : 'ok',
      source: step.details?.decision?.awsRule?.match(/https?:\/\/\S+/)?.[0] })) };
}

export function serviceOperationWalkthrough(target:N,nodes:N[],edges:E[],scenario:SimulationScenario,whatIf:{callerFails?:boolean}={}):Walkthrough {
  const candidates=operationCallers(target,nodes,edges);
  const id=target.data.customConfig?.operationLab?.callerId ?? (candidates.length===1?candidates[0].id:undefined);
  const patched=structuredClone(nodes).map(n=>whatIf.callerFails && n.id===id?clone(n,{health:'failed'}):n);
  const selected=patched.find(n=>n.id===target.id)!;
  const result=runServiceOperation(selected,patched,edges,{...scenario,startNodeId:target.id});
  return {title:`${SERVICE_OPERATIONS[target.data.serviceId].name} operation`,summary:result.summary,lanes:[{id:'operation',label:'Caller → service operation'}],
    frames:result.steps.map(step=>({lane:'operation',title:step.action,detail:step.explanation,status:step.status==='failed'?'fail':step.status==='bypassed'?'info':'ok',source:step.details?.decision?.awsRule?.match(/https?:\/\/\S+/)?.[0]}))};
}
