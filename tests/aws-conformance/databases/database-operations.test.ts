import { runConformanceCases, type ConformanceCase } from '../harness.ts';
import type { Node, Edge } from '@xyflow/react';
import { runLiveSimulation } from '../../../src/engine/simulation/liveSimulation.ts';
import { checkConnection, connectionProtocols } from '../../../src/engine/architecture/connectionContracts.ts';
import { SERVICE_OPERATIONS, operationSample } from '../../../src/engine/serviceOperations/definitions.ts';
import type { Policy } from '../../../src/engine/iam/types.ts';

// Database services, bounded operation slices. Sources (verified 2026-11-08) are listed per service
// in docs/behavior/<service-id>.md; the key ones are quoted in each case's reference.

interface Result { code: number; detail?: string }

const box = (id: string, boundaryType: string, x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}): Node<any> =>
  ({ id, type: 'boundaryNode', position: { x, y }, width: w, height: h, data: { boundaryType, label: id, ...extra } } as any);
const svc = (id: string, serviceId: string, x: number, y: number, extra: Record<string, unknown> = {}): Node<any> =>
  ({ id, type: 'serviceNode', position: { x, y }, width: 100, height: 90, data: { serviceId, label: id, health: 'healthy', ...extra } } as any);
const edge = (source: string, target: string, protocol: string, extra: Record<string, unknown> = {}): Edge<any> =>
  ({ id: `${source}-${target}`, source, target, data: { protocol, interactionType: 'synchronous', isCriticalDependency: true, timeoutMs: 1000, ...extra } });
const link = (source: string, target: string): Edge<any> => edge(source, target, 'Event', { relationship: 'manages' });
const role = (principal: string, actions: string[], id = 'AppRole') => ({
  id, trustPolicy: { id: 't', kind: 'trust', statements: [{ effect: 'Allow', principals: [principal], actions: ['sts:AssumeRole'], resources: ['*'] }] } as Policy,
  identityPolicies: [{ id: 'p', kind: 'identity', statements: [{ effect: 'Allow', actions, resources: ['*'] }] }] as Policy[]
});
const denyAllSg = (id: string) => box(id, 'security_group', 3000, 3000, 100, 100, { securityGroupRules: { inbound: [], outbound: [] } });

interface Options {
  resource?: Record<string, unknown>; request?: Record<string, unknown>; action?: string; actions?: string[] | null;
  nat?: boolean; endpoint?: string; otherVpc?: boolean; targetSg?: boolean; targetHealth?: string; port?: number;
}
/** VPC with public/private subnets, IGW, NAT; EC2 caller in the private subnet; database target. */
function diagram(id: string, o: Options = {}) {
  const d = SERVICE_OPERATIONS[id];
  const sample = operationSample(id);
  const lab = { ...sample, ...(o.action ? { action: o.action } : {}), resource: { ...sample.resource, ...(o.resource ?? {}) }, request: { ...sample.request, ...(o.request ?? {}) } };
  const regional = d.iam;
  const nodes: Node<any>[] = [
    box('vpc', 'vpc', 0, 0, 1400, 800, { cidr: '10.0.0.0/16' }),
    box('pub', 'public_subnet', 20, 40, 600, 300, { cidr: '10.0.1.0/24' }),
    box('priv', 'private_subnet', 700, 40, 600, 700, { cidr: '10.0.2.0/24' }),
    svc('igw', 'internet_gateway', 600, 760),
    ...(o.nat === false ? [] : [svc('nat', 'nat_gateway', 100, 100, { subnet: 'public' })]),
    ...(o.endpoint ? [svc('vpce', 'privatelink', 1000, 600, { customConfig: { endpointService: o.endpoint } })] : []),
    ...(o.otherVpc ? [box('vpc2', 'vpc', 3000, 0, 600, 600, { cidr: '10.9.0.0/16' }), box('priv2', 'private_subnet', 3020, 40, 500, 500, { cidr: '10.9.1.0/24' })] : []),
    svc('app', 'ec2', 750, 100, { subnet: 'private', ...(o.actions === null ? {} : { iamRole: role('ec2.amazonaws.com', o.actions ?? ['*']) }) }),
    svc('db', id, regional ? 2000 : o.otherVpc ? 3100 : 750, regional ? 0 : o.otherVpc ? 100 : 400, {
      subnet: regional ? 'global' : 'private', health: o.targetHealth ?? 'healthy', customConfig: { operationLab: lab }, ...(o.targetSg ? { securityGroupIds: ['sg-db'] } : {}) }),
    ...(o.targetSg ? [denyAllSg('sg-db')] : [])
  ];
  return { nodes, edges: [edge('app', 'db', d.protocol, o.port ? { destinationPort: o.port } : {})] };
}
const run = ({ nodes, edges }: { nodes: Node<any>[]; edges: Edge<any>[] }, start = 'app', extra: Record<string, unknown> = {}): Result => {
  const r: any = runLiveSimulation(nodes as any, edges as any, { id: 's', name: 's', method: 'GET', path: '/', trafficLevel: 'normal', startNodeId: start, ...extra } as any);
  return { code: r.statusCode, detail: r.summary };
};
const code = (r: Result) => ({ code: r.code });
const docs = 'docs/behavior/<service-id>.md';

const OK = ['aurora', 'aurora_serverless', 'documentdb', 'memorydb', 'elasticache_serverless', 'timestream', 'redshift_serverless', 'opensearch_db', 'keyspaces', 'aurora_dsql', 'dynamodb', 'rds', 'elasticache', 'neptune'];
const success: ConformanceCase<Result>[] = OK.map(id => ({
  id: `DB-${id.toUpperCase()}-OK-001`, awsBehavior: `${SERVICE_OPERATIONS[id].name}: a correctly placed, authorized caller completes the documented operation (${SERVICE_OPERATIONS[id].actions[0]}).`,
  reference: SERVICE_OPERATIONS[id].source, scenario: `EC2 in a private subnet -> ${id} (${SERVICE_OPERATIONS[id].protocol})`,
  configuration: operationSample(id).resource, request: { action: SERVICE_OPERATIONS[id].actions[0] }, expected: { code: 200 },
  run: () => code(run(diagram(id))), explain: a => a.detail ?? ''
}));

/** RDS Proxy: caller -> proxy -> secret + writer target. */
function proxy(o: { proxyRole?: string[] | null; secret?: boolean; target?: boolean; targetHealth?: string; targetSg?: boolean; resource?: Record<string, unknown>; callerVpc2?: boolean } = {}) {
  const lab = operationSample('rds_proxy');
  const nodes: Node<any>[] = [
    box('vpc', 'vpc', 0, 0, 1400, 800, { cidr: '10.0.0.0/16' }),
    box('priv', 'private_subnet', 20, 40, 1300, 700, { cidr: '10.0.2.0/24' }),
    ...(o.callerVpc2 ? [box('vpc2', 'vpc', 3000, 0, 600, 600, { cidr: '10.9.0.0/16' }), box('priv2', 'private_subnet', 3020, 40, 500, 500, { cidr: '10.9.1.0/24' })] : []),
    svc('app', 'ec2', o.callerVpc2 ? 3100 : 100, 100, { subnet: 'private' }),
    svc('proxy', 'rds_proxy', 400, 100, { subnet: 'private', customConfig: { operationLab: { ...lab, resource: { ...lab.resource, ...(o.resource ?? {}) } } },
      ...(o.proxyRole === null ? {} : { iamRole: role('rds.amazonaws.com', o.proxyRole ?? ['secretsmanager:GetSecretValue', 'kms:Decrypt'], 'ProxyRole') }) }),
    ...(o.secret === false ? [] : [svc('secret', 'secrets_manager', 2000, 0, { subnet: 'global' })]),
    ...(o.target === false ? [] : [svc('writer', 'aurora', 800, 400, { subnet: 'private', health: o.targetHealth ?? 'healthy', ...(o.targetSg ? { securityGroupIds: ['sg-db'] } : {}) })]),
    ...(o.targetSg ? [denyAllSg('sg-db')] : [])
  ];
  const edges = [edge('app', 'proxy', 'SQL'), ...(o.secret === false ? [] : [link('proxy', 'secret')]), ...(o.target === false ? [] : [link('proxy', 'writer')])];
  return { nodes, edges };
}

/** DMS: source RDS -> replication instance -> target Aurora Serverless, all in one VPC. */
function dms(o: { dmsVpcRole?: boolean; inVpc?: boolean; sourceHealth?: string; targetSg?: boolean; target?: boolean; sourceCredentials?: boolean } = {}) {
  const rdsLab = operationSample('rds');
  const nodes: Node<any>[] = [
    box('vpc', 'vpc', 0, 0, 1400, 800, { cidr: '10.0.0.0/16' }),
    box('priv', 'private_subnet', 20, 40, 1300, 700, { cidr: '10.0.2.0/24' }),
    svc('source', 'rds', 100, 100, { subnet: 'private', health: o.sourceHealth ?? 'healthy', customConfig: { operationLab: { ...rdsLab, resource: { ...rdsLab.resource, credentialsValid: o.sourceCredentials ?? true } } } }),
    svc('dms', 'dms', o.inVpc === false ? 3000 : 500, o.inVpc === false ? 2000 : 100, { subnet: o.inVpc === false ? 'global' : 'private', customConfig: o.dmsVpcRole === false ? { dmsVpcRole: false } : {} }),
    ...(o.target === false ? [] : [svc('target', 'aurora_serverless', 900, 100, { subnet: 'private', customConfig: { operationLab: operationSample('aurora_serverless') }, ...(o.targetSg ? { securityGroupIds: ['sg-db'] } : {}) })]),
    ...(o.targetSg ? [denyAllSg('sg-db')] : [])
  ];
  return { nodes, edges: [link('source', 'dms'), ...(o.target === false ? [] : [link('dms', 'target')])] };
}

const CASES: ConformanceCase<Result>[] = [
  ...success,
  // Status / state rules
  { id: 'DB-AURORA-STATUS-001', awsBehavior: 'You can connect only when the instance is available.', reference: 'RDS troubleshooting: "When the state changes to available, you can connect"',
    scenario: 'Aurora status stopped', configuration: { status: 'stopped' }, request: {}, expected: { code: 503 }, run: () => code(run(diagram('aurora', { resource: { status: 'stopped' } }))), explain: a => a.detail ?? '' },
  { id: 'DB-DOCDB-STATUS-001', awsBehavior: 'A DocumentDB cluster is inaccessible while it is being created.', reference: 'DocumentDB cluster status',
    scenario: 'DocumentDB creating', configuration: { status: 'creating' }, request: {}, expected: { code: 503 }, run: () => code(run(diagram('documentdb', { resource: { status: 'creating' } }))), explain: a => a.detail ?? '' },
  { id: 'DB-DOCDB-STATUS-002', awsBehavior: 'Elastic clusters report active.', reference: 'DocumentDB cluster status',
    scenario: 'DocumentDB active', configuration: { status: 'active' }, request: {}, expected: { code: 200 }, run: () => code(run(diagram('documentdb', { resource: { status: 'active' } }))), explain: a => a.detail ?? '' },
  { id: 'DB-DDB-STATUS-001', awsBehavior: 'A DynamoDB table remains available for data operations while UPDATING.', reference: 'DynamoDB API TableDescription',
    scenario: 'Table UPDATING', configuration: { status: 'UPDATING' }, request: {}, expected: { code: 200 }, run: () => code(run(diagram('dynamodb', { resource: { status: 'UPDATING' } }))), explain: a => a.detail ?? '' },
  { id: 'DB-DDB-STATUS-002', awsBehavior: 'An ARCHIVING table does not serve data operations.', reference: 'DynamoDB API TableDescription',
    scenario: 'Table ARCHIVING', configuration: { status: 'ARCHIVING' }, request: {}, expected: { code: 503 }, run: () => code(run(diagram('dynamodb', { resource: { status: 'ARCHIVING' } }))), explain: a => a.detail ?? '' },
  { id: 'DB-RSS-STATUS-001', awsBehavior: 'Redshift Serverless workgroup must be AVAILABLE.', reference: 'Redshift Serverless Workgroup status values',
    scenario: 'Workgroup MODIFYING', configuration: { status: 'MODIFYING' }, request: {}, expected: { code: 503 }, run: () => code(run(diagram('redshift_serverless', { resource: { status: 'MODIFYING' } }))), explain: a => a.detail ?? '' },
  { id: 'DB-DSQL-STATUS-001', awsBehavior: 'Which DSQL states accept connections is UNKNOWN in AWS docs; the simulator reports unsupported instead of guessing.', reference: 'Aurora DSQL GetCluster status values',
    scenario: 'DSQL cluster IDLE', configuration: { status: 'IDLE' }, request: {}, expected: { code: 501 }, run: () => code(run(diagram('aurora_dsql', { resource: { status: 'IDLE' } }))), explain: a => a.detail ?? '' },
  // Aurora Serverless v2 auto-pause
  { id: 'DB-ASV2-RESUME-001', awsBehavior: 'Connecting to a paused Aurora Serverless v2 instance (0 ACU minimum) resumes it and accepts the connection.', reference: 'Aurora Serverless v2 auto-pause',
    scenario: 'Paused, min 0 ACU', configuration: { minCapacityAcu: 0, paused: true }, request: {}, expected: { code: 200 }, run: () => code(run(diagram('aurora_serverless', { resource: { minCapacityAcu: 0, paused: true } }))), explain: a => a.detail ?? '' },
  { id: 'DB-ASV2-RESUME-002', awsBehavior: 'A connection attempt without valid credentials still resumes the instance, then fails authentication.', reference: 'Aurora Serverless v2 auto-pause',
    scenario: 'Paused, invalid credentials', configuration: { minCapacityAcu: 0, paused: true, credentialsValid: false }, request: {}, expected: { code: 403 },
    run: () => code(run(diagram('aurora_serverless', { resource: { minCapacityAcu: 0, paused: true, credentialsValid: false } }))), explain: a => a.detail ?? '' },
  { id: 'DB-ASV2-CONFIG-001', awsBehavior: 'Only a 0 ACU minimum enables auto-pause.', reference: 'Aurora Serverless v2 auto-pause',
    scenario: 'paused with min 0.5 ACU', configuration: { minCapacityAcu: 0.5, paused: true }, request: {}, expected: { code: 400 }, run: () => code(run(diagram('aurora_serverless', { resource: { paused: true } }))), explain: a => a.detail ?? '' },
  // Credentials and configuration
  { id: 'DB-MEMORYDB-AUTH-001', awsBehavior: 'MemoryDB ACL users authenticate connections.', reference: 'MemoryDB getting started / ACLs',
    scenario: 'Invalid ACL credentials', configuration: { credentialsValid: false }, request: {}, expected: { code: 403 }, run: () => code(run(diagram('memorydb', { resource: { credentialsValid: false } }))), explain: a => a.detail ?? '' },
  { id: 'DB-TIMESTREAM-AUTH-001', awsBehavior: 'Timestream for InfluxDB uses InfluxDB credentials, not IAM, for data access.', reference: 'Timestream for InfluxDB overview',
    scenario: 'Invalid InfluxDB credentials', configuration: { credentialsValid: false }, request: {}, expected: { code: 403 }, run: () => code(run(diagram('timestream', { resource: { credentialsValid: false } }))), explain: a => a.detail ?? '' },
  { id: 'DB-ECS-SL-TLS-001', awsBehavior: 'All ElastiCache Serverless caches have in-transit encryption enabled.', reference: 'ElastiCache in-transit encryption',
    scenario: 'tls: false', configuration: { tls: false }, request: {}, expected: { code: 400 }, run: () => code(run(diagram('elasticache_serverless', { resource: { tls: false } }))), explain: a => a.detail ?? '' },
  { id: 'DB-ECS-SL-READER-001', awsBehavior: 'Port 6380 is the read-from-replica endpoint (reads only).', reference: 'ElastiCache set-up: serverless uses ports 6379 and 6380',
    scenario: 'SET on 6380', configuration: { port: 6380 }, request: {}, expected: { code: 400 }, run: () => code(run(diagram('elasticache_serverless', { resource: { port: 6380 } }))), explain: a => a.detail ?? '' },
  { id: 'DB-ECS-SL-READER-002', awsBehavior: 'GET on the 6380 read-from-replica endpoint succeeds.', reference: 'ElastiCache set-up',
    scenario: 'GET on 6380', configuration: { port: 6380 }, request: { action: 'GET' }, expected: { code: 200 }, run: () => code(run(diagram('elasticache_serverless', { resource: { port: 6380 }, action: 'GET' }))), explain: a => a.detail ?? '' },
  { id: 'DB-ECS-SL-PUBLIC-001', awsBehavior: 'Public serverless endpoints exist (TLS 1.3, IAM-only users) but are outside this slice.', reference: 'API ServerlessCache ConnectionType',
    scenario: 'connectionType public', configuration: { connectionType: 'public' }, request: {}, expected: { code: 501 }, run: () => code(run(diagram('elasticache_serverless', { resource: { connectionType: 'public' } }))), explain: a => a.detail ?? '' },
  { id: 'DB-RSS-PORT-001', awsBehavior: 'Redshift Serverless runs within ports 5431-5455 and 8191-8215.', reference: 'Connecting to Amazon Redshift Serverless',
    scenario: 'Port 6000', configuration: { port: 6000 }, request: {}, expected: { code: 400 }, run: () => code(run(diagram('redshift_serverless', { resource: { port: 6000 } }))), explain: a => a.detail ?? '' },
  { id: 'DB-AURORA-ENGINE-001', awsBehavior: 'Aurora engines are Aurora MySQL (3306) and Aurora PostgreSQL (5432).', reference: 'Creating an Aurora DB cluster',
    scenario: 'engine oracle', configuration: { engine: 'oracle' }, request: {}, expected: { code: 501 }, run: () => code(run(diagram('aurora', { resource: { engine: 'oracle' } }))), explain: a => a.detail ?? '' },
  // Network
  { id: 'DB-DOCDB-NET-001', awsBehavior: 'VPC databases deny access unless a security group inbound rule allows the caller on the port.', reference: 'RDS/DocumentDB security groups',
    scenario: 'DocumentDB SG with no inbound rules', configuration: { securityGroup: 'deny all' }, request: {}, expected: { code: 403 }, run: () => code(run(diagram('documentdb', { targetSg: true }))), explain: a => a.detail ?? '' },
  { id: 'DB-AURORA-NET-001', awsBehavior: 'Private endpoints are reachable from the same VPC; cross-VPC access needs peering (outside this slice).', reference: 'Aurora VPC',
    scenario: 'Aurora in another VPC', configuration: { otherVpc: true }, request: {}, expected: { code: 501 }, run: () => code(run(diagram('aurora', { otherVpc: true }))), explain: a => a.detail ?? '' },
  { id: 'DB-KEYSPACES-NET-001', awsBehavior: 'Without a VPC endpoint, a private-subnet caller needs an internet path (NAT) to the regional endpoint.', reference: 'Keyspaces VPC endpoints',
    scenario: 'No NAT, no endpoint', configuration: { nat: false }, request: {}, expected: { code: 504 }, run: () => code(run(diagram('keyspaces', { nat: false }))), explain: a => a.detail ?? '' },
  { id: 'DB-KEYSPACES-NET-002', awsBehavior: 'An interface VPC endpoint removes the need for NAT.', reference: 'Keyspaces VPC endpoints: "don\'t require an internet gateway, NAT device"',
    scenario: 'No NAT, keyspaces interface endpoint', configuration: { nat: false, endpoint: 'keyspaces' }, request: {}, expected: { code: 200 }, run: () => code(run(diagram('keyspaces', { nat: false, endpoint: 'keyspaces' }))), explain: a => a.detail ?? '' },
  { id: 'DB-NGA-NET-001', awsBehavior: 'Graphs are created with public connectivity disabled; private access uses the graph private endpoint.', reference: 'Neptune Analytics connecting',
    scenario: 'Default graph via NAT', configuration: { publicConnectivity: false }, request: {}, expected: { code: 504 }, run: () => code(run(diagram('neptune_analytics'))), explain: a => a.detail ?? '' },
  { id: 'DB-NGA-NET-002', awsBehavior: 'Through the private endpoint the signed query is authorized.', reference: 'Neptune Analytics connecting',
    scenario: 'Default graph via interface endpoint', configuration: { endpoint: 'neptune_analytics' }, request: {}, expected: { code: 200 }, run: () => code(run(diagram('neptune_analytics', { endpoint: 'neptune_analytics' }))), explain: a => a.detail ?? '' },
  { id: 'DB-NGA-NET-003', awsBehavior: 'With public connectivity enabled, an internet path (NAT) reaches the graph.', reference: 'Neptune Analytics connecting',
    scenario: 'publicConnectivity true via NAT', configuration: { publicConnectivity: true }, request: {}, expected: { code: 200 }, run: () => code(run(diagram('neptune_analytics', { resource: { publicConnectivity: true } }))), explain: a => a.detail ?? '' },
  // IAM
  { id: 'DB-KEYSPACES-IAM-001', awsBehavior: 'CQL reads need cassandra:Select on the caller identity.', reference: 'Keyspaces identity-based policy examples',
    scenario: 'Role allows only cassandra:Modify', configuration: { actions: ['cassandra:Modify'] }, request: { action: 'cassandra:Select' }, expected: { code: 403 },
    run: () => code(run(diagram('keyspaces', { actions: ['cassandra:Modify'] }))), explain: a => a.detail ?? '' },
  { id: 'DB-DSQL-IAM-001', awsBehavior: 'The admin role needs dsql:DbConnectAdmin; dsql:DbConnect covers custom roles only.', reference: 'Aurora DSQL authentication and authorization',
    scenario: 'DbConnectAdmin with only DbConnect allowed', configuration: { actions: ['dsql:DbConnect'] }, request: { action: 'dsql:DbConnectAdmin' }, expected: { code: 403 },
    run: () => code(run(diagram('aurora_dsql', { actions: ['dsql:DbConnect'], action: 'dsql:DbConnectAdmin' }))), explain: a => a.detail ?? '' },
  { id: 'DB-OPENSEARCH-IAM-001', awsBehavior: 'With an IAM-based access policy, requests must be signed by an authorized identity.', reference: 'OpenSearch Service identity and access management',
    scenario: 'accessPolicy iam, caller without role', configuration: { accessPolicy: 'iam' }, request: {}, expected: { code: 403 }, run: () => code(run(diagram('opensearch_db', { actions: null }))), explain: a => a.detail ?? '' },
  { id: 'DB-OPENSEARCH-IAM-002', awsBehavior: 'In a VPC domain an open access policy leaves access control to security groups.', reference: 'OpenSearch Service: open domain access policy in a VPC',
    scenario: 'accessPolicy open, caller without role', configuration: { accessPolicy: 'open' }, request: {}, expected: { code: 200 }, run: () => code(run(diagram('opensearch_db', { actions: null, resource: { accessPolicy: 'open' } }))), explain: a => a.detail ?? '' },
  // Health and recovery
  { id: 'DB-MEMORYDB-HEALTH-001', awsBehavior: 'An unavailable cluster refuses connections (teaching failure); healthy recovers (DB-MEMORYDB-OK-001).', reference: 'Failure injection',
    scenario: 'MemoryDB failed', configuration: { health: 'failed' }, request: {}, expected: { code: 503 }, run: () => code(run(diagram('memorydb', { targetHealth: 'failed' }))), explain: a => a.detail ?? '' },
  // RDS Proxy
  { id: 'DB-PROXY-OK-001', awsBehavior: 'The proxy reads its secret with its role and connects to the writer target.', reference: 'RDS Proxy concepts; IAM setup',
    scenario: 'App -> proxy -> secret + Aurora writer', configuration: {}, request: {}, expected: { code: 200 }, run: () => code(run(proxy())), explain: a => a.detail ?? '' },
  { id: 'DB-PROXY-SECRET-001', awsBehavior: 'A proxy needs a Secrets Manager secret (unless end-to-end IAM auth is used).', reference: 'RDS Proxy secrets',
    scenario: 'No secret linked', configuration: { secret: false }, request: {}, expected: { code: 400 }, run: () => code(run(proxy({ secret: false }))), explain: a => a.detail ?? '' },
  { id: 'DB-PROXY-IAM-001', awsBehavior: 'The proxy role must allow secretsmanager:GetSecretValue.', reference: 'RDS Proxy IAM setup',
    scenario: 'Proxy role allows only kms:Decrypt', configuration: { proxyRole: ['kms:Decrypt'] }, request: {}, expected: { code: 403 }, run: () => code(run(proxy({ proxyRole: ['kms:Decrypt'] }))), explain: a => a.detail ?? '' },
  { id: 'DB-PROXY-IAM-002', awsBehavior: 'A proxy without an IAM role cannot read its secret.', reference: 'RDS Proxy IAM setup',
    scenario: 'No proxy role', configuration: { proxyRole: null }, request: {}, expected: { code: 400 }, run: () => code(run(proxy({ proxyRole: null }))), explain: a => a.detail ?? '' },
  { id: 'DB-PROXY-PORT-001', awsBehavior: 'All proxies listen on 5432 for PostgreSQL and 3306 for MySQL.', reference: 'RDS Proxy limitations',
    scenario: 'POSTGRESQL proxy on 3306', configuration: { port: 3306 }, request: {}, expected: { code: 400 }, run: () => code(run(proxy({ resource: { port: 3306 } }))), explain: a => a.detail ?? '' },
  { id: 'DB-PROXY-TARGET-001', awsBehavior: 'An unavailable writer leaves the proxy nothing to connect to (teaching failure).', reference: 'RDS Proxy concepts',
    scenario: 'Writer failed', configuration: { targetHealth: 'failed' }, request: {}, expected: { code: 503 }, run: () => code(run(proxy({ targetHealth: 'failed' }))), explain: a => a.detail ?? '' },
  { id: 'DB-PROXY-NET-001', awsBehavior: 'The target security group must allow the proxy.', reference: 'RDS Proxy network prerequisites',
    scenario: 'Writer SG with no inbound rules', configuration: { targetSg: true }, request: {}, expected: { code: 403 }, run: () => code(run(proxy({ targetSg: true }))), explain: a => a.detail ?? '' },
  { id: 'DB-PROXY-VPC-001', awsBehavior: 'The proxy can\'t be publicly accessible; callers reach it from inside its VPC.', reference: 'RDS Proxy limitations',
    scenario: 'Caller in another VPC', configuration: { callerVpc2: true }, request: {}, expected: { code: 501 }, run: () => code(run(proxy({ callerVpc2: true }))), explain: a => a.detail ?? '' },
  // DMS
  { id: 'DB-DMS-OK-001', awsBehavior: 'Starting a task connects to the source and target endpoints, then runs the full load.', reference: 'DMS task status: Starting',
    scenario: 'RDS -> DMS -> Aurora Serverless', configuration: {}, request: { start: 'dms' }, expected: { code: 200 }, run: () => code(run(dms(), 'dms')), explain: a => a.detail ?? '' },
  { id: 'DB-DMS-IAM-001', awsBehavior: 'The account needs the exact role dms-vpc-role.', reference: 'DMS IAM: "You must use these exact role names"',
    scenario: 'No dms-vpc-role', configuration: { dmsVpcRole: false }, request: { start: 'dms' }, expected: { code: 403 }, run: () => code(run(dms({ dmsVpcRole: false }), 'dms')), explain: a => a.detail ?? '' },
  { id: 'DB-DMS-VPC-001', awsBehavior: 'AWS DMS always creates the replication instance in a VPC.', reference: 'DMS replication instance VPC',
    scenario: 'Replication instance outside any subnet', configuration: { inVpc: false }, request: { start: 'dms' }, expected: { code: 400 }, run: () => code(run(dms({ inVpc: false }), 'dms')), explain: a => a.detail ?? '' },
  { id: 'DB-DMS-NET-001', awsBehavior: 'The endpoint security group must allow ingress on the database port from the replication instance.', reference: 'DMS replication instance VPC',
    scenario: 'Target SG with no inbound rules', configuration: { targetSg: true }, request: { start: 'dms' }, expected: { code: 403 }, run: () => code(run(dms({ targetSg: true }), 'dms')), explain: a => a.detail ?? '' },
  { id: 'DB-DMS-HEALTH-001', awsBehavior: 'An unavailable source endpoint fails the connection test (teaching failure).', reference: 'DMS TestConnection',
    scenario: 'Source failed', configuration: { sourceHealth: 'failed' }, request: { start: 'dms' }, expected: { code: 503 }, run: () => code(run(dms({ sourceHealth: 'failed' }), 'dms')), explain: a => a.detail ?? '' },
  { id: 'DB-DMS-AUTH-001', awsBehavior: 'Endpoint credentials are part of the connection test.', reference: 'DMS endpoints: test connection',
    scenario: 'Source credentials invalid', configuration: { sourceCredentials: false }, request: { start: 'dms' }, expected: { code: 403 }, run: () => code(run(dms({ sourceCredentials: false }), 'dms')), explain: a => a.detail ?? '' },
  { id: 'DB-DMS-CONFIG-001', awsBehavior: 'A task needs both a source and a target endpoint.', reference: 'DMS endpoints',
    scenario: 'No target', configuration: { target: false }, request: { start: 'dms' }, expected: { code: 400 }, run: () => code(run(dms({ target: false }), 'dms')), explain: a => a.detail ?? '' },
  // QLDB retired
  { id: 'DB-QLDB-RETIRED-001', awsBehavior: 'Amazon QLDB was fully shut down on July 31, 2025 and no longer accepts requests.', reference: 'AWS services in full shutdown',
    scenario: 'EC2 -> QLDB', configuration: {}, request: {}, expected: { code: 0, detail: 'invalid' },
    run: () => { const a = svc('a', 'ec2', 0, 0), b = svc('b', 'qldb', 0, 0); return { code: connectionProtocols(a, b).length, detail: checkConnection(a, b, { protocol: 'HTTPS' } as any).status }; },
    explain: a => JSON.stringify(a) },
  // End-to-end request through the generic traversal
  { id: 'DB-E2E-001', awsBehavior: 'A user request through an ALB to an EC2 app reaches DocumentDB through the same operation evaluator.', reference: 'DocumentDB connect',
    scenario: 'User -> ALB -> EC2 -> DocumentDB', configuration: {}, request: { start: 'user' }, expected: { code: 200 },
    run: () => {
      const base = diagram('documentdb');
      const nodes = [...base.nodes, svc('user', 'user', -300, 100, { subnet: 'global' }), svc('alb', 'alb', 300, 150, { subnet: 'public' })];
      return code(run({ nodes, edges: [edge('user', 'alb', 'HTTPS'), edge('alb', 'app', 'HTTP'), ...base.edges] }, 'user'));
    }, explain: a => a.detail ?? '' }
];

runConformanceCases(CASES);
