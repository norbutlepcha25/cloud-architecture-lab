/**
 * Actors outside AWS: people, partner systems and third-party platforms that AWS services
 * interact with. They are never VPC resources: they reach AWS public service endpoints over the
 * internet and are reached from a VPC only through internet egress (IGW / NAT).
 * Spec: docs/behavior/external_actors.md.
 */

/** Generic internet origins that existed before the third-party additions. */
export const INTERNET_CLIENT_IDS = ['user', 'client_ui', 'api_client'] as const;

/** Third-party / outside-AWS actors. Behavior beyond generic internet origin/target is listed in
 *  the spec (Git push, CodeConnections pipeline source). */
export const THIRD_PARTY_ACTOR_IDS = ['developer', 'github', 'gitlab', 'bitbucket', 'docker_hub', 'on_premises'] as const;

/** Third-party Git hosts CodePipeline reaches through an AWS CodeConnections connection.
 *  https://docs.aws.amazon.com/codepipeline/latest/userguide/action-reference-CodestarConnectionSource.html */
export const CONNECTION_GIT_PROVIDERS: Record<string, string> = { github: 'GitHub', gitlab: 'GitLab', bitbucket: 'Bitbucket' };

const ACTORS = new Set<string>([...INTERNET_CLIENT_IDS, ...THIRD_PARTY_ACTOR_IDS]);

/** True for every actor outside AWS (request origin on the internet). */
export function isExternalActor(serviceId: string | undefined): boolean {
  return !!serviceId && ACTORS.has(serviceId);
}

/** External actors a VPC resource can call outbound. The Data Transfer Hub UI is a browser client
 *  only, so it is not an egress destination (legacy rule kept). */
export function isExternalTarget(serviceId: string | undefined): boolean {
  return isExternalActor(serviceId) && serviceId !== 'client_ui';
}

export function isConnectionGitProvider(serviceId: string | undefined): boolean {
  return !!serviceId && Object.prototype.hasOwnProperty.call(CONNECTION_GIT_PROVIDERS, serviceId);
}
