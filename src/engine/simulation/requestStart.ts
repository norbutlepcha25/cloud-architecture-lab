import type { Node } from '@xyflow/react';
import type { ServiceNodeData } from '../../types/index.ts';

/** Shared deterministic entry-point defaults for loaders and execution. An explicit missing
 * resource is never replaced unless a compatibility caller deliberately opts into it. */
export function resolveRequestStart<T extends Node<ServiceNodeData>>(
  nodes: T[], startNodeId = '', allowMissingExplicitFallback = false
): T | undefined {
  const services = nodes.filter(node => node.type !== 'boundaryNode' && node.data?.serviceId);
  const selected = services.find(node => node.id === startNodeId);
  if (selected) return selected;
  if (startNodeId && !allowMissingExplicitFallback) return undefined;
  // Compatibility callers retain their historical insertion priority until migrated.
  const ordered = allowMissingExplicitFallback ? services : [...services].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return ordered.find(node => ['user', 'client_ui', 'api_client'].includes(node.data.serviceId))
    ?? ordered.find(node => ['internet_gateway', 'cloudfront', 'route53', 'alb', 'api_gateway'].includes(node.data.serviceId))
    ?? ordered[0];
}
