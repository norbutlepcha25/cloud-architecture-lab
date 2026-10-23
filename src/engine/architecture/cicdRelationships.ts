import type { Node } from '@xyflow/react';
import type { ConnectionData } from '../../types/index.ts';
import { relationshipKind } from './relationships.ts';

/** CI/CD relationships describe configured actions/artifacts, not application forwarding.
 * AWS: https://docs.aws.amazon.com/codepipeline/latest/userguide/welcome-introducing-artifacts.html
 * Deployment roles: https://docs.aws.amazon.com/codedeploy/latest/userguide/deployment-groups.html
 * Git push: https://docs.aws.amazon.com/codecommit/latest/userguide/how-to-create-commit.html
 * Connections: https://docs.aws.amazon.com/codepipeline/latest/userguide/action-reference-CodestarConnectionSource.html
 */
const CICD_PAIRS: [string[], string[], string][] = [
  [['developer'], ['codecommit'], 'Git push over HTTPS (Git credentials) or SSH to the repository\'s public Git endpoint; outside any VPC.'],
  [['developer'], ['github', 'gitlab', 'bitbucket'], 'Git push to the third-party repository.'],
  [['github', 'gitlab', 'bitbucket'], ['codepipeline'], 'Pipeline source action through an AWS CodeConnections connection (CodeStarSourceConnection).'],
  [['codecommit', 's3', 'ecr_registry'], ['codepipeline'], 'Pipeline source action: a change here starts the pipeline.'],
  [['codecommit', 's3'], ['codebuild'], 'Build project source.'],
  [['s3'], ['codedeploy'], 'Existing application revision in S3 for a standalone deployment.'],
  [['codepipeline'], ['codebuild'], 'Pipeline build/test action runs this project.'],
  [['codepipeline'], ['codedeploy', 'ecs', 'fargate'], 'Pipeline deploy action.'],
  [['codepipeline'], ['s3'], 'Pipeline artifact store.'],
  [['codebuild'], ['s3'], 'Build artifact output.'],
  [['codebuild'], ['ecr_registry'], 'Build pushes a container image (needs privileged mode and ECR permissions).'],
  [['codebuild'], ['cloudwatch'], 'Build logs (CloudWatch Logs).'],
  [['codebuild'], ['codedeploy', 'codepipeline'], 'Build output consumed by the next deploy action.'],
  [['codedeploy'], ['ec2', 'ec2_auto_scaling', 'ecs', 'fargate', 'lambda', 'alb', 'nlb'], 'CodeDeploy deployment group target.'],
  [['iam'], ['codepipeline', 'codebuild', 'codedeploy'], 'Service role illustration; attach the role in the IAM role panel to evaluate it.'],
];
export function cicdRelationship(source?: Node<any>, target?: Node<any>): string | undefined {
  if (!source || !target) return undefined;
  return CICD_PAIRS.find(([from, to]) => from.includes(source.data.serviceId) && to.includes(target.data.serviceId))?.[2];
}

/** Preserve legacy HTTPS drawings while honoring explicit non-executable annotations.
 * This is a simulator compatibility rule, not an AWS trigger configuration API.
 */
export function isCicdWorkflowLink(source: Node<any> | undefined, target: Node<any> | undefined, data?: Partial<ConnectionData>): boolean {
  if (data?.action || data?.destinationPort !== undefined) return false;
  if (!cicdRelationship(source, target) || data?.referenceAnnotation || data?.signalType === 'outbound_response') return false;
  const kind = relationshipKind(data);
  return (kind === 'request' || kind === 'manages')
    && (data?.protocol === undefined || data.protocol === 'HTTPS' || data.protocol === 'Event');
}
