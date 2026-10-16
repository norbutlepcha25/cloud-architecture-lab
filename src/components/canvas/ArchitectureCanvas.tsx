import { compassHandleId } from '../../utils/compassHandles.ts';
import { ReferenceLibrary } from '../references/ReferenceLibrary.tsx';
import { SaveLabDiagram } from '../labs/SaveLabDiagram.tsx';
import { CanvasLayers, canvasLayerKey } from './CanvasLayers.tsx';
import { asgMembershipFrames } from '../../engine/layout/asgMembershipFrames.ts';
import { detectStrayComponents, STRAY_REASON_TEXT } from '../../engine/analysis/strayComponents.ts';
import { StrayNotice } from './StrayNotice.tsx';
import React, { useRef, useCallback, useState, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionMode,
  Panel,
  Node,
  type ReactFlowInstance
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useArchitecture } from '../../context/ArchitectureContext.tsx';
import { ServiceNode } from './ServiceNode.tsx';
import { BoundaryNode } from './BoundaryNode.tsx';
import { CustomConnectionEdge } from './CustomConnectionEdge.tsx';
import { NodeContextMenu } from './NodeContextMenu.tsx';
import { NodeStatusModal } from './NodeStatusModal.tsx';
import { SERVICE_MAP } from '../../data/serviceCatalog.ts';
import { ServiceNodeData, NodeHealth } from '../../types/index.ts';
import { Shield } from 'lucide-react';
import { useTheme } from '../../utils/theme.ts';

const nodeTypes = {
  asgMembershipFrame: ({ data }: any) => <div className="w-full h-full border-2 border-dashed border-orange-500 rounded-xl pointer-events-none bg-transparent"><span className="absolute left-3 top-1 px-1 bg-white text-xs font-semibold text-orange-700 dark:bg-[#0f1720] dark:text-orange-300">{data.label} · membership</span></div>,
  serviceNode: ServiceNode,
  boundaryNode: BoundaryNode
};

const edgeTypes = {
  custom: CustomConnectionEdge
};

export const ArchitectureCanvas: React.FC = () => {
  const {
    nodes,
    canvasRevision,
    draftViewport, setDraftViewport,
    onNodesChange,
    edges,
    onEdgesChange,
    onConnect,
    onReconnect,
    selectedNode,
    selectedEdge,
    setSelectedNodeId,
    setSelectedEdgeId,
    addServiceNode,
    addBoundaryNode,
    removeNode,
    duplicateNode,
    setNodeHealth,
    bringToFront,
    sendToBack,
    bringForward,
    sendBackward,
    showNaclSideColumn,
    setShowNaclSideColumn,
    hasCustomNacl
  } = useArchitecture();

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [theme] = useTheme();
  const dark = theme === 'dark';
  const [hiddenLayers, setHiddenLayers] = useState<Set<string>>(new Set());
  // Connection dots stay hidden until a node is hovered/selected; while a connection is being
  // dragged every node shows them so the drop target is visible.
  const [isConnecting, setIsConnecting] = useState(false);
  // Project visibility into React Flow without modifying the architecture used by the engine.
  const hiddenNodeIds = new Set(nodes.filter(node => hiddenLayers.has(canvasLayerKey(node))).map(node => node.id));
  const strayComponents = React.useMemo(() => detectStrayComponents(nodes, edges), [nodes, edges]);
  const strayById = new Map(strayComponents.map(item => [item.nodeId, item.reasons.map(reason => STRAY_REASON_TEXT[reason])]));
  const visibleNodes = nodes.map(node => {
    const flagged = strayById.get(node.id);
    const shown = flagged ? { ...node, data: { ...node.data, strayReasons: flagged } } : node;
    return hiddenNodeIds.has(node.id) ? { ...shown, hidden: true } : shown;
  });
  const flowInstance = useRef<ReactFlowInstance<any, any> | null>(null);
  const focusNode = useCallback((nodeId: string) => {
    const node = nodes.find(item => item.id === nodeId);
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    if (node && flowInstance.current) {
      const width = node.measured?.width ?? 120, height = node.measured?.height ?? 90;
      flowInstance.current.setCenter(node.position.x + width / 2, node.position.y + height / 2, { zoom: Math.max(flowInstance.current.getZoom(), 1), duration: 300 });
    }
  }, [nodes, setSelectedNodeId, setSelectedEdgeId]);
  const membershipFrames = asgMembershipFrames(visibleNodes);
  const displayedFrames = membershipFrames.map(node => hiddenLayers.has(canvasLayerKey(node)) ? { ...node, hidden: true } : node);
  const visibleEdges = edges.map(edge => ({
    ...edge,
    selected: edge.id === selectedEdge?.id,
    reconnectable: true,
    sourceHandle: compassHandleId(edge.sourceHandle, 'source'),
    targetHandle: compassHandleId(edge.targetHandle, 'target'),
    hidden: edge.hidden || hiddenNodeIds.has(edge.source) || hiddenNodeIds.has(edge.target),
  }));
  useEffect(() => { setHiddenLayers(new Set()); }, [canvasRevision]);
  const selectedId = selectedNode?.id;

  // Global Keyboard shortcuts for layer order adjustments
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing into an input or textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (!selectedId) return;

      if (e.key === ']') {
        e.preventDefault();
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
          bringToFront(selectedId);
        } else {
          bringForward(selectedId);
        }
      } else if (e.key === '[') {
        e.preventDefault();
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
          sendToBack(selectedId);
        } else {
          sendBackward(selectedId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, bringToFront, sendToBack, bringForward, sendBackward]);

  // Right-click context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: Node<any>;
  } | null>(null);

  // Status & Details modal state
  const [statusModalNode, setStatusModalNode] = useState<Node<ServiceNodeData> | null>(null);

  // Handle Drag Over from Service Palette
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Handle Drop on Canvas
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!reactFlowWrapper.current) return;
      const bounds = reactFlowWrapper.current.getBoundingClientRect();

      // 1. Boundary Drop (VPC, Subnet, AZ, Security Group)
      const boundaryType = event.dataTransfer.getData('application/aws-boundary-type');
      if (boundaryType) {
        const position = {
          x: Math.max(20, event.clientX - bounds.left - 120),
          y: Math.max(20, event.clientY - bounds.top - 60)
        };
        addBoundaryNode(boundaryType, position);
        return;
      }

      // 2. Service Drop (EC2, S3, RDS, ALB, etc.)
      const serviceId = event.dataTransfer.getData('application/aws-service-id');
      if (!serviceId || !SERVICE_MAP[serviceId]) return;

      const position = {
        x: event.clientX - bounds.left - 60,
        y: event.clientY - bounds.top - 40
      };

      addServiceNode(serviceId, position);
    },
    [addServiceNode, addBoundaryNode]
  );

  // Node Click Selection (supports both services and boundary containers)
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: any) => {
      setSelectedNodeId(node.id);
      setSelectedEdgeId(null);
      setContextMenu(null);
    },
    [setSelectedNodeId, setSelectedEdgeId]
  );

  // Node Right-Click Context Menu (services and boundaries)
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: any) => {
      // Prevent native browser right-click menu
      event.preventDefault();
      event.stopPropagation();

      // Select right-clicked node
      setSelectedNodeId(node.id);
      setSelectedEdgeId(null);

      // Open custom context menu at mouse position
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        node: node
      });
    },
    [setSelectedNodeId, setSelectedEdgeId]
  );

  // Edge Click Selection
  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: any) => {
      setSelectedEdgeId(edge.id);
      setSelectedNodeId(null);
      setContextMenu(null);
    },
    [setSelectedEdgeId, setSelectedNodeId]
  );

  // Pane Click Deselection & Close Context Menu
  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setContextMenu(null);
  }, [setSelectedNodeId, setSelectedEdgeId]);

  return (
    <div className={`lab-canvas relative w-full h-full flex-1 overflow-hidden select-none ${isConnecting ? 'is-connecting' : ''} ${dark ? 'bg-[#0f1720]' : 'bg-white'}`} ref={reactFlowWrapper}>
      <ReactFlow
        key={canvasRevision}
        nodes={[...visibleNodes, ...displayedFrames]}
        edges={visibleEdges}
        onNodesChange={changes => onNodesChange(changes.filter(change => !('id' in change) || !membershipFrames.some(frame => frame.id === change.id)))}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onReconnect={onReconnect}
        onConnectStart={() => setIsConnecting(true)}
        onConnectEnd={() => setIsConnecting(false)}
        onReconnectStart={() => setIsConnecting(true)}
        onReconnectEnd={() => setIsConnecting(false)}
        connectionMode={ConnectionMode.Loose}
        edgesReconnectable
        reconnectRadius={14}
        connectionLineType={ConnectionLineType.Step}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onNodeClick={onNodeClick}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        defaultViewport={draftViewport ?? undefined}
        onMoveEnd={(_, viewport) => setDraftViewport(viewport)}
        onInit={instance => { flowInstance.current = instance; }}
        fitView={!draftViewport}
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        maxZoom={2.0}
        proOptions={{ hideAttribution: true }}
        colorMode={theme}
        // Boundary containers (VPC, subnet, security group) carry their own z-index so they can
        // stack against each other, and public/private subnets render with an opaque background.
        // Under React Flow's default "basic" z mode, connection edges only elevate above a node
        // when that node has a parentId (true nesting), which this canvas never sets - so edges
        // were being painted under any opaque boundary they crossed. "manual" mode makes each
        // edge's z-index absolute instead of derived from the nodes it touches; combined with a
        // z-index far above any boundary (-3 to 1) or manual bring-to-front value a user could
        // reach, this keeps process/connection arrows visible above every container.
        zIndexMode="manual"
        defaultEdgeOptions={{ zIndex: 1000 }}
      >
        {/* Subtle Architectural Grid */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color={dark ? '#2A3646' : '#E2E8F0'}
        />

        <Controls
          className="!bg-white !border !border-slate-200 !rounded-lg !shadow-md !overflow-hidden [&>button]:!bg-white [&>button]:!border-b [&>button]:!border-slate-100 [&>button]:!text-slate-600 [&>button:hover]:!bg-slate-50 dark:!bg-slate-900 dark:!border-slate-700 dark:[&>button]:!bg-slate-900 dark:[&>button]:!border-slate-800 dark:[&>button]:!text-slate-300 dark:[&>button]:!fill-slate-300 dark:[&>button:hover]:!bg-slate-800"
          showInteractive={false}
        />


        <Panel position="top-left" className="m-3 flex items-center gap-2">
          <ReferenceLibrary />
          <SaveLabDiagram key={canvasRevision} />
          {/* Quick NACL Rules & Signals Side Column Toggle */}
          {hasCustomNacl && (
            <button
              onClick={() => setShowNaclSideColumn(!showNaclSideColumn)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium shadow-xs transition-colors cursor-pointer ${
                showNaclSideColumn
                  ? 'bg-circuit-600 text-white border-circuit-600'
                  : 'bg-white/95 border-slate-200 text-slate-700 hover:bg-white hover:border-circuit-300 dark:bg-slate-900/95 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900'
              }`}
              title="Show NACL rules"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>NACL rules</span>
            </button>
          )}
        </Panel>

        {strayComponents.length > 0 && (
          <Panel position="top-center" className="m-3">
            <StrayNotice items={strayComponents} onFocus={focusNode} />
          </Panel>
        )}

        <Panel position="top-right" className="m-3">
          <CanvasLayers nodes={[...nodes, ...membershipFrames]} hidden={hiddenLayers} onChange={setHiddenLayers} />
        </Panel>

      </ReactFlow>

      {/* Right-Click Context Menu */}
      {contextMenu && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          node={contextMenu.node}
          onClose={() => setContextMenu(null)}
          onOpenDetails={(node) => setStatusModalNode(node)}
          onDuplicate={(nodeId) => duplicateNode(nodeId)}
          onRemove={(nodeId) => removeNode(nodeId)}
          onSetHealth={(nodeId, health, reason) => setNodeHealth(nodeId, health, reason)}
          onBringToFront={(nodeId) => bringToFront(nodeId)}
          onSendToBack={(nodeId) => sendToBack(nodeId)}
          onBringForward={(nodeId) => bringForward(nodeId)}
          onSendBackward={(nodeId) => sendBackward(nodeId)}
        />
      )}

      {/* Node Status & Resilience Details Modal */}
      <NodeStatusModal
        node={statusModalNode}
        isOpen={!!statusModalNode}
        onClose={() => setStatusModalNode(null)}
      />
    </div>
  );
};
