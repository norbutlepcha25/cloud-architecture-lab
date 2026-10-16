import React from 'react';
import { Node } from '@xyflow/react';
import { ServiceNodeData } from '../../types';
import { SERVICE_MAP } from '../../data/serviceCatalog';
import { AwsServiceIcon } from '../icons/AwsServiceIcons';
import { useArchitecture } from '../../context/ArchitectureContext';
import { Modal, modalButton } from '../ui/Modal';

interface NodeStatusModalProps {
  node: Node<ServiceNodeData> | null;
  isOpen: boolean;
  onClose: () => void;
}

const sectionLabel = 'text-xs font-medium text-slate-500 mb-2';

export const NodeStatusModal: React.FC<NodeStatusModalProps> = ({
  node,
  isOpen,
  onClose
}) => {
  const {
    nodes,
    edges,
    duplicateNode,
    removeNode,
    setNodeHealth,
    analysis
  } = useArchitecture();

  if (!isOpen || !node || node.type === 'boundaryNode' || !(node.data as any)?.serviceId) return null;

  const nodeData = node.data || ({} as any);
  const serviceDef = SERVICE_MAP[nodeData.serviceId] || {
    name: nodeData.label || 'AWS Service',
    category: nodeData.category || 'Compute',
    architecturalRole: 'Cloud service component',
    description: 'Managed AWS component',
    failureModes: ['Instance failure', 'Quota exhaustion'],
    resilienceCharacteristics: ['AWS managed multi-AZ resilience'],
    scalabilityCharacteristics: ['Elastic auto-scaling']
  };

  // Find incoming & outgoing connections
  const incomingEdges = edges.filter(e => e.target === node.id);
  const outgoingEdges = edges.filter(e => e.source === node.id);

  // Check if this node is identified as a Single Point of Failure (SPOF)
  const isSpof = analysis.spofs.some(spof => spof.nodeId === node.id);
  const spofDetail = analysis.spofs.find(spof => spof.nodeId === node.id);

  const isHealthy = nodeData.health === 'healthy';
  const isDegraded = nodeData.health === 'degraded';
  const isFailed = nodeData.health === 'failed';

  const handleDuplicate = () => {
    duplicateNode(node.id);
    onClose();
  };

  const handleRemove = () => {
    removeNode(node.id);
    onClose();
  };

  const healthButton = (active: boolean) =>
    `px-2.5 py-1 text-xs font-medium rounded transition-colors ${
      active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
    }`;

  const renderConnections = (list: typeof edges, direction: 'in' | 'out') => (
    list.length === 0 ? (
      <p className="text-xs text-slate-400">None</p>
    ) : (
      <ul className="divide-y divide-slate-100">
        {list.map(edge => {
          const otherId = direction === 'in' ? edge.source : edge.target;
          const other = nodes.find(n => n.id === otherId);
          return (
            <li key={edge.id} className="flex items-center justify-between gap-2 py-1.5 text-xs">
              <span className="text-slate-800 truncate">{other?.data.label || otherId}</span>
              <span className="font-mono text-[11px] text-slate-500">{(edge.data as any)?.protocol || 'HTTP'}</span>
            </li>
          );
        })}
      </ul>
    )
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title={
        <span className="flex items-center gap-2">
          <AwsServiceIcon serviceId={nodeData.serviceId} size={20} />
          {nodeData.label}
        </span>
      }
      meta={serviceDef.category}
      footer={
        <>
          <button onClick={handleRemove} className="mr-auto px-2 py-1.5 text-xs font-medium rounded-md text-rose-600 hover:bg-rose-50 transition-colors">
            Remove Node
          </button>
          <button onClick={handleDuplicate} className={modalButton.secondary}>
            Duplicate Node
          </button>
        </>
      }
    >
      <div className="space-y-5 text-sm">
        <section>
          <h3 className={sectionLabel}>Health</h3>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className={`text-sm font-semibold ${isHealthy ? 'text-emerald-600' : isDegraded ? 'text-amber-600' : isFailed ? 'text-rose-600' : 'text-slate-600'}`}>
                {isHealthy && 'Healthy'}
                {isDegraded && 'Degraded'}
                {isFailed && 'Failed'}
              </span>
              {nodeData.failureReason && (
                <p className="text-xs text-slate-600 mt-0.5">Cause: {nodeData.failureReason}</p>
              )}
            </div>
            <div className="flex items-center gap-1 rounded-md border border-slate-200 p-0.5">
              <button onClick={() => setNodeHealth(node.id, 'healthy')} className={healthButton(isHealthy)}>
                Healthy
              </button>
              <button onClick={() => setNodeHealth(node.id, 'degraded', 'Performance Degraded')} className={healthButton(isDegraded)}>
                Degrade
              </button>
              <button onClick={() => setNodeHealth(node.id, 'failed', 'Injected Service Outage')} className={healthButton(isFailed)}>
                Fail
              </button>
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 pt-4">
          <h3 className={sectionLabel}>Deployment</h3>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-xs">
            <div>
              <dt className="text-slate-500">Availability Zone</dt>
              <dd className="font-mono text-slate-900 mt-0.5">{nodeData.az || 'AZ-A'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Subnet</dt>
              <dd className="text-slate-900 mt-0.5">{nodeData.subnet || 'Private'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Multi-AZ</dt>
              <dd className="text-slate-900 mt-0.5">{nodeData.multiAz || nodeData.az === 'Multi-AZ' ? 'Enabled' : 'Single AZ'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Replicas</dt>
              <dd className="font-mono text-slate-900 mt-0.5">{nodeData.replicas || 1}</dd>
            </div>
          </dl>
          <p className="text-xs text-slate-400 mt-2 font-mono">{node.id}</p>
        </section>

        <section className="border-t border-slate-200 pt-4">
          <h3 className={sectionLabel}>Resilience</h3>
          {isSpof ? (
            <div className="text-xs text-slate-600 space-y-1">
              <p><span className="font-semibold text-rose-600">Single point of failure.</span> {spofDetail?.explanation || 'No redundant parallel path; a failure here cuts traffic to downstream dependencies.'}</p>
              <p>Mitigation: {spofDetail?.mitigation || 'Duplicate the node or enable Multi-AZ failover.'}</p>
            </div>
          ) : (
            <p className="text-xs text-slate-600">
              <span className="font-semibold text-emerald-600">No SPOF detected.</span> Redundant routes exist, or the service is managed multi-AZ.
            </p>
          )}
        </section>

        <section className="border-t border-slate-200 pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <h3 className={sectionLabel}>Inbound ({incomingEdges.length})</h3>
              {renderConnections(incomingEdges, 'in')}
            </div>
            <div>
              <h3 className={sectionLabel}>Outbound ({outgoingEdges.length})</h3>
              {renderConnections(outgoingEdges, 'out')}
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 pt-4">
          <h3 className={sectionLabel}>Role</h3>
          <p className="text-xs text-slate-600 leading-relaxed">{serviceDef.architecturalRole}</p>
        </section>
      </div>
    </Modal>
  );
};
