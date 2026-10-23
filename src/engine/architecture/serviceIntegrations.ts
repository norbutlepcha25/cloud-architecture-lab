import type { Node } from '@xyflow/react';
import type { ConnectionData } from '../../types/index.ts';
import { relationshipKind } from './relationships.ts';

/**
 * Documented AWS service-to-service integrations that are not application request traffic:
 * event delivery, rule targets, build-time dependencies, scanning, findings and audit trails.
 * One table drives canvas creation, reconnection, import validation and live execution, so every
 * diagram (new design, reference, lab, challenge) gets the same answer for the same pair.
 *
 * `executes` names the engine that evaluates the link; links without it are valid documented
 * relationships that the simulator does not execute (stated in the connection reason).
 * Spec: docs/behavior/service_integrations.md (sources verified 2026-10-22).
 */
export interface ServiceIntegration {
  from: string[];
  to: string[];
  meaning: string;
  source: string;
  /** IAM actions the caller's role needs, when AWS documents them. */
  permissions?: string[];
  /** Target-dependent permissions (e.g. Signer differs for container images and Lambda code). */
  permissionsFor?: (targetConfig: Record<string, any>) => string[];
  executes?: 'git-push-events' | 'codebuild-dependency' | 'codedeploy-alarm' | 'amplify-cd';
}

export const SERVICE_INTEGRATIONS: ServiceIntegration[] = [
  { from: ['codecommit'], to: ['eventbridge'], executes: 'git-push-events',
    meaning: 'CodeCommit sends repository state change events (for example a branch update after a push) to EventBridge.',
    source: 'https://docs.aws.amazon.com/codecommit/latest/userguide/monitoring-events.html' },
  { from: ['eventbridge'], to: ['codebuild', 'codepipeline'], executes: 'git-push-events',
    meaning: 'Rule target: a matching event starts the build (StartBuild) or pipeline (StartPipelineExecution). The rule needs an execution role trusted by events.amazonaws.com (the target action is implied by AWS docs, not quoted).',
    permissions: ['codebuild:StartBuild', 'codepipeline:StartPipelineExecution'],
    source: 'https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-targets.html' },
  { from: ['codebuild'], to: ['codeartifact'], executes: 'codebuild-dependency',
    meaning: 'The build fetches pinned packages from a CodeArtifact repository with an authorization token (sts:GetServiceBearerToken is conditioned on sts:AWSServiceName = codeartifact.amazonaws.com; condition not evaluated).',
    permissions: ['codeartifact:GetAuthorizationToken', 'codeartifact:GetRepositoryEndpoint', 'codeartifact:ReadFromRepository', 'sts:GetServiceBearerToken'],
    source: 'https://docs.aws.amazon.com/codeartifact/latest/ug/tokens-authentication.html' },
  { from: ['codebuild'], to: ['secrets_manager'], executes: 'codebuild-dependency',
    meaning: 'buildspec env/secrets-manager: CodeBuild reads secret values into environment variables.',
    permissions: ['secretsmanager:GetSecretValue'],
    source: 'https://docs.aws.amazon.com/codebuild/latest/userguide/build-spec-ref.html' },
  { from: ['codebuild'], to: ['systems_manager'], executes: 'codebuild-dependency',
    meaning: 'buildspec env/parameter-store: CodeBuild reads Parameter Store values into environment variables.',
    permissions: ['ssm:GetParameters'],
    source: 'https://docs.aws.amazon.com/codebuild/latest/userguide/build-spec-ref.html' },
  { from: ['codebuild'], to: ['signer'], executes: 'codebuild-dependency',
    meaning: 'The build calls AWS Signer: container images through the Notation CLI (SignPayload), or Lambda code through a signing job that needs versioned S3 source and destination buckets (not modeled).',
    permissionsFor: c => c.signingPlatform === 'lambda'
      ? ['signer:StartSigningJob', 'signer:GetSigningProfile'] : ['signer:SignPayload', 'signer:GetRevocationStatus'],
    source: 'https://docs.aws.amazon.com/signer/latest/developerguide/image-signing-prerequisites.html' },
  { from: ['codebuild'], to: ['security_hub'], executes: 'codebuild-dependency',
    meaning: 'Custom integration only: the build imports scan findings with BatchImportFindings (Security Hub CSPM, ASFF). CodeBuild is not a native Security Hub integration.',
    permissions: ['securityhub:BatchImportFindings'],
    source: 'https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-custom-providers.html' },
  { from: ['codecommit', 'github', 'gitlab', 'bitbucket'], to: ['amplify'], executes: 'amplify-cd',
    meaning: 'Amplify Hosting app connected to this repository branch: continuous deployment builds and deploys the app on each push when auto build is enabled.',
    source: 'https://docs.aws.amazon.com/amplify/latest/userguide/welcome.html' },
  { from: ['github', 'gitlab', 'bitbucket'], to: ['codebuild'],
    meaning: 'Build project source through a CodeConnections connection; webhook events can start builds. The project role needs codeconnections:GetConnectionToken and codeconnections:GetConnection.',
    source: 'https://docs.aws.amazon.com/codebuild/latest/userguide/connections-github-app.html' },
  { from: ['ecr_registry'], to: ['inspector'],
    meaning: 'ECR enhanced scanning: Amazon Inspector scans pushed images for vulnerabilities.',
    source: 'https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-scanning-enhanced.html' },
  { from: ['inspector'], to: ['security_hub'],
    meaning: 'Amazon Inspector sends findings to AWS Security Hub CSPM automatically once both are enabled (the new AWS Security Hub receives them in OCSF).',
    source: 'https://docs.aws.amazon.com/inspector/latest/user/securityhub-integration.html' },
  { from: ['cloudwatch'], to: ['codedeploy'], executes: 'codedeploy-alarm', permissions: ['cloudwatch:DescribeAlarms'],
    meaning: 'Deployment group alarm (up to 10): CodeDeploy stops the deployment and, with rollback on alarm enabled, redeploys the last known good revision. The alarm itself does not roll anything back.',
    source: 'https://docs.aws.amazon.com/codedeploy/latest/userguide/deployment-groups-configure-advanced-options.html' },
  { from: ['ecs', 'fargate', 'lambda', 'ec2', 'eks'], to: ['appconfig'],
    meaning: 'The application retrieves feature flags (for containers through the AppConfig Agent sidecar), separating release from deployment. The task/function role needs appconfig:StartConfigurationSession and appconfig:GetLatestConfiguration.',
    permissions: ['appconfig:StartConfigurationSession', 'appconfig:GetLatestConfiguration'],
    source: 'https://docs.aws.amazon.com/appconfig/latest/userguide/appconfig-integration-containers-agent.html' },
  { from: ['codecommit', 'codebuild', 'codedeploy', 'codepipeline', 'ecr_registry'], to: ['cloudtrail'],
    meaning: 'CloudTrail records the service API calls as management events (who changed or deployed what, and when).',
    source: 'https://docs.aws.amazon.com/codedeploy/latest/userguide/monitoring-cloudtrail.html' },
  { from: ['cloudtrail'], to: ['audit_manager'],
    meaning: 'Audit Manager custom controls collect CloudTrail user activity as evidence. Note: AWS Audit Manager is no longer open to new customers.',
    source: 'https://docs.aws.amazon.com/audit-manager/latest/userguide/control-data-sources.html' }
];

/** Pairs students commonly draw that AWS does not integrate; the reason says what to draw instead. */
export const NON_INTEGRATIONS: { from: string[]; to: string[]; reason: string }[] = [
  { from: ['github', 'gitlab', 'bitbucket'], to: ['eventbridge'],
    reason: 'A third-party repository does not publish push events to EventBridge. Through CodeConnections it starts CodePipeline (or a CodeBuild webhook) directly: connect the repository to CodePipeline or CodeBuild.' },
  { from: ['signer'], to: ['codedeploy'],
    reason: 'AWS Signer does not start or feed CodeDeploy deployments. Order sign → deploy with CodePipeline stages (or an explicit CreateDeployment call), and connect CodePipeline or CodeBuild to CodeDeploy.' }
];

const has = (list: string[], id: string | undefined) => !!id && list.includes(id);

export function serviceIntegration(source?: Node<any>, target?: Node<any>): ServiceIntegration | undefined {
  if (!source || !target) return undefined;
  return SERVICE_INTEGRATIONS.find(i => has(i.from, source.data?.serviceId) && has(i.to, target.data?.serviceId));
}

export function nonIntegrationReason(source?: Node<any>, target?: Node<any>): string | undefined {
  if (!source || !target) return undefined;
  return NON_INTEGRATIONS.find(i => has(i.from, source.data?.serviceId) && has(i.to, target.data?.serviceId))?.reason;
}

/** An integration link that should execute (not an annotation, response or application request). */
export function isIntegrationLink(source: Node<any> | undefined, target: Node<any> | undefined, data?: Partial<ConnectionData>, kind?: ServiceIntegration['executes']): boolean {
  const integration = serviceIntegration(source, target);
  if (!integration || (kind && integration.executes !== kind)) return false;
  if (data?.referenceAnnotation || data?.signalType === 'outbound_response' || data?.action || data?.destinationPort !== undefined) return false;
  const relation = relationshipKind(data);
  return (relation === 'manages' || relation === 'request') && (data?.protocol === undefined || data.protocol === 'HTTPS' || data.protocol === 'Event');
}
