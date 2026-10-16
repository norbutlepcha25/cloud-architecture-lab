export type ServiceCategory =
  | 'Client / Ingress'
  | 'Compute'
  | 'Storage'
  | 'Databases'
  | 'Networking & Content Delivery'
  | 'Security, Identity & Compliance'
  | 'Integration & Messaging'
  | 'Analytics'
  | 'Machine Learning & AI'
  | 'Management & Governance'
  | 'Developer Tools'
  | 'Containers'
  | 'Frontend Web & Mobile'
  | 'Migration & Transfer'
  | 'Media Services'
  | 'Business Applications'
  | 'End User Computing'
  | 'Internet of Things (IoT)'
  | 'Cloud Financial Management'
  | 'Blockchain & Quantum'
  | 'Robotics & Satellite'
  // Backwards compatibility aliases
  | 'DNS / Edge'
  | 'Load Balancing'
  | 'Networking'
  | 'Security'
  | 'Messaging';

export type NodeHealth = 'healthy' | 'degraded' | 'failed';

export type ProtocolType =
  | 'HTTPS'
  | 'HTTP'
  | 'DNS'
  | 'SQL'
  | 'gRPC'
  | 'TCP'
  | 'Event'
  | 'Message'
  | 'Object access';

export type AvailabilityZone = 'AZ-A' | 'AZ-B' | 'AZ-C' | 'Multi-AZ' | 'Edge / Global';
export type SubnetType = 'public' | 'private' | 'isolated' | 'global' | 'unassigned';

export interface AWSService {
  id: string;
  name: string;
  category: ServiceCategory;
  description: string;
  architecturalRole: string;
  color: string;
  iconName: string;
  inputs: string[];
  outputs: string[];
  commonInteractions: ProtocolType[];
  dependencies: string[];
  failureModes: string[];
  resilienceCharacteristics: string[];
  scalabilityCharacteristics: string[];
  securityConsiderations: string[];
  alternatives: string[];
  teachingNotes: string[];
  defaultConfig?: {
    capacity?: number;
    replicas?: number;
    multiAz?: boolean;
    cached?: boolean;
    timeoutMs?: number;
  };
}

export interface NetworkIdentity {
  privateIp?: string;
  subnetId?: string;
  vpcId?: string;
  routeTableId?: string;
}

export interface ServiceNodeData extends Record<string, unknown> {
  /** Explicit relationships override canvas placement; absent fields retain legacy behavior. */
  networkIdentity?: NetworkIdentity;
  serviceId: string;
  label: string;
  category: ServiceCategory;
  health: NodeHealth;
  az: AvailabilityZone;
  subnet: SubnetType;
  replicas: number;
  multiAz: boolean;
  notes?: string;
  /** IDs of `security_group` boundary nodes attached to this resource - explicit, like
   *  attaching a Security Group to an ENI in real AWS, independent of canvas position. */
  securityGroupIds?: string[];
  isSimulating?: boolean;
  simulationStatus?: 'active' | 'success' | 'failed' | 'idle';
  trafficLoad?: number;
  failureReason?: string;
  customConfig?: Record<string, any>;
  /** Optional IAM role attached to this resource (e.g. an EC2 instance profile or a Lambda
   *  execution role) - drives `engine/validation/iam.ts`'s real trust-policy/permission checks via
   *  the standalone IAM engine (`engine/iam/`) instead of a shallow allow-list string match. A
   *  resource with no role attached still gets a coarser "no IAM role at all" validation check. */
  iamRole?: {
    id: string;
    trustPolicy?: import('../engine/iam/types.ts').Policy;
    identityPolicies?: import('../engine/iam/types.ts').Policy[];
    permissionsBoundary?: import('../engine/iam/types.ts').Policy;
  };
}

export type FlowStatus = 'active' | 'completed' | 'pending' | 'failed' | 'dimmed' | 'idle';

export interface ConnectionData extends Record<string, unknown> {
  transport?: 'HTTP' | 'HTTPS' | 'TCP' | 'UDP';
  /** Explicit destination port; absent values retain the educational protocol abstraction. */
  destinationPort?: number;
  /** Structural relationships never act as forwarding hops. Legacy edges default to request. */
  relationship?: import('../engine/architecture/relationships.ts').RelationshipKind;
  protocol: ProtocolType;
  label?: string;
  stepNumber?: number;
  interactionType: 'synchronous' | 'asynchronous' | 'cached' | 'event';
  isCriticalDependency: boolean;
  timeoutMs: number;
  /** A dependency call is executed as a child operation and then returns to the parent
   * request. It is not selected as the next forwarding hop. */
  traversal?: 'forward' | 'dependency';
  dependencyRequired?: boolean;
  action?: string;
  animated?: boolean;
  isFailing?: boolean;
  isSimulating?: boolean;
  // Task Flow visualization
  flowStatus?: FlowStatus;
  flowStepNumber?: number;
  flowStepIndex?: number;
  flowAction?: string;
  flowLatency?: number;
  flowExplanation?: string;
  flowStatusCode?: number;
  // Signal Flow properties
  signalType?: 'inbound_request' | 'outbound_response';
  hasMissingReturnBlock?: boolean;
  signalLabel?: string;
  /** Diagram-only appearance. Straight uses right-angle bends when unaligned;
   * orthogonal is a legacy alias. Omitted values use the straight default. */
  lineStyle?: 'curved' | 'straight' | 'orthogonal';
  curveOffset?: number;
}

export interface NaclRule {
  ruleNumber: number;
  type: string;
  protocol: string;
  portRange: string;
  cidr: string;
  action: 'ALLOW' | 'DENY';
  isStatelessReturn?: boolean;
  isMissingReturn?: boolean;
}

export interface SubnetNaclConfig {
  naclName: string;
  inboundRules: NaclRule[];
  outboundRules: NaclRule[];
  isCustom: boolean;
}

export interface SimulationStep {
  id: string;
  stepNumber: number;
  timestampMs: number;
  sourceNodeId: string;
  targetNodeId: string;
  sourceNodeName: string;
  targetNodeName: string;
  protocol: ProtocolType;
  action: string;
  status: 'processing' | 'success' | 'failed' | 'bypassed';
  explanation: string;
  targetHealth: NodeHealth;
  latencyMs: number;
  details?: {
    decision?: import('../engine/trace/types.ts').TraceEntry;
    targetsEvaluated?: { id: string; name: string; health: NodeHealth; selected: boolean }[];
    cacheHit?: boolean;
    statusCode?: number;
    failureReason?: string;
    recoveryApplied?: string;
    dependencyCall?: boolean;
    callId?: string;
    parentCallId?: string;
    phase?: 'call' | 'response';
    /** A logical application response is not proof of reverse packet evaluation. */
    returnPathEvaluated?: boolean;
    returnsToNodeId?: string;
  };
}

export interface SimulationScenario {
  id: string;
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  startNodeId: string;
  trafficLevel: 'low' | 'normal' | 'high' | 'very_high' | '10x' | '100x';
  simulateFailureCascade?: boolean;
  /** Subnets with no route table association behave like a standard public/private setup.
   *  false = they get only the VPC local route (AWS main route table of a new VPC). Default true. */
  assumeRouteTables?: boolean;
}

export type SimulationResultKind = 'request' | 'configuration-check' | 'authorization-check' | 'workflow';
export type SimulationOutcome = 'success' | 'failure' | 'denied' | 'unsupported';

export interface SimulationResult {
  /** Absent on older saved results; those retain request presentation. */
  kind?: SimulationResultKind;
  outcome?: SimulationOutcome;
  serviceStates?: Record<string, import('../engine/services/operations.ts').Runtime>;
  scenario: SimulationScenario;
  steps: SimulationStep[];
  success: boolean;
  totalLatencyMs: number;
  statusCode: number;
  summary: string;
  bottlenecksDetected: string[];
  cascadeOccurred: boolean;
  /** The ordered node ids this specific request actually traversed (start node first) - lets a
   *  caller (e.g. the Trace Engine, `engine/trace/`) reconstruct the real hop-by-hop path without
   *  re-deriving traversal/next-hop-selection logic that already lives in `runSimulation`. Empty
   *  when the scenario had no resolvable start node. */
  path: string[];
}

export interface ScoreDetail {
  score: number; // 0-100
  positiveReasons: string[];
  negativeReasons: string[];
}

export interface SPOFItem {
  nodeId: string;
  nodeName: string;
  serviceId: string;
  category: ServiceCategory;
  impactLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  impactPath: string[];
  explanation: string;
  mitigation: string;
}

export interface BottleneckItem {
  nodeId: string;
  nodeName: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  explanation: string;
  mitigation: string;
}

export interface SecurityAuditItem {
  severity: 'CRITICAL' | 'WARNING' | 'GOOD';
  title: string;
  explanation: string;
  recommendation: string;
  affectedNodes: string[];
}

export interface ArchitectureAnalysis {
  availability: ScoreDetail;
  resilience: ScoreDetail;
  faultTolerance: ScoreDetail;
  scalability: ScoreDetail;
  security: ScoreDetail;
  spofs: SPOFItem[];
  bottlenecks: BottleneckItem[];
  securityIssues: SecurityAuditItem[];
  overallRating: 'Resilient' | 'Moderate' | 'Fragile' | 'Incomplete';
  summary: string;
}

/** Extra evaluation context beyond the legacy `(nodes, edges, analysis)` triple - lets a challenge
 *  evaluate connectivity (`simulationResult`), configuration validity (`validationFindings`), and
 *  IAM/security/resilience risk (`architecturalFindings`, which includes the `iam`, `public_exposure`,
 *  `redundancy`, `dependency_concentration`, and `blast_radius` subcategories) without threading
 *  four more positional parameters through every existing challenge definition. Optional and
 *  additive: a challenge written against the old 3-argument signature still works unchanged. */
export interface ChallengeEvaluationContext {
  simulationResult: SimulationResult | null;
  validationFindings: import('../engine/findings.ts').Finding[];
  architecturalFindings: import('../engine/findings.ts').Finding[];
}

export interface StudentChallenge {
  id: string;
  title: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  scenario: string;
  trafficScale: string;
  requirements: string[];
  evaluationCheck: (
    nodes: any[],
    edges: any[],
    analysis: ArchitectureAnalysis,
    context?: ChallengeEvaluationContext
  ) => {
    passed: boolean;
    feedback: string[];
    score: number;
  };
  initialTemplateId?: string;
}

export type AppMode = 'design' | 'simulate' | 'failure' | 'analyze' | 'compare' | 'challenges';
