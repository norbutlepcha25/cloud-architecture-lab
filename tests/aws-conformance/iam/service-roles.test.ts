import { runConformanceCases, type ConformanceCase } from '../harness.ts';
import type { Node, Edge } from '@xyflow/react';
import { authorizeApplicationHop } from '../../../src/engine/iam/applicationHop.ts';
import { validateIam } from '../../../src/engine/validation/iam.ts';
import { runLiveSimulation } from '../../../src/engine/simulation/liveSimulation.ts';
import { REFERENCE_ARCHITECTURES } from '../../../src/data/referenceArchitectures.ts';
import type { Policy } from '../../../src/engine/iam/types.ts';

interface Decision { decision: string }

const trust = (principal: string): Policy => ({ id: 'trust', kind: 'trust', statements: [{ effect: 'Allow', principals: [principal], actions: ['sts:AssumeRole'], resources: ['*'] }] });
const allow = (actions: string[], resources: string[]): Policy => ({ id: 'perm', kind: 'identity', statements: [{ effect: 'Allow', actions, resources }] });
const svc = (id: string, serviceId: string, extra: Record<string, unknown> = {}): Node<any> =>
  ({ id, type: 'serviceNode', position: { x: 0, y: 0 }, data: { serviceId, label: id, ...extra } });
const bucket = svc('bucket', 's3', { customConfig: { resourceArn: 'arn:aws:s3:::example-bucket' } });
const hop = (caller: Node<any>, action?: string) => ({ decision: authorizeApplicationHop(caller, bucket, 'HTTPS', action).decision });
const scenario = { id: 'x', name: 'x', method: 'GET' as const, path: '/', trafficLevel: 'normal' as const };
const reference = (id: string) => REFERENCE_ARCHITECTURES.find(r => r.id === id)!;
const outcome = (nodes: Node<any>[], edges: Edge<any>[]) => (runLiveSimulation(structuredClone(nodes), structuredClone(edges), scenario) as any).outcome as string;

const CASES: ConformanceCase<Decision>[] = [
  {
    id: 'IAM-SVC-PRINCIPAL-001',
    awsBehavior: 'A Lambda execution role is assumed by the service principal lambda.amazonaws.com; a trust policy naming it lets the function use the role.',
    reference: 'Lambda Developer Guide - "Defining Lambda function permissions with an execution role"',
    scenario: 'Lambda with a role trusting lambda.amazonaws.com and allowing s3:GetObject on example-bucket/* reads an object.',
    configuration: { trust: 'lambda.amazonaws.com', allow: 's3:GetObject arn:aws:s3:::example-bucket/*' },
    request: { action: 's3:GetObject', resource: 'arn:aws:s3:::example-bucket/<key>' },
    expected: { decision: 'ALLOW' },
    run: () => hop(svc('fn', 'lambda', { iamRole: { id: 'role', trustPolicy: trust('lambda.amazonaws.com'), identityPolicies: [allow(['s3:GetObject'], ['arn:aws:s3:::example-bucket/*'])] } })),
    explain: a => a.decision === 'ALLOW' ? 'Lambda assumed a role trusting lambda.amazonaws.com and the object-level allow matched.' : 'A correctly trusted Lambda execution role was rejected.'
  },
  {
    id: 'IAM-SVC-PRINCIPAL-002',
    awsBehavior: 'A role trusting a different service principal cannot be assumed by Lambda.',
    reference: 'IAM User Guide - "Role trust policies"',
    scenario: 'Lambda with a role that only trusts ec2.amazonaws.com.',
    configuration: { trust: 'ec2.amazonaws.com' },
    request: { action: 's3:GetObject' },
    expected: { decision: 'DENY' },
    run: () => hop(svc('fn', 'lambda', { iamRole: { id: 'role', trustPolicy: trust('ec2.amazonaws.com'), identityPolicies: [allow(['s3:*'], ['*'])] } })),
    explain: a => a.decision === 'DENY' ? 'The trust policy does not name Lambda, so the role cannot be assumed.' : 'Lambda assumed a role that does not trust it.'
  },
  {
    id: 'IAM-SVC-PRINCIPAL-003',
    awsBehavior: 'Configuration validation and request simulation agree on the EC2 service principal ec2.amazonaws.com.',
    reference: 'EC2 User Guide - "IAM roles for Amazon EC2"',
    scenario: 'EC2 with a role trusting ec2.amazonaws.com calls S3; validation must not report a trust failure.',
    configuration: { trust: 'ec2.amazonaws.com' },
    request: { action: 's3:GetObject' },
    expected: { decision: 'NO-TRUST-FINDING' },
    run: () => {
      const ec2 = svc('web', 'ec2', { iamRole: { id: 'role', trustPolicy: trust('ec2.amazonaws.com'), identityPolicies: [allow(['s3:GetObject'], ['arn:aws:s3:::example-bucket/*'])] } });
      const findings = validateIam([ec2, bucket] as any, [{ id: 'e', source: 'web', target: 'bucket', data: { protocol: 'HTTPS' } }] as any);
      return { decision: findings.some(f => /cannot assume/.test(f.problem)) ? 'TRUST-FINDING' : 'NO-TRUST-FINDING' };
    },
    explain: a => a.decision === 'NO-TRUST-FINDING' ? 'Validation accepts the AWS service principal form.' : 'Validation rejected a trust policy the request simulator accepts.'
  },
  {
    id: 'IAM-S3-OBJECT-ARN-001',
    awsBehavior: 's3:GetObject and s3:PutObject are authorized against the object ARN (bucket/key), regardless of which service makes the call.',
    reference: 'Service Authorization Reference - Amazon S3 actions and resource types',
    scenario: 'Lambda role allows s3:PutObject only on example-bucket/* (no bucket-level ARN).',
    configuration: { allow: 's3:PutObject arn:aws:s3:::example-bucket/*' },
    request: { action: 's3:PutObject' },
    expected: { decision: 'ALLOW' },
    run: () => hop(svc('fn', 'lambda', { iamRole: { id: 'role', trustPolicy: trust('lambda.amazonaws.com'), identityPolicies: [allow(['s3:PutObject'], ['arn:aws:s3:::example-bucket/*'])] } }), 's3:PutObject'),
    explain: a => a.decision === 'ALLOW' ? 'The object-level ARN matched bucket/*.' : 'An object action was evaluated against the bucket ARN.'
  },
  {
    id: 'S3-GATEWAY-ENDPOINT-REFS-001',
    awsBehavior: 'A gateway endpoint gives a private route to S3 but does not authenticate the call; the caller still needs an IAM role that allows the action.',
    reference: 'VPC PrivateLink Guide - "Gateway endpoints for Amazon S3"; IAM policy evaluation logic',
    scenario: 'Simple website and Thumbnail generator references request S3 through a gateway endpoint with least-privilege roles attached; then the role is removed.',
    configuration: { references: ['simple-website', 'thumbnail-generator'] },
    request: { method: 'GET', path: '/' },
    expected: { decision: 'success,success / denied,denied' },
    run: () => {
      const ids = ['simple-website', 'thumbnail-generator'];
      const withRole = ids.map(id => outcome(reference(id).nodes as any, reference(id).edges as any));
      const withoutRole = ids.map(id => {
        const ref = reference(id);
        const nodes = (ref.nodes as any[]).map(n => n.data.iamRole ? { ...n, data: { ...n.data, iamRole: undefined } } : n);
        return outcome(nodes, ref.edges as any);
      });
      return { decision: `${withRole.join(',')} / ${withoutRole.join(',')}` };
    },
    explain: a => a.decision.startsWith('success,success') ? 'Endpoint path plus role succeeds; without the role IAM denies.' : 'Reference S3 paths do not behave as expected.'
  },
  {
    id: 'RDS-REPLICATION-HOP-001',
    awsBehavior: 'Database replication is a structural relationship, not a client request; a request never travels along it.',
    reference: 'RDS User Guide - "Multi-AZ DB instance deployments"',
    scenario: 'Multi-AZ VPC reference: DB primary has a replication line (step 4) and an S3 call (step 5).',
    configuration: { reference: 'vpc-subnets-multi-az-security-groups' },
    request: { method: 'GET', path: '/' },
    expected: { decision: 'path-skips-replica' },
    run: () => {
      const ref = reference('vpc-subnets-multi-az-security-groups');
      const result = runLiveSimulation(structuredClone(ref.nodes) as any, structuredClone(ref.edges) as any, scenario);
      return { decision: result.path.includes('node-db-b') ? 'path-uses-replica' : 'path-skips-replica' };
    },
    explain: a => a.decision === 'path-skips-replica' ? 'The request continued past the primary without following replication.' : 'The request was forwarded along a replication line.'
  }
];

runConformanceCases(CASES);
