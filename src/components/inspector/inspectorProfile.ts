import { SERVICE_OPERATIONS } from '../../engine/serviceOperations/definitions.ts';
import type { ServiceNodeData } from '../../types/index.ts';
import { SUBNET_REQUIRED_SERVICE_IDS } from '../../engine/layout/containment.ts';
import { eksConfiguration } from '../../engine/service/models/eks.ts';

/** UI configuration routing only. AWS decisions remain in the service/shared engines. */
const configurations: Record<string, string> = {
  ec2: 'instance', s3: 'bucket', s3_client: 'bucket', s3_managed: 'bucket',
  rds: 'database', aurora: 'database', lambda: 'function', step_lambda: 'function',
  ecs: 'ecs', eks: 'eks', route_tables: 'routes', internet_gateway: 'igw',
  xray: 'xray',
  codepipeline: 'pipeline', codecommit: 'repo', codebuild: 'build', codedeploy: 'deploy',
  signer: 'signer',
  developer: 'developer', github: 'gitprovider', gitlab: 'gitprovider', bitbucket: 'gitprovider',
  s3_gateway_endpoint: 'endpoint', privatelink: 'endpoint',
  sqs: 'operations', sns: 'operations', cloudwatch: 'operations', cloudtrail: 'operations',
  ec2_auto_scaling: 'scaling'
};
export function inspectorProfile(data: ServiceNodeData) {
  const workload = data.serviceId === 'eks' && eksConfiguration(data).kind === 'workload';
  const lambdaVpc = data.serviceId === 'lambda' && ['public', 'private', 'isolated'].includes(data.subnet);
  const network = SUBNET_REQUIRED_SERVICE_IDS.includes(data.serviceId) || workload || lambdaVpc || data.serviceId === 'nat_gateway';
  return {
    configuration: configurations[data.serviceId],
    serviceOperation: !!SERVICE_OPERATIONS[data.serviceId],
    network,
    az: ['ec2', 'ecs', 'fargate', 'rds', 'nat_gateway'].includes(data.serviceId) || workload,
    multiAz: data.serviceId === 'rds'
  };
}
