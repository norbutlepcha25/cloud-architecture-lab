import React, { useEffect, useRef } from 'react';
import { Node } from '@xyflow/react';
import { ServiceNodeData, NodeHealth } from '../../types';
import { SERVICE_MAP } from '../../data/serviceCatalog';
import { AwsServiceIcon } from '../icons/AwsServiceIcons';
import {
  Info,
  Copy,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sliders,
  ExternalLink,
  ChevronsUp,
  ChevronUp,
  ChevronDown,
  ChevronsDown,
} from 'lucide-react';

interface NodeContextMenuProps {
  x: number;
  y: number;
  node: Node<any>;
  onClose: () => void;
  onOpenDetails: (node: Node<ServiceNodeData>) => void;
  onDuplicate: (nodeId: string) => void;
  onRemove: (nodeId: string) => void;
  onSetHealth: (nodeId: string, health: NodeHealth, reason?: string) => void;
  onBringToFront: (nodeId: string) => void;
  onSendToBack: (nodeId: string) => void;
  onBringForward: (nodeId: string) => void;
  onSendBackward: (nodeId: string) => void;
}

export const NodeContextMenu: React.FC<NodeContextMenuProps> = ({
  x,
  y,
  node,
  onClose,
  onOpenDetails,
  onDuplicate,
  onRemove,
  onSetHealth,
  onBringToFront,
  onSendToBack,
  onBringForward,
  onSendBackward
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleClickOutside);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Adjust positioning to avoid overflowing viewport
  const menuWidth = 240;
  const menuHeight = 310;
  const adjustedX = Math.min(Math.max(10, x), window.innerWidth - menuWidth - 10);
  const adjustedY = Math.min(Math.max(10, y), window.innerHeight - menuHeight - 10);

  // If this is a network boundary container (VPC, Subnet, AZ, etc.)
  if (node.type === 'boundaryNode') {
    const bData = node.data as any;
    return (
      <div
        ref={menuRef}
        style={{ top: `${adjustedY}px`, left: `${adjustedX}px` }}
        className="fixed z-[10000] w-52 bg-white rounded-lg shadow-lg border border-slate-200 py-1 select-none divide-y divide-slate-100"
      >
        <div className="px-3 py-2">
          <div className="text-xs font-semibold text-slate-900 truncate">
            {bData.label || 'Network Boundary'}
          </div>
          <div className="text-[10px] text-slate-500 capitalize">
            {(bData.boundaryType || 'boundary').replace(/_/g, ' ')} container
          </div>
        </div>
        <div className="py-1">
          <button
            onClick={() => {
              onDuplicate(node.id);
              onClose();
            }}
            className="w-full px-3 py-1.5 text-xs text-left text-slate-700 hover:bg-slate-100 flex items-center gap-2 transition-colors"
          >
            <Copy className="w-3.5 h-3.5 text-slate-400" />
            <span>Duplicate</span>
          </button>
        </div>

        {/* Layer / Stacking Order */}
        <div className="py-1">
          <div className="px-3 py-1 text-[10px] font-medium text-slate-400 flex items-center justify-between">
            <span>Layer</span>
            <span className="font-mono text-[10px] text-slate-400">
              z {node.zIndex ?? -1}
            </span>
          </div>
          <button
            onClick={() => {
              onBringToFront(node.id);
              onClose();
            }}
            className="w-full px-3 py-1 text-xs text-left text-slate-700 hover:bg-slate-100 flex items-center justify-between transition-colors"
          >
            <div className="flex items-center gap-2">
              <ChevronsUp className="w-3.5 h-3.5 text-slate-400" />
              <span>Bring to front</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">Shift+]</span>
          </button>
          <button
            onClick={() => {
              onBringForward(node.id);
              onClose();
            }}
            className="w-full px-3 py-1 text-xs text-left text-slate-700 hover:bg-slate-100 flex items-center justify-between transition-colors"
          >
            <div className="flex items-center gap-2">
              <ChevronUp className="w-3.5 h-3.5 text-slate-600" />
              <span>Bring forward</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">]</span>
          </button>
          <button
            onClick={() => {
              onSendBackward(node.id);
              onClose();
            }}
            className="w-full px-3 py-1 text-xs text-left text-slate-700 hover:bg-slate-100 flex items-center justify-between transition-colors"
          >
            <div className="flex items-center gap-2">
              <ChevronDown className="w-3.5 h-3.5 text-slate-600" />
              <span>Send backward</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">[</span>
          </button>
          <button
            onClick={() => {
              onSendToBack(node.id);
              onClose();
            }}
            className="w-full px-3 py-1 text-xs text-left text-slate-700 hover:bg-slate-100 flex items-center justify-between transition-colors"
          >
            <div className="flex items-center gap-2">
              <ChevronsDown className="w-3.5 h-3.5 text-slate-400" />
              <span>Send to back</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">Shift+[</span>
          </button>
        </div>

        <div className="py-1">
          <button
            onClick={() => {
              onRemove(node.id);
              onClose();
            }}
            className="w-full px-3 py-1.5 text-xs text-left text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Boundary</span>
          </button>
        </div>
      </div>
    );
  }

  const nodeData = node.data;
  const serviceDef = SERVICE_MAP[nodeData.serviceId];
  const isHealthy = nodeData.health === 'healthy';
  const isDegraded = nodeData.health === 'degraded';
  const isFailed = nodeData.health === 'failed';

  return (
    <div
      ref={menuRef}
      style={{ top: `${adjustedY}px`, left: `${adjustedX}px` }}
      className="fixed z-[10000] w-60 bg-white rounded-lg shadow-lg border border-slate-200 py-1 select-none divide-y divide-slate-100"
    >
      {/* Node Mini Header */}
      <div className="px-3 py-2 flex items-center gap-2.5">
        <div className="flex-shrink-0">
          <AwsServiceIcon serviceId={nodeData.serviceId} size={24} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-slate-900 truncate">
            {nodeData.label || serviceDef?.name || 'AWS Service'}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] text-slate-500 truncate">
              {nodeData.category || serviceDef?.category || 'Service'}
            </span>
            <span className="text-slate-300">•</span>
            {isHealthy && (
              <span className="text-[10px] font-medium text-emerald-700">Healthy</span>
            )}
            {isDegraded && (
              <span className="text-[10px] font-medium text-amber-700">Degraded</span>
            )}
            {isFailed && (
              <span className="text-[10px] font-medium text-rose-700">Failed</span>
            )}
          </div>
        </div>
      </div>

      {/* Primary Actions */}
      <div className="py-1">
        <button
          onClick={() => {
            onOpenDetails(node);
            onClose();
          }}
          className="w-full px-3 py-1.5 text-xs text-left text-slate-700 hover:bg-slate-100 flex items-center justify-between transition-colors group"
        >
          <div className="flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-slate-400" />
            <span>Details</span>
          </div>
        </button>

        <button
          onClick={() => {
            onDuplicate(node.id);
            onClose();
          }}
          className="w-full px-3 py-1.5 text-xs text-left text-slate-700 hover:bg-slate-100 hover:text-slate-900 flex items-center justify-between transition-colors"
        >
          <div className="flex items-center gap-2">
            <Copy className="w-3.5 h-3.5 text-slate-400" />
            <span>Duplicate</span>
          </div>
        </button>
      </div>

      {/* Layer / Stacking Order */}
      <div className="py-1">
        <div className="px-3 py-1 text-[10px] font-medium text-slate-400 flex items-center justify-between">
          <span>Layer</span>
          <span className="font-mono text-[10px] text-slate-400">
            z {node.zIndex ?? 10}
          </span>
        </div>
        <button
          onClick={() => {
            onBringToFront(node.id);
            onClose();
          }}
          className="w-full px-3 py-1.5 text-xs text-left text-slate-700 hover:bg-slate-100 flex items-center justify-between transition-colors"
        >
          <div className="flex items-center gap-2">
            <ChevronsUp className="w-3.5 h-3.5 text-slate-400" />
            <span>Bring to front</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">Shift+]</span>
        </button>
        <button
          onClick={() => {
            onBringForward(node.id);
            onClose();
          }}
          className="w-full px-3 py-1.5 text-xs text-left text-slate-700 hover:bg-slate-100 flex items-center justify-between transition-colors"
        >
          <div className="flex items-center gap-2">
            <ChevronUp className="w-3.5 h-3.5 text-slate-600" />
            <span>Bring forward</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">]</span>
        </button>
        <button
          onClick={() => {
            onSendBackward(node.id);
            onClose();
          }}
          className="w-full px-3 py-1.5 text-xs text-left text-slate-700 hover:bg-slate-100 flex items-center justify-between transition-colors"
        >
          <div className="flex items-center gap-2">
            <ChevronDown className="w-3.5 h-3.5 text-slate-600" />
            <span>Send backward</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">[</span>
        </button>
        <button
          onClick={() => {
            onSendToBack(node.id);
            onClose();
          }}
          className="w-full px-3 py-1.5 text-xs text-left text-slate-700 hover:bg-slate-100 flex items-center justify-between transition-colors"
        >
          <div className="flex items-center gap-2">
            <ChevronsDown className="w-3.5 h-3.5 text-slate-400" />
            <span>Send to back</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">Shift+[</span>
        </button>
      </div>

      {/* Quick Health Status Controls */}
      <div className="py-1.5 px-3">
        <div className="text-[10px] font-medium text-slate-400 mb-1.5">
          Health
        </div>
        <div className="grid grid-cols-3 gap-1">
          <button
            onClick={() => {
              onSetHealth(node.id, 'healthy');
              onClose();
            }}
            title="Mark as Healthy"
            className={`px-1.5 py-1 text-[11px] font-medium rounded flex items-center justify-center gap-1 border transition-colors ${
              isHealthy
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <CheckCircle2 className="w-3 h-3" />
            <span>Online</span>
          </button>

          <button
            onClick={() => {
              onSetHealth(node.id, 'degraded', 'Performance Degraded');
              onClose();
            }}
            title="Mark as Degraded"
            className={`px-1.5 py-1 text-[11px] font-medium rounded flex items-center justify-center gap-1 border transition-colors ${
              isDegraded
                ? 'bg-amber-50 text-amber-700 border-amber-300'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <AlertTriangle className="w-3 h-3" />
            <span>Slow</span>
          </button>

          <button
            onClick={() => {
              onSetHealth(node.id, 'failed', 'Injected Service Outage');
              onClose();
            }}
            title="Mark as Failed"
            className={`px-1.5 py-1 text-[11px] font-medium rounded flex items-center justify-center gap-1 border transition-colors ${
              isFailed
                ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <XCircle className="w-3 h-3" />
            <span>Outage</span>
          </button>
        </div>
      </div>

      {/* Destructive Action */}
      <div className="py-1">
        <button
          onClick={() => {
            onRemove(node.id);
            onClose();
          }}
          className="w-full px-3 py-1.5 text-xs text-left text-rose-600 hover:bg-rose-50 hover:text-rose-700 flex items-center gap-2 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete</span>
        </button>
      </div>
    </div>
  );
};
