import test from 'node:test';
import assert from 'node:assert/strict';
import { runConformanceCases } from '../harness.ts';
import { runLiveSimulation } from '../../../src/engine/simulation/liveSimulation.ts';
import { runLabReference } from '../../../src/engine/labs/runLabReference.ts';
import { buildRole } from '../../../src/engine/iam/roleBuilder.ts';
import { checkConnection } from '../../../src/engine/architecture/connectionContracts.ts';
import { validateArchitecture } from '../../../src/engine/validation/index.ts';

const DOC = 'https://docs.aws.amazon.com/xray/latest/api/API_PutTraceSegments.html';
const segment = (patch: Record<string, unknown> = {}) => ({ name: 'orders', id: '0123456789abcdef', trace_id: '1-abcdef01-0123456789abcdef01234567', start_time: 1800000000, end_time: 1800000001, ...patch });
const node = (id: string, serviceId: string, config: any = {}): any => ({ id, type: 'serviceNode', position: { x: 2000, y: 0 }, data: { serviceId, label: id, health: 'healthy', subnet: 'global', customConfig: config } });
const scenario: any = { id: 'xray', name: 'xray', startNodeId: 'publisher', trafficLevel: 'normal', method: 'POST', path: '/TraceSegments' };
function fixture(docs: any = [segment()]) {
  const publisher = node('publisher', 'lambda');
  const xray = node('xray', 'xray', { segmentDocuments: JSON.stringify(docs) });
  publisher.data.iamRole = buildRole('lambda', 'publisher-role', [{ target: xray, actions: ['xray:PutTraceSegments'] }]);
  const edge: any = { id: 'publish', source: publisher.id, target: xray.id, data: { protocol: 'HTTPS', relationship: 'request', action: 'xray:PutTraceSegments' } };
  return { publisher, xray, nodes: [publisher, xray], edges: [edge] };
}
const run = (g: ReturnType<typeof fixture>, startNodeId = 'publisher') => runLiveSimulation(g.nodes, g.edges, { ...scenario, startNodeId });
const batch = (r: any) => r.steps.find((s: any) => s.action === 'X-Ray: PutTraceSegments')?.details?.xrayResponse;
runConformanceCases([
  { id: 'XRAY-PUT-001', awsBehavior: 'PutTraceSegments accepts completed segments and returns HTTP 200 with unprocessed segment results.', reference: DOC, scenario: 'Authorized Lambda submits a valid segment', configuration: {}, request: { operation: 'PutTraceSegments' }, expected: { code: 200, accepted: 1, unprocessed: 0 }, run: () => { const r = run(fixture()); return { code: r.statusCode, accepted: batch(r)?.accepted, unprocessed: batch(r)?.UnprocessedTraceSegments.length }; }, explain: a => JSON.stringify(a) },
  { id: 'XRAY-PARTIAL-001', awsBehavior: 'Per-segment processing failures are returned in UnprocessedTraceSegments even when the request returns HTTP 200.', reference: DOC, scenario: 'One valid segment and one missing required id', configuration: {}, request: {}, expected: { code: 200, accepted: 1, unprocessed: 1 }, run: () => { const r = run(fixture([segment(), segment({ id: '' })])); return { code: r.statusCode, accepted: batch(r)?.accepted, unprocessed: batch(r)?.UnprocessedTraceSegments.length }; }, explain: a => JSON.stringify(a) },
  { id: 'XRAY-SIZE-001', awsBehavior: 'A segment document can be up to 64 kB.', reference: 'https://docs.aws.amazon.com/xray/latest/devguide/xray-api-segmentdocuments.html', scenario: 'Oversized UTF-8 segment is not ingested', configuration: {}, request: {}, expected: 1, run: () => batch(run(fixture([segment({ metadata: { payload: 'é'.repeat(33000) } })])))?.UnprocessedTraceSegments.length, explain: a => String(a) },
  { id: 'XRAY-IAM-001', awsBehavior: 'PutTraceSegments requires IAM permission on Resource *; a role attachment or a scoped group ARN does not grant this action.', reference: 'https://docs.aws.amazon.com/service-authorization/latest/reference/list_xray.html', scenario: 'Missing role, explicit deny, wrong trust and resource-scoped grant are denied', configuration: {}, request: {}, expected: [403, 403, 403, 403], run: () => [0,1,2,3].map(mode => { const g = fixture(); if (!mode) delete g.publisher.data.iamRole; if (mode === 1) g.publisher.data.iamRole.identityPolicies[0].statements.push({ effect: 'Deny', actions: ['xray:*'], resources: ['*'] }); if (mode === 2) g.publisher.data.iamRole.trustPolicy.statements[0].principals = ['ec2.amazonaws.com']; if (mode === 3) g.publisher.data.iamRole.identityPolicies[0].statements[0].resources = ['arn:aws:xray:us-east-1:000000000000:group/test']; return run(g).statusCode; }), explain: a => JSON.stringify(a) },
  { id: 'XRAY-UPDATE-001', awsBehavior: 'A completed segment overwrites an in-progress segment with the same identity.', reference: DOC, scenario: 'Start segment, then submit its completion', configuration: {}, request: {}, expected: { records: 1, complete: true }, run: () => { const g = fixture([segment({ end_time: undefined, in_progress: true })]); const first = run(g); g.xray.data.customConfig.serviceRuntime = first.serviceStates?.xray; g.xray.data.customConfig.segmentDocuments = JSON.stringify([segment()]); const r = run(g); const records = r.serviceStates?.xray.records ?? []; return { records: records.length, complete: records[0]?.end_time === 1800000001 }; }, explain: a => JSON.stringify(a) }
]);

test('X-Ray standalone submission uses a connected publisher and the same API evaluator', () => {
  const g = fixture(), expected = run(g);
  const direct = run(g, 'xray');
  assert.equal(direct.statusCode, 200, direct.summary);
  assert.deepEqual(batch(direct), batch(expected));
  assert.deepEqual(direct.serviceStates, expected.serviceStates);
  assert.equal(runLiveSimulation([g.xray], [], { ...scenario, startNodeId: 'xray' }).statusCode, 400);
});

test('X-Ray rejects invalid batch configuration and records health failures and recovery without mutating inputs', () => {
  const g = fixture(), before = structuredClone(g);
  assert.equal(run(g).success, true);
  assert.deepEqual(g, before);
  g.xray.data.customConfig.segmentDocuments = '{';
  assert.equal(run(g).statusCode, 400);
  assert.ok(validateArchitecture(g.nodes, g.edges).some(f => f.resourceId === 'xray'));
  g.xray.data.customConfig.segmentDocuments = JSON.stringify([segment()]);
  g.xray.data.health = 'failed';
  assert.equal(run(g).statusCode, 503);
  g.xray.data.health = 'healthy';
  assert.equal(run(g).statusCode, 200);
});

test('X-Ray connection contracts, saved roles and entry points preserve supported scope', () => {
  const g = fixture();
  assert.equal(g.publisher.data.iamRole.identityPolicies[0].statements[0].resources[0], '*');
  assert.equal(checkConnection(g.publisher, g.xray, g.edges[0].data).status, 'valid');
  assert.equal(checkConnection(g.publisher, g.xray, { protocol: 'SQL' }).status, 'invalid');
  assert.notEqual(checkConnection(node('db', 'rds'), g.xray, { protocol: 'HTTPS' }).status, 'valid');
  assert.notEqual(checkConnection(g.xray, g.publisher, { protocol: 'HTTPS' }).status, 'valid');
  const expected = run(g, 'xray');
  assert.deepEqual(runLiveSimulation([...g.nodes].reverse(), [...g.edges].reverse(), { ...scenario, startNodeId: 'xray' }), expected);
  assert.deepEqual(runLabReference({ nodes: g.nodes, edges: g.edges, scenario: { ...scenario, startNodeId: 'xray' } } as any), expected);
  assert.deepEqual(runLiveSimulation(JSON.parse(JSON.stringify(g.nodes)), JSON.parse(JSON.stringify(g.edges)), { ...scenario, startNodeId: 'xray' }), expected);
  assert.equal(runLiveSimulation(g.nodes, [{ ...g.edges[0], data: { ...g.edges[0].data, relationship: 'manages', referenceAnnotation: 'lab' } }], { ...scenario, startNodeId: 'xray' }).statusCode, 400);
});

// Network rules: https://docs.aws.amazon.com/xray/latest/devguide/xray-security-vpc-endpoint.html
// Lambda IGW rule: https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc-internet.html
// Checked 2026-10-18. Shared route evaluator coverage excludes endpoint policy and egress SG/NACL.
test('X-Ray private publishers require NAT or a matching interface endpoint and recover after endpoint failure', () => {
  const g = fixture();
  const boundary = (id: string, boundaryType: string, x: number, width: number): any => ({ id, type: 'boundaryNode', position: { x, y: 3000 }, width, height: 600, data: { boundaryType, label: id, cidr: boundaryType === 'vpc' ? '10.0.0.0/16' : boundaryType === 'public_subnet' ? '10.0.1.0/24' : '10.0.2.0/24' } });
  g.publisher.position = { x: 800, y: 3200 }; g.publisher.width = 100; g.publisher.height = 90;
  const vpc = boundary('vpc', 'vpc', 0, 1400), pub = boundary('pub', 'public_subnet', 20, 500), priv = boundary('private', 'private_subnet', 700, 500);
  g.nodes.push(vpc, pub, priv);
  assert.equal(run(g, 'xray').statusCode, 504);
  const unrelated = node('unrelated', 'privatelink', { endpointService: 's3' }); unrelated.position = { x: 900, y: 3400 };
  g.nodes.push(unrelated);
  assert.equal(run(g, 'xray').statusCode, 504);
  const endpoint = node('endpoint', 'privatelink', { endpointService: 'xray' }); endpoint.position = { x: 900, y: 3300 };
  g.nodes.push(endpoint);
  assert.equal(run(g, 'xray').statusCode, 200);
  endpoint.data.health = 'failed';
  assert.equal(run(g, 'xray').statusCode, 504);
  endpoint.data.health = 'healthy';
  const expected = run(g, 'xray');
  assert.equal(expected.statusCode, 200);
  assert.deepEqual(runLiveSimulation([...g.nodes].reverse(), g.edges, { ...scenario, startNodeId: 'xray' }), expected);
  g.nodes = g.nodes.filter(n => n.id !== endpoint.id);
  const igw = node('igw', 'internet_gateway'), nat = node('nat', 'nat_gateway');
  igw.position = { x: 600, y: 3010 }; nat.position = { x: 100, y: 3400 };
  g.nodes.push(igw, nat);
  assert.equal(run(g, 'xray').statusCode, 200);
  g.publisher.position = { x: 200, y: 3200 };
  assert.equal(run(g, 'xray').statusCode, 504, 'public-subnet Lambda cannot use an IGW alone');
});

test('X-Ray required-field failures are item-level results; subsegments stay explicitly unsupported', () => {
  for (const patch of [{ trace_id: 'bad' }, { start_time: 'yesterday' }, { end_time: undefined }, { name: '' }, { name: '<invalid>' }, { id: 1234567890123456 }, { in_progress: 'true' }]) {
    const r = run(fixture([segment(patch)]));
    assert.equal(r.statusCode, 200);
    assert.equal(batch(r).UnprocessedTraceSegments.length, 1);
    assert.match(r.steps.find(s => s.action === 'X-Ray: unprocessed segment')!.explanation, /not ingested/);
  }
  const r = run(fixture([segment({ subsegments: [] })]));
  assert.equal(r.outcome, 'unsupported');
  assert.equal(r.statusCode, 501);
  assert.equal(r.serviceStates?.xray, undefined);
});

test('X-Ray walkthrough consumes the same operation and what-ifs never mutate the architecture', async () => {
  const { xrayWalkthrough } = await import('../../../src/engine/explain/walkthrough.ts');
  const g = fixture(), before = structuredClone(g);
  const direct = run(g, 'xray');
  const walkthrough = xrayWalkthrough(g.xray, g.nodes, g.edges, scenario);
  assert.deepEqual(walkthrough.frames.map(f => f.detail), direct.steps.map(s => s.explanation));
  assert.equal(walkthrough.summary, direct.summary);
  assert.ok(xrayWalkthrough(g.xray, g.nodes, g.edges, scenario, { publisherFails: true }).frames.some(f => f.status === 'fail'));
  assert.deepEqual(g, before);
});
