import { SERVICE_OPERATIONS } from '../serviceOperations/definitions.ts';
import { withServiceOperations } from '../serviceOperations/models.ts';
import { xrayModel } from './models/xray.ts';
// The serviceId -> ServiceModel registry - flat and order-independent, exactly like
// `costCalculator.ts`'s `PRICING_MODULE_ENTRIES` registry (each entry is evaluated independently;
// unlike the Network Engine's per-hop pipeline, there is no ordering concern here at all).
// Tier 1 and Tier 2 services get a dedicated, hand-written model (models/*.ts); every other
// serviceId in the catalog resolves to the generic Tier 3 fallback (genericModel.ts) built
// straight from its AWSService catalog entry - never a fabricated deep behavior.
import { AWS_SERVICES } from '../../data/serviceCatalog.ts';
import { buildGenericServiceModel } from './genericModel.ts';
import { ec2Model, ecsModel, fargateModel, eksModel, lambdaModel } from './models/compute.ts';
import { s3Model, rdsModel, auroraModel, dynamodbModel } from './models/data.ts';
import { albModel, nlbModel, apiGatewayModel, cloudFrontModel, route53Model } from './models/edge.ts';
import { sqsModel, snsModel } from './models/messaging.ts';
import { vpcModel, internetGatewayModel, natGatewayModel, routeTablesModel, s3GatewayEndpointModel, privateLinkModel } from './models/networkingPrimitives.ts';
import { iamModel, stsModel } from './models/iamModels.ts';
import {
  ecrModel, efsModel, kmsModel, secretsManagerModel, cognitoModel, cloudwatchModel,
  eventbridgeModel, stepFunctionsModel, elastiCacheModel, wafModel
} from './models/tier2.ts';
import type { ServiceModel } from './types.ts';

const TIER_1_AND_2_MODELS: ServiceModel[] = [
  // Tier 1
  vpcModel, internetGatewayModel, natGatewayModel, iamModel, stsModel,
  ec2Model, lambdaModel, ecsModel, fargateModel, eksModel,
  s3Model, rdsModel, auroraModel, dynamodbModel,
  albModel, nlbModel, apiGatewayModel, cloudFrontModel, route53Model,
  sqsModel, snsModel,
  routeTablesModel, // decorative, but a real catalog serviceId - see networkingPrimitives.ts
  // Tier 2
  xrayModel,
  ecrModel, efsModel, kmsModel, secretsManagerModel, cognitoModel,
  eventbridgeModel, stepFunctionsModel, elastiCacheModel, cloudwatchModel, wafModel,
  s3GatewayEndpointModel, privateLinkModel
];

const REGISTRY: Record<string, ServiceModel> = {};
for (const model of TIER_1_AND_2_MODELS) {
  REGISTRY[model.id] = model;
}

for (const id of Object.keys(SERVICE_OPERATIONS)) REGISTRY[id] = withServiceOperations(id, REGISTRY[id]);

const GENERIC_CACHE = new Map<string, ServiceModel>();

/**
 * Resolves the ServiceModel for a serviceId: a dedicated Tier 1/2 model if one exists, otherwise
 * a Tier 3 fallback built lazily from the service's catalog entry (cached so repeated resolution
 * doesn't rebuild it every call). Returns `null` only for a serviceId with no catalog entry at
 * all (e.g. a typo) - the one case genuinely outside this engine's scope.
 */
export function resolveServiceModel(serviceId: string): ServiceModel | null {
  const dedicated = REGISTRY[serviceId];
  if (dedicated) return dedicated;

  const cached = GENERIC_CACHE.get(serviceId);
  if (cached) return cached;

  const catalogEntry = AWS_SERVICES.find(s => s.id === serviceId);
  if (!catalogEntry) return null;

  const generic = buildGenericServiceModel(catalogEntry);
  GENERIC_CACHE.set(serviceId, generic);
  return generic;
}

export function isDedicatedModel(serviceId: string): boolean {
  return serviceId in REGISTRY;
}
