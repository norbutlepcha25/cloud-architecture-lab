import test from 'node:test';
import assert from 'node:assert/strict';
import { dmsWalkthrough } from '../src/engine/explain/walkthrough.ts';
import { runLiveSimulation } from '../src/engine/simulation/liveSimulation.ts';
import { operationSample } from '../src/engine/serviceOperations/definitions.ts';

const box = (id: string, boundaryType: string, x: number, y: number, w: number, h: number, cidr: string): any => ({ id, type: 'boundaryNode', position: { x, y }, width: w, height: h, data: { boundaryType, label: id, cidr } });
const svc = (id: string, serviceId: string, x: number, extra: Record<string, unknown> = {}): any => ({ id, type: 'serviceNode', position: { x, y: 100 }, width: 100, height: 90, data: { serviceId, label: id, health: 'healthy', subnet: 'private', ...extra } });
const link = (source: string, target: string): any => ({ id: `${source}-${target}`, source, target, data: { protocol: 'Event', relationship: 'manages' } });
const nodes = [box('vpc', 'vpc', 0, 0, 1400, 800, '10.0.0.0/16'), box('priv', 'private_subnet', 20, 40, 1300, 700, '10.0.2.0/24'),
  svc('source', 'rds', 100, { customConfig: { operationLab: operationSample('rds') } }), svc('dms', 'dms', 500), svc('target', 'aurora_serverless', 900, { customConfig: { operationLab: operationSample('aurora_serverless') } })];
const edges = [link('source', 'dms'), link('dms', 'target')];
const scenario: any = { id: 's', name: 's', method: 'POST', path: '/', trafficLevel: 'normal', startNodeId: 'dms' };

test('DMS walkthrough replays the live task decisions in order and its what-if never edits the diagram', () => {
  const before = structuredClone(nodes);
  const live = runLiveSimulation(nodes, edges, scenario);
  const walk = dmsWalkthrough(nodes[3], nodes, edges, scenario);
  assert.deepEqual(walk.frames.map(f => f.title), live.steps.map(s => s.action));
  assert.deepEqual(walk.frames.map(f => f.title), ['Replication instance placement', 'dms-vpc-role', 'Test connection: source endpoint', 'Test connection: target endpoint', 'Replication task: full load']);
  const failed = dmsWalkthrough(nodes[3], nodes, edges, scenario, { sourceFails: true });
  assert.equal(failed.frames.at(-1)!.status, 'fail');
  assert.match(failed.frames.at(-1)!.detail, /source is unavailable/);
  assert.deepEqual(nodes, before);
});
