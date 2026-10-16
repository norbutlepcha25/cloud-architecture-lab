import { AWS_SERVICES } from '../../data/serviceCatalog.ts';
import { resolveServiceModel, isDedicatedModel } from '../service/registry.ts';
import { SUBNET_REQUIRED_SERVICE_IDS } from '../layout/containment.ts';
import { IAM_AUTHENTICATED_ACTIONS, IAM_CALLER_SERVICE_IDS } from './iamCoverage.ts';
import { LIVE_ADAPTER_SERVICE_IDS, REQUEST_SIMULATION_EVIDENCE, FAILURE_SIMULATION_EVIDENCE } from './liveCoverage.ts';
import { classify, type CapabilityFlag, type CapabilityStatus, type ServiceCapabilityProfile } from './types.ts';

/** Real AWS network primitives beyond the pure "must live in a customer subnet" list
 *  (`SUBNET_REQUIRED_SERVICE_IDS`) that still have a structurally-real, code-backed network
 *  behavior: NAT/IGW attachment checks, VPC Gateway/Interface Endpoint routing, and route-table
 *  driven ingress/egress (engine/network/subnetRouting.ts; tests/aws-conformance/networking/route-tables-live.test.ts). */
const NETWORK_BEHAVIOR_EXTRA_SERVICE_IDS = ['nat_gateway', 'internet_gateway', 's3_gateway_endpoint', 'route_tables'];

/** Services this simulator has explicit, test-confirmed evidence that IAM genuinely does NOT
 *  govern (a database-credential connection, DNS resolution, ALB/NLB routing) - distinct from the
 *  ~290 services with no evidence either way, which default to `false` rather than
 *  `NOT_APPLICABLE` (see module doc: unproven is not the same as proven-inapplicable). */
const IAM_NOT_APPLICABLE_EVIDENCE: Record<string, string> = {
  rds: 'tests/aws-conformance/database/rds.test.ts SVC-RDS-IAM-N/A-001 - default DB-credential auth, not IAM',
  aurora: 'same default DB-credential auth mechanism as rds (Amazon Aurora User Guide)',
  alb: 'tests/aws-conformance/load-balancing/alb.test.ts SVC-ALB-IAM-NA-001 - routing is not part of the IAM data path',
  nlb: 'shares the same L4/L7 routing data path as alb - no IAM in request routing',
  route53: 'tests/aws-conformance/dns/route53.test.ts SVC-R53-IAM-NA-001 - DNS resolution is not an IAM-authorized action',
  cloudfront: 'tests/aws-conformance/dns/cloudfront.test.ts SVC-CF-IAM-NA-001 - viewer request serving is not an IAM-authorized action'
};

function computeConfigurationAndValidation(serviceId: string): { config: CapabilityStatus; validation: CapabilityStatus; evidence: string } {
  const model = resolveServiceModel(serviceId);
  if (!model) {
    // No catalog entry resolves to a model at all - genuinely nothing here (should not happen for
    // any serviceId actually drawn from AWS_SERVICES itself, but stay honest if it ever does).
    return { config: false, validation: false, evidence: 'No ServiceModel resolves for this serviceId.' };
  }
  const dedicated = isDedicatedModel(serviceId);
  const evidence = dedicated
    ? `Dedicated Tier ${model.tier} ServiceModel (engine/service/models/) - real, service-specific validateConfiguration().`
    : 'Tier 3 generic fallback (engine/service/genericModel.ts) - every catalog service gets a real config surface and a (minimal) validateConfiguration() from this.';
  return { config: true, validation: true, evidence };
}

/** Builds the full capability profile for every one of the 327 catalog services. Nothing here is
 *  hand-typed per-service except the curated evidence tables in `liveCoverage.ts` and the small
 *  IAM-not-applicable table above - everything else is derived mechanically from the same
 *  registries the live engines themselves use, so this stays accurate as those engines evolve. */
function buildProfile(service: (typeof AWS_SERVICES)[number]): ServiceCapabilityProfile {
  const { config, validation, evidence: configEvidence } = computeConfigurationAndValidation(service.id);

  const hasNetworkBehavior = SUBNET_REQUIRED_SERVICE_IDS.includes(service.id) || NETWORK_BEHAVIOR_EXTRA_SERVICE_IDS.includes(service.id);
  const networkBehavior: CapabilityStatus = hasNetworkBehavior ? true : 'NOT_APPLICABLE';
  const networkEvidence = hasNetworkBehavior
    ? (SUBNET_REQUIRED_SERVICE_IDS.includes(service.id)
      ? 'engine/layout/containment.ts SUBNET_REQUIRED_SERVICE_IDS - real subnet-placement validation (engine/validation/network.ts) and NACL/SG evaluation on every hop into it.'
      : service.id === 'route_tables'
        ? 'engine/network/subnetRouting.ts - associated route tables decide internet ingress, NAT/IGW egress and gateway endpoint use (tests/aws-conformance/networking/route-tables-live.test.ts).'
        : 'engine/simulation/adapters/ - real NAT/IGW attachment or VPC endpoint routing logic keyed on this exact serviceId.')
    : 'Not asserted as VPC-subnet-relevant by this simulator (fully-managed/edge service, or not yet modeled - see registry.ts module note on this default).';

  const isConnected = LIVE_ADAPTER_SERVICE_IDS.includes(service.id);
  const connectivity: CapabilityStatus = isConnected;
  const connectivityEvidence = isConnected
    ? 'engine/capability/liveCoverage.ts LIVE_ADAPTER_SERVICE_IDS - specifically branched on by name in the live SIMULATION_PIPELINE, not the generic forward-or-terminal fallback.'
    : 'Falls through to the generic forward-or-terminal path in networkPath.ts - no serviceId-specific traversal logic exists yet.';

  const isIamCaller = IAM_CALLER_SERVICE_IDS.includes(service.id);
  const isIamTarget = service.id in IAM_AUTHENTICATED_ACTIONS;
  let iamBehavior: CapabilityStatus = false;
  let iamEvidence: string | undefined;
  if (isIamCaller || isIamTarget) {
    iamBehavior = true;
    iamEvidence = isIamCaller && isIamTarget
      ? 'engine/capability/iamCoverage.ts - modeled both as an IAM caller (attached role) and as an IAM-authenticated API target.'
      : isIamCaller
        ? 'engine/capability/iamCoverage.ts IAM_CALLER_SERVICE_IDS - can carry an IAM role and act as the caller of an IAM-authenticated dependency (engine/validation/iam.ts, engine/trace/explainHop.ts).'
        : 'engine/capability/iamCoverage.ts IAM_AUTHENTICATED_ACTIONS - a real AWS API IAM governs; validated end-to-end via evaluateAuthorization()/assumeRole().';
  } else if (service.id in IAM_NOT_APPLICABLE_EVIDENCE) {
    iamBehavior = 'NOT_APPLICABLE';
    iamEvidence = IAM_NOT_APPLICABLE_EVIDENCE[service.id];
  }

  const requestSimEvidence = REQUEST_SIMULATION_EVIDENCE[service.id];
  const requestSimulation: CapabilityStatus = Boolean(requestSimEvidence);

  const failureSimEvidence = FAILURE_SIMULATION_EVIDENCE[service.id];
  const failureSimulation: CapabilityStatus = Boolean(failureSimEvidence);

  const flags: Record<CapabilityFlag, CapabilityStatus> = {
    CONFIGURATION: config,
    VALIDATION: validation,
    CONNECTIVITY: connectivity,
    NETWORK_BEHAVIOR: networkBehavior,
    IAM_BEHAVIOR: iamBehavior,
    REQUEST_SIMULATION: requestSimulation,
    FAILURE_SIMULATION: failureSimulation
  };

  const evidence: Partial<Record<CapabilityFlag, string>> = {
    CONFIGURATION: configEvidence,
    VALIDATION: configEvidence,
    CONNECTIVITY: connectivityEvidence,
    NETWORK_BEHAVIOR: networkEvidence,
    ...(iamEvidence ? { IAM_BEHAVIOR: iamEvidence } : {}),
    ...(requestSimEvidence ? { REQUEST_SIMULATION: requestSimEvidence } : {}),
    ...(failureSimEvidence ? { FAILURE_SIMULATION: failureSimEvidence } : {})
  };

  return {
    serviceId: service.id,
    name: service.name,
    category: service.category,
    flags,
    evidence,
    classification: classify(flags)
  };
}

/** Builds the full capability profile for every one of the 327 catalog services. Nothing here is
 *  hand-typed per-service except the curated evidence tables in `liveCoverage.ts` and the small
 *  IAM-not-applicable table above - everything else is derived mechanically from the same
 *  registries the live engines themselves use, so this stays accurate as those engines evolve. */
export function buildServiceCapabilityRegistry(): ServiceCapabilityProfile[] {
  return AWS_SERVICES.map(buildProfile);
}

let cached: ServiceCapabilityProfile[] | null = null;

/** Cached accessor - the registry is pure/deterministic over the (static) service catalog, so
 *  there is no reason to rebuild it on every call. */
export function getServiceCapabilityRegistry(): ServiceCapabilityProfile[] {
  if (!cached) cached = buildServiceCapabilityRegistry();
  return cached;
}

export function getServiceCapabilityProfile(serviceId: string): ServiceCapabilityProfile | undefined {
  return getServiceCapabilityRegistry().find(p => p.serviceId === serviceId);
}
