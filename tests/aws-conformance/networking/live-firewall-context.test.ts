import test from 'node:test';
import assert from 'node:assert/strict';
import { runLiveSimulation } from '../../../src/engine/simulation/liveSimulation.ts';
import { checkConnection } from '../../../src/engine/architecture/connectionContracts.ts';

// Test IDs: LIVE-SG-CIDR-001, LIVE-SG-PORT-001, LIVE-NACL-CONTEXT-001.
// AWS rule: inbound controls match the packet source, protocol and destination port;
// NACL uses the first matching numbered rule, SG requires a matching allow.
// Official sources (verified 2026-10-16):
// https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html
// https://docs.aws.amazon.com/vpc/latest/userguide/nacl-rules.html
// Architecture/request: private EC2 app 10.0.1.24 -> private EC2 endpoint TCP 5432.
// Configuration and expected outcomes are varied below. Actual behavior/result is asserted
// through the live entry point. Scope: configured inbound checks, not full TCP conformance.
const scenario = { id: 'packet', name: 'Packet context', startNodeId: 'app', method: 'GET', path: '/', trafficLevel: 'normal' } as const;
function fixture() {
  const nodes: any[] = [
    { id: 'app', type: 'serviceNode', position: { x: 0, y: 0 }, data: { serviceId: 'ec2', label: 'App', health: 'healthy', subnet: 'private', networkIdentity: { privateIp: '10.0.1.24' } } },
    { id: 'server', type: 'serviceNode', position: { x: 300, y: 0 }, data: { serviceId: 'ec2', label: 'Server', health: 'healthy', subnet: 'private', networkIdentity: { privateIp: '10.0.2.10' }, securityGroupIds: ['server-sg'] } },
    { id: 'server-sg', type: 'boundaryNode', position: { x: 5000, y: 5000 }, data: { boundaryType: 'security_group', label: 'Server SG', securityGroupRules: { inbound: [{ protocol: 'TCP', portRange: '5432', source: { type: 'cidr', cidr: '10.0.1.0/24' } }], outbound: [] } } }
  ];
  const edges: any[] = [{ id: 'call', source: 'app', target: 'server', data: { protocol: 'TCP', destinationPort: 5432 } }];
  return { nodes, edges, run: () => runLiveSimulation(nodes, edges, scenario) };
}

test('LIVE-SG-CIDR-001: actual source IP controls live inbound CIDR matching', () => {
  const f = fixture(); assert.equal(f.run().success, true);
  f.nodes[0].data.networkIdentity.privateIp = '10.0.3.24';
  const denied = f.run(); assert.equal(denied.success, false); assert.equal(denied.statusCode, 403);
  const evidence = denied.steps.find(step => step.details?.decision?.component === 'Security Group')!.details!.decision!;
  assert.equal(evidence.input.sourceIp, '10.0.3.24');
  assert.equal(evidence.input.destinationPort, 5432);
  assert.equal(evidence.metadata.addressEvaluated, true);
});

test('LIVE-SG-PORT-001: source permission does not permit a different destination port', () => {
  const f = fixture(); f.edges[0].data.destinationPort = 5433;
  assert.equal(f.run().success, false);
  f.nodes[2].data.securityGroupRules.inbound[0].portRange = '5432-5434';
  assert.equal(f.run().success, true);
});

test('LIVE-NACL-CONTEXT-001: earlier port/CIDR-specific deny wins over later allow', () => {
  const f = fixture();
  f.nodes.push({ id: 'destination-subnet', type: 'boundaryNode', position: { x: 200, y: -50 }, data: {
    boundaryType: 'private_subnet', width: 500, height: 400, customNacl: { naclName: 'Server NACL', isCustom: true,
      inboundRules: [
        { ruleNumber: 10, type: 'Custom TCP', protocol: 'TCP', portRange: '5432', cidr: '10.0.3.0/24', action: 'DENY' },
        { ruleNumber: 100, type: 'Custom TCP', protocol: 'TCP', portRange: '5432', cidr: '0.0.0.0/0', action: 'ALLOW' }
      ], outboundRules: [] }
  } });
  f.nodes[1].data.networkIdentity.subnetId = 'destination-subnet';
  assert.equal(f.run().success, true);
  f.nodes[0].data.networkIdentity.privateIp = '10.0.3.24';
  const result = f.run(); assert.equal(result.success, false);
  assert.match(result.steps.find(step => step.details?.decision?.component === 'NACL')!.explanation, /Rule 10/);
  assert.ok(!result.steps.some(step => step.details?.decision?.component === 'Security Group'));
});

test('Explicit malformed packet configuration fails validation rather than gaining access', () => {
  const f = fixture();
  for (const port of [0, -1, 65536, 1.5, NaN]) {
    f.edges[0].data.destinationPort = port;
    assert.equal(checkConnection(f.nodes[0], f.nodes[1], f.edges[0].data).status, 'invalid');
    assert.equal(f.run().success, false);
  }
  f.edges[0].data.destinationPort = 5432;
  f.nodes[0].data.networkIdentity.privateIp = '999.0.0.1';
  assert.equal(f.run().statusCode, 400);
});
