import type { Node, Edge } from '@xyflow/react';
import type { ServiceNodeData, ConnectionData, SimulationScenario, SimulationResult, SimulationStep } from '../../types/index.ts';
import type { TraceEntry } from '../trace/types.ts';
import { isIntegrationLink } from '../architecture/serviceIntegrations.ts';
import { findContainingSubnetBoundary, findContainingVpc } from '../layout/containment.ts';
import { evaluateApplicationHop } from '../simulation/applicationHop.ts';
import { SimulationTrace } from '../simulation/adapters/types.ts';

/**
 * AWS DMS StartReplicationTask (full load), bounded. Spec: docs/behavior/dms.md (verified 2026-11-08).
 * - The replication instance always runs in a VPC (replication subnet group in at least two AZs).
 *   https://docs.aws.amazon.com/dms/latest/userguide/CHAP_ReplicationInstance.VPC.html
 * - Endpoint databases must allow ingress on the database port from the replication instance (same page).
 * - The account needs the exact role dms-vpc-role (AmazonDMSVPCManagementRole).
 *   https://docs.aws.amazon.com/dms/latest/userguide/security-iam.html
 * - Starting a task connects to the source and target endpoints (TestConnection semantics).
 *   https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Monitoring.html
 * Source = database linked into DMS, target = database DMS links to (data-flow direction).
 * Not modeled: CDC, table mappings, LOB settings, engine conversion, cross-VPC/public endpoints,
 * exact task behavior when an endpoint becomes unreachable mid-task (UNKNOWN).
 */

type N = Node<ServiceNodeData>;
type E = Edge<ConnectionData>;

const DEFAULT_PORTS: Record<string, number> = { rds: 5432, aurora: 5432, aurora_serverless: 5432, documentdb: 27017 };
const cfg = (node: N | undefined): Record<string, any> => (node?.data.customConfig ?? {}) as Record<string, any>;
const label = (node: N) => String(node.data.label ?? node.id);
const byId = (a: { id: string }, b: { id: string }) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Endpoint settings authored on the database's operation lab (status, port, credentials). */
function endpointSettings(db: N): { port: number; status?: string; credentialsValid?: boolean } {
  let resource: Record<string, any> = {};
  try { const raw = cfg(db).operationLab?.resource; resource = (typeof raw === 'string' ? JSON.parse(raw) : raw) ?? {}; } catch { resource = {}; }
  return { port: Number.isInteger(resource.port) ? resource.port : DEFAULT_PORTS[db.data.serviceId], status: resource.status, credentialsValid: resource.credentialsValid };
}

export function dmsEndpoints(dms: N, nodes: N[], edges: E[]): { sources: N[]; targets: N[] } {
  const byNode = new Map(nodes.map(n => [n.id, n]));
  const sources = edges.filter(e => e.target === dms.id && isIntegrationLink(byNode.get(e.source), dms, e.data, 'dms-endpoint')).map(e => byNode.get(e.source)!).sort(byId);
  const targets = edges.filter(e => e.source === dms.id && isIntegrationLink(dms, byNode.get(e.target), e.data, 'dms-endpoint')).map(e => byNode.get(e.target)!).sort(byId);
  return { sources, targets };
}

export function runDmsReplicationTask(dms: N, nodes: N[], edges: E[], scenario: SimulationScenario): SimulationResult {
  const steps: SimulationStep[] = [];
  const push = (target: N, action: string, ok: boolean, explanation: string, decision: Partial<TraceEntry> = {}) => {
    const n = steps.length + 1;
    steps.push({ id: `dms-step-${n}`, stepNumber: n, timestampMs: n * 10, sourceNodeId: dms.id, targetNodeId: target.id, sourceNodeName: label(dms), targetNodeName: label(target),
      protocol: 'TCP', action, status: ok ? 'success' : 'failed', explanation, targetHealth: target.data.health, latencyMs: 10,
      details: { decision: { order: n, component: 'Service', resource: label(target), operation: action, input: {}, decision: ok ? 'ALLOW' : 'DENY', reason: explanation,
        simpleExplanation: explanation, awsRule: 'https://docs.aws.amazon.com/dms/latest/userguide/CHAP_ReplicationInstance.VPC.html', metadata: {}, ...decision } as TraceEntry } });
  };
  const finish = (ok: boolean, code: number, summary: string): SimulationResult => ({
    kind: 'workflow', outcome: ok ? 'success' : code === 403 ? 'denied' : code === 501 ? 'unsupported' : 'failure', scenario, steps, success: ok, statusCode: code,
    summary, totalLatencyMs: steps.length * 10, bottlenecksDetected: [], cascadeOccurred: false, path: [...new Set([dms.id, ...steps.map(s => s.targetNodeId)])]
  });
  const fail = (target: N, code: number, action: string, reason: string, decision: Partial<TraceEntry> = {}) => { push(target, action, false, reason, decision); return finish(false, code, reason); };

  if (dms.data.health === 'failed') return fail(dms, 503, 'Replication instance', `${label(dms)} is unavailable.`);
  if ((cfg(dms).status ?? 'available') !== 'available') return fail(dms, 503, 'Replication instance', `Replication instance status is ${cfg(dms).status}; it must be available.`);
  const subnet = findContainingSubnetBoundary(dms, nodes);
  const vpc = subnet && findContainingVpc(subnet, nodes);
  if (!vpc) return fail(dms, 400, 'Replication instance placement', 'AWS DMS always creates the replication instance in a VPC: place it in a subnet of a replication subnet group.');
  push(dms, 'Replication instance placement', true, `${label(dms)} runs in ${label(subnet!)} of ${label(vpc)}. AWS requires the replication subnet group to cover at least two Availability Zones (subnet group not drawn).`);
  if (cfg(dms).dmsVpcRole === false) return fail(dms, 403, 'dms-vpc-role', 'The account has no dms-vpc-role (AmazonDMSVPCManagementRole); DMS cannot manage the replication instance network interfaces.',
    { component: 'IAM', awsRule: 'https://docs.aws.amazon.com/dms/latest/userguide/security-iam.html' });
  push(dms, 'dms-vpc-role', true, 'The exact role dms-vpc-role with AmazonDMSVPCManagementRole exists in the account.', { component: 'IAM', awsRule: 'https://docs.aws.amazon.com/dms/latest/userguide/security-iam.html' });

  const { sources, targets } = dmsEndpoints(dms, nodes, edges);
  if (!sources.length || !targets.length) return fail(dms, 400, 'Endpoints', 'Connect the source database to DMS and DMS to the target database (data-flow direction).');
  const chosen = (list: N[], key: string) => list.find(n => n.id === cfg(dms)[key]) ?? list[0];
  for (const [role, db] of [['source', chosen(sources, 'sourceId')], ['target', chosen(targets, 'targetId')]] as const) {
    const action = `Test connection: ${role} endpoint`;
    if (db.data.health === 'failed') return fail(db, 503, action, `${role === 'source' ? 'Source' : 'Target'} ${label(db)} is unavailable; the task cannot connect to it.`);
    const dbVpc = findContainingSubnetBoundary(db, nodes) && findContainingVpc(findContainingSubnetBoundary(db, nodes)!, nodes);
    if (!dbVpc) return fail(db, 400, action, `Place ${label(db)} in a subnet; VPC-hosted endpoints need network placement.`);
    if (dbVpc.id !== vpc.id) return fail(db, 501, action, 'Cross-VPC, peered and public endpoints are outside this same-VPC DMS slice.');
    const settings = endpointSettings(db);
    if (settings.status !== undefined && !['available', 'active'].includes(settings.status)) return fail(db, 503, action, `${label(db)} status is ${settings.status}; it does not accept connections.`);
    const trace = new SimulationTrace();
    const link = edges.find(e => (e.source === db.id && e.target === dms.id) || (e.source === dms.id && e.target === db.id))!;
    const hop = { ...link, data: { ...link.data, protocol: 'TCP', destinationPort: settings.port } } as E;
    if (evaluateApplicationHop({ source: dms, target: db, protocol: 'TCP', nodes, path: [dms], enforceIam: false, trace, connection: hop })) {
      return fail(db, trace.finalStatusCode, action, `${trace.finalSummary} The ${role} security group must allow ingress on port ${settings.port} from the replication instance.`, { component: 'Route' });
    }
    if (settings.credentialsValid === false) return fail(db, 403, action, `The ${role} endpoint credentials were rejected by ${label(db)} (authored training input).`);
    push(db, action, true, `Replication instance reached ${label(db)} on port ${settings.port}; credentials accepted. Status: successful.`,
      { awsRule: 'https://docs.aws.amazon.com/dms/latest/APIReference/API_TestConnection.html' });
  }
  const source = chosen(sources, 'sourceId'), target = chosen(targets, 'targetId');
  push(target, 'Replication task: full load', true, `Task started (Starting → Running) and copied existing data from ${label(source)} to ${label(target)}. Table mappings, data volume and CDC are not simulated.`,
    { awsRule: 'https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Monitoring.html' });
  return finish(true, 200, `Replication task running: full load ${label(source)} → ${label(target)}.`);
}
