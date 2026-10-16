import { resolveRequestStart } from '../engine/simulation/requestStart.ts';
import { changeAnalyticsContext, track } from '../analytics/analytics.ts';
import { COURSE_LABS } from '../data/courseLabs.ts';
import { isEksManagementPair } from '../engine/architecture/eksRelationships.ts';
import { labAnnotationProtocol } from '../engine/architecture/labConnections.ts';
import { observeAlbRequests } from '../engine/scaling/albObservation.ts';
import { resetAsg } from '../engine/scaling/asg.ts';
import { checkConnection, connectionProtocols, interactionTransport, isManagementPair, isAuthorizationPair } from '../engine/architecture/connectionContracts.ts';
import { parseDraft, serializeDraft } from '../engine/persistence/draft.ts';
import type { Viewport } from '@xyflow/react';
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import {
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  MarkerType
} from '@xyflow/react';
import {
  ServiceNodeData,
  ConnectionData,
  AppMode,
  SimulationScenario,
  SimulationResult,
  SimulationStep,
  ArchitectureAnalysis,
  StudentChallenge,
  AvailabilityZone,
  ProtocolType,
  NodeHealth,
  NaclRule
} from '../types/index.ts';
import { SERVICE_MAP } from '../data/serviceCatalog.ts';
import { REFERENCE_ARCHITECTURES, type ReferenceArchitecture } from '../data/referenceArchitectures.ts';
import { STUDENT_CHALLENGES } from '../data/studentChallenges.ts';
import { runLiveSimulation as runSimulation, traceFromSimulation } from '../engine/simulation/liveSimulation.ts';
import { analyzeArchitecture } from '../engine/analysis/rulesEngine.ts';
import { deriveSubnetForNode, findContainingVpc, getBoundaryRect, calculateBoundaryZIndex } from '../engine/layout/containment.ts';
import { allocateSubnetCidrs } from '../engine/layout/cidrAllocator.ts';
import { calculateArchitectureCost, ArchitectureCostReport } from '../engine/cost/costCalculator.ts';
import { createFailure, computeEffectiveArchitectureState } from '../engine/failure/index.ts';
import type { Failure, FailureInput, FailureImpactAnalysis } from '../engine/failure/index.ts';
import { validateArchitecture } from '../engine/validation/index.ts';
import type { Finding } from '../engine/validation/index.ts';
import { analyzeArchitectureFindings } from '../engine/analysis/architecturalFindings.ts';
import type { RequestTrace } from '../engine/trace/index.ts';

import type { LabReference } from '../data/courseLabs.ts';
import { runLabReference } from '../engine/labs/runLabReference.ts';

interface ArchitectureContextType {
  draftName: string;
  setDraftName: (name: string) => void;
  exportDraft: () => string;
  importDraft: (text: string) => void;
  draftViewport: Viewport | null;
  setDraftViewport: (viewport: Viewport) => void;
  activeLabReference: LabReference | null;
  canvasRevision: number;
  openLabReference: (reference: LabReference, run?: boolean) => void;
  nodes: Node<ServiceNodeData>[];
  setNodes: React.Dispatch<React.SetStateAction<Node<ServiceNodeData>[]>>;
  onNodesChange: any;
  edges: Edge<ConnectionData>[];
  setEdges: React.Dispatch<React.SetStateAction<Edge<ConnectionData>[]>>;
  onEdgesChange: any;
  onConnect: (connection: Connection) => void;
  onReconnect: (edge: Edge<ConnectionData>, connection: Connection) => void;

  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;

  selectedNode: Node<ServiceNodeData> | null;
  setSelectedNodeId: (id: string | null) => void;
  selectedEdge: Edge<ConnectionData> | null;
  setSelectedEdgeId: (id: string | null) => void;

  addServiceNode: (serviceId: string, position?: { x: number; y: number }, options?: Partial<ServiceNodeData>) => void;
  addBoundaryNode: (boundaryType: string, position?: { x: number; y: number }, options?: { label?: string; width?: number; height?: number }) => string;
  updateNodeData: (id: string, data: Partial<ServiceNodeData>) => void;
  updateEdgeData: (id: string, data: Partial<ConnectionData>) => void;
  updateNodeDimensions: (id: string, width: number, height: number) => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  bringForward: (id: string) => void;
  sendBackward: (id: string) => void;
  setNodeZIndex: (id: string, zIndex: number) => void;
  removeNode: (id: string) => void;
  duplicateNode: (id: string) => void;
  setNodeHealth: (id: string, health: NodeHealth, reason?: string) => void;
  deleteSelected: () => void;
  clearCanvas: () => void;

  // Failure controls
  toggleNodeFailure: (id: string) => void;
  failAvailabilityZone: (az: AvailabilityZone) => void;
  restoreAllNodes: () => void;

  // Failure Simulation Engine (Phase 9): structured, propagation-aware failures on top of the
  // manual health mutators above. `effectiveNodes`/`effectiveEdges` are `nodes`/`edges` with every
  // active failure's real (dependency-aware) consequences merged in - what `runScenario` actually
  // simulates against.
  activeFailures: Failure[];
  injectFailure: (input: FailureInput) => string;
  resolveFailure: (failureId: string) => void;
  clearAllFailures: () => void;
  effectiveNodes: Node<ServiceNodeData>[];
  effectiveEdges: Edge<ConnectionData>[];
  failureImpacts: FailureImpactAnalysis[];

  // Simulation controls
  scenario: SimulationScenario;
  setScenario: React.Dispatch<React.SetStateAction<SimulationScenario>>;
  simulationResult: SimulationResult | null;
  /** The explainable AWS decision trace for `simulationResult` - request path, decision points,
   *  and the AWS rule/reason behind each one (engine/trace/). `null` when there's nothing to
   *  explain yet. */
  requestTrace: RequestTrace | null;
  activeStepIndex: number | null;
  setActiveStepIndex: (index: number | null) => void;
  runScenario: () => void;
  /** Runs from a specific resource without changing the saved request start (e.g. Run pipeline). */
  runFromNode: (nodeId: string) => void;
  resetSimulation: () => void;
  stepForward: () => void;
  stepBackward: () => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;

  // Task Flow visualization
  highlightTaskFlow: boolean;
  setHighlightTaskFlow: (val: boolean) => void;
  toggleTaskFlow: () => void;
  hoveredStepIndex: number | null;
  setHoveredStepIndex: (index: number | null) => void;

  // Architecture Analysis
  analysis: ArchitectureAnalysis;
  recalculateAnalysis: () => void;

  // Phase 10: Configuration & Design Validation - see engine/findings.ts for why these are two
  // separate lists rather than one.
  validationFindings: Finding[];
  architecturalFindings: Finding[];

  // Challenges & Templates
  loadTemplate: (templateId: string, reference?: ReferenceArchitecture) => void;
  activeChallenge: StudentChallenge | null;
  setActiveChallenge: (challenge: StudentChallenge | null) => void;
  challengeResult: { passed: boolean; feedback: string[]; score: number } | null;
  runChallengeTest: () => void;

  // NACL Side Column & Inspection
  showNaclSideColumn: boolean;
  setShowNaclSideColumn: (val: boolean) => void;
  hasCustomNacl: boolean;
  hasMissingReturnNacl: boolean;

  // AWS Cost & Billing Simulator
  costReport: ArchitectureCostReport;
}

const ArchitectureContext = createContext<ArchitectureContextType | null>(null);

export const DEFAULT_STARTER_NODES: Node<any>[] = [
  // 1. Boundary: VPC (10.0.0.0/16)
  {
    id: 'box-vpc',
    type: 'boundaryNode',
    position: { x: 60, y: 40 },
    data: {
      label: 'VPC',
      boundaryType: 'vpc',
      width: 780,
      height: 480,
      cidr: '10.0.0.0/16'
    },
    style: { width: 780, height: 480 },
    draggable: true,
    selectable: true,
    zIndex: -2
  },

  // 2. Boundary: Public Subnet
  {
    id: 'box-public-subnet',
    type: 'boundaryNode',
    position: { x: 90, y: 80 },
    data: {
      label: 'Public subnet',
      boundaryType: 'public_subnet',
      width: 720,
      height: 195
    },
    style: { width: 720, height: 195 },
    draggable: true,
    selectable: true,
    zIndex: 0
  },

  // 3. Boundary: Private Subnet
  {
    id: 'box-private-subnet',
    type: 'boundaryNode',
    position: { x: 90, y: 300 },
    data: {
      label: 'Private subnet',
      boundaryType: 'private_subnet',
      width: 720,
      height: 195
    },
    style: { width: 720, height: 195 },
    draggable: true,
    selectable: true,
    zIndex: 0
  }
];

export const createStarterNodes = (): Node<any>[] =>
  DEFAULT_STARTER_NODES.map(n => ({
    ...n,
    data: { ...n.data },
    style: { ...n.style }
  }));

// `Date.now()` alone collides whenever two nodes/edges of the same kind are created within the
// same millisecond (e.g. two quick clicks, or a script/test adding several at once) - React then
// sees two elements with the same key, and the second creation can silently clobber the first's
// state instead of adding a new one. A per-session counter guarantees uniqueness regardless of
// timing.
let idSequence = 0;
const uniqueId = (prefix: string) => `${prefix}-${Date.now()}-${++idSequence}`;

export const ArchitectureProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Start with default VPC and Public/Private subnets on the canvas
  const [nodes, setNodes, rawOnNodesChange] = useNodesState<Node<any>>(createStarterNodes());
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<any>>([]);

  const [activeLabReference, setActiveLabReference] = useState<LabReference | null>(null);
  const [canvasRevision, setCanvasRevision] = useState(0);
  const [draftName, setDraftName] = useState('Untitled draft');
  const [draftViewport, setDraftViewport] = useState<Viewport | null>(null);

  // Synchronize dynamic dimension changes (e.g. from NodeResizer) into node.data and node.style
  const onNodesChange = useCallback((changes: any[]) => {
    rawOnNodesChange(changes);
    const dimChanges = changes.filter(c => c.type === 'dimensions' && c.dimensions);
    if (dimChanges.length > 0) {
      setNodes(nds =>
        nds.map(n => {
          const dc = dimChanges.find(d => d.id === n.id);
          if (dc && dc.dimensions) {
            return {
              ...n,
              data: {
                ...n.data,
                width: Math.round(dc.dimensions.width),
                height: Math.round(dc.dimensions.height)
              },
              style: {
                ...n.style,
                width: Math.round(dc.dimensions.width),
                height: Math.round(dc.dimensions.height)
              }
            };
          }
          return n;
        })
      );
    }
  }, [rawOnNodesChange, setNodes]);

  // A node's real subnet is whatever boundary box it is geometrically inside right now, not
  // whatever value happens to be stored on it - otherwise dragging an ALB out of its VPC would
  // leave it still behaving as a valid public-subnet resource. Recomputed from the current node
  // positions on every change (drag, drop, resize of a boundary, template load) and only
  // written back when it actually disagrees, so this settles in one extra pass and never loops.
  //
  // The same pass also auto-carves each VPC's own CIDR block across the Public/Private subnet
  // boundaries drawn inside it - a subnet's CIDR is never typed by hand, only the VPC's is.
  // Public subnets are numbered first (left-to-right, top-to-bottom), then private subnets,
  // so a VPC with 2 public + 2 private subnets reliably gets .0/.1 for public and .2/.3 for
  // private. This can never violate AWS subnetting rules by construction: allocateSubnetCidrs
  // always produces equal, non-overlapping blocks carved out of the VPC's own range, and refuses
  // (with an explanatory error surfaced on the subnet) rather than emit a subnet smaller than
  // AWS's real /28 floor.
  useEffect(() => {
    const boundaryNodes = nodes.filter(n => n.type === 'boundaryNode');

    const subnetBoundaries = boundaryNodes.filter(
      b => (b.data as any)?.boundaryType === 'public_subnet' || (b.data as any)?.boundaryType === 'private_subnet'
    );

    // Group subnet boundaries by the VPC that actually contains them, ordering public subnets
    // before private ones (each sorted left-to-right then top-to-bottom) for stable numbering.
    const byVpc = new Map<string, Node<any>[]>();
    const orphanSubnetIds = new Set<string>();
    for (const subnet of subnetBoundaries) {
      const vpc = findContainingVpc(subnet, boundaryNodes);
      if (!vpc) {
        orphanSubnetIds.add(subnet.id);
        continue;
      }
      const list = byVpc.get(vpc.id) || [];
      list.push(subnet);
      byVpc.set(vpc.id, list);
    }

    const positionSort = (a: Node<any>, b: Node<any>) => {
      const ra = getBoundaryRect(a);
      const rb = getBoundaryRect(b);
      return ra.y - rb.y || ra.x - rb.x;
    };

    const cidrById = new Map<string, {
      cidr: string | null;
      totalAddresses: number | null;
      usableHosts: number | null;
      reservedAddresses: any[];
      usableRange: any;
      error: string | null;
    }>();
    for (const [vpcId, subnetsInVpc] of byVpc) {
      const vpcNode = boundaryNodes.find(b => b.id === vpcId)!;
      const publicOnes = subnetsInVpc.filter(s => (s.data as any).boundaryType === 'public_subnet').sort(positionSort);
      const privateOnes = subnetsInVpc.filter(s => (s.data as any).boundaryType === 'private_subnet').sort(positionSort);
      const orderedIds = [...publicOnes, ...privateOnes].map(s => s.id);

      const allocations = allocateSubnetCidrs((vpcNode.data as any)?.cidr, orderedIds);
      allocations.forEach((allocation, id) => cidrById.set(id, {
        cidr: allocation.cidr,
        totalAddresses: allocation.totalAddresses,
        usableHosts: allocation.usableHosts,
        reservedAddresses: allocation.reservedAddresses,
        usableRange: allocation.usableRange,
        error: allocation.error
      }));
    }
    orphanSubnetIds.forEach(id =>
      cidrById.set(id, {
        cidr: null,
        totalAddresses: null,
        usableHosts: null,
        reservedAddresses: [],
        usableRange: null,
        error: 'This subnet is not inside any VPC boundary, so it has no address space to be carved from.'
      })
    );

    // Dynamically calculate containment-aware stacking z-index for every boundary node.
    // Inner/enclosed boundaries receive higher z-index than their enclosing containers
    // (e.g. VPC inside AZ gets higher z-index than AZ, and AZ gets higher z-index than Region).
    const targetZIndexById = new Map<string, number>();
    for (const b of boundaryNodes) {
      if ((b.data as any)?.customZIndex) {
        continue;
      }
      const targetZ = calculateBoundaryZIndex(b, boundaryNodes);
      targetZIndexById.set(b.id, targetZ);
    }

    let changed = false;

    const nextNodes = nodes.map(n => {
      const isServiceNode = n.type === 'serviceNode' || (n.type !== 'boundaryNode' && (n.data as any)?.serviceId);
      if (isServiceNode) {
        const derivedSubnet = deriveSubnetForNode(n, boundaryNodes);
        const needsZIndex = n.zIndex === undefined || n.zIndex < 10;
        if ((n.data as any)?.subnet === derivedSubnet && !needsZIndex) return n;
        changed = true;
        return {
          ...n,
          ...(needsZIndex ? { zIndex: 10 } : {}),
          data: { ...n.data, subnet: derivedSubnet }
        };
      }

      if (cidrById.has(n.id)) {
        const alloc = cidrById.get(n.id)!;
        const targetZ = targetZIndexById.get(n.id);
        const zChanged = targetZ !== undefined && n.zIndex !== targetZ;
        const cidrChanged =
          (n.data as any)?.cidr !== (alloc.cidr ?? undefined) ||
          (n.data as any)?.cidrError !== (alloc.error ?? undefined) ||
          (n.data as any)?.usableHosts !== (alloc.usableHosts ?? undefined);

        if (!cidrChanged && !zChanged) {
          return n;
        }
        changed = true;
        return {
          ...n,
          ...(zChanged ? { zIndex: targetZ } : {}),
          data: {
            ...n.data,
            cidr: alloc.cidr ?? undefined,
            cidrError: alloc.error ?? undefined,
            totalAddresses: alloc.totalAddresses ?? undefined,
            usableHosts: alloc.usableHosts ?? undefined,
            reservedAddresses: alloc.reservedAddresses,
            usableRange: alloc.usableRange
          }
        };
      }

      if (n.type === 'boundaryNode' && targetZIndexById.has(n.id)) {
        const targetZ = targetZIndexById.get(n.id)!;
        if (n.zIndex !== targetZ) {
          changed = true;
          return { ...n, zIndex: targetZ };
        }
      }

      return n;
    });

    if (changed) {
      setNodes(nextNodes);
    }
  }, [nodes, setNodes]);

  const [appMode, setAppMode] = useState<AppMode>('design');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const [scenario, setScenario] = useState<SimulationScenario>({
    id: 'default-scenario',
    name: 'Application Request',
    method: 'GET',
    path: '/api/v1/resource',
    startNodeId: '',
    trafficLevel: 'normal'
  });

  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [highlightTaskFlow, setHighlightTaskFlow] = useState<boolean>(true);
  const [hoveredStepIndex, setHoveredStepIndex] = useState<number | null>(null);

  const [activeChallenge, setActiveChallenge] = useState<StudentChallenge | null>(null);
  const [challengeResult, setChallengeResult] = useState<{ passed: boolean; feedback: string[]; score: number } | null>(null);
  const [showNaclSideColumn, setShowNaclSideColumn] = useState<boolean>(false);
  // A new canvas selection opens its own inspector rather than retaining the NACL panel.
  useEffect(() => { setShowNaclSideColumn(false); }, [selectedNodeId]);

  const hasCustomNacl = useMemo(() => {
    return nodes.some(n => Boolean((n.data as any)?.customNacl));
  }, [nodes]);

  // Distinct from `hasCustomNacl` (any subnet has NACL rules at all, e.g. via "Enable NACL rule
  // set"): this is specifically the missing-ephemeral-return-rule condition Problem 3.1 diagnoses.
  // Enabling a NACL preset does NOT set this by default - only the Problem 3.1 reference diagram,
  // or a subnet where a student has explicitly toggled "Simulate missing return rule", does.
  const hasMissingReturnNacl = useMemo(() => {
    return nodes.some(n => (n.data as any)?.customNacl?.inboundRules?.some(
      (r: NaclRule) => r.isStatelessReturn && r.isMissingReturn
    ));
  }, [nodes]);

  // Compute Analysis dynamically
  const analysis = useMemo(() => {
    return analyzeArchitecture(nodes, edges);
  }, [nodes, edges]);

  // Phase 10: three deliberately separate questions. `validationFindings` = is this legal, well-
  // formed AWS config (CIDR/placement/routing/NACL/SG/IAM/dependency/service-config correctness) -
  // independent of both whether a simulated request succeeds (`simulationResult`, above) and
  // whether the design itself is good (`architecturalFindings`, below - SPOF/bottleneck/public
  // exposure/redundancy/dependency concentration/blast radius). A configuration can score
  // differently on all three at once - see engine/findings.ts.
  const validationFindings = useMemo(() => {
    return validateArchitecture(nodes, edges);
  }, [nodes, edges]);

  const architecturalFindings = useMemo(() => {
    return analyzeArchitectureFindings(nodes, edges);
  }, [nodes, edges]);

  // Compute Architecture Bill dynamically
  const costReport = useMemo(() => {
    return calculateArchitectureCost(nodes, scenario.trafficLevel);
  }, [nodes, scenario.trafficLevel]);

  const recalculateAnalysis = useCallback(() => {
    // triggers useMemo automatically
  }, []);

  // Selected entities
  const selectedNode = useMemo(() => {
    return nodes.find(n => n.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  const selectedEdge = useMemo(() => {
    return edges.find(e => e.id === selectedEdgeId) || null;
  }, [edges, selectedEdgeId]);

  // Connect handler with default protocols based on source/target
  const onConnect = useCallback((connection: Connection) => {
    // A node cannot depend on itself: a self-loop is an immediate routing cycle.
    if (!connection.source || !connection.target || connection.source === connection.target) {
      return;
    }

    const sourceNode = nodes.find(n => n.id === connection.source);
    const targetNode = nodes.find(n => n.id === connection.target);

    // Both endpoints must be real service nodes. Boundary containers (VPC, subnet, AZ,
    // security group) are visual grouping only, and the simulator skips them, which
    // would leave a traversal with no next hop.
    if (!sourceNode || !targetNode) return;
    if ((sourceNode.type === 'boundaryNode' || targetNode.type === 'boundaryNode') && !isEksManagementPair(sourceNode, targetNode)) return;

    // Ignore a duplicate connection between the same pair of services.
    if (edges.some(e => e.source === connection.source && e.target === connection.target)) {
      return;
    }

    let defaultProtocol: ProtocolType = 'HTTP';
    if (targetNode?.data.serviceId === 'rds') {
      defaultProtocol = 'SQL';
    } else if (targetNode?.data.serviceId === 'sqs' || targetNode?.data.serviceId === 'sns') {
      defaultProtocol = 'Message';
    } else if (sourceNode?.data.serviceId === 'route53') {
      defaultProtocol = 'DNS';
    } else if (sourceNode?.data.serviceId === 'user') {
      defaultProtocol = 'HTTPS';
    } else if (targetNode?.data.serviceId === 's3') {
      defaultProtocol = 'Object access';
    }

    const authorization = isAuthorizationPair(sourceNode, targetNode);
    const management = isManagementPair(sourceNode, targetNode);
    const annotationProtocol = management ? undefined : labAnnotationProtocol(activeLabReference, sourceNode, targetNode);
    const relationship = authorization ? 'authorization' : management || annotationProtocol ? 'manages' : 'request';
    const protocols: ProtocolType[] = authorization ? ['Event'] : annotationProtocol ? [annotationProtocol] : management ? (isEksManagementPair(sourceNode, targetNode) ? ['HTTPS'] : ['Event']) : connectionProtocols(sourceNode, targetNode);
    if (!protocols.length) { window.alert('Behavior not modeled or unsupported interaction for this pair. No request connection was created.'); return; }
    if (!protocols.includes(defaultProtocol)) defaultProtocol = protocols[0];
    const validation = checkConnection(sourceNode, targetNode, { protocol: defaultProtocol, relationship });
    if (validation.status !== 'valid' && !(annotationProtocol && validation.status === 'unknown')) { window.alert(validation.reason); return; }
    const newEdge: Edge<ConnectionData> = {
      ...connection,
      id: uniqueId(`edge-${connection.source}-${connection.target}`),
      type: 'custom',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#94A3B8'
      },
      data: {
        relationship,
        label: authorization ? 'IAM authorization (not request traffic)' : annotationProtocol ? 'Lab configuration link (not request traffic)' : management ? (isEksManagementPair(sourceNode, targetNode) ? 'EKS management relationship (not executed)' : sourceNode.data.serviceId === 'alb' ? 'ALB request metrics' : 'Management') : undefined,
        referenceAnnotation: !authorization && annotationProtocol ? activeLabReference?.id : undefined,
        protocol: defaultProtocol,
        transport: interactionTransport(defaultProtocol),
        lineStyle: 'straight',
        interactionType: authorization || management || annotationProtocol ? 'event' : 'synchronous',
        isCriticalDependency: !(authorization || management || annotationProtocol),
        timeoutMs: 2500
      }
    };

    setEdges((eds) => addEdge(newEdge as any, eds as any) as any);
  }, [nodes, edges, setEdges, activeLabReference]);

  // Preserve edge identity/configuration while relocating either endpoint.
  const onReconnect = useCallback((oldEdge: Edge<ConnectionData>, connection: Connection) => {
    const edge = edges.find(e => e.id === oldEdge.id);
    if (!edge || !connection.source || !connection.target || connection.source === connection.target) return;
    const source = nodes.find(n => n.id === connection.source);
    const target = nodes.find(n => n.id === connection.target);
    if (!source || !target) return;
    const samePair = edge.source === source.id && edge.target === target.id;
    if (!samePair) {
      if (edges.some(e => e.id !== edge.id && e.source === source.id && e.target === target.id)) return;
      const result = checkConnection(source, target, { ...edge.data, referenceAnnotation: undefined });
      if (result.status !== 'valid') { window.alert(result.reason); return; }
    }
    setEdges(previous => previous.map(e => e.id === edge.id ? { ...e, ...connection } : e));
  }, [edges, nodes, setEdges]);

  // Add a new node to canvas
  const addServiceNode = useCallback((
    serviceId: string,
    position?: { x: number; y: number },
    options?: Partial<ServiceNodeData>
  ) => {
    const serviceDef = SERVICE_MAP[serviceId];
    if (!serviceDef) return;

    const count = nodes.filter(n => n.data.serviceId === serviceId).length;
    const label = count > 0 ? `${serviceDef.name} #${count + 1}` : serviceDef.name;

    const newNode: Node<ServiceNodeData> = {
      id: uniqueId(`node-${serviceId}`),
      type: 'serviceNode',
      position: position || {
        x: 100 + Math.random() * 400,
        y: 100 + Math.random() * 250
      },
      data: {
        serviceId,
        label: options?.label || label,
        category: serviceDef.category,
        health: 'healthy',
        az: options?.az || (serviceDef.defaultConfig?.multiAz ? 'Multi-AZ' : 'AZ-A'),
        subnet: options?.subnet || (['user', 'route53', 'cloudfront'].includes(serviceId) ? 'global' : ['alb', 'api_gateway'].includes(serviceId) ? 'public' : 'private'),
        replicas: options?.replicas || serviceDef.defaultConfig?.replicas || 1,
        multiAz: options?.multiAz !== undefined ? options.multiAz : (serviceDef.defaultConfig?.multiAz || false),
        ...options
      },
      zIndex: 10
    };

    setNodes((nds) => [...nds, newNode]);
    setSelectedNodeId(newNode.id);
  }, [nodes, setNodes]);

  // Add a new boundary/group container to canvas
  const addBoundaryNode = useCallback((
    boundaryType: string,
    position?: { x: number; y: number },
    options?: { label?: string; width?: number; height?: number }
  ): string => {
    const defs: Record<string, { label: string; width: number; height: number; zIndex: number }> = {
      region: { label: 'Region (us-east-1)', width: 980, height: 600, zIndex: -3 },
      vpc: { label: 'VPC', width: 880, height: 500, zIndex: -2 },
      az: { label: 'Availability Zone', width: 360, height: 560, zIndex: -2 },
      availability_zone: { label: 'Availability Zone', width: 360, height: 560, zIndex: -2 },
      public_subnet: { label: 'Public subnet', width: 320, height: 200, zIndex: 0 },
      private_subnet: { label: 'Private subnet', width: 320, height: 200, zIndex: 0 },
      security_group: { label: 'Security group', width: 700, height: 130, zIndex: 1 },
      account: { label: "Customer's AWS Account", width: 800, height: 550, zIndex: -3 }
    };

    const config = defs[boundaryType] || { label: 'Boundary', width: 400, height: 300, zIndex: -1 };
    const count = nodes.filter(n => n.type === 'boundaryNode' && (n.data as any)?.boundaryType === boundaryType).length;
    const label = options?.label || (count > 0 ? `${config.label} #${count + 1}` : config.label);
    const width = options?.width || config.width;
    const height = options?.height || config.height;
    const boundaryPos = position || { x: 100, y: 100 };

    const candidateBoundary: Node<any> = {
      id: uniqueId(`box-${boundaryType}`),
      type: 'boundaryNode',
      position: boundaryPos,
      data: {
        label,
        boundaryType,
        width,
        height,
        // A VPC needs an address block from the moment it exists, so subnets drawn inside it
        // have something to be carved from immediately, without the student having to open the
        // inspector first. Subnets themselves get no default - their CIDR is always derived.
        ...(boundaryType === 'vpc' ? { cidr: '10.0.0.0/16' } : {})
      },
      style: {
        width,
        height
      },
      draggable: true,
      selectable: true
    };

    const existingBoundaryNodes = nodes.filter(n => n.type === 'boundaryNode');
    const dynamicZ = calculateBoundaryZIndex(candidateBoundary, [...existingBoundaryNodes, candidateBoundary]);

    const newBoundary: Node<any> = {
      ...candidateBoundary,
      zIndex: dynamicZ
    };

    setNodes(nds => [newBoundary, ...nds]);
    setSelectedNodeId(newBoundary.id);
    return newBoundary.id;
  }, [nodes, setNodes]);

  // Update node data
  const updateNodeData = useCallback((id: string, partialData: Partial<ServiceNodeData>) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              ...partialData
            }
          };
        }
        return node;
      })
    );
  }, [setNodes]);

  // Update node dimensions (both data and style)
  const updateNodeDimensions = useCallback((id: string, width: number, height: number) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              width: Math.round(width),
              height: Math.round(height)
            },
            style: {
              ...node.style,
              width: Math.round(width),
              height: Math.round(height)
            }
          };
        }
        return node;
      })
    );
  }, [setNodes]);

  // Layer Management: Bring node to front (highest z-index on canvas)
  const bringToFront = useCallback((id: string) => {
    setNodes((nds) => {
      const maxZ = nds.reduce((max, n) => Math.max(max, n.zIndex ?? 0), 0);
      return nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            zIndex: maxZ + 1,
            data: {
              ...node.data,
              customZIndex: true
            }
          };
        }
        return node;
      });
    });
  }, [setNodes]);

  // Layer Management: Send node to back (lowest z-index on canvas)
  const sendToBack = useCallback((id: string) => {
    setNodes((nds) => {
      const minZ = nds.reduce((min, n) => Math.min(min, n.zIndex ?? 0), 0);
      return nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            zIndex: minZ - 1,
            data: {
              ...node.data,
              customZIndex: true
            }
          };
        }
        return node;
      });
    });
  }, [setNodes]);

  // Layer Management: Bring forward (+1 z-index)
  const bringForward = useCallback((id: string) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            zIndex: (node.zIndex ?? 0) + 1,
            data: {
              ...node.data,
              customZIndex: true
            }
          };
        }
        return node;
      })
    );
  }, [setNodes]);

  // Layer Management: Send backward (-1 z-index)
  const sendBackward = useCallback((id: string) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            zIndex: (node.zIndex ?? 0) - 1,
            data: {
              ...node.data,
              customZIndex: true
            }
          };
        }
        return node;
      })
    );
  }, [setNodes]);

  // Layer Management: Set explicit numerical z-index
  const setNodeZIndex = useCallback((id: string, zIndex: number) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            zIndex,
            data: {
              ...node.data,
              customZIndex: true
            }
          };
        }
        return node;
      })
    );
  }, [setNodes]);

  // Update edge data
  const updateEdgeData = useCallback((id: string, partialData: Partial<ConnectionData>) => {
    const edge = edges.find(e => e.id === id);
    if (!edge) return;
    const data = { ...edge.data, ...partialData, ...(partialData.protocol ? { transport: interactionTransport(partialData.protocol) } : {}) } as ConnectionData;
    if (['protocol', 'action', 'transport', 'relationship', 'destinationPort'].some(key => key in partialData)) {
      const result = checkConnection(nodes.find(n => n.id === edge.source), nodes.find(n => n.id === edge.target), data);
      if (result.status === 'invalid' || (edge.data?.referenceAnnotation && data.relationship !== 'manages' && result.status !== 'valid')) { window.alert(result.reason); return; }
    }
    setEdges(previous => previous.map(e => e.id === id ? { ...e, data } : e));
  }, [edges, nodes, setEdges]);

  // Remove a specific node and its connected edges
  const removeNode = useCallback((id: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    if (selectedNodeId === id) {
      setSelectedNodeId(null);
    }
  }, [selectedNodeId, setNodes, setEdges]);

  // Duplicate a specific node with an offset position
  const duplicateNode = useCallback((id: string) => {
    const targetNode = nodes.find((n) => n.id === id);
    if (!targetNode) return;

    const serviceDef = SERVICE_MAP[targetNode.data.serviceId];
    const newId = uniqueId(`node-${targetNode.data.serviceId}`);
    const baseLabel = targetNode.data.label || serviceDef?.name || 'Node';

    const newNode: Node<ServiceNodeData> = {
      id: newId,
      type: 'serviceNode',
      position: {
        x: targetNode.position.x + 50,
        y: targetNode.position.y + 50
      },
      data: {
        ...targetNode.data,
        label: `${baseLabel} (Copy)`,
        health: 'healthy',
        failureReason: undefined,
        isSimulating: false
      }
    };

    setNodes((nds) => [...nds, newNode]);
    setSelectedNodeId(newId);
  }, [nodes, setNodes]);

  // Set health of a specific node
  const setNodeHealth = useCallback((id: string, health: NodeHealth, reason?: string) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              health,
              failureReason: health !== 'healthy' ? (reason || `Marked as ${health}`) : undefined
            }
          };
        }
        return node;
      })
    );
  }, [setNodes]);

  // Delete selected node or edge
  const deleteSelected = useCallback(() => {
    if (selectedNodeId) {
      setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
      setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
      setSelectedNodeId(null);
    } else if (selectedEdgeId) {
      setEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId));
      setSelectedEdgeId(null);
    }
  }, [selectedNodeId, selectedEdgeId, setNodes, setEdges]);

  // Clear / Reset canvas to baseline starter VPC and Public/Private subnets
  const clearCanvas = useCallback(() => {
    changeAnalyticsContext({ lab_id: undefined, reference_id: undefined, challenge_id: undefined });
    setActiveLabReference(null);
    setDraftViewport(null);
    setCanvasRevision(value => value + 1);
    setNodes(createStarterNodes());
    setEdges([]);
    setActiveFailures([]);
    setSimulationResult(null);
    setActiveStepIndex(null);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setShowNaclSideColumn(false);
  }, [setNodes, setEdges]);

  // Toggle failure of a single node
  const toggleNodeFailure = useCallback((id: string) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          const newHealth: NodeHealth = node.data.health === 'failed' ? 'healthy' : 'failed';
          return {
            ...node,
            data: {
              ...node.data,
              health: newHealth,
              failureReason: newHealth === 'failed' ? 'Deliberate Failure Injected' : undefined
            }
          };
        }
        return node;
      })
    );
  }, [setNodes]);

  // Fail an entire Availability Zone
  const failAvailabilityZone = useCallback((az: AvailabilityZone) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.data.az === az) {
          return {
            ...node,
            data: {
              ...node.data,
              health: 'failed',
              failureReason: `Zone Outage (${az} Hardware Failure)`
            }
          };
        }
        return node;
      })
    );
  }, [setNodes]);

  // Restore all nodes to healthy
  const restoreAllNodes = useCallback(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: {
          ...node.data,
          health: 'healthy',
          failureReason: undefined,
          isSimulating: false
        }
      }))
    );
    setEdges((eds) =>
      eds.map((edge) => ({
        ...edge,
        data: {
          ...(edge.data as ConnectionData),
          isSimulating: false,
          isFailing: false
        }
      }))
    );
    setActiveFailures([]);
    setSimulationResult(null);
    setActiveStepIndex(null);
    setIsPlaying(false);
  }, [setNodes, setEdges]);

  // Failure Simulation Engine: structured failures (the 14 failure types - NACL/SG/IAM/route/DNS/
  // network/NAT denial, AZ/instance/service/database/dependency/config unavailability, ALB target
  // failure) injected on top of the manual health mutators above. `effectiveNodes`/`effectiveEdges`
  // recompute whenever the canvas or the active failure set changes, merging each failure's real
  // propagated consequence (see engine/failure/propagation.ts) rather than a blanket downstream fail.
  const [activeFailures, setActiveFailures] = useState<Failure[]>([]);

  const injectFailure = useCallback((input: FailureInput): string => {
    const failure = createFailure(input);
    setActiveFailures((prev) => [...prev, failure]);
    return failure.id;
  }, []);

  const resolveFailure = useCallback((failureId: string) => {
    setActiveFailures((prev) => prev.filter((f) => f.id !== failureId));
  }, []);

  const clearAllFailures = useCallback(() => {
    setActiveFailures([]);
  }, []);

  const effectiveArchitectureState = useMemo(
    () => computeEffectiveArchitectureState(nodes, edges, activeFailures),
    [nodes, edges, activeFailures]
  );
  const { nodes: effectiveNodes, edges: effectiveEdges, impacts: failureImpacts } = effectiveArchitectureState;

  const openLabReference = useCallback((reference: LabReference, run = false) => {
    const snapshot = structuredClone(reference);
    const known = COURSE_LABS.some(lab => lab.references.some(ref => ref.id === snapshot.id));
    changeAnalyticsContext({ page: 'lab', lab_id: known ? snapshot.id : 'custom', reference_id: undefined });
    track('lab_opened');
    const initialResult = run ? runLabReference(snapshot) : null;
    if (initialResult) track(snapshot.configurationChecks ? 'configuration_checked' : 'simulation_run', { success: initialResult.success });
    setActiveLabReference(snapshot);
    setDraftName(snapshot.title.slice(0, 120));
    setDraftViewport(null);
    setCanvasRevision(value => value + 1);
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    setActiveFailures([]);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setShowNaclSideColumn(false);
    setScenario(snapshot.scenario);
    setSimulationResult(initialResult);
    setActiveStepIndex(run ? 0 : null);
    setHoveredStepIndex(null);
    setHighlightTaskFlow(run);
    setIsPlaying(run);
    setAppMode(run ? 'simulate' : 'design');
  }, [setNodes, setEdges]);

  // Load a reference architecture template
  const loadTemplate = useCallback((templateId: string, reference?: ReferenceArchitecture) => {
    const template = structuredClone(reference ?? REFERENCE_ARCHITECTURES.find(t => t.id === templateId));
    if (!template) return;
    changeAnalyticsContext({ page: 'lab', lab_id: undefined, reference_id: REFERENCE_ARCHITECTURES.some(ref => ref.id === template.id) ? template.id : 'custom' });
    track('reference_opened');
    setDraftName(template.name.slice(0, 120));
    setIsPlaying(false);
    setHoveredStepIndex(null);

    setActiveLabReference(null);
    setDraftViewport(null);
    setCanvasRevision(value => value + 1);
    setNodes(template.nodes);
    setEdges(template.edges);
    setActiveFailures([]);
    setSimulationResult(null);
    setActiveStepIndex(null);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);

    // Auto-align scenario startNodeId with an ingress service in the loaded template
    const ingressNode = resolveRequestStart(template.nodes);

    if (template.scenario) setScenario(template.scenario);
    else if (ingressNode) {
      setScenario(prev => ({
        ...prev,
        startNodeId: ingressNode.id
      }));
    }

    // Auto-open the NACL side column for ANY template that ships a configured custom NACL -
    // not just one hardcoded template id. A student's own saved/imported diagram, or a future
    // template, gets the same guided-teaching treatment as soon as it actually has a customNacl
    // to show, matching the same `customNacl` presence check `hasCustomNacl` uses for the
    // canvas's own manual "Open NACL Panel" button.
    const templateHasCustomNacl = template.nodes.some(n => Boolean((n.data as any)?.customNacl));
    if (templateHasCustomNacl) {
      setShowNaclSideColumn(true);
    }
  }, [setNodes, setEdges]);

  // Run Request Simulation - against `effectiveNodes`/`effectiveEdges`, i.e. the canvas with every
  // active structured `Failure`'s real propagated consequence merged in (see
  // engine/failure/effectiveState.ts), not just the manually-toggled `health` field.
  const evaluateCurrentScenario = useCallback(() => activeLabReference
    ? runLabReference({ ...activeLabReference, nodes: effectiveNodes, edges: effectiveEdges, scenario })
    : runSimulation(effectiveNodes, effectiveEdges, scenario),
  [activeLabReference, effectiveNodes, effectiveEdges, scenario]);

  const runScenario = useCallback(() => {
    const result = evaluateCurrentScenario();
    track(activeLabReference?.configurationChecks ? 'configuration_checked' : 'simulation_run', { page: 'lab', success: result.success });
    const scaled = observeAlbRequests(effectiveNodes, effectiveEdges, result);
    if (scaled.notes.length) {
      result.summary += ` Scaling: ${scaled.notes.join(' ')}`;
      setNodes(scaled.nodes.map(next => {
        const original = nodes.find(n => n.id === next.id);
        return original ? { ...next, data: { ...next.data, health: original.data.health } } : next;
      }));
      // Preserve base edge state; temporary failure overrides must not be saved.
      setEdges(scaled.edges.map(next => edges.find(e => e.id === next.id) ?? next));
    }
    setSimulationResult(result);
    if (result.serviceStates && Object.keys(result.serviceStates).length) setNodes(previous => previous.map(node => result.serviceStates?.[node.id]
      ? { ...node, data: { ...node.data, customConfig: { ...node.data.customConfig, serviceRuntime: result.serviceStates[node.id] } } } : node));
    setActiveStepIndex(0);
    setHoveredStepIndex(null);
    setHighlightTaskFlow(true);
    setIsPlaying(true);
    setAppMode('simulate');
  }, [evaluateCurrentScenario, effectiveNodes, effectiveEdges, nodes, edges, activeLabReference]);

  const runFromNode = useCallback((nodeId: string) => {
    const result = runSimulation(effectiveNodes, effectiveEdges, { ...scenario, startNodeId: nodeId });
    track('simulation_run', { page: 'lab', success: result.success });
    setSimulationResult(result);
    setActiveStepIndex(0);
    setHoveredStepIndex(null);
    setHighlightTaskFlow(true);
    setIsPlaying(true);
  }, [effectiveNodes, effectiveEdges, scenario]);

  // Toggle Task Flow lines on/off with smart auto-simulation
  const toggleTaskFlow = useCallback(() => {
    setHighlightTaskFlow((prev) => {
      const next = !prev;
      if (next && !simulationResult && nodes.length > 0) {
        const result = evaluateCurrentScenario();
    track(activeLabReference?.configurationChecks ? 'configuration_checked' : 'simulation_run', { page: 'lab', success: result.success });
        setSimulationResult(result);
    if (result.serviceStates && Object.keys(result.serviceStates).length) setNodes(previous => previous.map(node => result.serviceStates?.[node.id]
      ? { ...node, data: { ...node.data, customConfig: { ...node.data.customConfig, serviceRuntime: result.serviceStates[node.id] } } } : node));
        setActiveStepIndex(null);
      }
      return next;
    });
  }, [nodes, evaluateCurrentScenario, simulationResult]);

  // Explain the recorded run, including service/return-path failures and cache short circuits.
  const requestTrace = useMemo<RequestTrace | null>(() =>
    simulationResult ? traceFromSimulation(simulationResult) : null, [simulationResult]);

  const resetSimulation = useCallback(() => {
    setIsPlaying(false);
    setActiveStepIndex(null);
    setHoveredStepIndex(null);
    // Clear simulation pulses from nodes & edges
    setNodes(nds => resetAsg(nds, []).nodes.map(n => ({ ...n, data: { ...n.data, isSimulating: false, simulationStatus: 'idle' } })));
    setEdges(eds => resetAsg(nodes, eds).edges.map(e => ({
      ...e,
      data: {
        ...(e.data as ConnectionData),
        isSimulating: false,
        isFailing: false,
        flowStatus: (e.data as any)?.stepNumber ? 'completed' : 'idle',
        flowStepNumber: (e.data as any)?.stepNumber,
        flowStepIndex: undefined,
        flowAction: undefined,
        flowLatency: undefined,
        flowExplanation: undefined,
        flowStatusCode: undefined
      }
    })));
  }, [setNodes, setEdges, nodes]);

  // Step Forward in simulation
  const stepForward = useCallback(() => {
    if (!simulationResult) return;
    setActiveStepIndex((prev) => {
      const next = prev === null ? 0 : prev + 1;
      if (next >= simulationResult.steps.length) {
        setIsPlaying(false);
        return prev;
      }
      return next;
    });
  }, [simulationResult]);

  // Step Backward in simulation
  const stepBackward = useCallback(() => {
    if (!simulationResult) return;
    setActiveStepIndex((prev) => {
      if (prev === null || prev <= 0) return 0;
      return prev - 1;
    });
  }, [simulationResult]);

  // Effect: Calculate and apply Task Flow highlighting to lines & nodes
  useEffect(() => {
    // If highlightTaskFlow is OFF:
    if (!highlightTaskFlow) {
      setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, isSimulating: false, simulationStatus: 'idle' } })));
      setEdges(eds => eds.map(e => ({
        ...e,
        data: {
          ...(e.data as ConnectionData),
          isSimulating: false,
          isFailing: false,
          flowStatus: 'idle',
          flowStepNumber: (e.data as any)?.stepNumber,
          flowStepIndex: undefined,
          flowAction: undefined,
          flowLatency: undefined,
          flowExplanation: undefined,
          flowStatusCode: undefined
        }
      })));
      return;
    }

    // Determine target step for current focus (hovered step takes priority over active step for interactive scrubbing)
    const focusStepIndex = hoveredStepIndex !== null ? hoveredStepIndex : activeStepIndex;

    // Case 1: Active simulation result exists
    if (simulationResult && simulationResult.steps.length > 0) {
      const steps = simulationResult.steps;
      const currentStep = focusStepIndex !== null ? steps[focusStepIndex] : null;

      // Update node states along the task flow
      setNodes(nds =>
        nds.map(node => {
          const isCurrentTarget = currentStep ? node.id === currentStep.targetNodeId : false;
          const isCurrentSource = currentStep ? node.id === currentStep.sourceNodeId : false;
          const hasParticipated = steps.some((s, idx) =>
            (focusStepIndex === null || idx <= focusStepIndex) &&
            (s.targetNodeId === node.id || s.sourceNodeId === node.id)
          );
          return {
            ...node,
            data: {
              ...node.data,
              isSimulating: isCurrentTarget || isCurrentSource,
              simulationStatus: (isCurrentTarget || isCurrentSource)
                ? (currentStep?.status === 'failed' ? 'failed' : 'active')
                : hasParticipated
                ? 'success'
                : 'idle'
            }
          };
        })
      );

      // Update edges: Highlight the exact path representing the task flow
      setEdges(eds =>
        eds.map(edge => {
          // Find all steps that traverse this edge (either source->target or target->source)
          const matchingSteps: { step: SimulationStep; index: number }[] = [];
          steps.forEach((s, idx) => {
            const isMatch =
              (edge.source === s.sourceNodeId && edge.target === s.targetNodeId) ||
              (edge.source === s.targetNodeId && edge.target === s.sourceNodeId);
            if (isMatch) {
              matchingSteps.push({ step: s, index: idx });
            }
          });

          // If edge does not participate in this task flow, dim it
          if (matchingSteps.length === 0) {
            return {
              ...edge,
              data: {
                ...(edge.data as ConnectionData),
                isSimulating: false,
                isFailing: false,
                flowStatus: 'dimmed',
                flowStepNumber: (edge.data as any)?.stepNumber,
                flowStepIndex: undefined,
                flowAction: undefined,
                flowLatency: undefined,
                flowExplanation: undefined,
                flowStatusCode: undefined
              }
            };
          }

          // Edge is part of the task flow!
          if (focusStepIndex !== null) {
            // Check if this edge is the active step being processed
            const activeMatch = matchingSteps.find(m => m.index === focusStepIndex);
            if (activeMatch) {
              const isFail = activeMatch.step.status === 'failed';
              return {
                ...edge,
                data: {
                  ...(edge.data as ConnectionData),
                  isSimulating: true,
                  isFailing: isFail,
                  flowStatus: isFail ? 'failed' : 'active',
                  flowStepNumber: activeMatch.step.stepNumber,
                  flowStepIndex: activeMatch.index,
                  flowAction: activeMatch.step.action,
                  flowLatency: activeMatch.step.latencyMs,
                  flowExplanation: activeMatch.step.explanation,
                  flowStatusCode: activeMatch.step.details?.statusCode
                }
              };
            }

            // Check if this edge was completed prior to current focus
            const completedMatches = matchingSteps.filter(m => m.index < focusStepIndex);
            if (completedMatches.length > 0) {
              const lastCompleted = completedMatches[completedMatches.length - 1];
              const isFail = lastCompleted.step.status === 'failed';
              return {
                ...edge,
                data: {
                  ...(edge.data as ConnectionData),
                  isSimulating: false,
                  isFailing: isFail,
                  flowStatus: isFail ? 'failed' : 'completed',
                  flowStepNumber: lastCompleted.step.stepNumber,
                  flowStepIndex: lastCompleted.index,
                  flowAction: lastCompleted.step.action,
                  flowLatency: lastCompleted.step.latencyMs,
                  flowExplanation: lastCompleted.step.explanation,
                  flowStatusCode: lastCompleted.step.details?.statusCode
                }
              };
            }

            // Otherwise, this step is upcoming/pending in the task flow
            const pendingMatch = matchingSteps[0];
            return {
              ...edge,
              data: {
                ...(edge.data as ConnectionData),
                isSimulating: false,
                isFailing: false,
                flowStatus: 'pending',
                flowStepNumber: pendingMatch.step.stepNumber,
                flowStepIndex: pendingMatch.index,
                flowAction: pendingMatch.step.action,
                flowLatency: pendingMatch.step.latencyMs,
                flowExplanation: pendingMatch.step.explanation,
                flowStatusCode: pendingMatch.step.details?.statusCode
              }
            };
          }

          // When focusStepIndex is null (showing complete task flow at a glance)
          const primaryMatch = matchingSteps[0];
          const anyFailed = matchingSteps.some(m => m.step.status === 'failed');
          return {
            ...edge,
            data: {
              ...(edge.data as ConnectionData),
              isSimulating: false,
              isFailing: anyFailed,
              flowStatus: anyFailed ? 'failed' : 'completed',
              flowStepNumber: primaryMatch.step.stepNumber,
              flowStepIndex: primaryMatch.index,
              flowAction: primaryMatch.step.action,
              flowLatency: primaryMatch.step.latencyMs,
              flowExplanation: primaryMatch.step.explanation,
              flowStatusCode: primaryMatch.step.details?.statusCode
            }
          };
        })
      );
      return;
    }

    // Case 2: No active simulation result yet, but template edges might have pre-configured stepNumber
    setEdges(eds =>
      eds.map(edge => {
        const stepNum = (edge.data as any)?.stepNumber;
        if (stepNum) {
          return {
            ...edge,
            data: {
              ...(edge.data as ConnectionData),
              isSimulating: false,
              isFailing: false,
              flowStatus: 'completed',
              flowStepNumber: stepNum
            }
          };
        }
        return {
          ...edge,
          data: {
            ...(edge.data as ConnectionData),
            isSimulating: false,
            isFailing: false,
            flowStatus: 'idle',
            flowStepNumber: undefined
          }
        };
      })
    );
  }, [highlightTaskFlow, activeStepIndex, hoveredStepIndex, simulationResult, setNodes, setEdges]);

  // Effect: Auto-advance simulation when isPlaying is true
  useEffect(() => {
    if (!isPlaying || !simulationResult || activeStepIndex === null) return;

    const delay = Math.max(400, 1200 / playbackSpeed);
    const timer = setTimeout(() => {
      if (activeStepIndex < simulationResult.steps.length - 1) {
        setActiveStepIndex(prev => (prev !== null ? prev + 1 : 0));
      } else {
        setIsPlaying(false);
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [isPlaying, activeStepIndex, simulationResult, playbackSpeed]);

  // Challenge test
  const runChallengeTest = useCallback(() => {
    if (!activeChallenge) return;
    const res = activeChallenge.evaluationCheck(nodes, edges, analysis, {
      simulationResult,
      validationFindings,
      architecturalFindings
    });
    track('challenge_evaluated', { page: 'lab', passed: res.passed });
    setChallengeResult(res);
  }, [activeChallenge, nodes, edges, analysis, simulationResult, validationFindings, architecturalFindings]);

  const exportDraft = () => serializeDraft({ draftName, nodes, edges, scenario, simulationResult,
    activeFailures, activeLabReference, activeChallengeId: activeChallenge?.id ?? null,
    challengeResult, appMode, selectedNodeId, selectedEdgeId, activeStepIndex,
    playbackSpeed, highlightTaskFlow, showNaclSideColumn, viewport: draftViewport });
  const importDraft = (text: string) => {
    const draft = parseDraft(text);
    const challenge = draft.activeChallengeId ? STUDENT_CHALLENGES.find(c => c.id === draft.activeChallengeId) : null;
    if (draft.activeChallengeId && !challenge) throw new Error('This draft references a challenge unavailable in this version.');
    const knownLab = COURSE_LABS.some(lab => lab.references.some(ref => ref.id === draft.activeLabReference?.id));
    changeAnalyticsContext({ lab_id: draft.activeLabReference ? knownLab ? draft.activeLabReference.id : 'custom' : undefined, reference_id: undefined });
    setDraftName(draft.draftName ?? 'Untitled draft');
    setIsPlaying(false); setHoveredStepIndex(null);
    setNodes(draft.nodes); setEdges(draft.edges); setScenario(draft.scenario);
    setSimulationResult(draft.simulationResult); setActiveFailures(draft.activeFailures);
    setActiveLabReference(draft.activeLabReference); setActiveChallenge(challenge ?? null);
    setChallengeResult(draft.challengeResult); setAppMode(draft.appMode);
    setSelectedNodeId(draft.selectedNodeId); setSelectedEdgeId(draft.selectedEdgeId);
    setActiveStepIndex(draft.activeStepIndex); setPlaybackSpeed(draft.playbackSpeed);
    setHighlightTaskFlow(draft.highlightTaskFlow); setShowNaclSideColumn(draft.showNaclSideColumn);
    setDraftViewport(draft.viewport); setCanvasRevision(value => value + 1);
  };

  return (
    <ArchitectureContext.Provider
      value={{
        draftName, setDraftName, exportDraft, importDraft, draftViewport, setDraftViewport,
        nodes,
        setNodes,
        onNodesChange,
        edges,
        setEdges,
        onEdgesChange,
        onConnect,
        onReconnect,

        appMode,
        setAppMode,

        selectedNode,
        setSelectedNodeId,
        selectedEdge,
        setSelectedEdgeId,

        addServiceNode,
        addBoundaryNode,
        updateNodeData,
        updateEdgeData,
        updateNodeDimensions,
        bringToFront,
        sendToBack,
        bringForward,
        sendBackward,
        setNodeZIndex,
        removeNode,
        duplicateNode,
        setNodeHealth,
        deleteSelected,
        clearCanvas,

        toggleNodeFailure,
        failAvailabilityZone,
        restoreAllNodes,

        activeFailures,
        injectFailure,
        resolveFailure,
        clearAllFailures,
        effectiveNodes,
        effectiveEdges,
        failureImpacts,

        scenario,
        setScenario,
        simulationResult,
        requestTrace,
        activeStepIndex,
        setActiveStepIndex,
        runScenario,
        runFromNode,
        resetSimulation,
        stepForward,
        stepBackward,
        isPlaying,
        setIsPlaying,
        playbackSpeed,
        setPlaybackSpeed,

        highlightTaskFlow,
        setHighlightTaskFlow,
        toggleTaskFlow,
        hoveredStepIndex,
        setHoveredStepIndex,

        analysis,
        recalculateAnalysis,
        validationFindings,
        architecturalFindings,

        loadTemplate,
        openLabReference,
        activeLabReference,
        canvasRevision,
        activeChallenge,
        setActiveChallenge,
        challengeResult,
        runChallengeTest,

        showNaclSideColumn,
        setShowNaclSideColumn,
        hasCustomNacl,
        hasMissingReturnNacl,

        costReport
      }}
    >
      {children}
    </ArchitectureContext.Provider>
  );
};

export const useArchitecture = () => {
  const context = useContext(ArchitectureContext);
  if (!context) {
    throw new Error('useArchitecture must be used within an ArchitectureProvider');
  }
  return context;
};
