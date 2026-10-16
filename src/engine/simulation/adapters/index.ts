import { managedServicesAdapter } from './managedServices.ts';
import type { Adapter } from './types.ts';
import { perimeterInspectionAdapter } from './perimeterInspection.ts';
import { computeCapacityAdapter } from './computeCapacity.ts';
import { dependencyCallsAdapter } from './dependencyCalls.ts';
import { natGatewayAdapter } from './natGatewayHop.ts';
import { terminalNodeAdapter } from './terminalNode.ts';
import { cloudFrontAdapter } from './cloudFront.ts';
import { loadBalancerAdapter } from './loadBalancer.ts';
import { dataTierInteractionAdapter } from './dataTierInteraction.ts';
import { vpcEndpointAdapter } from './vpcEndpoint.ts';
import { networkPathAdapter } from './networkPath.ts';

/**
 * The ordered traversal pipeline, run in this exact sequence for every hop. Order is meaningful
 * and intentional - e.g. WAF inspection must run before load-balancer routing, and the
 * compute-to-data-tier check must run before the generic network-path resolution - so this array
 * is not a lookup table to be reordered freely the way the cost-calculator's pricing-module
 * registry is. `networkPathAdapter` is always last: it is the catch-all that resolves and
 * forwards to the next hop (or terminates) whenever nothing earlier in the pipeline already did.
 */
export const SIMULATION_PIPELINE: Adapter[] = [
  perimeterInspectionAdapter,
  computeCapacityAdapter,
  dependencyCallsAdapter,
  natGatewayAdapter,
  managedServicesAdapter,
  terminalNodeAdapter,
  cloudFrontAdapter,
  loadBalancerAdapter,
  dataTierInteractionAdapter,
  vpcEndpointAdapter,
  networkPathAdapter
];

export type { AdapterContext, AdapterSignal, Adapter } from './types.ts';
export { SimulationTrace, CONTINUE, TERMINATE, advanceTo } from './types.ts';
