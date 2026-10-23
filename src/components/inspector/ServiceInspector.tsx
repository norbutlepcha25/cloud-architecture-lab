import { ServiceOperationPanel } from './ServiceOperationPanel.tsx';
import { SERVICE_OPERATIONS } from '../../engine/serviceOperations/definitions.ts';
import { XrayPanel } from './XrayPanel.tsx';
import { LambdaConfigurationPanel } from './LambdaConfigurationPanel.tsx';
import { DatabaseConfigurationPanel } from './DatabaseConfigurationPanel.tsx';
import { S3ConfigurationPanel } from './S3ConfigurationPanel.tsx';
import { Ec2ConfigurationPanel } from './Ec2ConfigurationPanel.tsx';
import { EksConfigurationPanel } from './EksConfigurationPanel.tsx';
import { InspectorAccordion } from './InspectorAccordion.tsx';
import { inspectorProfile } from './inspectorProfile.ts';
import { COMPASS_POINTS, compassHandleId } from '../../utils/compassHandles.ts';
import { eksComponent } from '../../data/eksComponents.ts';
import { EksComponentPanel } from './EksComponentPanel.tsx';
import { AsgPanel } from './AsgPanel.tsx';
import { checkConnection, cicdRelationship, connectionProtocols, connectionOperations } from '../../engine/architecture/connectionContracts.ts';
import { ManagedServicePanel } from './ManagedServicePanel.tsx';
import { Ec2IamRolePanel, ROLE_PANEL_SERVICE_IDS } from './Ec2IamRolePanel.tsx';
import { RouteTablePanel } from './RouteTablePanel.tsx';
import { InternetGatewayPanel } from './InternetGatewayPanel.tsx';
import { CodePipelinePanel, CodeCommitPanel, DeveloperPanel, GitProviderPanel, EventRulePanel, SignerPanel, AmplifyBranchPanel, CodeBuildPanel, CodeDeployPanel, CicdRolePanel, CICD_ROLE_SERVICE_IDS } from './CicdPanels.tsx';
import { createTeachingNacl } from '../../engine/network/naclPreset.ts';
import { NetworkIdentityPanel } from './NetworkIdentityPanel.tsx';
import { relationshipKind, type RelationshipKind } from '../../engine/architecture/relationships.ts';
import { EndpointConfigurationPanel } from './EndpointConfigurationPanel.tsx';
import { supportsSecurityGroupAttachment } from '../../engine/network/securityGroupAttachment.ts';
import React, { useEffect, useState } from 'react';
import { LabConfigurationPanel } from './LabConfigurationPanel.tsx';
import { ServiceBehaviorExplorer, BEHAVIOR_EXPLORER_SERVICES } from '../learning/ServiceBehaviorExplorer.tsx';
import { EksExplorer } from '../eks/EksExplorer.tsx';
import { EcsExplorer } from '../ecs/EcsExplorer.tsx';
import { WalkthroughExplorer, WALKTHROUGH_SERVICES } from '../learning/WalkthroughExplorer.tsx';
import { EcsConfigurationPanel } from './EcsConfigurationPanel.tsx';
import { useArchitecture } from '../../context/ArchitectureContext.tsx';
import { SERVICE_MAP } from '../../data/serviceCatalog.ts';
import { AvailabilityZone, SubnetType, ProtocolType } from '../../types/index.ts';
import { AwsServiceIcon } from '../icons/AwsServiceIcons.tsx';
import { findContainingSubnetBoundary } from '../../engine/layout/containment.ts';
import {
  X,
  Trash2,
  CheckCircle2,
  XCircle,
  Activity,
  ArrowRight,
  BookOpen,
  Flag,
  Cloud,
  Shield,
  Server,
  Copy,
  Layers,
  ChevronsUp,
  ChevronUp,
  ChevronDown,
  ChevronsDown,
  Maximize2,
  Minimize2,
  Route,
  AlertTriangle,
  Plus,
  DollarSign,
  Database,
  Info
} from 'lucide-react';
import { VpcGroupIcon, PublicSubnetGroupIcon, PrivateSubnetGroupIcon } from '../icons/AwsGroupIcons.tsx';
import { calculateNodeCost } from '../../engine/cost/costCalculator.ts';

export const ServiceInspector: React.FC = () => {
  const {
    selectedNode,
    activeLabReference,
    setSelectedNodeId,
    selectedEdge,
    setSelectedEdgeId,
    updateNodeData,
    updateEdgeData,
    onReconnect,
    updateNodeDimensions,
    bringToFront,
    sendToBack,
    bringForward,
    sendBackward,
    setNodeZIndex,
    deleteSelected,
    duplicateNode,
    toggleNodeFailure,
    addBoundaryNode,
    nodes,
    edges,
    runFromNode,
    scenario,
    simulationResult,
    activeStepIndex,
    setActiveStepIndex,
    hasCustomNacl,
    setShowNaclSideColumn
  } = useArchitecture();

  const [activeTab, setActiveTab] = useState<'overview' | 'config'>('overview');
  const [showAttachSgMenu, setShowAttachSgMenu] = useState(false);
  const [serviceExplorerNodeId, setServiceExplorerNodeId] = useState<string | null>(null);

  useEffect(() => { setServiceExplorerNodeId(null); }, [selectedNode?.id]);

  if (!selectedNode && !selectedEdge) {
    return null;
  }

  // Handle Edge Inspection
  if (selectedEdge && !selectedNode) {
    const sourceNode = nodes.find(n => n.id === selectedEdge.source);
    const targetNode = nodes.find(n => n.id === selectedEdge.target);
    const cicd = cicdRelationship(sourceNode, targetNode);
    const edgeData = selectedEdge.data || { protocol: 'HTTP', interactionType: 'synchronous', timeoutMs: 2500 };
    const endpointSide = (end: 'source' | 'target') => {
      return <label className="block text-xs font-semibold text-slate-700">{end === 'source' ? 'Source side' : 'Target side'}
        <select aria-label={end === 'source' ? 'Source side' : 'Target side'} className="block border rounded p-2 w-full mt-1" value={compassHandleId(selectedEdge[`${end}Handle`], end)}
          onChange={e => onReconnect(selectedEdge, { source: selectedEdge.source, target: selectedEdge.target, sourceHandle: selectedEdge.sourceHandle ?? null, targetHandle: selectedEdge.targetHandle ?? null, [`${end}Handle`]: e.target.value })}>
          {COMPASS_POINTS.map(point => <option key={point.id} value={point.id}>{point.label}</option>)}
        </select>
      </label>;
    };

    return (
      <aside className="w-80 bg-white border-l border-slate-200 flex flex-col h-full flex-shrink-0 z-20 shadow-md">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Connection Inspector
            </h3>
            <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5 mt-0.5">
              <span>{sourceNode?.data.label || 'Source'}</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <span>{targetNode?.data.label || 'Target'}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {hasCustomNacl && (
              <button
                onClick={() => setShowNaclSideColumn(true)}
                className="text-[10px] font-bold px-2 py-1 rounded bg-circuit-50 hover:bg-circuit-100 text-circuit-700 border border-circuit-200 flex items-center gap-1 transition-colors cursor-pointer"
                title="Open NACL Details & Rules"
              >
                <Shield className="w-3 h-3 text-circuit-600" />
                <span>NACL Rules</span>
              </button>
            )}
            <button
              onClick={() => setSelectedEdgeId(null)}
              className="p-1 rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Edge Body */}
        <div className="p-4 space-y-4 flex-1 overflow-y-auto custom-scrollbar">
          <InspectorAccordion key={selectedEdge.id} title="Connection settings">
          {/* Flow of Task Live Status */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                <Route className="w-3.5 h-3.5 text-circuit-600" />
                <span>Flow of Task</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                (selectedEdge.data as any)?.flowStatus === 'active'
                  ? 'bg-circuit-100 text-circuit-800 ring-2 ring-circuit-300'
                  : (selectedEdge.data as any)?.flowStatus === 'failed'
                  ? 'bg-rose-100 text-rose-800 ring-2 ring-rose-300'
                  : (selectedEdge.data as any)?.flowStatus === 'completed'
                  ? 'bg-emerald-100 text-emerald-800'
                  : (selectedEdge.data as any)?.flowStatus === 'pending'
                  ? 'bg-circuit-100 text-circuit-800'
                  : 'bg-slate-100 text-slate-600'
              }`}>
                {((selectedEdge.data as any)?.flowStatus || 'idle').toUpperCase()}
              </span>
            </div>

            {(selectedEdge.data as any)?.flowStepNumber && (
              <div className="text-xs text-slate-700 flex items-center justify-between border-t border-slate-200/60 pt-2">
                <span className="text-slate-500">Flow Position:</span>
                <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                  Step #{(selectedEdge.data as any).flowStepNumber}
                </span>
              </div>
            )}

            {(selectedEdge.data as any)?.flowAction && (
              <div className="text-xs text-slate-700 space-y-1">
                <span className="text-slate-500 text-[11px] block">Task Action:</span>
                <div className="font-medium text-slate-900 bg-white p-2 rounded-lg border border-slate-200 text-xs">
                  {(selectedEdge.data as any).flowAction}
                </div>
              </div>
            )}

            {(selectedEdge.data as any)?.flowLatency !== undefined && (
              <div className="text-xs text-slate-700 flex items-center justify-between">
                <span className="text-slate-500">Traversed Latency:</span>
                <span className="font-mono font-bold text-slate-900">
                  +{(selectedEdge.data as any).flowLatency}ms
                </span>
              </div>
            )}

            {(selectedEdge.data as any)?.flowExplanation && (
              <p className="text-[11px] text-slate-600 leading-relaxed bg-white p-2 rounded-lg border border-slate-200">
                {(selectedEdge.data as any).flowExplanation}
              </p>
            )}

            {(selectedEdge.data as any)?.flowStepIndex !== undefined && (
              <button
                onClick={() => setActiveStepIndex((selectedEdge.data as any).flowStepIndex)}
                className="w-full mt-1.5 py-1.5 px-3 rounded-lg bg-circuit-600 hover:bg-circuit-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Jump to This Step on Timeline</span>
              </button>
            )}
          </div>

          <div>
            <label htmlFor="connection-line-style" className="block text-xs font-semibold text-slate-700 mb-1">
              Connection line style
            </label>
            <select
              id="connection-line-style"
              value={selectedEdge.data?.lineStyle === 'orthogonal' ? 'straight' : selectedEdge.data?.lineStyle ?? 'straight'}
              onChange={event => updateEdgeData(selectedEdge.id, { lineStyle: event.target.value as 'curved' | 'straight' })}
              className="w-full px-3 py-2 text-xs rounded-lg bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-circuit-600"
            >
              <option value="curved">Curved</option>
              <option value="straight">Straight</option>
            </select>
          </div>

          {/* Step Sequence Number */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Sequence Step Number (Simulation Priority)
            </label>
            <input
              type="number"
              min="1"
              value={(selectedEdge.data as any)?.stepNumber || ''}
              onChange={(e) => updateEdgeData(selectedEdge.id, { stepNumber: e.target.value ? Number(e.target.value) : undefined } as any)}
              placeholder="Optional: 1, 2, 3… (lowest first)"
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-circuit-600 font-mono"
            />
          </div>

          {/* Protocol Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Protocol / Interaction
            </label>
            <select
              value={edgeData.protocol}
              onChange={(e) => updateEdgeData(selectedEdge.id, { protocol: e.target.value as ProtocolType })}
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-circuit-600 font-mono"
            >
              {!(!cicd && ['manages', 'authorization'].includes(relationshipKind(selectedEdge.data)) ? [selectedEdge.data?.referenceAnnotation ? edgeData.protocol : 'Event'] : connectionProtocols(sourceNode, targetNode)).includes(edgeData.protocol) && <option value={edgeData.protocol}>Unsupported: {edgeData.protocol}</option>}
              {(!cicd && ['manages', 'authorization'].includes(relationshipKind(selectedEdge.data)) ? [selectedEdge.data?.referenceAnnotation ? edgeData.protocol : 'Event'] : connectionProtocols(sourceNode, targetNode)).map(protocol => <option key={protocol} value={protocol}>{protocol}</option>)}
            </select>
          </div>

          <p className="text-xs text-amber-700" role="status">{checkConnection(sourceNode, targetNode, selectedEdge.data).reason}</p>
          <p className="text-xs text-slate-500">Transport: {['HTTP', 'HTTPS', 'TCP'].includes(edgeData.protocol) ? edgeData.protocol : edgeData.protocol === 'DNS' ? 'UDP' : ['SQL', 'gRPC'].includes(edgeData.protocol) ? 'TCP' : 'HTTPS'}</p>
          <div className="grid grid-cols-2 gap-2">{endpointSide('source')}{endpointSide('target')}</div>
          <p className="text-xs text-slate-500">Drag either end of the selected edge onto another connection dot, or choose its side here. Export saves the changes.</p>
          {!cicd && <>
          <label className="block text-xs">Destination port (optional)
            <input aria-label="Destination port" type="number" min={1} max={65535} step={1}
              className="block border rounded p-2 w-full" value={selectedEdge.data?.destinationPort ?? ''}
              onChange={e => updateEdgeData(selectedEdge.id, { destinationPort: e.target.value === '' ? undefined : Number(e.target.value) })} />
            <span className="text-slate-500">Checks this port against inbound firewall rules. Blank retains the protocol abstraction.</span>
          </label>
          <label className="block text-xs">API operation
            <select className="block border rounded p-2 w-full" value={selectedEdge.data?.action ?? ''} onChange={e => updateEdgeData(selectedEdge.id, { action: e.target.value || undefined })}>
              <option value="">Default service operation</option>
              {connectionOperations(targetNode).map(action => <option key={action}>{action}</option>)}
            </select>
          </label>
          </>}
          <label className="block text-xs font-semibold text-slate-700">
            Connection meaning
            <select className="block w-full border rounded p-2 mt-1" value={relationshipKind(selectedEdge.data)}
              onChange={e => updateEdgeData(selectedEdge.id, { relationship: e.target.value as RelationshipKind })}>
              <option value="request">Request path</option>
              <option value="dependency">Dependency call</option>
              <option value="authorization">Authorization illustration</option>
              <option value="manages">Manages resource</option>
              <option value="route-association">Route association</option>
              <option value="target-registration">Target registration</option>
            </select>
            <span className="block font-normal text-slate-500 mt-1">{cicd ? 'CI/CD relationships configure the pipeline workflow. Run the pipeline to evaluate its actions, permissions and dependencies.' : 'Structural relationships do not carry requests. Management lines illustrate relationships; they do not execute Kubernetes operations or configure scaling policies.'}</span>
          </label>

          {/* Coupling Mode */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Coupling Mode
            </label>
            <select
              value={edgeData.interactionType}
              onChange={(e) => updateEdgeData(selectedEdge.id, { interactionType: e.target.value as any })}
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-circuit-600"
            >
              <option value="synchronous">Synchronous (Blocking - Caller waits)</option>
              <option value="asynchronous">Asynchronous (Decoupled buffer)</option>
              <option value="cached">Cached (Fast local edge lookup)</option>
            </select>
          </div>

          {/* Educational Callout */}
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-circuit-600" />
              Architectural Concept
            </div>
            <p className="leading-relaxed text-[11px]">
              {edgeData.interactionType === 'synchronous'
                ? 'Synchronous connections mean failures or high latency in downstream services immediately block the upstream caller.'
                : 'Asynchronous decoupling with message queues acts as a shock absorber, protecting downstream databases from thundering herds.'}
            </p>
          </div>
          </InspectorAccordion>
        </div>

        {/* Delete Edge Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50">
          <button
            onClick={deleteSelected}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-100 bg-rose-50 border border-rose-200 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Connection
          </button>
        </div>
      </aside>
    );
  }

  // Handle Node Inspection
  if (!selectedNode) return null;
  if (eksComponent(selectedNode)) return <EksComponentPanel node={selectedNode} onLabel={label => updateNodeData(selectedNode.id, { label })} onClose={() => setSelectedNodeId(null)} />;

  // Handle Boundary Node Inspection (VPC, Subnet, AZ, Security Group, Region, etc.)
  if (selectedNode.type === 'boundaryNode' || !selectedNode.data?.serviceId) {
    const bData = (selectedNode.data || {}) as any;
    const boundaryType: string = bData.boundaryType || 'vpc';
    const label: string = bData.label || 'Network Boundary';
    const cidr: string = bData.cidr || '';
    const cidrError: string = bData.cidrError || '';
    const width: number = bData.width || (selectedNode.style as any)?.width || 400;
    const height: number = bData.height || (selectedNode.style as any)?.height || 300;

    const boundaryDefs: Record<string, {
      title: string;
      color: string;
      bgColor: string;
      badgeBg: string;
      icon: React.ReactNode;
      scope: string;
      defaultCidr?: string;
      teachingNotes: string[];
    }> = {
      region: {
        title: 'AWS Region',
        color: '#0073BB',
        bgColor: '#EEF6FC',
        badgeBg: '#0073BB',
        icon: <Flag className="w-3.5 h-3.5 text-white" />,
        scope: 'Geographic Area (Multiple AZs)',
        teachingNotes: [
          'Separate geographic area with isolated power, cooling, and water facilities.',
          'Each Region contains at least 3 distinct Availability Zones connected via ultra-low-latency fiber.',
          'Compliance & Data Residency: Keeps data inside national or regulatory jurisdictions.'
        ]
      },
      vpc: {
        title: 'Virtual Private Cloud (VPC)',
        color: '#8C4FFF',
        bgColor: '#F4EEFF',
        badgeBg: '#8C4FFF',
        icon: <VpcGroupIcon size={32} className="rounded-lg" />,
        scope: 'Regional Virtual Network',
        defaultCidr: '10.0.0.0/16',
        teachingNotes: [
          'Logically isolated network dedicated to your AWS account within a single Region.',
          'Spans all Availability Zones in the Region automatically.',
          'Control network topology with custom IP CIDR blocks (RFC 1918), route tables, and network ACLs.'
        ]
      },
      public_subnet: {
        title: 'Public Subnet',
        color: '#7AA116',
        bgColor: '#F2F8E8',
        badgeBg: '#7AA116',
        icon: <PublicSubnetGroupIcon size={32} className="rounded-lg" />,
        scope: 'Zonal (Bound to 1 AZ)',
        defaultCidr: '10.0.1.0/24',
        teachingNotes: [
          'Route table has a direct default route to an Internet Gateway (0.0.0.0/0 -> igw).',
          'Instances get public IPv4 addresses and can accept inbound traffic from the internet.',
          'Best practice: Host only ingress components (ALB, Bastion, NAT Gateway) here.'
        ]
      },
      private_subnet: {
        title: 'Private Subnet',
        color: '#00A4A6',
        bgColor: '#E6F6F6',
        badgeBg: '#00A4A6',
        icon: <PrivateSubnetGroupIcon size={32} className="rounded-lg" />,
        scope: 'Zonal (Bound to 1 AZ)',
        defaultCidr: '10.0.2.0/24',
        teachingNotes: [
          'No direct route to the Internet Gateway. Zero direct public inbound connectivity.',
          'Outbound egress requires a NAT Gateway residing in a Public Subnet.',
          'Best practice: Place database backends (RDS, Aurora) and application servers (EC2, ECS) here.'
        ]
      },
      az: {
        title: 'Availability Zone',
        color: '#0073BB',
        bgColor: '#EEF6FC',
        badgeBg: '#0073BB',
        icon: <Server className="w-3.5 h-3.5 text-white" />,
        scope: 'Physical Fault Domain',
        teachingNotes: [
          'One or more discrete physical data centers with independent power and networking.',
          'Fault containment: Physical failure in one AZ does not cascade to other AZs.',
          'Architect for Multi-AZ redundancy to survive whole-datacenter disasters.'
        ]
      },
      availability_zone: {
        title: 'Availability Zone',
        color: '#0073BB',
        bgColor: '#EEF6FC',
        badgeBg: '#0073BB',
        icon: <Server className="w-3.5 h-3.5 text-white" />,
        scope: 'Physical Fault Domain',
        teachingNotes: [
          'One or more discrete physical data centers with independent power and networking.',
          'Fault containment: Physical failure in one AZ does not cascade to other AZs.',
          'Architect for Multi-AZ redundancy to survive whole-datacenter disasters.'
        ]
      },
      security_group: {
        title: 'Security Group',
        color: '#EF4444',
        bgColor: '#FEF2F2',
        badgeBg: '#EF4444',
        icon: <Shield className="w-3.5 h-3.5 text-white" />,
        scope: 'Virtual Firewall (ENI Layer)',
        teachingNotes: [
          'Stateful virtual firewall applied directly to individual instance ENIs.',
          'Evaluates traffic at the hypervisor layer before reaching the operating system.',
          'Return traffic is automatically permitted regardless of inbound rules (stateful tracking).'
        ]
      },
      account: {
        title: "Customer's AWS Account",
        color: '#232F3E',
        bgColor: '#F1F5F9',
        badgeBg: '#232F3E',
        icon: <Cloud className="w-3.5 h-3.5 text-white" />,
        scope: 'Security & Billing Boundary',
        teachingNotes: [
          'Ultimate blast-radius isolation boundary in AWS Organizations.',
          'Provides isolated IAM permissions, consolidated billing, and quota allocations.'
        ]
      }
    };

    const config = boundaryDefs[boundaryType] || boundaryDefs.vpc;

    // Detect services positioned inside this boundary
    const bPos = selectedNode.position;
    const bRight = bPos.x + width;
    const bBottom = bPos.y + height;

    const containedServices = nodes.filter(n => {
      if (n.type === 'boundaryNode' || n.id === selectedNode.id) return false;
      const nPos = n.position;
      return nPos.x >= bPos.x - 20 && nPos.x <= bRight && nPos.y >= bPos.y - 20 && nPos.y <= bBottom;
    });

    return (
      <aside className="w-80 bg-white border-l border-slate-200 flex flex-col h-full flex-shrink-0 z-20 shadow-md overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 bg-white">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shadow-xs flex-shrink-0"
                style={{ backgroundColor: config.badgeBg }}
              >
                {config.icon}
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Network Boundary
                </div>
                <h3 className="text-sm font-bold text-slate-900 leading-tight">
                  {label || config.title}
                </h3>
              </div>
            </div>
            <button
              onClick={() => setSelectedNodeId(null)}
              className="p-1 rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scope Badge */}
          <div className="mt-3 flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center gap-1.5 text-xs text-slate-700">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-semibold">{config.scope}</span>
            </div>
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
              style={{ backgroundColor: config.bgColor, color: config.color }}
            >
              {boundaryType.replace(/_/g, ' ')}
            </span>
          </div>
        </div>

        {/* Boundary Inspector Body */}
        <div className="p-4 space-y-4 flex-1 overflow-y-auto custom-scrollbar">
          <InspectorAccordion key={selectedNode.id} title={`${config.title} settings`}>
          {/* Label Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Boundary Label
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => updateNodeData(selectedNode.id, { label: e.target.value } as any)}
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-circuit-600 font-sans"
            />
          </div>

          {/* CIDR Block: editable on the VPC (the one real input), auto-carved and read-only
              on Public/Private subnets so they can never overlap or violate AWS's /28 floor. */}
          {boundaryType === 'vpc' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                IPv4 CIDR Block
              </label>
              <input
                type="text"
                value={cidr || config.defaultCidr || ''}
                onChange={(e) => updateNodeData(selectedNode.id, { cidr: e.target.value } as any)}
                placeholder={config.defaultCidr || 'e.g. 10.0.0.0/16'}
                className="w-full px-3 py-1.5 text-xs rounded-lg bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-circuit-600 font-mono"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Allocates private RFC 1918 address space. Public/Private subnet boundaries drawn inside this VPC automatically split this block between them.
              </p>
            </div>
          )}

          {['public_subnet', 'private_subnet'].includes(boundaryType) && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Route table</label>
              <select aria-label="Subnet route table" className="w-full px-2 py-1.5 text-xs rounded-lg bg-white border border-slate-300 text-slate-900"
                value={bData.networkIdentity?.routeTableId ?? ''}
                onChange={e => { const identity = { ...bData.networkIdentity }; if (e.target.value) identity.routeTableId = e.target.value; else delete identity.routeTableId; updateNodeData(selectedNode.id, { networkIdentity: identity } as any); }}>
                <option value="">None (assumed {boundaryType === 'public_subnet' ? 'public' : 'private'} routing)</option>
                {nodes.filter(n => n.data?.serviceId === 'route_tables').map(n => <option key={n.id} value={n.id}>{n.data.label ?? n.id}</option>)}
              </select>
            </div>
          )}

          {['public_subnet', 'private_subnet'].includes(boundaryType) && (
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  IPv4 CIDR Block & Host Capacity
                </label>
                {cidrError ? (
                  <div className="w-full px-3 py-1.5 text-xs rounded-lg border bg-rose-50 border-rose-400 text-rose-700 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>{cidrError}</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-xs font-bold font-mono text-slate-900">{cidr || '—'}</span>
                    {bData.usableHosts !== undefined && (
                      <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                        {bData.usableHosts} usable hosts
                      </span>
                    )}
                  </div>
                )}
                <p className="text-[10px] text-slate-400 mt-1">
                  Auto-carved from the containing VPC CIDR block. Subnets cannot overlap or drop below AWS's /28 floor.
                </p>
              </div>

              {/* Educational AWS 5 Reserved Addresses Card */}
              {!cidrError && bData.totalAddresses && (
                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2.5">
                  <div className="flex items-center justify-between text-xs border-b border-slate-200/80 pb-2">
                    <span className="text-slate-600 font-medium">Total CIDR Block IPs:</span>
                    <span className="font-mono font-bold text-slate-900">{bData.totalAddresses}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs border-b border-slate-200/80 pb-2">
                    <span className="text-slate-600 font-medium">Usable Host IPs:</span>
                    <span className="font-mono font-bold text-emerald-700">
                      {bData.usableHosts} (Total − 5)
                    </span>
                  </div>
                  {bData.usableRange && (
                    <div className="flex items-center justify-between text-xs border-b border-slate-200/80 pb-2">
                      <span className="text-slate-600 font-medium">Usable Host Range:</span>
                      <span className="font-mono text-[11px] font-bold text-slate-800">
                        {bData.usableRange.start} – {bData.usableRange.end}
                      </span>
                    </div>
                  )}

                  <div className="pt-1">
                    <div className="text-[11px] font-bold text-slate-800 mb-1.5 flex items-center justify-between">
                      <span>5 AWS Reserved Addresses</span>
                      <span className="text-[9px] font-mono text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">RFC 1918 / VPC</span>
                    </div>
                    <div className="space-y-1">
                      {(bData.reservedAddresses && bData.reservedAddresses.length > 0) ? (
                        bData.reservedAddresses.map((res: any, idx: number) => (
                          <div key={idx} className="p-1.5 rounded-lg bg-white border border-slate-200 text-[10px]">
                            <div className="flex items-center justify-between font-mono">
                              <span className="font-bold text-circuit-700">{res.ip}</span>
                              <span className="text-[9px] font-sans font-semibold text-slate-600 uppercase">{res.role}</span>
                            </div>
                            <div className="text-slate-500 text-[9px] mt-0.5 leading-tight">{res.description}</div>
                          </div>
                        ))
                      ) : (
                        <div className="text-[10px] text-slate-500 italic">
                          First 4 addresses (.0 Network, .1 Router, .2 DNS, .3 Future use) and last address (.last Broadcast) are reserved by AWS.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Network ACL - one per subnet in real AWS, governing every resource inside it.
              The protocol deny-list below is a simplified control, not the full AWS rule table. */}
          {['public_subnet', 'private_subnet'].includes(boundaryType) && (() => {
            const denyList: string[] = bData.naclDenyInbound || [];
            const protectedNodes = nodes.filter(n => {
              if (n.type === 'boundaryNode') return false;
              const containing = findContainingSubnetBoundary(n as any, nodes.filter(x => x.type === 'boundaryNode') as any);
              return containing?.id === selectedNode.id;
            });

            const setRestricted = (restrict: boolean) => {
              if (!restrict) return;
              const config = bData.customNacl ?? createTeachingNacl(bData.label || 'Subnet', boundaryType === 'public_subnet');
              const legacyRules = denyList.map((protocol, index) => ({ ruleNumber: 10 + index, type: protocol,
                protocol, portRange: protocol === 'SQL' ? '3306' : protocol === 'HTTP' ? '80' : protocol === 'HTTPS' ? '443' : protocol === 'DNS' ? '53' : 'Protocol match',
                cidr: '0.0.0.0/0', action: 'DENY' as const }));
              updateNodeData(selectedNode.id, { customNacl: bData.customNacl ?? { ...config, inboundRules: [...legacyRules, ...config.inboundRules] }, naclDenyInbound: undefined } as any);
              setShowNaclSideColumn(true);
            };
            return (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Network ACL — subnet association
                </label>
                {bData.customNacl && <button onClick={() => setShowNaclSideColumn(true)} className="text-xs text-circuit-700 underline mb-2">View NACL Rules</button>}
                <p className="text-[10px] text-slate-500 mb-2">Subnet-wide numbered inbound/outbound rules, like diagram 3.1. The teaching preset allows HTTP (public subnets), MySQL and ephemeral return traffic; review its CIDRs. This is not the AWS deny-all custom NACL default.</p>
                {!bData.customNacl && <button className="px-2 py-1 border rounded text-xs" onClick={() => setRestricted(true)}>Enable NACL rule set</button>}
                <p className="mt-2 text-[10px] text-slate-400">
                  {protectedNodes.length === 0
                    ? 'No resources placed inside this subnet yet.'
                    : `Applies to: ${protectedNodes.map(n => (n.data as any).label).join(', ')}`}
                </p>
              </div>
            );
          })()}

          {/* Security Group inbound rules - editable here too (not just from an attached
              instance's own panel), since in real AWS you can manage a group's rules from the
              Security Groups console page independent of any one resource. */}
          {boundaryType === 'security_group' && (() => {
            const allowed: string[] | undefined = bData.allowedProtocols;
            const isRestricted = allowed !== undefined;
            const PROTOCOLS: ProtocolType[] = ['HTTP', 'HTTPS', 'SQL', 'DNS', 'gRPC', 'TCP', 'Event', 'Message', 'Object access'];
            const attachedTo = nodes.filter(n => ((n.data as any)?.securityGroupIds || []).includes(selectedNode.id));

            const setRestricted = (restrict: boolean) => {
              updateNodeData(selectedNode.id, { allowedProtocols: restrict ? (allowed || []) : undefined } as any);
            };
            const toggleProtocol = (proto: string) => {
              const current = allowed || [];
              const next = current.includes(proto) ? current.filter(p => p !== proto) : [...current, proto];
              updateNodeData(selectedNode.id, { allowedProtocols: next } as any);
            };

            return (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Inbound Rules
                </label>
                <label className="flex items-center gap-1.5 text-[10px] text-slate-600 cursor-pointer mb-1.5">
                  <input type="checkbox" checked={isRestricted} onChange={(e) => setRestricted(e.target.checked)} className="w-3 h-3" />
                  Restrict inbound traffic (custom rules)
                </label>

                {!isRestricted ? (
                  <p className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
                    Default rule: allows all inbound traffic.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-1">
                      {PROTOCOLS.map(proto => {
                        const active = (allowed || []).includes(proto);
                        return (
                          <button
                            key={proto}
                            onClick={() => toggleProtocol(proto)}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                              active ? 'bg-circuit-600 border-circuit-600 text-white' : 'bg-white border-slate-300 text-slate-500 hover:border-circuit-400'
                            }`}
                          >
                            {proto}
                          </button>
                        );
                      })}
                    </div>
                    {(allowed || []).length === 0 && (
                      <p className="text-[10px] text-rose-600 mt-1">No protocols allowed yet - this Security Group currently denies all inbound traffic.</p>
                    )}
                  </>
                )}

                <p className="mt-2 text-[10px] text-slate-400">
                  {attachedTo.length === 0
                    ? 'Not attached to any resource yet - attach it from a service node\'s own Security Groups panel.'
                    : `Attached to: ${attachedTo.map(n => (n.data as any).label).join(', ')}`}
                </p>
              </div>
            );
          })()}

          {/* Interactive Dimensions & Resizing */}
          <div className="p-3 rounded-lg bg-white border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Maximize2 className="w-3.5 h-3.5 text-slate-500" />
                Dimensions & Sizing
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {Math.round(width)} × {Math.round(height)} px
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {/* Width Adjuster */}
              <div>
                <label className="block text-[10px] font-medium text-slate-600 mb-1">
                  Width (px)
                </label>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => updateNodeDimensions(selectedNode.id, Math.max(120, width - 50), height)}
                    className="px-1.5 py-1 text-xs font-semibold bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-600"
                    title="Decrease width by 50px"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={120}
                    max={2500}
                    step={20}
                    value={Math.round(width)}
                    onChange={(e) => updateNodeDimensions(selectedNode.id, Number(e.target.value), height)}
                    className="w-full text-center px-1.5 py-1 text-xs rounded bg-white border border-slate-200 text-slate-900 font-mono focus:outline-none focus:border-slate-400"
                  />
                  <button
                    onClick={() => updateNodeDimensions(selectedNode.id, width + 50, height)}
                    className="px-1.5 py-1 text-xs font-semibold bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-600"
                    title="Increase width by 50px"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Height Adjuster */}
              <div>
                <label className="block text-[10px] font-medium text-slate-600 mb-1">
                  Height (px)
                </label>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => updateNodeDimensions(selectedNode.id, width, Math.max(60, height - 50))}
                    className="px-1.5 py-1 text-xs font-semibold bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-600"
                    title="Decrease height by 50px"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={60}
                    max={2500}
                    step={20}
                    value={Math.round(height)}
                    onChange={(e) => updateNodeDimensions(selectedNode.id, width, Number(e.target.value))}
                    className="w-full text-center px-1.5 py-1 text-xs rounded bg-white border border-slate-200 text-slate-900 font-mono focus:outline-none focus:border-slate-400"
                  />
                  <button
                    onClick={() => updateNodeDimensions(selectedNode.id, width, height + 50)}
                    className="px-1.5 py-1 text-xs font-semibold bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-600"
                    title="Increase height by 50px"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Size Preset Buttons */}
            <div className="pt-1">
              <span className="block text-[10px] text-slate-400 font-medium mb-1">Quick Presets</span>
              <div className="grid grid-cols-4 gap-1">
                <button
                  onClick={() => updateNodeDimensions(selectedNode.id, 340, 220)}
                  className="py-1 px-1 text-[10px] font-medium bg-white hover:bg-slate-100 hover:text-slate-900 border border-slate-200 rounded transition-colors"
                >
                  Compact
                </button>
                <button
                  onClick={() => updateNodeDimensions(selectedNode.id, 560, 340)}
                  className="py-1 px-1 text-[10px] font-medium bg-white hover:bg-slate-100 hover:text-slate-900 border border-slate-200 rounded transition-colors"
                >
                  Medium
                </button>
                <button
                  onClick={() => updateNodeDimensions(selectedNode.id, 780, 480)}
                  className="py-1 px-1 text-[10px] font-medium bg-white hover:bg-slate-100 hover:text-slate-900 border border-slate-200 rounded transition-colors"
                >
                  Large
                </button>
                <button
                  onClick={() => updateNodeDimensions(selectedNode.id, 960, 600)}
                  className="py-1 px-1 text-[10px] font-medium bg-white hover:bg-slate-100 hover:text-slate-900 border border-slate-200 rounded transition-colors"
                >
                  Full
                </button>
              </div>
            </div>

            {/* Fit to Enclosed Services Button */}
            {containedServices.length > 0 && (
              <button
                onClick={() => {
                  const bPos = selectedNode.position;
                  const padding = 55;
                  const rightMost = Math.max(...containedServices.map(s => s.position.x + 90));
                  const bottomMost = Math.max(...containedServices.map(s => s.position.y + 90));
                  const newW = Math.max(200, Math.round(rightMost - bPos.x + padding));
                  const newH = Math.max(120, Math.round(bottomMost - bPos.y + padding));
                  updateNodeDimensions(selectedNode.id, newW, newH);
                }}
                className="w-full py-1.5 px-2 text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-200 rounded flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
              >
                <Minimize2 className="w-3.5 h-3.5 text-slate-500" />
                Fit to Enclosed Services ({containedServices.length})
              </button>
            )}
          </div>

          {/* Stacking Layer (Z-Index) Controls */}
          <div className="p-3 rounded-lg bg-white border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-slate-500" />
                Stacking Layer (Z-Index)
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  value={selectedNode.zIndex ?? -1}
                  onChange={(e) => setNodeZIndex(selectedNode.id, Number(e.target.value))}
                  className="w-14 text-center font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-slate-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 pt-0.5">
              <button
                onClick={() => bringToFront(selectedNode.id)}
                className="px-2 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 hover:text-slate-900 border border-slate-200 rounded flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                title="Bring in front of all components"
              >
                <ChevronsUp className="w-3.5 h-3.5 text-slate-600" />
                Bring to Front
              </button>
              <button
                onClick={() => bringForward(selectedNode.id)}
                className="px-2 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 hover:text-slate-900 border border-slate-200 rounded flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                title="Bring 1 step forward (Hotkey: ])"
              >
                <ChevronUp className="w-3.5 h-3.5 text-slate-600" />
                Bring Forward
              </button>
              <button
                onClick={() => sendBackward(selectedNode.id)}
                className="px-2 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 hover:text-slate-900 border border-slate-200 rounded flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                title="Send 1 step backward (Hotkey: [)"
              >
                <ChevronDown className="w-3.5 h-3.5 text-slate-600" />
                Send Backward
              </button>
              <button
                onClick={() => sendToBack(selectedNode.id)}
                className="px-2 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 hover:text-slate-900 border border-slate-200 rounded flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                title="Send behind all components"
              >
                <ChevronsDown className="w-3.5 h-3.5 text-slate-600" />
                Send to Back
              </button>
            </div>
          </div>

          {/* Contained Services List */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Enclosed Services ({containedServices.length})
              </span>
            </div>
            {containedServices.length > 0 ? (
              <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                {containedServices.map(cs => (
                  <button
                    key={cs.id}
                    onClick={() => setSelectedNodeId(cs.id)}
                    className="w-full flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-circuit-50 border border-slate-200 hover:border-circuit-200 text-left transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <AwsServiceIcon serviceId={cs.data?.serviceId} size={22} />
                      <span className="text-xs font-semibold text-slate-800 truncate">{cs.data?.label}</span>
                    </div>
                    <ArrowRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic p-2 bg-slate-50 rounded border border-slate-200 text-center">
                No services positioned inside this boundary
              </p>
            )}
          </div>

          {/* Architectural Notes */}
          <div className="space-y-2">
            <div className="font-bold text-slate-800 uppercase tracking-wider text-[10px] flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5 text-circuit-600" />
              AWS Architecture Guide
            </div>
            <div className="space-y-1.5">
              {config.teachingNotes.map((note, idx) => (
                <div key={idx} className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-700 leading-relaxed">
                  {note}
                </div>
              ))}
            </div>
          </div>
          </InspectorAccordion>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 bg-white space-y-2">
          <button
            onClick={() => duplicateNode(selectedNode.id)}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100 bg-white border border-slate-200 rounded-lg transition-colors shadow-xs"
          >
            <Copy className="w-3.5 h-3.5" />
            Duplicate Boundary
          </button>
          <button
            onClick={deleteSelected}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium text-rose-700 hover:bg-rose-50 bg-white border border-rose-200 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Boundary Container
          </button>
        </div>
      </aside>
    );
  }

  const nodeData = selectedNode.data || ({} as any);
  const profile = inspectorProfile(nodeData);
  const serviceDef = SERVICE_MAP[nodeData.serviceId] || {
    name: nodeData.label || 'Custom Component',
    category: nodeData.category || 'Compute',
    description: 'Custom AWS component',
    architecturalRole: 'General system processing unit',
    failureModes: ['Process crash', 'Out of memory'],
    resilienceCharacteristics: ['Redundancy across multiple AZs'],
    teachingNotes: ['Keep workloads stateless where possible.']
  };

  const isFailed = nodeData.health === 'failed';

  // Find upstream (dependents) and downstream (dependencies)
  const incomingEdges = edges.filter(e => e.target === selectedNode.id);
  const outgoingEdges = edges.filter(e => e.source === selectedNode.id);
  const upstreamNodes = incomingEdges.map(e => nodes.find(n => n.id === e.source)).filter(Boolean);
  const downstreamNodes = outgoingEdges.map(e => nodes.find(n => n.id === e.target)).filter(Boolean);

  // Current simulation activity
  const activeStep = (simulationResult && activeStepIndex !== null)
    ? simulationResult.steps[activeStepIndex]
    : null;
  const isNodeActiveInSimulation = activeStep && (activeStep.targetNodeId === selectedNode.id || activeStep.sourceNodeId === selectedNode.id);

  // Failure impact rating
  let failureImpact: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
  let failureImpactWhy = 'Disrupts processing for connected services.';
  if (['rds', 'dynamodb'].includes(nodeData.serviceId) && !nodeData.multiAz) {
    failureImpact = 'CRITICAL';
    failureImpactWhy = 'Application cannot retrieve or persist relational data. All transactional queries fail immediately.';
  } else if (['alb', 'route53', 'api_gateway', 'appsync'].includes(nodeData.serviceId)) {
    failureImpact = 'CRITICAL';
    failureImpactWhy = 'Primary ingress endpoint. Dropping this service cuts off client traffic completely.';
  } else if (['ecs', 'ec2'].includes(nodeData.serviceId) && (nodeData.replicas || 1) <= 1 && upstreamNodes.length > 0) {
    failureImpact = 'HIGH';
    failureImpactWhy = 'No redundant compute instances available to pick up traffic, resulting in 502 Bad Gateway.';
  } else if (['ecs', 'ec2', 'lambda', 'fargate'].includes(nodeData.serviceId) && (nodeData.replicas || 1) > 1) {
    failureImpact = 'LOW';
    failureImpactWhy = 'Traffic steers safely to other healthy compute replicas.';
  }

  return (
    <aside className="w-80 bg-white border-l border-slate-200 flex flex-col h-full flex-shrink-0 z-20 shadow-md overflow-hidden">
      {serviceExplorerNodeId === selectedNode.id && nodeData.serviceId === 'ecs' && <EcsExplorer key={`ecs-${selectedNode.id}`} nodeId={selectedNode.id} nodes={nodes} edges={edges} onUpdate={updateNodeData} onClose={() => setServiceExplorerNodeId(null)} />}
      {serviceExplorerNodeId === selectedNode.id && nodeData.serviceId === 'eks' && <EksExplorer key={`eks-${selectedNode.id}`} nodeId={selectedNode.id} nodes={nodes} edges={edges} onUpdate={updateNodeData} onClose={() => setServiceExplorerNodeId(null)} />}
      {serviceExplorerNodeId === selectedNode.id && WALKTHROUGH_SERVICES.includes(nodeData.serviceId) && <WalkthroughExplorer key={`walkthrough-${selectedNode.id}`} node={selectedNode} nodes={nodes} edges={edges} scenario={scenario} onClose={() => setServiceExplorerNodeId(null)} />}
      {!nodeData.customConfig?.canvasScalingDemo && serviceExplorerNodeId === selectedNode.id && BEHAVIOR_EXPLORER_SERVICES.includes(nodeData.serviceId) && <ServiceBehaviorExplorer key={`behavior-${selectedNode.id}`} node={selectedNode} nodes={nodes} edges={edges} onUpdate={updateNodeData} onClose={() => setServiceExplorerNodeId(null)} />}
      {/* Header */}
      <div className="p-4 border-b border-slate-200 bg-white">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <AwsServiceIcon serviceId={nodeData.serviceId} size={42} />
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {serviceDef.category}
              </div>
              <h3 className="text-sm font-bold text-slate-900 leading-tight">
                {nodeData.label || serviceDef.name}
              </h3>
            </div>
          </div>
          <button
            onClick={() => setSelectedNodeId(null)}
            className="p-1 rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!nodeData.customConfig?.canvasScalingDemo && (['ecs', 'eks'].includes(nodeData.serviceId) || BEHAVIOR_EXPLORER_SERVICES.includes(nodeData.serviceId) || WALKTHROUGH_SERVICES.includes(nodeData.serviceId)) && <button onClick={() => setServiceExplorerNodeId(selectedNode.id)} className="mt-3 w-full min-h-11 flex items-center justify-center gap-2 rounded-lg border border-circuit-600 bg-circuit-50 text-circuit-800 text-sm font-semibold hover:bg-circuit-100 focus-visible:outline-circuit-600">
          <Maximize2 size={16} aria-hidden="true" /> More information
        </button>}
        {/* Status Bar with Simulate Failure toggle */}
        <div className="mt-3 flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200 shadow-xs">
          <div className="flex items-center gap-1.5 text-xs">
            {isFailed ? (
              <XCircle className="w-4 h-4 text-rose-600" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            )}
            <span className={`font-semibold ${isFailed ? 'text-rose-700' : 'text-emerald-800'}`}>
              {isFailed ? 'FAILED' : 'Healthy'}
            </span>
          </div>

          <button
            onClick={() => toggleNodeFailure(selectedNode.id)}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
              isFailed
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
            }`}
          >
            {isFailed ? 'Restore Node' : 'Simulate Failure'}
          </button>
        </div>


        <div role="tablist" aria-label="Service inspector" className="flex gap-1 mt-3 border-b border-slate-200">
          {(['overview', 'config'] as const).map(tab => <button key={tab} type="button" role="tab"
            id={`inspector-${tab}-tab`} aria-selected={activeTab === tab} aria-controls={`inspector-${tab}-panel`}
            tabIndex={activeTab === tab ? 0 : -1}
            onClick={() => setActiveTab(tab)}
            onKeyDown={event => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === 'Home' ? 'overview' : event.key === 'End' ? 'config' : tab === 'overview' ? 'config' : 'overview';
              setActiveTab(next);
              document.getElementById(`inspector-${next}-tab`)?.focus();
            }}
            className={`min-h-11 px-3 text-xs border-b-2 focus-visible:outline focus-visible:outline-circuit-600 ${activeTab === tab ? 'border-slate-900 text-slate-900 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {tab === 'overview' ? 'Overview' : 'Config'}
          </button>)}
        </div>
      </div>

      {/* Tab Body */}
      <div className="p-4 space-y-4 flex-1 overflow-y-auto custom-scrollbar">
        <div role="tabpanel" id="inspector-overview-panel" aria-labelledby="inspector-overview-tab" hidden={activeTab !== 'overview'} className="space-y-4">
            {/* Live Simulation Activity */}
            {isNodeActiveInSimulation ? (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-900 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-800">
                  <Activity className="w-3.5 h-3.5 animate-spin" />
                  CURRENT ACTIVITY
                </div>
                <div className="font-mono font-semibold">{activeStep.action}</div>
                <div className="text-[11px] text-amber-800/90">{activeStep.explanation}</div>
              </div>
            ) : (
              <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500 flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-slate-400" />
                <span>Idle (Waiting for simulation request)</span>
              </div>
            )}

            {/* Architectural Role */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Architectural Role
              </label>
              <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                {serviceDef.architecturalRole}
              </p>
            </div>

            {/* Failure Impact Box */}
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Failure Impact
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                    failureImpact === 'CRITICAL'
                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                      : failureImpact === 'HIGH'
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  }`}
                >
                  {failureImpact}
                </span>
              </div>
              <div className="text-xs text-slate-700 leading-relaxed">
                <span className="font-semibold text-slate-900">Why? </span>
                {failureImpactWhy}
              </div>
            </div>

            {/* Upstream & Downstream Dependencies */}
            <div className="space-y-2.5 pt-1">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Depends On (Downstream)
                </span>
                {downstreamNodes.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {downstreamNodes.map((n: any) => (
                      <span
                        key={n.id}
                        className="px-2 py-0.5 rounded bg-white text-slate-800 text-xs font-medium border border-slate-300 shadow-xs"
                      >
                        {n.data.label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-slate-400 italic">No downstream dependencies</span>
                )}
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Dependents (Upstream Callers)
                </span>
                {upstreamNodes.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {upstreamNodes.map((n: any) => (
                      <span
                        key={n.id}
                        className="px-2 py-0.5 rounded bg-white text-slate-800 text-xs font-medium border border-slate-300 shadow-xs"
                      >
                        {n.data.label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-slate-400 italic">No upstream callers (Entry point)</span>
                )}
              </div>
            </div>

            {/* AWS Estimated Monthly Cost Card (Overview) */}
            {(() => {
              const nodeCost = calculateNodeCost(selectedNode);
              return (
                <div className="p-3 rounded-xl border border-circuit-200 bg-circuit-50/40 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                      <DollarSign className="w-3 h-3 text-circuit-600" />
                      AWS Estimated Cost
                    </span>
                    {nodeCost.freeTierEligible && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                        Free Tier
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline justify-between">
                    <div className="text-lg font-bold font-mono text-slate-900">
                      ${nodeCost.monthlyCost.toFixed(2)}
                      <span className="text-xs font-normal text-slate-500"> / mo</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">
                      ≈ ${nodeCost.hourlyCost.toFixed(4)}/hr
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono truncate">
                    {nodeCost.configurationSummary}
                  </div>
                </div>
              );
            })()}
        </div>

        <div role="tabpanel" id="inspector-config-panel" aria-labelledby="inspector-config-tab" hidden={activeTab !== 'config'}>
          <div key={selectedNode.id} className="space-y-3.5">
            <InspectorAccordion title="Display label">
            {/* Display Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Display Label
              </label>
              <input
                type="text"
                value={nodeData.label}
                onChange={(e) => updateNodeData(selectedNode.id, { label: e.target.value })}
                className="w-full px-3 py-1.5 text-xs rounded-lg bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-circuit-600"
              />
            </div>

            </InspectorAccordion>

            {/* Availability Zone Placement */}
            {profile.az && <InspectorAccordion title="Availability zone">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Availability Zone Placement
              </label>
              <select
                value={nodeData.az}
                onChange={(e) => updateNodeData(selectedNode.id, { az: e.target.value as AvailabilityZone })}
                className="w-full px-3 py-1.5 text-xs rounded-lg bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-circuit-600 font-mono"
              >
                <option value="AZ-A">Availability Zone A (us-east-1a)</option>
                <option value="AZ-B">Availability Zone B (us-east-1b)</option>
                <option value="AZ-C">Availability Zone C (us-east-1c)</option>
                {!['AZ-A', 'AZ-B', 'AZ-C'].includes(nodeData.az) && <option value={nodeData.az}>Saved placement: {nodeData.az}</option>}
              </select>
            </div>
            </InspectorAccordion>}

            {/* Subnet Type - derived live from where this node actually sits on the canvas,
                relative to Public/Private subnet boundaries, so it can never drift from what
                the diagram visually shows. Drag the node to change it, not this panel. */}
            {profile.network && <InspectorAccordion title="Subnet placement">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Subnet Security Boundary
              </label>
              {(() => {
                const subnetDisplay: Record<SubnetType, { text: string; className: string }> = {
                  public: { text: 'Public Subnet (Internet Gateway)', className: 'bg-emerald-50 border-emerald-300 text-emerald-800' },
                  private: { text: 'Private Subnet (Internal only)', className: 'bg-circuit-50 border-circuit-300 text-circuit-800' },
                  isolated: { text: 'Isolated Data Subnet', className: 'bg-circuit-50 border-circuit-300 text-circuit-800' },
                  global: { text: 'Global Edge / Managed (outside any VPC)', className: 'bg-slate-100 border-slate-300 text-slate-700' },
                  unassigned: { text: 'Not inside any subnet - unreachable', className: 'bg-rose-50 border-rose-400 text-rose-700' }
                };
                const display = subnetDisplay[nodeData.subnet] || subnetDisplay.global;
                return (
                  <div className={`w-full px-3 py-1.5 text-xs rounded-lg border font-medium flex items-center gap-1.5 ${display.className}`}>
                    {nodeData.subnet === 'unassigned' && <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />}
                    {display.text}
                  </div>
                );
              })()}
              <p className="mt-1 text-[10px] text-slate-500 leading-relaxed">
                Derived automatically from where this node sits on the canvas relative to Public/Private subnet boundaries. Drag it into or out of a subnet box to change this.
              </p>
            </div>
            </InspectorAccordion>}

            {/* Security Groups - attached by explicit reference, exactly like a real AWS
                instance's Security tab. Unlike the subnet above, this has nothing to do with
                where the node sits on the canvas: attach or detach any Security Group here, and
                edit its rules directly - changes apply everywhere that group is attached. */}
            {supportsSecurityGroupAttachment(nodeData) && (nodeData.serviceId !== 'eks' || profile.network) && <InspectorAccordion title="Security groups"><div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-slate-500" />
                Security Groups
              </label>
              {(() => {
                const PROTOCOLS: ProtocolType[] = ['HTTP', 'HTTPS', 'SQL', 'DNS', 'gRPC', 'TCP', 'Event', 'Message', 'Object access'];
                const allSecurityGroups = nodes.filter(n => n.type === 'boundaryNode' && (n.data as any)?.boundaryType === 'security_group');
                const attachedIds: string[] = nodeData.securityGroupIds || [];
                const attachedGroups = attachedIds
                  .map(id => allSecurityGroups.find(n => n.id === id))
                  .filter((n): n is (typeof allSecurityGroups)[number] => Boolean(n));
                const availableToAttach = allSecurityGroups.filter(n => !attachedIds.includes(n.id));

                const detach = (sgId: string) => {
                  updateNodeData(selectedNode.id, { securityGroupIds: attachedIds.filter(id => id !== sgId) } as any);
                };
                const attach = (sgId: string) => {
                  updateNodeData(selectedNode.id, { securityGroupIds: [...attachedIds, sgId] } as any);
                  setShowAttachSgMenu(false);
                };
                const createAndAttach = () => {
                  const newId = addBoundaryNode(
                    'security_group',
                    { x: selectedNode.position.x + 60, y: selectedNode.position.y - 90 },
                    { label: `${nodeData.label} SG`, width: 220, height: 90 }
                  );
                  updateNodeData(selectedNode.id, { securityGroupIds: [...attachedIds, newId] } as any);
                  setShowAttachSgMenu(false);
                };

                return (
                  <div className="space-y-2">
                    {attachedGroups.length === 0 && (
                      <p className="text-[10px] text-slate-400 italic px-0.5">
                        No Security Group attached in this model. AWS EC2 uses a default group when none is specified; its default inbound rules do not allow unrestricted access.
                      </p>
                    )}

                    {attachedGroups.map(sg => {
                      const allowed: string[] | undefined = (sg.data as any).allowedProtocols;
                      const isRestricted = allowed !== undefined;

                      const setRestricted = (restrict: boolean) => {
                        updateNodeData(sg.id, { allowedProtocols: restrict ? (allowed || []) : undefined } as any);
                      };
                      const toggleProtocol = (proto: string) => {
                        const current = allowed || [];
                        const next = current.includes(proto) ? current.filter(p => p !== proto) : [...current, proto];
                        updateNodeData(sg.id, { allowedProtocols: next } as any);
                      };

                      return (
                        <div key={sg.id} className="p-2.5 rounded-lg border border-slate-200 bg-white space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-800 truncate">{(sg.data as any).label || 'Security Group'}</span>
                            <button
                              onClick={() => detach(sg.id)}
                              title="Detach this Security Group"
                              className="p-0.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors flex-shrink-0"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <label className="flex items-center gap-1.5 text-[10px] text-slate-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isRestricted}
                              onChange={(e) => setRestricted(e.target.checked)}
                              className="w-3 h-3"
                            />
                            Restrict inbound traffic (custom rules)
                          </label>

                          {!isRestricted && (
                            <p className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
                              Default rule: allows all inbound traffic.
                            </p>
                          )}

                          {isRestricted && (
                            <>
                              <p className="text-[10px] text-slate-400">Allowed inbound protocols (allow-list only - unlisted protocols are denied):</p>
                              <div className="flex flex-wrap gap-1">
                                {PROTOCOLS.map(proto => {
                                  const active = (allowed || []).includes(proto);
                                  return (
                                    <button
                                      key={proto}
                                      onClick={() => toggleProtocol(proto)}
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                                        active
                                          ? 'bg-circuit-600 border-circuit-600 text-white'
                                          : 'bg-white border-slate-300 text-slate-500 hover:border-circuit-400'
                                      }`}
                                    >
                                      {proto}
                                    </button>
                                  );
                                })}
                              </div>
                              {(allowed || []).length === 0 && (
                                <p className="text-[10px] text-rose-600">No protocols allowed yet - this Security Group currently denies all inbound traffic.</p>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}

                    <div className="relative">
                      <button
                        onClick={() => setShowAttachSgMenu(v => !v)}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-dashed border-slate-300 text-slate-600 hover:border-circuit-400 hover:text-circuit-600 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Attach Security Group
                      </button>

                      {showAttachSgMenu && (
                        <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10 py-1 max-h-48 overflow-y-auto">
                          {availableToAttach.map(sg => (
                            <button
                              key={sg.id}
                              onClick={() => attach(sg.id)}
                              className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 truncate"
                            >
                              {(sg.data as any).label || 'Security Group'}
                            </button>
                          ))}
                          {availableToAttach.length > 0 && <div className="my-1 border-t border-slate-100" />}
                          <button
                            onClick={createAndAttach}
                            className="w-full text-left px-3 py-1.5 text-xs font-medium text-circuit-600 hover:bg-circuit-50"
                          >
                            + Create new Security Group
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div></InspectorAccordion>}

            {!profile.configuration && !activeLabReference?.configurationChecks && <p className="text-xs text-slate-500">No service-specific configuration panel is available for this service yet. Shared diagram controls remain available; behavior coverage is limited to the existing model.</p>}

            {/* Multi-AZ Toggle */}
            {profile.multiAz && <InspectorAccordion title="RDS availability"><div className="pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!nodeData.multiAz}
                  onChange={(e) => updateNodeData(selectedNode.id, { multiAz: e.target.checked })}
                  className="rounded border-slate-300 text-circuit-600 focus:ring-circuit-500"
                />
                <span className="text-xs font-semibold text-slate-800">
                  Multi-AZ Synchronous Hot Standby
                </span>
              </label>
            </div></InspectorAccordion>}

            {/* ---------------------------------------------------- */}
            {/* SERVICE-SPECIFIC AWS CONFIGURATION (EC2, S3, RDS, etc.) */}
            {/* ---------------------------------------------------- */}
            {activeLabReference?.configurationChecks && nodeData.customConfig && <InspectorAccordion title="Course configuration"><LabConfigurationPanel key={selectedNode.id} config={nodeData.customConfig} onChange={customConfig => updateNodeData(selectedNode.id, { customConfig })} /></InspectorAccordion>}
            {SERVICE_OPERATIONS[nodeData.serviceId] && <InspectorAccordion title="Service operation lab"><ServiceOperationPanel node={selectedNode} nodes={nodes} edges={edges} result={simulationResult} onConfig={patch=>updateNodeData(selectedNode.id,{customConfig:{...nodeData.customConfig,...patch}})} onRun={()=>runFromNode(selectedNode.id)}/></InspectorAccordion>}
            {profile.configuration === 'xray' && <InspectorAccordion title="X-Ray trace ingestion"><XrayPanel node={selectedNode} nodes={nodes} edges={edges} onConfig={patch => updateNodeData(selectedNode.id, { customConfig: { ...nodeData.customConfig, ...patch } })} onRun={() => runFromNode(selectedNode.id)} /></InspectorAccordion>}
            {profile.configuration === 'pipeline' && <InspectorAccordion title="Pipeline"><CodePipelinePanel node={selectedNode} nodes={nodes} edges={edges} onRun={() => runFromNode(selectedNode.id)} /></InspectorAccordion>}
            {profile.configuration === 'repo' && <InspectorAccordion title="Repository"><CodeCommitPanel node={selectedNode} nodes={nodes} edges={edges} onConfig={patch => updateNodeData(selectedNode.id, { customConfig: { ...nodeData.customConfig, ...patch } })} onRun={() => runFromNode(selectedNode.id)} /></InspectorAccordion>}
            {nodeData.serviceId === 'eventbridge' && <InspectorAccordion title="Rule: CodeCommit events"><EventRulePanel node={selectedNode} onConfig={patch => updateNodeData(selectedNode.id, { customConfig: { ...nodeData.customConfig, ...patch } })} /></InspectorAccordion>}
            {profile.configuration === 'amplify' && <InspectorAccordion title="Hosting branch"><AmplifyBranchPanel node={selectedNode} onConfig={patch => updateNodeData(selectedNode.id, { customConfig: { ...nodeData.customConfig, ...patch } })} /></InspectorAccordion>}
            {profile.configuration === 'signer' && <InspectorAccordion title="Signing"><SignerPanel node={selectedNode} onConfig={patch => updateNodeData(selectedNode.id, { customConfig: { ...nodeData.customConfig, ...patch } })} /></InspectorAccordion>}
            {profile.configuration === 'developer' && <InspectorAccordion title="Git push"><DeveloperPanel node={selectedNode} nodes={nodes} edges={edges} onConfig={patch => updateNodeData(selectedNode.id, { customConfig: { ...nodeData.customConfig, ...patch } })} onRun={() => runFromNode(selectedNode.id)} /></InspectorAccordion>}
            {profile.configuration === 'gitprovider' && <InspectorAccordion title="Repository connection"><GitProviderPanel node={selectedNode} nodes={nodes} edges={edges} onConfig={patch => updateNodeData(selectedNode.id, { customConfig: { ...nodeData.customConfig, ...patch } })} onRun={() => runFromNode(selectedNode.id)} /></InspectorAccordion>}
            {profile.configuration === 'build' && <InspectorAccordion title="Build project"><CodeBuildPanel onRun={() => runFromNode(selectedNode.id)} node={selectedNode} nodes={nodes} edges={edges} onConfig={patch => updateNodeData(selectedNode.id, { customConfig: { ...nodeData.customConfig, ...patch } })} /></InspectorAccordion>}
            {profile.configuration === 'deploy' && <InspectorAccordion title="Deployment group"><CodeDeployPanel onRun={() => runFromNode(selectedNode.id)} node={selectedNode} nodes={nodes} edges={edges} onConfig={patch => updateNodeData(selectedNode.id, { customConfig: { ...nodeData.customConfig, ...patch } })} onInstance={(id, patch) => { const target = nodes.find(n => n.id === id); updateNodeData(id, { customConfig: { ...(target?.data as any)?.customConfig, ...patch } }); }} /></InspectorAccordion>}
            {CICD_ROLE_SERVICE_IDS.includes(nodeData.serviceId) && <InspectorAccordion title="Service role"><CicdRolePanel node={selectedNode} onRole={iamRole => updateNodeData(selectedNode.id, { iamRole })} /></InspectorAccordion>}
            {profile.configuration === 'igw' && <InspectorAccordion title="Internet gateway attachment"><InternetGatewayPanel key={selectedNode.id} node={selectedNode} nodes={nodes} onChange={patch => updateNodeData(selectedNode.id, patch)} /></InspectorAccordion>}
            {profile.configuration === 'routes' && <InspectorAccordion title="Routes and subnet associations"><RouteTablePanel key={selectedNode.id} node={selectedNode} nodes={nodes} onRoutes={routes => updateNodeData(selectedNode.id, { customConfig: { ...nodeData.customConfig, routeTable: { ...(nodeData.customConfig?.routeTable ?? {}), routes } } })} onAssociate={(subnetId, routeTableId) => { const subnet = nodes.find(n => n.id === subnetId); const identity = { ...(subnet?.data as any)?.networkIdentity }; if (routeTableId) identity.routeTableId = routeTableId; else delete identity.routeTableId; updateNodeData(subnetId, { networkIdentity: identity } as any); }} /></InspectorAccordion>}
            {profile.configuration === 'operations' && <InspectorAccordion title={`${serviceDef.name} operations`}><ManagedServicePanel key={selectedNode.id} /></InspectorAccordion>}
            {ROLE_PANEL_SERVICE_IDS.includes(nodeData.serviceId) && <InspectorAccordion title="IAM role"><Ec2IamRolePanel key={selectedNode.id} node={selectedNode} nodes={nodes} edges={edges} onChange={iamRole => updateNodeData(selectedNode.id, { iamRole })} /></InspectorAccordion>}
            {profile.network && <InspectorAccordion title="Network identity"><NetworkIdentityPanel data={nodeData} nodes={nodes} onChange={networkIdentity => updateNodeData(selectedNode.id, { networkIdentity })} /></InspectorAccordion>}
            {profile.configuration === 'endpoint' && <InspectorAccordion title="VPC endpoint configuration"><EndpointConfigurationPanel data={nodeData} nodes={nodes} onChange={customConfig => updateNodeData(selectedNode.id, { customConfig })} /></InspectorAccordion>}
            {profile.configuration === 'eks' && <InspectorAccordion title="EKS cluster and workload"><EksConfigurationPanel data={nodeData} onChange={customConfig => updateNodeData(selectedNode.id, { customConfig })} /></InspectorAccordion>}
            {profile.configuration === 'ecs' && <InspectorAccordion title="ECS service configuration"><EcsConfigurationPanel data={nodeData} onChange={(customConfig) => updateNodeData(selectedNode.id, { customConfig })} /></InspectorAccordion>}
            {(profile.configuration === 'scaling' || (nodeData.serviceId === 'cloudwatch' && nodes.some(node => node.data.serviceId === 'ec2_auto_scaling' && node.data.customConfig?.asg?.alarmId === selectedNode.id))) && <InspectorAccordion title="EC2 Auto Scaling"><AsgPanel key={`asg-${selectedNode.id}`} /></InspectorAccordion>}
            {nodeData.serviceId === 'ec2' && (
              <InspectorAccordion title="EC2 instance configuration">
                <Ec2ConfigurationPanel data={nodeData} onChange={patch => updateNodeData(selectedNode.id, patch)} />
              </InspectorAccordion>
            )}

            {/* S3 Storage Configuration */}
            {(nodeData.serviceId === 's3' || nodeData.serviceId === 's3_client' || nodeData.serviceId === 's3_managed') && (
              <InspectorAccordion title="S3 bucket configuration">
                <S3ConfigurationPanel data={nodeData} onChange={patch => updateNodeData(selectedNode.id, patch)} />
              </InspectorAccordion>
            )}

            {/* RDS Database Configuration */}
            {(nodeData.serviceId === 'rds' || nodeData.serviceId === 'aurora') && (
              <InspectorAccordion title="Database configuration">
                <DatabaseConfigurationPanel data={nodeData} onChange={patch => updateNodeData(selectedNode.id, patch)} />
              </InspectorAccordion>
            )}

            {/* AWS Lambda Configuration */}
            {(nodeData.serviceId === 'lambda' || nodeData.serviceId === 'step_lambda') && (
              <InspectorAccordion title="Lambda function configuration">
                <LambdaConfigurationPanel data={nodeData} onChange={patch => updateNodeData(selectedNode.id, patch)} />
              </InspectorAccordion>
            )}

            {/* ---------------------------------------------------- */}
            <InspectorAccordion title="Cost estimate">
            {/* LIVE PER-RESOURCE AWS PRICING PREVIEW CARD */}
            {/* ---------------------------------------------------- */}
            {(() => {
              const nodeCost = calculateNodeCost(selectedNode);
              return (
                <div className="p-3.5 rounded-xl border border-circuit-200 bg-circuit-50/40 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <DollarSign className="w-4 h-4 text-circuit-600" />
                      <span>AWS Estimated Resource Cost</span>
                    </div>
                    {nodeCost.freeTierEligible && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                        Free Tier
                      </span>
                    )}
                  </div>

                  <div className="flex items-baseline justify-between pt-1 border-b border-circuit-100 pb-2">
                    <div>
                      <div className="text-xl font-bold font-mono text-slate-900">
                        ${nodeCost.monthlyCost.toFixed(2)}
                        <span className="text-xs font-normal text-slate-500"> / month</span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        ≈ ${nodeCost.hourlyCost.toFixed(4)} / hour
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-circuit-700 bg-white px-2 py-0.5 rounded border border-circuit-200 font-semibold truncate max-w-[140px]">
                      {nodeCost.configurationSummary}
                    </span>
                  </div>

                  {/* Line Items */}
                  <div className="space-y-1 pt-1">
                    {nodeCost.lineItems.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between text-[11px]">
                        <div className="truncate pr-2">
                          <span className="text-slate-700 font-medium">{item.name}</span>
                          <span className="text-slate-400 text-[10px] block">{item.detail}</span>
                        </div>
                        <span className="font-mono font-bold text-slate-900 flex-shrink-0">
                          ${item.cost.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            </InspectorAccordion>

            <InspectorAccordion title="Diagram layout">
            {/* Stacking Layer (Z-Index) */}
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-circuit-600" />
                  Stacking Layer (Z-Index)
                </span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={selectedNode.zIndex ?? 10}
                    onChange={(e) => setNodeZIndex(selectedNode.id, Number(e.target.value))}
                    className="w-14 text-center font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-white border border-slate-300 text-slate-800 focus:outline-none focus:border-circuit-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                <button
                  onClick={() => bringToFront(selectedNode.id)}
                  className="px-2 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-circuit-50 hover:text-circuit-700 border border-slate-200 hover:border-circuit-300 rounded flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                  title="Bring in front of all components"
                >
                  <ChevronsUp className="w-3.5 h-3.5 text-circuit-600" />
                  Bring to Front
                </button>
                <button
                  onClick={() => bringForward(selectedNode.id)}
                  className="px-2 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                  title="Bring 1 step forward (Hotkey: ])"
                >
                  <ChevronUp className="w-3.5 h-3.5 text-slate-600" />
                  Bring Forward
                </button>
                <button
                  onClick={() => sendBackward(selectedNode.id)}
                  className="px-2 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                  title="Send 1 step backward (Hotkey: [)"
                >
                  <ChevronDown className="w-3.5 h-3.5 text-slate-600" />
                  Send Backward
                </button>
                <button
                  onClick={() => sendToBack(selectedNode.id)}
                  className="px-2 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-circuit-50 hover:text-circuit-700 border border-slate-200 hover:border-circuit-300 rounded flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                  title="Send behind all components"
                >
                  <ChevronsDown className="w-3.5 h-3.5 text-circuit-600" />
                  Send to Back
                </button>
              </div>
            </div>
            </InspectorAccordion>
          </div>
        </div>

        <InspectorAccordion key={`${selectedNode.id}-learn`} title="Teaching Notes">
          <div className="space-y-4 text-xs text-slate-700">
            {/* Failure Modes */}
            <div>
              <div className="font-bold text-rose-700 uppercase tracking-wider text-[10px] mb-1.5">
                Common Failure Modes
              </div>
              <ul className="list-disc pl-4 space-y-1 text-slate-600">
                {serviceDef.failureModes.map((fm, idx) => (
                  <li key={idx}>{fm}</li>
                ))}
              </ul>
            </div>

            {/* Teaching Notes */}
            <div>
              <div className="font-bold text-circuit-800 uppercase tracking-wider text-[10px] mb-1.5">
                AWS Architecture Notes
              </div>
              <div className="space-y-2">
                {serviceDef.teachingNotes.map((note, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 leading-relaxed text-slate-700">
                    {note}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </InspectorAccordion>
      </div>

      {/* Delete Node Footer */}
      <div className="p-4 border-t border-slate-200 bg-slate-50">
        <button
          onClick={deleteSelected}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-100 bg-rose-50 border border-rose-200 rounded-lg transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Remove Service from Diagram
        </button>
      </div>
    </aside>
  );
};
