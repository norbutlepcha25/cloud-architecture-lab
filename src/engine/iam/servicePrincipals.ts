import type { Policy } from './types.ts';

/**
 * The AWS service principal that assumes a resource's attached role.
 *
 * - EC2 instance profile role:    ec2.amazonaws.com
 *   https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/iam-roles-for-amazon-ec2.html
 * - ECS / Fargate task role:      ecs-tasks.amazonaws.com
 *   https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html
 * - Lambda execution role:        lambda.amazonaws.com
 *   https://docs.aws.amazon.com/lambda/latest/dg/lambda-intro-execution-role.html
 *
 * - CodePipeline / CodeBuild / CodeDeploy service roles: codepipeline.amazonaws.com,
 *   codebuild.amazonaws.com, codedeploy.amazonaws.com
 *
 * Services not listed keep their catalog id; their role assumption is not modeled beyond that.
 */
const SERVICE_PRINCIPALS: Record<string, string> = {
  ec2: 'ec2.amazonaws.com',
  ecs: 'ecs-tasks.amazonaws.com',
  lambda: 'lambda.amazonaws.com',
  codepipeline: 'codepipeline.amazonaws.com',
  codebuild: 'codebuild.amazonaws.com',
  codedeploy: 'codedeploy.amazonaws.com'
};

export function servicePrincipalFor(serviceId: string): string {
  return SERVICE_PRINCIPALS[serviceId] ?? serviceId;
}

/**
 * Older diagrams write a trust principal as the short catalog id (`ec2`, `lambda`). Read that
 * shorthand as the matching service principal so both forms behave like the AWS form. ECS keeps
 * its existing behavior: only `ecs-tasks.amazonaws.com` is trusted.
 */
export function normalizeTrustPolicy(policy: Policy | undefined, serviceId: string): Policy | undefined {
  const principal = SERVICE_PRINCIPALS[serviceId];
  if (!policy || !principal || serviceId === 'ecs') return policy;
  return {
    ...policy,
    statements: policy.statements.map(statement => ({
      ...statement,
      principals: statement.principals?.map(p => p === serviceId ? principal : p)
    }))
  };
}
