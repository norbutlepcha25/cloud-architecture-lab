import type { ServiceNodeData } from '../../types/index.ts';
import { servicePrincipalFor } from './servicePrincipals.ts';

/** Builds a least-privilege S3 role trusted by the calling service's AWS service principal
 *  (EC2 instance profile, Lambda execution role, ECS task role). */
export function createServiceS3Role(serviceId: string, name: string, bucketArn: string, write: boolean): NonNullable<ServiceNodeData['iamRole']> {
  if (!name.trim()) throw new Error('Enter a role name.');
  if (!/^arn:aws:s3:::[^/*?]+$/.test(bucketArn)) throw new Error('Select an S3 bucket with a valid bucket ARN (without wildcards).');
  return {
    id: name.trim(),
    trustPolicy: { id: `${name}-trust`, kind: 'trust', statements: [{ effect: 'Allow', actions: ['sts:AssumeRole'], resources: [], principals: [servicePrincipalFor(serviceId)] }] },
    identityPolicies: [{ id: `${name}-s3`, kind: 'identity', statements: [
      { effect: 'Allow', actions: ['s3:GetObject', ...(write ? ['s3:PutObject'] : [])], resources: [`${bucketArn}/*`] },
      { effect: 'Allow', actions: ['s3:ListBucket'], resources: [bucketArn] }
    ] }]
  };
}

/** EC2 instance-profile attachment is represented by iamRole in this educational model. */
export function createEc2S3Role(name: string, bucketArn: string, write: boolean): NonNullable<ServiceNodeData['iamRole']> {
  return createServiceS3Role('ec2', name, bucketArn, write);
}
