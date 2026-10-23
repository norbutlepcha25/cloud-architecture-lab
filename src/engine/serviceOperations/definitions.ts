import type { ProtocolType } from '../../types/index.ts';
import type { OperationSettings } from './types.ts';
export interface OperationDefinition {
  name: string; actions: string[]; protocol: ProtocolType; port: number; iam: boolean; source: string;
  resource: Record<string, unknown>; request: Record<string, unknown>; scope: string;
}
export const OPERATION_CALLERS = ['ec2', 'lambda', 'ecs', 'fargate'];
export const SERVICE_OPERATIONS: Record<string, OperationDefinition> = {
  sns: { name: 'SNS', actions: ['sns:Publish'], protocol: 'HTTPS', port: 443, iam: true,
    source: 'https://docs.aws.amazon.com/sns/latest/api/API_Publish.html', resource: { topicType: 'standard', MaximumMessageSize: 262144 }, request: { Message: 'Training notification' }, scope: 'Standard-topic publish and existing SQS subscription delivery. FIFO/SMS/mobile endpoints are excluded.' },
  rds: { name: 'RDS', actions: ['Connect'], protocol: 'SQL', port: 5432, iam: false,
    source: 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_CommonTasks.Connect.html', resource: { engine: 'postgres', port: 5432, status: 'available', credentialsValid: true }, request: {}, scope: 'Private SQL connection and authored credential-validity input; SQL execution and IAM DB auth are excluded. No instant failover is inferred.' },
  dynamodb: { name: 'DynamoDB', actions: ['dynamodb:PutItem', 'dynamodb:GetItem'], protocol: 'HTTPS', port: 443, iam: true,
    source: 'https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_PutItem.html', resource: { partitionKey: 'id', status: 'ACTIVE' }, request: { Item: { id: { S: 'order-1' }, state: { S: 'new' } }, Key: { id: { S: 'order-1' } }, ConsistentRead: true }, scope: 'Single string partition key, scalar S/N/BOOL attributes, deterministic local writes and strongly consistent reads. Indexes/transactions/expressions/eventual-read timing excluded.' },
  neptune: { name: 'Neptune', actions: ['Connect'], protocol: 'HTTPS', port: 8182, iam: false,
    source: 'https://docs.aws.amazon.com/neptune/latest/userguide/access-graph-opencypher-queries.html', resource: { port: 8182, status: 'available', iamAuthentication: false }, request: {}, scope: 'Private HTTPS endpoint connectivity only; no graph query execution. IAM-enabled and public endpoints are excluded.' },
  redshift: { name: 'Redshift', actions: ['Connect'], protocol: 'SQL', port: 5439, iam: false,
    source: 'https://docs.aws.amazon.com/redshift/latest/mgmt/connecting-to-cluster.html', resource: { port: 5439, status: 'available', credentialsValid: true }, request: {}, scope: 'Provisioned private cluster SQL connection; paused clusters do not accept connections. SQL execution/Serverless/Data API excluded.' },
  kinesis: { name: 'Kinesis Data Streams', actions: ['kinesis:PutRecord'], protocol: 'HTTPS', port: 443, iam: true,
    source: 'https://docs.aws.amazon.com/kinesis/latest/APIReference/API_PutRecord.html', resource: { status: 'ACTIVE', distribution: 'USER_PARTITION_KEY' }, request: { PartitionKey: 'orders', Data: 'training record' }, scope: 'Single record with a user partition key and UTF-8 teaching payload. Record limit 10 MiB including key. Shard hashing, throughput, consumers and retention scheduling excluded.' },
  eventbridge: { name: 'EventBridge', actions: ['events:PutEvents'], protocol: 'HTTPS', port: 443, iam: true,
    source: 'https://docs.aws.amazon.com/eventbridge/latest/APIReference/API_PutEvents.html', resource: { exists: true }, request: { Entries: [{ Source: 'training.orders', DetailType: 'OrderCreated', Detail: '{"id":"order-1"}' }] }, scope: '1–10 custom events, per-entry results and ingestion storage only; rules/targets/retries/replay are excluded. Ingestion success does not promise delivery.' },
  elasticache: { name: 'ElastiCache', actions: ['SET', 'GET'], protocol: 'TCP', port: 6379, iam: false,
    source: 'https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/GettingStarted.ConnectToCache.html', resource: { engine: 'redis', port: 6379, status: 'available', credentialsValid: true }, request: { key: 'order-1', value: 'cached result' }, scope: 'Private Redis OSS string GET/SET only. Credential validity is an authored teaching input. TLS negotiation, IAM auth, TTL, clustering, Memcached and automatic failover excluded.' },
  cloudwatch: { name: 'CloudWatch', actions: ['cloudwatch:PutMetricData'], protocol: 'HTTPS', port: 443, iam: true,
    source: 'https://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/API_PutMetricData.html', resource: {}, request: { Namespace: 'Training/Orders', MetricData: [{ MetricName: 'Requests', Value: 1 }] }, scope: 'Scalar custom metric ingestion only; no immediate alarm evaluation or metric-query/visibility timing. Existing alarm exercise remains separate.' },
  kms: { name: 'KMS', actions: ['kms:DescribeKey'], protocol: 'HTTPS', port: 443, iam: true,
    source: 'https://docs.aws.amazon.com/kms/latest/APIReference/API_DescribeKey.html', resource: { KeyId: 'training-key', KeyState: 'Enabled', KeyUsage: 'ENCRYPT_DECRYPT', keyPolicy: { id: 'training-direct-grant', kind: 'resource', statements: [{ effect: 'Allow', principals: ['*'], actions: ['kms:DescribeKey', 'kms:Decrypt'], resources: ['*'] }] } }, request: {}, scope: 'Key metadata, including disabled key metadata; identity and explicit direct-grant key policy both checked. Delegated/account-root key policies, cryptography, grants and cross-account use excluded.' },
  acm: { name: 'Certificate Manager', actions: ['acm:DescribeCertificate'], protocol: 'HTTPS', port: 443, iam: true,
    source: 'https://docs.aws.amazon.com/acm/latest/APIReference/API_DescribeCertificate.html', resource: { CertificateArn: 'arn:aws:acm:us-east-1:000000000000:certificate/00000000-0000-0000-0000-000000000001', DomainName: 'training.example.com', Status: 'PENDING_VALIDATION' }, request: {}, scope: 'Certificate metadata only; PENDING_VALIDATION does not become ISSUED automatically. Request/renewal, DNS validation and listener attachment/TLS termination excluded.' },
  secrets_manager: { name: 'Secrets Manager', actions: ['secretsmanager:GetSecretValue'], protocol: 'HTTPS', port: 443, iam: true,
    source: 'https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_GetSecretValue.html', resource: { SecretId: 'training-secret', versions: [{ VersionId: '00000000000000000000000000000001', VersionStages: ['AWSCURRENT'], SecretString: 'synthetic-training-value' }] }, request: {}, scope: 'Synthetic authored secret versions and staging labels. Customer-key dependency requires the caller’s Decrypt and a direct-grant key policy. Rotation/decryption internals and cross-account use excluded.' }
};
export const NEW_OPERATION_ONLY = ['neptune', 'redshift', 'kinesis', 'acm', 'kms', 'secrets_manager'];
export function operationMode(serviceId: string, config?: Record<string, any>) { return !!SERVICE_OPERATIONS[serviceId] && (NEW_OPERATION_ONLY.includes(serviceId) || config?.operationLab !== undefined); }
export function operationSample(serviceId: string): OperationSettings {
  const d = SERVICE_OPERATIONS[serviceId];
  return { action: d.actions[0], resource: structuredClone(d.resource), request: structuredClone(d.request) };
}
