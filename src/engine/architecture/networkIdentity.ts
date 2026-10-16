import type { Node } from '@xyflow/react';
import { findContainingSubnetBoundary, findContainingVpc } from '../layout/containment.ts';
import type { Finding } from '../findings.ts';
import { parseCidr } from '../network/cidr.ts';

/** Validate explicit references without silently replacing them with geometric guesses. */
export function validateNetworkIdentities(nodes: Node<any>[]): Finding[] {
  const findings: Finding[] = [];
  for (const node of nodes) {
    const identity = node.data.networkIdentity;
    if (!identity) continue;
    const report = (field: string, problem: string) => findings.push({
      id: `network-identity:${node.id}:${field}`, category: 'validation', subcategory: 'network_identity',
      severity: 'HIGH', resource: node.data.label ?? node.id, resourceId: node.id, problem,
      whyItMatters: 'Invalid explicit references must not fall back to visual placement.',
      awsRule: 'Subnets belong to a VPC; resource subnet membership is explicit.',
      recommendation: 'Select an existing compatible resource or clear the explicit assignment.'
    });
    if (identity.privateIp !== undefined && (typeof identity.privateIp !== 'string' || identity.privateIp.includes('/') || !parseCidr(`${identity.privateIp}/32`))) {
      report('privateIp', 'Private IP must be a single valid IPv4 address. IPv6 is not modeled.');
    }
    for (const [field, matches] of [
      ['subnetId', (n: Node<any>) => n.type === 'boundaryNode' && ['public_subnet', 'private_subnet'].includes(n.data.boundaryType)],
      ['vpcId', (n: Node<any>) => n.type === 'boundaryNode' && n.data.boundaryType === 'vpc'],
      ['routeTableId', (n: Node<any>) => n.data.serviceId === 'route_tables']
    ] as const) {
      const id = identity[field];
      if (id !== undefined && (typeof id !== 'string' || !nodes.some(n => n.id === id && matches(n)))) {
        report(field, `Invalid ${field} reference: ${String(id)}.`);
      }
    }
    const subnet = findContainingSubnetBoundary(node, nodes);
    const vpc = subnet && findContainingVpc(subnet, nodes);
    if (identity.vpcId && vpc && identity.vpcId !== vpc.id) report('vpcMismatch', 'Resource VPC does not match its subnet VPC.');
  }
  return findings;
}
