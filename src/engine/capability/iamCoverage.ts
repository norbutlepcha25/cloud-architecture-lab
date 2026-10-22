/**
 * Single source of truth for "which services does IAM actually govern in this simulator" -
 * previously duplicated identically in `engine/validation/iam.ts` and `engine/trace/explainHop.ts`.
 * Phase 14's capability registry needs this exact set too, so it's extracted here and imported by
 * all three rather than re-typed a third time.
 */

/** AWS APIs actually authorized by IAM (an SDK/API call, signed with credentials) - not a raw
 *  network connection. Mapped to one representative action each, just enough to ask "does this
 *  role's policy grant anything at all for this dependency." */
export const IAM_AUTHENTICATED_ACTIONS: Record<string, string> = {
  kinesis: 'kinesis:PutRecord', acm: 'acm:DescribeCertificate',
  xray: 'xray:PutTraceSegments',
  s3: 's3:GetObject',
  dynamodb: 'dynamodb:GetItem',
  sqs: 'sqs:SendMessage',
  sns: 'sns:Publish',
  lambda: 'lambda:InvokeFunction',
  kms: 'kms:Decrypt',
  secrets_manager: 'secretsmanager:GetSecretValue'
};

/** Compute services that can carry an IAM role and act as the CALLER of an IAM-authenticated API
 *  (an EC2 instance profile, an ECS task role, a Lambda execution role, ...). */
export const IAM_CALLER_SERVICE_IDS = ['ec2', 'ecs', 'fargate', 'lambda', 'eks', 'app_runner'];
