import type { Node, Edge } from '@xyflow/react';
import type { ServiceNodeData, ConnectionData, SimulationScenario, SimulationResult, SimulationStep } from '../../types/index.ts';
import type { Policy } from '../iam/types.ts';
import type { TraceEntry } from '../trace/types.ts';
import { evaluateAuthorization } from '../iam/evaluate.ts';
import { isCicdWorkflowLink } from '../architecture/cicdRelationships.ts';
import { CONNECTION_GIT_PROVIDERS, isConnectionGitProvider } from '../architecture/externalActors.ts';
import { connectionStatus, evaluateServiceRole, pipelinesTriggeredBy, runPipelineExecution, runStandaloneDeveloperTool } from './pipeline.ts';
import { isIntegrationLink } from '../architecture/serviceIntegrations.ts';

/**
 * A developer outside AWS pushes commits to CodeCommit or a third-party Git host; a push to the
 * branch a pipeline source watches starts that pipeline. Spec: docs/behavior/codecommit.md and
 * docs/behavior/external_actors.md (sources verified 2026-10-22).
 *
 * - CodeCommit HTTPS Git uses IAM Git credentials (or SSH keys) against the regional public Git
 *   endpoint; git push needs codecommit:GitPush on the repository ARN.
 *   https://docs.aws.amazon.com/codecommit/latest/userguide/setting-up-gc.html
 *   https://docs.aws.amazon.com/codecommit/latest/userguide/auth-and-access-control-permissions-reference.html
 * - Third-party sources start a pipeline through a CodeConnections connection that completed its
 *   handshake; DetectChanges=false disables automatic starts.
 *   https://docs.aws.amazon.com/codepipeline/latest/userguide/action-reference-CodestarConnectionSource.html
 * Not modeled: repository contents, merge/conflict handling, branch-condition policies, GitHub
 * permissions, webhook delivery failures, multi-pipeline fan-out.
 */

type N = Node<ServiceNodeData>;
type E = Edge<ConnectionData>;

export const GIT_HOST_IDS = ['codecommit', ...Object.keys(CONNECTION_GIT_PROVIDERS)];
const GIT_HOSTNAMES: Record<string, string> = { github: 'github.com', gitlab: 'gitlab.com', bitbucket: 'bitbucket.org' };

/** Developer IAM identity presets (subset of the AWS managed policies' Git permissions). */
export const DEVELOPER_POLICY_PRESETS: Record<string, { label: string; policies: (repoArn: string) => Policy[] }> = {
  'power-user': { label: 'AWSCodeCommitPowerUser (GitPull + GitPush)', policies: () => [
    { id: 'AWSCodeCommitPowerUser', kind: 'identity', statements: [{ effect: 'Allow', actions: ['codecommit:GitPull', 'codecommit:GitPush'], resources: ['*'] }] }] },
  'read-only': { label: 'AWSCodeCommitReadOnly (GitPull only)', policies: () => [
    { id: 'AWSCodeCommitReadOnly', kind: 'identity', statements: [{ effect: 'Allow', actions: ['codecommit:GitPull'], resources: ['*'] }] }] },
  'deny-push': { label: 'Power user + explicit Deny GitPush on this repository', policies: repoArn => [
    { id: 'AWSCodeCommitPowerUser', kind: 'identity', statements: [{ effect: 'Allow', actions: ['codecommit:GitPull', 'codecommit:GitPush'], resources: ['*'] }] },
    { id: 'DenyPushToRepository', kind: 'identity', statements: [{ effect: 'Deny', actions: ['codecommit:GitPush'], resources: [repoArn] }] }] },
  none: { label: 'No CodeCommit permissions', policies: () => [] }
};

const cfg = (node: N | undefined): Record<string, any> => (node?.data.customConfig ?? {}) as Record<string, any>;
const sid = (node: N | undefined) => node?.data.serviceId;
const label = (node: N | undefined) => String(node?.data.label ?? node?.id ?? 'unknown');
const byId = (a: { id: string }, b: { id: string }) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export function repositoryArn(repo: N): string {
  return cfg(repo).resourceArn ?? `arn:aws:codecommit:us-east-1:000000000000:${cfg(repo).repositoryName ?? repo.id}`;
}

/** Repositories this developer pushes to (Git push links only). */
export function pushTargets(developer: N, nodes: N[], edges: E[]): N[] {
  const nodesById = new Map(nodes.map(n => [n.id, n]));
  return edges.filter(e => e.source === developer.id && isCicdWorkflowLink(developer, nodesById.get(e.target), e.data))
    .map(e => nodesById.get(e.target)!).filter(n => GIT_HOST_IDS.includes(sid(n)!)).sort(byId);
}

/** Runs a git push from `developer` (undefined: a push event started at the repository itself). */
export function runGitPush(developer: N | undefined, nodes: N[], edges: E[], scenario: SimulationScenario, repoOverride?: N): SimulationResult {
  const result = runPushAndPrimaryTrigger(developer, nodes, edges, scenario, repoOverride);
  const committed = result.steps.find(s => s.action === 'Commit pushed' && s.status === 'success');
  const repo = committed && nodes.find(n => n.id === committed.targetNodeId);
  const apps = repo ? linkedTargets(repo, nodes, edges, ['amplify'], 'amplify-cd') : [];
  if (!repo || !apps.length) return result;
  // A push notifies every subscriber: Amplify Hosting continuous deployment runs alongside the pipeline.
  const branch = String((developer ? cfg(developer).branch : undefined) ?? cfg(repo).branch ?? 'main');
  const outcomes = apps.map(app => amplifyJob(app, repo, branch, result.steps, developer ?? repo));
  const failed = outcomes.includes(false);
  return { ...result, success: result.success && !failed, statusCode: result.success && failed ? 500 : result.statusCode,
    outcome: result.success && failed ? 'failure' : result.outcome, totalLatencyMs: result.totalLatencyMs + apps.length * 15,
    summary: `${result.summary} Amplify Hosting: ${apps.map((app, i) => `${label(app)} ${outcomes[i] === true ? 'deployed' : outcomes[i] === false ? 'build failed' : 'not built'}`).join('; ')}.`,
    path: [...new Set([...result.path, ...apps.map(a => a.id)])] };
}

/** Amplify Hosting continuous deployment for one connected app; true = deployed, false = failed,
 *  undefined = not started. https://docs.aws.amazon.com/amplify/latest/userguide/welcome.html */
function amplifyJob(app: N, repo: N, branch: string, steps: SimulationStep[], owner: N): boolean | undefined {
  const c = cfg(app), connected = String(c.branch ?? 'main');
  const branchRef = 'https://docs.aws.amazon.com/amplify/latest/APIReference/API_Branch.html';
  const add = (action: string, status: SimulationStep['status'], explanation: string, awsRule = branchRef) => {
    const n = steps.length + 1, at = (steps[steps.length - 1]?.timestampMs ?? 0) + 5;
    steps.push({ id: `amplify-step-${n}`, stepNumber: n, timestampMs: at, sourceNodeId: repo.id, targetNodeId: app.id,
      sourceNodeName: label(repo), targetNodeName: label(app), protocol: 'HTTPS', action, status, explanation, targetHealth: app.data.health, latencyMs: 5,
      details: { decision: { order: n, component: 'Service', resource: label(app), operation: action, input: { branch }, decision: status === 'success' ? 'ALLOW' : status === 'failed' ? 'DENY' : 'INFO',
        reason: explanation, simpleExplanation: explanation, awsRule, metadata: { initiatedBy: owner.id } } as TraceEntry } });
  };
  if (branch !== connected) { add('Amplify: branch', 'bypassed', `${label(app)} is connected to branch ${connected}; the push to ${branch} does not start a build. Connect a branch (feature branch) to deploy it.`); return undefined; }
  if (c.enableAutoBuild === false) { add('Amplify: auto build', 'bypassed', `Auto build is disabled for ${connected} (enableAutoBuild = false), so the push does not start a job. Start the job manually.`); return undefined; }
  if (app.data.health === 'failed') { add('Amplify job', 'failed', `${label(app)} is unavailable; no job ran (teaching failure).`); return false; }
  add('Amplify: job started', 'success', `Continuous deployment: the push to ${connected} on ${label(repo)} started a build job for ${label(app)}.`, 'https://docs.aws.amazon.com/amplify/latest/userguide/welcome.html');
  if (c.buildResult === 'FAILED') {
    add('Amplify: build', 'failed', `A command in the build specification (amplify.yml) failed (simulated build input). Atomic deployment: the previously deployed version keeps serving.`);
    return false;
  }
  add('Amplify: build and deploy', 'success', `Built with the app build specification and deployed atomically to the Amplify CDN: the site switches to the new version only after the whole deployment finishes. Build commands are simulated, not executed.`, 'https://docs.aws.amazon.com/amplify/latest/userguide/welcome.html');
  return true;
}

function runPushAndPrimaryTrigger(developer: N | undefined, nodes: N[], edges: E[], scenario: SimulationScenario, repoOverride?: N): SimulationResult {
  const steps: SimulationStep[] = [];
  const owner = developer ?? repoOverride!;
  const push = (target: N, action: string, ok: boolean, explanation: string, decision?: Partial<TraceEntry>) => {
    const n = steps.length + 1;
    steps.push({ id: `git-step-${n}`, stepNumber: n, timestampMs: n * 5, sourceNodeId: owner.id, targetNodeId: target.id,
      sourceNodeName: label(owner), targetNodeName: label(target), protocol: 'HTTPS', action, status: ok ? 'success' : 'failed',
      explanation, targetHealth: target.data.health, latencyMs: 5,
      details: decision ? { decision: { order: n, component: 'Service', resource: label(target), operation: action, input: {},
        decision: ok ? 'ALLOW' : 'DENY', reason: explanation, simpleExplanation: explanation, awsRule: '', metadata: {}, ...decision } as TraceEntry } : undefined });
  };
  const finish = (ok: boolean, code: number, summary: string, path: string[] = []): SimulationResult => ({
    kind: 'workflow', outcome: ok ? 'success' : code === 403 ? 'denied' : 'failure', scenario, steps, success: ok, statusCode: code,
    summary, totalLatencyMs: steps.length * 5, bottlenecksDetected: [], cascadeOccurred: false,
    path: [...new Set([owner.id, ...steps.map(s => s.targetNodeId), ...path])]
  });
  const targets = developer ? pushTargets(developer, nodes, edges) : [repoOverride!];
  const chosen = developer && cfg(developer).targetRepoId;
  const repo = targets.find(n => n.id === chosen) ?? targets[0];
  if (!repo) {
    push(owner, 'Git push', false, `${label(owner)} has no Git push link. Connect it to a CodeCommit, GitHub, GitLab or Bitbucket repository.`);
    return finish(false, 400, 'No repository to push to.');
  }
  const isCodeCommit = sid(repo) === 'codecommit';
  const host = isCodeCommit ? 'CodeCommit' : CONNECTION_GIT_PROVIDERS[sid(repo)!];
  const branch = String((developer ? cfg(developer).branch : undefined) ?? cfg(repo).branch ?? 'main');
  const commitRef = 'https://docs.aws.amazon.com/codecommit/latest/userguide/how-to-create-commit.html';

  if (developer) {
    if (developer.data.health === 'failed') { push(developer, 'Git push', false, `${label(developer)} is offline.`); return finish(false, 503, 'Developer workstation is offline.'); }
    const endpoint = isCodeCommit ? 'git-codecommit.us-east-1.amazonaws.com' : GIT_HOSTNAMES[sid(repo)!];
    push(repo, 'Network: public Git endpoint', true, `${label(developer)} is outside AWS and connects to ${endpoint} over HTTPS (443) on the internet. ${isCodeCommit ? 'CodeCommit is a regional service endpoint, not a VPC resource, so no internet gateway, NAT gateway or route table is on this path.' : 'The repository is hosted outside AWS.'}`,
      { component: 'Route', awsRule: isCodeCommit ? 'https://docs.aws.amazon.com/codecommit/latest/userguide/regions.html' : '' });
    if (cfg(developer).gitCredentials === false) {
      push(repo, 'Authenticate', false, isCodeCommit
        ? `${label(developer)} has no Git credentials (HTTPS Git credentials or an SSH key for an IAM identity). CodeCommit rejects the push before authorization.`
        : `${label(developer)} has no ${host} credentials, so ${host} rejects the push.`,
        { component: 'IAM', awsRule: isCodeCommit ? 'https://docs.aws.amazon.com/codecommit/latest/userguide/setting-up-gc.html' : '' });
      return finish(false, 403, 'Git push rejected: authentication failed.');
    }
    if (isCodeCommit) {
      const preset = DEVELOPER_POLICY_PRESETS[cfg(developer).iamPolicy] ?? DEVELOPER_POLICY_PRESETS['power-user'];
      const arn = repositoryArn(repo);
      const decision = evaluateAuthorization({ principal: { id: cfg(developer).iamUserName ?? 'developer', kind: 'user', accountId: '000000000000', identityPolicies: preset.policies(arn) },
        action: 'codecommit:GitPush', resource: { arn, accountId: '000000000000' } });
      const allowed = decision.effect === 'Allow';
      push(repo, 'Authorize codecommit:GitPush', allowed, `${preset.label}: ${decision.finalReason}`,
        { component: 'IAM', operation: 'evaluate-identity-policy', decision: allowed ? 'ALLOW' : 'DENY',
          awsRule: 'git push requires the codecommit:GitPush permission on the repository ARN. https://docs.aws.amazon.com/codecommit/latest/userguide/auth-and-access-control-permissions-reference.html',
          metadata: { action: 'codecommit:GitPush', resource: arn } });
      if (!allowed) return finish(false, 403, `Git push denied: ${label(developer)} is not allowed codecommit:GitPush on ${label(repo)}.`);
    } else {
      push(repo, 'Authenticate', true, `${host} accepted the credentials. ${host} repository permissions are not simulated.`);
    }
  }

  if (repo.data.health === 'failed') { push(repo, 'Git push', false, `${label(repo)} is unavailable.`); return finish(false, 503, `${host} repository is unavailable.`); }
  push(repo, 'Commit pushed', true, `Commit recorded on branch ${branch} of ${label(repo)}. Repository contents are not simulated.`, { awsRule: isCodeCommit ? commitRef : '' });

  const append = (execution: SimulationResult, via: string[]): SimulationResult => {
    const offset = steps.length, time = steps.length * 5;
    for (const step of execution.steps) steps.push({ ...step, id: `git-${step.id}`, stepNumber: step.stepNumber + offset, timestampMs: step.timestampMs + time });
    return { ...execution, scenario, steps, totalLatencyMs: execution.totalLatencyMs + time,
      summary: `Pushed to ${label(repo)} (${branch}). ${execution.summary}`,
      path: [...new Set([owner.id, repo.id, ...via, ...execution.path])] };
  };
  const pipeline = pipelinesTriggeredBy(repo, nodes, edges).sort(byId)[0];
  const rule = isCodeCommit ? linkedTargets(repo, nodes, edges, ['eventbridge'])[0] : undefined;
  if (!pipeline && rule) return eventRule(rule);
  if (!pipeline) return finish(true, 200, `Pushed to ${label(repo)} (${branch}). No pipeline uses this repository as its source.`);
  const watched = String(cfg(repo).branch ?? 'main');
  const connectionRef = 'https://docs.aws.amazon.com/codepipeline/latest/userguide/action-reference-CodestarConnectionSource.html';
  const notStarted = (reason: string, awsRule: string) => {
    push(pipeline, 'Pipeline trigger', true, `${reason} ${label(pipeline)} was not started.`, { decision: 'INFO', awsRule });
    return finish(true, 200, `Pushed to ${label(repo)} (${branch}); ${label(pipeline)} was not started: ${reason}`);
  };
  if (branch !== watched) return notStarted(`The pipeline source watches branch ${watched}, and the push went to ${branch}.`,
    isCodeCommit ? 'https://docs.aws.amazon.com/codepipeline/latest/userguide/action-reference-CodeCommit.html' : connectionRef);
  if (isConnectionGitProvider(sid(repo))) {
    const status = connectionStatus(repo);
    if (status !== 'AVAILABLE') return notStarted(`The ${host} connection is ${status}; a connection that has not completed its handshake does not trigger the pipeline.`, connectionRef);
    if (cfg(repo).detectChanges === false) return notStarted('DetectChanges is false on the source action.', connectionRef);
  }
  push(pipeline, 'Pipeline trigger', true, `A push to ${watched} on ${label(repo)} starts ${label(pipeline)}.`, { awsRule: isCodeCommit ? 'https://docs.aws.amazon.com/codepipeline/latest/userguide/triggering.html' : connectionRef });

  return append(runPipelineExecution(pipeline, nodes, edges, scenario), []);

  /** CodeCommit -> EventBridge rule -> CodeBuild / CodePipeline target. */
  function eventRule(rule: N): SimulationResult {
    const eventsRef = 'https://docs.aws.amazon.com/codecommit/latest/userguide/monitoring-events.html';
    const targetsRef = 'https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-targets.html';
    if (rule.data.health === 'failed') { push(rule, 'EventBridge rule', false, `${label(rule)} is unavailable, so the event is not delivered to its targets.`, { awsRule: eventsRef }); return finish(false, 503, 'EventBridge rule unavailable.'); }
    const ruleBranch = String(cfg(rule).referenceName ?? 'main');
    if (ruleBranch !== branch) {
      push(rule, 'EventBridge rule', true, `The CodeCommit Repository State Change event (referenceUpdated, branch ${branch}) does not match the rule pattern (branch ${ruleBranch}). No target was invoked.`, { decision: 'INFO', awsRule: eventsRef });
      return finish(true, 200, `Pushed to ${label(repo)} (${branch}); ${label(rule)} did not match.`);
    }
    push(rule, 'EventBridge rule', true, `${label(repo)} sent a CodeCommit Repository State Change event (referenceUpdated, branch ${branch}); ${label(rule)} matched it.`, { awsRule: eventsRef });
    const target = linkedTargets(rule, nodes, edges, ['codebuild', 'codepipeline'])[0];
    if (!target) return finish(true, 200, `Pushed to ${label(repo)} (${branch}); ${label(rule)} matched but has no target.`);
    const action = sid(target) === 'codebuild' ? 'codebuild:StartBuild' : 'codepipeline:StartPipelineExecution';
    const role = evaluateServiceRole(rule, [action], cfg(target).resourceArn ?? '*');
    push(target, `Invoke target: ${action}`, role.decision !== 'DENY', role.decision === 'NOT_EVALUATED' ? `Not evaluated: ${role.reason}` : role.reason,
      { component: 'IAM', operation: 'evaluate-service-role', decision: role.decision === 'NOT_EVALUATED' ? 'INFO' : role.decision, awsRule: targetsRef });
    if (role.decision === 'DENY') return finish(false, 403, `${label(rule)} could not invoke ${label(target)}: ${role.reason}`);
    const execution = sid(target) === 'codebuild'
      ? runStandaloneDeveloperTool(target, nodes, edges, scenario, repo)
      : runPipelineExecution(target, nodes, edges, scenario);
    return append(execution, [rule.id, target.id]);
  }
}

/** Targets reached from `from` over documented integration links (stable ID order). */
function linkedTargets(from: N, nodes: N[], edges: E[], serviceIds: string[], kind: 'git-push-events' | 'amplify-cd' = 'git-push-events'): N[] {
  const nodesById = new Map(nodes.map(n => [n.id, n]));
  return edges.filter(e => e.source === from.id && isIntegrationLink(from, nodesById.get(e.target), e.data, kind))
    .map(e => nodesById.get(e.target)!).filter(n => serviceIds.includes(sid(n)!)).sort(byId);
}
