/** Relationship meaning is independent of line geometry and request protocol. */
export type RelationshipKind = 'authorization' | 'request' | 'dependency' | 'manages' | 'route-association' | 'target-registration';
interface RelationshipData {
  relationship?: RelationshipKind;
  traversal?: 'forward' | 'dependency';
  signalType?: unknown;
  protocol?: unknown;
}
export function relationshipKind(data?: RelationshipData): RelationshipKind {
  return data?.relationship ?? (data?.traversal === 'dependency' ? 'dependency' : 'request');
}
/** Database replication lines are structural (connectionContracts.ts says so); they never carry
 * the client request onward. */
export function carriesRequest(data?: RelationshipData): boolean {
  return data?.signalType !== 'outbound_response' && relationshipKind(data) === 'request' && data?.protocol !== 'Replication';
}
export function isDependencyCall(data?: RelationshipData): boolean {
  return data?.signalType !== 'outbound_response' && relationshipKind(data) === 'dependency';
}
