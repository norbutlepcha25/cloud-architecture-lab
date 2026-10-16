import React, { useState } from 'react';
import { getServiceKnowledge, ServiceNoteKnowledge } from '../../data/serviceKnowledgeBase.ts';
import { AwsServiceIcon } from '../icons/AwsServiceIcons.tsx';
import { Modal, modalButton } from '../ui/Modal.tsx';

interface ServiceInfoModalProps {
  serviceId: string;
  onClose: () => void;
  onAddToCanvas?: (serviceId: string) => void;
}

type Tab = 'classes' | 'features' | 'useCases' | 'finops';

export const ServiceInfoModal: React.FC<ServiceInfoModalProps> = ({
  serviceId,
  onClose,
  onAddToCanvas
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('classes');
  const knowledge: ServiceNoteKnowledge = getServiceKnowledge(serviceId);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'classes', label: knowledge.keyClassesOrTypesTitle, count: knowledge.classesOrTypes.length },
    { id: 'features', label: 'Key Features', count: knowledge.architecturalFeatures.length },
    { id: 'useCases', label: 'Use Cases', count: knowledge.useCases.length },
    { id: 'finops', label: 'Cost' }
  ];

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="xl"
      flush
      title={
        <span className="flex items-center gap-2">
          <AwsServiceIcon serviceId={knowledge.serviceId} size={20} />
          {knowledge.serviceName}
        </span>
      }
      meta={knowledge.storageModel}
      footer={onAddToCanvas && (
        <button
          onClick={() => {
            onAddToCanvas(knowledge.serviceId);
            onClose();
          }}
          className={modalButton.primary}
        >
          Add to Canvas
        </button>
      )}
    >
      <div className="px-5 pt-4 pb-3 border-b border-slate-200">
        <p className="text-sm text-slate-600 leading-relaxed">{knowledge.overview}</p>
      </div>

      <div className="px-5 border-b border-slate-200 flex items-center gap-5" role="tablist">
        {tabs.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`py-2.5 -mb-px text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && <span className="ml-1.5 text-slate-400">{tab.count}</span>}
          </button>
        ))}
      </div>

      <div className="p-5">
        {activeTab === 'classes' && (
          <div className="divide-y divide-slate-200">
            {knowledge.classesOrTypes.map((item, idx) => (
              <div key={idx} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-baseline gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">{item.name}</h3>
                  {item.code && <span className="font-mono text-[11px] text-slate-500">{item.code}</span>}
                </div>
                <p className="text-xs text-slate-600 leading-relaxed mt-1">{item.headline}</p>
                <dl className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-1 text-xs mt-2">
                  <dt className="text-slate-500">Durability</dt>
                  <dd className="text-slate-800">{item.durabilityOrAvailability}</dd>
                  <dt className="text-slate-500">Performance</dt>
                  <dd className="text-slate-800">{item.performance}</dd>
                  <dt className="text-slate-500">Use cases</dt>
                  <dd className="text-slate-600">{item.useCases}</dd>
                  <dt className="text-slate-500">Cost</dt>
                  <dd className="text-slate-600">{item.costProfile}</dd>
                  {item.features && item.features.length > 0 && (
                    <>
                      <dt className="text-slate-500">Features</dt>
                      <dd className="text-slate-600">{item.features.join(', ')}</dd>
                    </>
                  )}
                </dl>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'features' && (
          <div className="divide-y divide-slate-200">
            {knowledge.architecturalFeatures.map((feat, idx) => (
              <div key={idx} className="py-3 first:pt-0 last:pb-0">
                <h3 className="text-sm font-semibold text-slate-900">{feat.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed mt-1">{feat.description}</p>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'useCases' && (
          <div className="divide-y divide-slate-200">
            {knowledge.useCases.map((uc, idx) => (
              <div key={idx} className="py-3 first:pt-0 last:pb-0">
                <h3 className="text-sm font-semibold text-slate-900">{uc.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed mt-1">{uc.description}</p>
                <p className="text-xs text-slate-500 leading-relaxed mt-1.5">
                  <span className="font-medium text-slate-700">Architecture: </span>
                  {uc.architectureTip}
                </p>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'finops' && (
          <ul className="list-disc pl-4 space-y-2 text-xs text-slate-600 leading-relaxed marker:text-slate-400">
            {knowledge.finopsTips.map((tip, idx) => (
              <li key={idx}>{tip}</li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
};
