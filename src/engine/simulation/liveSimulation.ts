import { operationMode } from '../serviceOperations/definitions.ts';
import { runServiceOperation } from '../serviceOperations/runner.ts';
import { runXraySubmission } from '../observability/xray.ts';
import { isCicdWorkflowLink } from '../architecture/cicdRelationships.ts';
import { isDependencyCall, relationshipKind } from '../architecture/relationships.ts';
import type { Node, Edge } from '@xyflow/react';
import type { ServiceNodeData, ConnectionData, SimulationScenario, SimulationResult } from '../../types/index.ts';
import type { RequestTrace } from '../trace/types.ts';
import { runSimulation } from './requestSimulator.ts';
import { resultEvidence } from './resultEvidence.ts';
import { pipelinesTriggeredBy, runPipelineExecution, runStandaloneDeveloperTool } from '../cicd/pipeline.ts';
import { pushTargets, runGitPush } from '../cicd/gitPush.ts';
import { isConnectionGitProvider } from '../architecture/externalActors.ts';
import { isIntegrationLink } from '../architecture/serviceIntegrations.ts';

/** The UI executes this entry point. Explanations are immutable run evidence, never a second run. */
export function runLiveSimulation(nodes: Node<ServiceNodeData>[], edges: Edge<ConnectionData>[], scenario: SimulationScenario): SimulationResult {
  // Normalize legacy CI/CD links for execution only; saved architecture data stays unchanged.
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  edges = edges.map(edge => isCicdWorkflowLink(nodesById.get(edge.source), nodesById.get(edge.target), edge.data)
    ? { ...edge, data: { ...edge.data, relationship: 'manages' } as ConnectionData } : edge);
  // Explicit step numbers still define workload priority. IDs break otherwise ambiguous ties;
  // canvas insertion order and JSON serialization order must not select a different path.
  const byId = (a: { id: string }, b: { id: string }) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  // A pipeline (or a push to a source that triggers one) runs as a CI/CD workflow, not a request.
  const start = nodes.find(node => node.id === scenario.startNodeId);
  if (start && operationMode(start.data.serviceId,start.data.customConfig)) return structuredClone(runServiceOperation(start,nodes,edges,scenario));
  if (start?.data.serviceId === 'xray') return structuredClone(runXraySubmission(start, nodes, edges, scenario));
  // A developer's Git push, or a push event at a third-party Git host, may start a pipeline.
  if (start?.data.serviceId === 'developer' && pushTargets(start, nodes, edges).length) return structuredClone(runGitPush(start, [...nodes].sort(byId), [...edges].sort(byId), scenario));
  if (start && isConnectionGitProvider(start.data.serviceId)) return structuredClone(runGitPush(undefined, [...nodes].sort(byId), [...edges].sort(byId), scenario, start));
  // A repository push with an Amplify Hosting app connected fans out to the app as well as any pipeline.
  if (start?.data.serviceId === 'codecommit' && edges.some(e => e.source === start.id && isIntegrationLink(start, nodesById.get(e.target), e.data, 'amplify-cd'))) {
    return structuredClone(runGitPush(undefined, [...nodes].sort(byId), [...edges].sort(byId), scenario, start));
  }
  const pipeline = start?.data.serviceId === 'codepipeline' ? start
    : start && ['codecommit', 'ecr_registry'].includes(start.data.serviceId) ? pipelinesTriggeredBy(start, nodes, edges).sort(byId)[0] : undefined;
  if (pipeline) return structuredClone(runPipelineExecution(pipeline, [...nodes].sort(byId), [...edges].sort(byId), scenario));
  // A push event at a repository whose events go to an EventBridge rule.
  if (start?.data.serviceId === 'codecommit' && edges.some(e => e.source === start.id && isIntegrationLink(start, nodesById.get(e.target), e.data, 'git-push-events'))) {
    return structuredClone(runGitPush(undefined, [...nodes].sort(byId), [...edges].sort(byId), scenario, start));
  }
  if (start && ['codecommit', 'codebuild', 'codedeploy'].includes(start.data.serviceId)) {
    return structuredClone(runStandaloneDeveloperTool(start, [...nodes].sort(byId), [...edges].sort(byId), scenario));
  }
  const result = runSimulation([...nodes].sort(byId), [...edges].sort(byId), scenario, { enforceIam: true });
  Object.assign(result, resultEvidence(result));
  if (edges.some(edge => isDependencyCall(edge.data))) {
    result.summary += ' Scope: the forwarding path and supported dependency calls were evaluated; other dependency-only arrows were not executed.';
  }
  if (edges.some(edge => ['authorization', 'manages', 'route-association', 'target-registration'].includes(relationshipKind(edge.data)))) {
    result.summary += ' Scope: structural relationships do not carry requests; ASG control-plane changes run separately through the scaling controls. Other structural control-plane behavior is not yet simulated.';
  }
  // Some legacy steps include nested configuration objects. Capture evidence before the UI
  // edits those objects or applies returned service state to the architecture.
  return structuredClone(result);
}

export function traceFromSimulation(result: SimulationResult): RequestTrace {
  const { kind, outcome } = resultEvidence(result);
  return {
    kind,
    entries: result.steps.map((step, index) => step.details?.decision
      ? { ...step.details.decision, order: index + 1,
          metadata: { ...step.details.decision.metadata, stepId: step.id, timestampMs: step.timestampMs } }
      : {
          order: index + 1, component: 'Service', resource: step.targetNodeName,
          operation: step.action, input: { source: step.sourceNodeId, destination: step.targetNodeId, protocol: step.protocol },
          decision: step.status === 'failed' ? 'FAILURE' : step.status === 'bypassed' ? 'INFO' : 'SUCCESS',
          reason: step.explanation, simpleExplanation: step.explanation,
          awsRule: 'Recorded simulator decision. This legacy stage does not yet provide a verified AWS rule reference.',
          metadata: { ...step.details, stepId: step.id, timestampMs: step.timestampMs, ruleReferenceAvailable: false }
        }),
    final: outcome === 'success' ? 'SUCCESS' : outcome === 'denied' ? 'DENIED' : outcome === 'unsupported' ? 'UNSUPPORTED' : 'FAILURE', why: result.summary
  };
}
