import type { Node, Edge } from '@xyflow/react';
import { operate, type Runtime } from '../services/operations.ts';
import { bytes, object, reject, unsupported, OperationError, type OperationSettings, type OperationOutput } from './types.ts';
import { isIntegrationLink } from '../architecture/serviceIntegrations.ts';
import { evaluateServiceRole } from '../cicd/pipeline.ts';
import { evaluateApplicationHop } from '../simulation/applicationHop.ts';
import { SimulationTrace } from '../simulation/adapters/types.ts';
export interface OperationContext extends OperationSettings {
  id: string; runtime: Runtime; nodes: Node<any>[]; edges: Edge<any>[];
  authorizeKey: (id: string, action: string) => void;
}
export type Handler = (ctx: OperationContext) => OperationOutput;
const value = (v: unknown, field: string) => typeof v === 'string' && v.length ? v : reject(`${field} must be a non-empty string.`);
const available = (resource: Record<string, any>, status: string) => { if (resource.status !== status) throw new OperationError(503, `Resource status is ${resource.status ?? 'unspecified'}; this operation requires ${status}.`); };
const metadata = (ctx: OperationContext) => { ctx.runtime.sequence++; return ctx.runtime; };
const append = (ctx: OperationContext, record: Record<string, unknown>) => { ctx.runtime.records.push(record); return metadata(ctx); };

const publish: Handler = ctx => {
  if (ctx.resource.topicType !== 'standard') return unsupported('Only standard SNS topics are modeled in this operation slice.');
  const limit = ctx.resource.MaximumMessageSize;
  if (!Number.isInteger(limit) || limit < 1024 || limit > 1048576) return reject('MaximumMessageSize must be between 1024 and 1048576 bytes.');
  const message = value(ctx.request.Message, 'Message');
  if (ctx.request.MessageAttributes || ctx.request.MessageStructure) return unsupported('SNS structured messages and message attributes are outside this operation slice.');
  if (bytes(message) > limit) return reject(`SNS Message exceeds configured MaximumMessageSize (${limit} bytes).`);
  const result = operate(ctx.nodes, ctx.edges, ctx.id, 'publish', { body: message });
  const states: Record<string, Runtime> = {};
  for (const node of result.nodes) if (node.data.customConfig?.serviceRuntime) states[node.id] = node.data.customConfig.serviceRuntime;
  ctx.runtime.records.push({ Message: message });
  return { response: { MessageId: `${ctx.id}-message-${ctx.runtime.sequence + 1}`, subscriptionStates: states }, runtime: metadata(ctx), notes: result.trace };
};

function itemAttributes(item: unknown, name: string): Record<string, any> {
  if (!object(item)) return reject(`${name} must be an attribute map.`);
  for (const [key, attr] of Object.entries(item)) {
    if (!key || !object(attr) || Object.keys(attr).length !== 1) return reject(`${name} attributes need one scalar type each.`);
    if (attr.S !== undefined) { if (typeof attr.S !== 'string') return reject('S attributes must be strings.'); }
    else if (attr.N !== undefined) { if (typeof attr.N !== 'string' || !/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(attr.N)) return reject('N attributes must contain a numeric string.'); }
    else if (attr.BOOL !== undefined) { if (typeof attr.BOOL !== 'boolean') return reject('BOOL attributes must be booleans.'); }
    else return unsupported('Only S/N/BOOL attributes are supported in this DynamoDB slice.');
  }
  return item;
}
const dynamodb: Handler = ctx => {
  // "The table/index remains available for data operations when UPDATING." (API TableDescription)
  if (!['ACTIVE', 'UPDATING'].includes(ctx.resource.status)) throw new OperationError(503, `Table status is ${ctx.resource.status ?? 'unspecified'}; data operations require ACTIVE (or UPDATING).`);
  const pk = value(ctx.resource.partitionKey, 'partitionKey');
  if (ctx.resource.sortKey) return unsupported('Composite keys are outside this single-string-key slice.');
  if (ctx.request.ConditionExpression || ctx.request.ProjectionExpression) return unsupported('DynamoDB expressions are not modeled.');
  if (ctx.action === 'dynamodb:PutItem') {
    const item = itemAttributes(ctx.request.Item, 'Item');
    const key = value(item[pk]?.S, `Item.${pk}.S`);
    if (bytes(key) > 2048) return reject('String partition keys must not exceed 2048 bytes.');
    // Exact string-map size; numeric storage/precision accounting is outside the large-item slice.
    if (bytes(JSON.stringify(item)) > 400 * 1024) return unsupported('Large-item encoding/accounting requires a fuller DynamoDB schema model.');
    const index = ctx.runtime.records.findIndex(r => (r.Item as any)?.[pk]?.S === key);
    const record = { Item: structuredClone(item) };
    if (index < 0) ctx.runtime.records.push(record); else ctx.runtime.records[index] = record;
    return { response: {}, runtime: metadata(ctx) };
  }
  const key = itemAttributes(ctx.request.Key, 'Key');
  if (Object.keys(key).length !== 1) return reject('GetItem Key must contain exactly the configured partition key.');
  const id = value(key[pk]?.S, `Key.${pk}.S`);
  if (ctx.request.ConsistentRead !== true) return unsupported('Choose ConsistentRead: true; eventual-consistency timing is outside this slice.');
  const item = ctx.runtime.records.find(r => (r.Item as any)?.[pk]?.S === id)?.Item;
  return { response: item ? { Item: structuredClone(item) } : {} };
};

const kinesis: Handler = ctx => {
  available(ctx.resource, 'ACTIVE');
  if (ctx.resource.distribution !== 'USER_PARTITION_KEY' || (ctx.resource.shardCount ?? 1) !== 1) return unsupported('Only a single teaching shard with USER_PARTITION_KEY distribution is supported.');
  const key = value(ctx.request.PartitionKey, 'PartitionKey');
  if ([...key].length > 256) return reject('PartitionKey exceeds 256 characters.');
  if (typeof ctx.request.Data !== 'string') return reject('Data must be the decoded UTF-8 payload string in this teaching input.');
  if (bytes(key) + bytes(ctx.request.Data) > 10 * 1024 * 1024) return reject('Record data plus partition key exceeds 10 MiB.');
  if (ctx.request.ExplicitHashKey || ctx.request.SequenceNumberForOrdering) return unsupported('Explicit shard hashing and ordered-write parameters are not implemented.');
  const sequence = String(ctx.runtime.sequence + 1);
  return { response: { ShardId: 'shardId-000000000000', SequenceNumber: sequence }, runtime: append(ctx, { PartitionKey: key, Data: ctx.request.Data, SequenceNumber: sequence }), notes: ['Single-shard sequence identifiers are deterministic teaching values, not AWS predictions.'] };
};

const events: Handler = ctx => {
  const entries = ctx.request.Entries;
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 10) return reject('PutEvents requires 1–10 Entries.');
  const size = entries.reduce((sum, e) => sum + (e?.Time === undefined ? 0 : 14) + ['Source', 'DetailType', 'Detail'].reduce((s,k) => s + (typeof e?.[k] === 'string' ? bytes(e[k]) : 0), 0) + (Array.isArray(e?.Resources) ? e.Resources.reduce((s: number, v: any) => s + (typeof v === 'string' ? bytes(v) : 0), 0) : 0), 0);
  if (size >= 1048576) return reject('PutEvents total entry size must be less than 1 MiB.');
  let failed = 0;
  const result = entries.map((entry, index) => {
    let problem = '';
    if (!object(entry) || !entry.Source || !entry.DetailType || typeof entry.Detail !== 'string') problem = 'Source, DetailType and JSON Detail are required.';
    else { try { if (!object(JSON.parse(entry.Detail))) problem = 'Detail must encode a JSON object.'; } catch { problem = 'Detail is malformed JSON.'; } }
    if (problem) { failed++; return { ErrorCode: 'InvalidEntry', ErrorMessage: problem }; }
    const id = `${ctx.id}-event-${ctx.runtime.sequence + index + 1}`;
    if (ctx.resource.exists !== false) ctx.runtime.records.push({ ...structuredClone(entry), EventId: id });
    return { EventId: id };
  });
  ctx.runtime.sequence += entries.length;
  return { response: { FailedEntryCount: failed, Entries: result }, runtime: ctx.runtime,
    notes: [ctx.resource.exists === false ? 'The authored bus does not exist: EventBridge may return successful PutEvents without storing/delivering these events.' : 'Events were ingested only. Rule matching, target delivery and retries were not executed.', 'InvalidEntry is a simulator-local diagnostic; exact AWS item error strings are not certified.'] };
};

const metrics: Handler = ctx => {
  const namespace = value(ctx.request.Namespace, 'Namespace');
  if (namespace.length > 255 || namespace.startsWith(':')) return reject('Namespace must be at most 255 characters and cannot start with a colon.');
  const data = ctx.request.MetricData;
  if (!Array.isArray(data) || data.length < 1 || data.length > 1000) return reject('MetricData must contain 1–1000 metrics.');
  for (const metric of data) {
    if (!object(metric) || typeof metric.MetricName !== 'string' || !metric.MetricName.length || metric.MetricName.length > 255) return reject('MetricName must contain 1–255 characters.');
    if (metric.Values || metric.StatisticValues || metric.Dimensions) return unsupported('Only scalar metrics without dimensions/statistical sets are modeled.');
    if (typeof metric.Value !== 'number' || !Number.isFinite(metric.Value) || Math.abs(metric.Value) > 2 ** 360) return reject('Metric Value must be finite and within ±2^360.');
  }
  if (bytes(JSON.stringify(ctx.request)) > 1024 * 1024) return reject('PutMetricData request exceeds 1 MiB.');
  data.forEach(metric => ctx.runtime.records.push({ Namespace: namespace, ...structuredClone(metric) }));
  return { response: {}, runtime: metadata(ctx), notes: ['Metric ingestion does not immediately evaluate alarms or prove metric query availability.'] };
};

/** Private endpoint connection; `ready` lists the documented states that accept connections. */
const connectWhen = (ready: string[]): Handler => ctx => {
  if (ctx.id && !Number.isInteger(ctx.resource.port)) return reject('Configure an integer endpoint port.');
  if (ctx.resource.port < 1 || ctx.resource.port > 65535) return reject('Endpoint port must be 1–65535.');
  if (!ready.includes(ctx.resource.status)) throw new OperationError(503, `Resource status is ${ctx.resource.status ?? 'unspecified'}; connections are accepted only when ${ready.join(' or ')}.`);
  if (ctx.resource.iamAuthentication === true) return unsupported('IAM database authentication is outside this connection slice.');
  if (ctx.resource.credentialsValid === false) throw new OperationError(403, 'Database credentials were rejected (authored training input, not an IAM decision).');
  if (ctx.resource.credentialsValid !== undefined && typeof ctx.resource.credentialsValid !== 'boolean') return reject('credentialsValid must be a boolean.');
  return { response: { connected: true, port: ctx.resource.port }, notes: ['Connection accepted in the bounded model. SQL/graph query execution, password exchange and TLS negotiation are not implemented.'] };
};
const connect = connectWhen(['available']);
const stringStore = (ctx: OperationContext): OperationOutput => {
  const key = value(ctx.request.key, 'key');
  if (ctx.action === 'SET') {
    if (typeof ctx.request.value !== 'string') return reject('SET value must be a string.');
    const index = ctx.runtime.records.findIndex(r => r.key === key);
    const record = { key, value: ctx.request.value };
    if (index < 0) ctx.runtime.records.push(record); else ctx.runtime.records[index] = record;
    return { response: { result: 'OK' }, runtime: metadata(ctx) };
  }
  return { response: { value: ctx.runtime.records.find(r => r.key === key)?.value ?? null } };
};
const cache: Handler = ctx => {
  connect(ctx);
  if (ctx.resource.engine !== 'redis') return unsupported('Only Redis OSS string GET/SET is modeled.');
  return stringStore(ctx);
};

// ---- Database services (sources verified 2026-11-08; see docs/behavior/<id>.md) ----

/** Aurora: cluster (writer) endpoint; default ports Aurora MySQL 3306 / Aurora PostgreSQL 5432. */
const AURORA_PORTS: Record<string, number> = { 'aurora-postgresql': 5432, 'aurora-mysql': 3306 };
const aurora: Handler = ctx => {
  if (!AURORA_PORTS[ctx.resource.engine]) return unsupported('Choose engine aurora-postgresql or aurora-mysql.');
  return connect(ctx);
};
/** Serverless v2 auto-pause: at 0 ACU minimum a paused instance resumes on any connection attempt,
 *  even one with invalid credentials, and still reports status available. */
const auroraServerless: Handler = ctx => {
  const min = ctx.resource.minCapacityAcu;
  if (typeof min !== 'number' || min < 0) return reject('minCapacityAcu must be a number of ACUs (0 enables auto-pause).');
  if (ctx.resource.paused === true && min !== 0) return reject('Only a cluster with minimum capacity 0 ACU can be auto-paused.');
  const notes: string[] = [];
  if (ctx.resource.paused === true) notes.push('The instance was auto-paused (0 ACU). The connection attempt resumed it; AWS documents a typical resume time of about 15 seconds (30 s or more after a long pause).');
  try { const output = aurora(ctx); return { ...output, response: { ...output.response, resumed: ctx.resource.paused === true }, notes: [...notes, ...(output.notes ?? [])] }; }
  catch (error) { if (notes.length && error instanceof OperationError) error.message = `${notes[0]} ${error.message}`; throw error; }
};
const documentdb: Handler = ctx => {
  if (typeof ctx.resource.tls !== 'boolean') return reject('tls must be true or false (the cluster tls parameter; enabled by default).');
  return connectWhen(['available', 'active'])(ctx);
};
const memorydb: Handler = ctx => { connect(ctx); return stringStore(ctx); };
/** Serverless: 6379 primary (read/write), 6380 read-from-replica; TLS always on. */
const elasticacheServerless: Handler = ctx => {
  if (ctx.resource.connectionType === 'public') return unsupported('Public serverless endpoints (TLS 1.3, IAM-only user groups) are outside this VPC slice.');
  if (ctx.resource.connectionType !== 'vpc') return reject('connectionType must be vpc or public.');
  if (ctx.resource.tls === false) return reject('All ElastiCache Serverless caches have in-transit encryption enabled; it cannot be turned off.');
  if (![6379, 6380].includes(ctx.resource.port)) return reject('ElastiCache Serverless uses port 6379 (primary) and 6380 (read from replica).');
  connectWhen(['AVAILABLE'])(ctx);
  if (ctx.resource.port === 6380 && ctx.action === 'SET') return reject('Port 6380 is the read-from-replica endpoint; send writes to 6379.');
  return stringStore(ctx);
};
const timestream = connectWhen(['AVAILABLE']);
/** Redshift Serverless workgroups listen on 5431–5455 or 8191–8215 (default 5439). */
const redshiftServerless: Handler = ctx => {
  const p = ctx.resource.port;
  if (!((p >= 5431 && p <= 5455) || (p >= 8191 && p <= 8215))) return reject('Redshift Serverless ports are 5431–5455 or 8191–8215 (default 5439).');
  return connectWhen(['AVAILABLE'])(ctx);
};
/** Regional APIs authorized by IAM in the runner; the handler checks resource state only. */
const regionalState = (ready: string[], unknownNote?: string): Handler => ctx => {
  if (!ready.includes(ctx.resource.status)) {
    if (unknownNote) throw new OperationError(501, `${unknownNote} Status ${ctx.resource.status ?? 'unspecified'} is not modeled.`);
    throw new OperationError(503, `Resource status is ${ctx.resource.status ?? 'unspecified'}; requests require ${ready.join(' or ')}.`);
  }
  return { response: { accepted: true, action: ctx.action }, notes: ['Authorized and accepted in the bounded model; query/statement execution is not implemented.'] };
};
const opensearch: Handler = ctx => {
  if (ctx.resource.port !== 443 && ctx.resource.port !== 80) return reject('OpenSearch Service accepts connections only on port 443 (HTTPS) or 80 (HTTP).');
  if (!['open', 'iam'].includes(ctx.resource.accessPolicy)) return reject('accessPolicy must be open or iam.');
  return { response: { accepted: true, action: ctx.action }, notes: ['Search/index request accepted in the bounded model; documents and queries are not simulated.'] };
};

const keyMetadata: Handler = ctx => {
  const key = value(ctx.resource.KeyId, 'KeyId');
  if (!['Enabled','Disabled','PendingDeletion','PendingImport','Unavailable','Creating','Updating'].includes(ctx.resource.KeyState)) return reject('Configure a supported KeyState.');
  if (ctx.resource.exists === false) throw new OperationError(400, 'NotFoundException: the modeled key does not exist.');
  return { response: { KeyMetadata: { KeyId: key, KeyState: ctx.resource.KeyState, KeyUsage: ctx.resource.KeyUsage ?? 'ENCRYPT_DECRYPT' } }, notes: ['DescribeKey reports metadata even for a disabled key; it does not perform encryption/decryption.'] };
};
const certificate: Handler = ctx => {
  const arn = value(ctx.resource.CertificateArn, 'CertificateArn');
  if (!/^arn:[^:]+:acm:[^:]+:\d{12}:certificate\/[A-Za-z0-9-]+$/.test(arn)) return reject('CertificateArn must identify an ACM certificate.');
  if (!['PENDING_VALIDATION','ISSUED','INACTIVE','EXPIRED','VALIDATION_TIMED_OUT','REVOKED','FAILED'].includes(ctx.resource.Status)) return reject('Unsupported certificate Status.');
  if (ctx.resource.exists === false) throw new OperationError(400, 'ResourceNotFoundException: certificate not found.');
  return { response: { Certificate: { CertificateArn: arn, DomainName: value(ctx.resource.DomainName, 'DomainName'), Status: ctx.resource.Status } }, notes: ['Description does not issue/validate a certificate or attach it to a listener.'] };
};
const secret: Handler = ctx => {
  value(ctx.resource.SecretId, 'SecretId');
  if (ctx.resource.deleted === true) throw new OperationError(400, 'InvalidRequestException: secret is scheduled for deletion.');
  const versions = ctx.resource.versions;
  if (!Array.isArray(versions)) return reject('versions must be an authored array.');
  const stage = ctx.request.VersionStage ?? (ctx.request.VersionId ? undefined : 'AWSCURRENT');
  const version = versions.find(v => (!ctx.request.VersionId || v.VersionId === ctx.request.VersionId) && (!stage || v.VersionStages?.includes(stage)));
  if (!version) throw new OperationError(400, 'ResourceNotFoundException: no secret version matches the requested id/stage.');
  if (ctx.resource.kmsKeyId) ctx.authorizeKey(value(ctx.resource.kmsKeyId, 'kmsKeyId'), 'kms:Decrypt');
  if (typeof version.SecretString !== 'string') return unsupported('Only synthetic SecretString versions are supported; SecretBinary is excluded.');
  return { response: { Name: ctx.resource.SecretId, VersionId: version.VersionId, VersionStages: version.VersionStages, SecretString: version.SecretString } };
};

export const OPERATION_HANDLERS: Record<string, Handler> = {
  sns: publish, rds: connect, dynamodb, neptune: connect, redshift: connect, kinesis,
  eventbridge: events, elasticache: cache, cloudwatch: metrics, kms: keyMetadata, acm: certificate, secrets_manager: secret,
  aurora, aurora_serverless: auroraServerless, documentdb, memorydb, elasticache_serverless: elasticacheServerless, timestream,
  redshift_serverless: redshiftServerless, opensearch_db: opensearch,
  keyspaces: regionalState(['ACTIVE']), neptune_analytics: regionalState(['AVAILABLE']),
  aurora_dsql: regionalState(['ACTIVE'], 'Which Aurora DSQL cluster states accept connections is UNKNOWN in AWS documentation; only ACTIVE is modeled.'),
  rds_proxy: ctx => proxyConnect(ctx)
};

/** RDS Proxy default endpoint: listens on the engine-family port, reads its Secrets Manager secret
 *  with its own role (trusted by rds.amazonaws.com), then opens a connection to the writer target.
 *  https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy.html
 *  https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy-iam-setup.html */
const PROXY_PORTS: Record<string, number> = { POSTGRESQL: 5432, MYSQL: 3306 };
function proxyConnect(ctx: OperationContext): OperationOutput {
  const family = ctx.resource.engineFamily;
  if (!PROXY_PORTS[family]) return unsupported('Choose engineFamily POSTGRESQL or MYSQL; SQL Server proxies are outside this slice.');
  if (ctx.resource.port !== PROXY_PORTS[family]) return reject(`RDS Proxy listens on port ${PROXY_PORTS[family]} for ${family}.`);
  connect(ctx);
  const proxy = ctx.nodes.find(n => n.id === ctx.id)!;
  const linked = (serviceIds: string[]) => ctx.edges.filter(e => e.source === proxy.id)
    .map(e => ({ edge: e, node: ctx.nodes.find(n => n.id === e.target) }))
    .filter(({ edge, node }) => node && serviceIds.includes(node.data.serviceId) && isIntegrationLink(proxy, node, edge.data))
    .sort((a, b) => a.node!.id.localeCompare(b.node!.id));
  const secret = linked(['secrets_manager'])[0]?.node;
  if (!secret) return reject('Connect the proxy to the Secrets Manager secret that holds the database credentials (required unless end-to-end IAM authentication is used, which is outside this slice).');
  if (secret.data.health === 'failed') throw new OperationError(503, `${secret.data.label} is unavailable, so the proxy cannot read database credentials.`);
  const secretArn = String(secret.data.customConfig?.resourceArn ?? `arn:aws:secretsmanager:us-east-1:000000000000:secret:${secret.id}`);
  const role = evaluateServiceRole(proxy, ['secretsmanager:GetSecretValue'], secretArn);
  if (role.decision === 'DENY') throw new OperationError(403, `Proxy role cannot read the secret: ${role.reason}`);
  if (role.decision === 'NOT_EVALUATED') return reject(`${proxy.data.label} has no IAM role. RDS Proxy needs a role trusted by rds.amazonaws.com that allows secretsmanager:GetSecretValue (and kms:Decrypt for a customer managed key).`);
  const targetLink = linked(['rds', 'aurora', 'aurora_serverless'])[0];
  if (!targetLink) return reject('Connect the proxy to its target database (the writer instance or Aurora cluster).');
  const target = targetLink.node!;
  if (target.data.health === 'failed') throw new OperationError(503, `Target ${target.data.label} is unavailable; the proxy has no writer to connect to.`);
  const status = (() => { try { const raw = target.data.customConfig?.operationLab?.resource; const r = typeof raw === 'string' ? JSON.parse(raw) : raw; return r?.status; } catch { return undefined; } })();
  if (status !== undefined && status !== 'available') throw new OperationError(503, `Target ${target.data.label} status is ${status}; it must be available.`);
  const trace = new SimulationTrace();
  const hop = { ...targetLink.edge, data: { ...targetLink.edge.data, protocol: 'SQL', destinationPort: PROXY_PORTS[family] } };
  if (evaluateApplicationHop({ source: proxy, target, protocol: 'SQL', nodes: ctx.nodes, path: [proxy], enforceIam: false, trace, connection: hop as any })) {
    throw new OperationError(trace.finalStatusCode, `Proxy → ${target.data.label}: ${trace.finalSummary} The target security group must allow the proxy on port ${PROXY_PORTS[family]}.`);
  }
  return { response: { connected: true, port: ctx.resource.port, target: target.id },
    notes: [`Proxy role ${proxy.data.iamRole?.id} read ${secret.data.label} (${role.reason})`, `Proxy connected to writer target ${target.data.label} on port ${PROXY_PORTS[family]}; security groups allowed it.`, 'Connection pooling, multiplexing and pinning are not simulated.'] };
}
