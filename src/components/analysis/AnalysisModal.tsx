import React, { useState } from 'react';
import { useArchitecture } from '../../context/ArchitectureContext.tsx';
import { Modal } from '../ui/Modal.tsx';

interface AnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SEVERITY_TEXT: Record<string, string> = {
  CRITICAL: 'text-rose-700',
  HIGH: 'text-rose-700',
  MEDIUM: 'text-amber-700',
  LOW: 'text-slate-500',
  INFO: 'text-slate-500'
};

const RATING_TEXT: Record<string, string> = {
  Resilient: 'text-emerald-700',
  Moderate: 'text-amber-700'
};

const RISK_SUBCATEGORIES = ['public_exposure', 'redundancy', 'dependency_concentration', 'blast_radius', 'security_risk', 'iam'];

type Tab = 'scores' | 'spofs' | 'bottlenecks' | 'security' | 'validation' | 'risks';

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="py-6 text-center text-xs text-slate-500">{children}</p>
);

const Item: React.FC<{ title: React.ReactNode; status: React.ReactNode; statusClass: string; children: React.ReactNode }> = ({ title, status, statusClass, children }) => (
  <div className="py-3 first:pt-0 space-y-1">
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm font-medium text-slate-900">{title}</span>
      <span className={`text-xs shrink-0 ${statusClass}`}>{status}</span>
    </div>
    <div className="space-y-1 text-xs text-slate-600 leading-relaxed">{children}</div>
  </div>
);

export const AnalysisModal: React.FC<AnalysisModalProps> = ({ isOpen, onClose }) => {
  const { analysis, validationFindings, architecturalFindings } = useArchitecture();
  const [activeTab, setActiveTab] = useState<Tab>('scores');

  if (!isOpen) return null;

  // Everything from the new unified analysis engine (engine/analysis/architecturalFindings.ts)
  // NOT already shown by the legacy SPOF/Bottleneck tabs - public exposure, missing
  // redundancy, dependency concentration, failure blast radius, and IAM/security risk.
  const riskFindings = architecturalFindings.filter(f => RISK_SUBCATEGORIES.includes(f.subcategory));

  const scoreCategories = [
    { key: 'availability', label: 'Availability', detail: analysis.availability },
    { key: 'resilience', label: 'Resilience', detail: analysis.resilience },
    { key: 'faultTolerance', label: 'Fault Tolerance', detail: analysis.faultTolerance },
    { key: 'scalability', label: 'Scalability', detail: analysis.scalability },
    { key: 'security', label: 'Security & Isolation', detail: analysis.security },
  ];

  const criticalSecurity = analysis.securityIssues.filter(s => s.severity === 'CRITICAL').length;
  const count = (n: number) => (n > 0 ? ` (${n})` : '');

  const tabs: { id: Tab; label: string; title?: string }[] = [
    { id: 'scores', label: 'Scores' },
    { id: 'spofs', label: `Single Points of Failure${count(analysis.spofs.length)}` },
    { id: 'bottlenecks', label: `Bottlenecks${count(analysis.bottlenecks.length)}` },
    { id: 'security', label: `Security${count(criticalSecurity)}` },
    { id: 'validation', label: `Configuration Validity${count(validationFindings.length)}`, title: 'Is this legal, well-formed AWS configuration? Independent of request success and of design quality.' },
    { id: 'risks', label: `Architecture Risks${count(riskFindings.length)}`, title: 'Design risk. A valid, successful architecture can still score badly here.' },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Architecture Analysis"
      meta={<span className={RATING_TEXT[analysis.overallRating] ?? 'text-rose-700'}>{analysis.overallRating}</span>}
      size="xl"
      closeLabel="Close analysis"
      flush
    >
      <nav className="flex gap-5 px-5 border-b border-slate-200 overflow-x-auto custom-scrollbar">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            title={tab.title}
            className={`py-2.5 text-xs whitespace-nowrap border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? 'border-slate-900 text-slate-900 font-medium'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="p-5">
        {activeTab === 'scores' && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 leading-relaxed">{analysis.summary}</p>
            <div className="divide-y divide-slate-200">
              {scoreCategories.map(cat => (
                <div key={cat.key} className="py-3 first:pt-0 space-y-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-medium text-slate-900">{cat.label}</span>
                    <span className="text-sm font-mono text-slate-900">{cat.detail.score}%</span>
                  </div>
                  <div className="w-full h-1 rounded-full bg-slate-200 overflow-hidden">
                    <div className="h-full bg-slate-700" style={{ width: `${cat.detail.score}%` }} />
                  </div>
                  {(cat.detail.positiveReasons.length > 0 || cat.detail.negativeReasons.length > 0) && (
                    <ul className="space-y-0.5 text-xs text-slate-600 leading-snug">
                      {cat.detail.positiveReasons.map((pos, idx) => (
                        <li key={`p${idx}`} className="flex gap-1.5"><span className="text-emerald-700">+</span><span>{pos}</span></li>
                      ))}
                      {cat.detail.negativeReasons.map((neg, idx) => (
                        <li key={`n${idx}`} className="flex gap-1.5"><span className="text-rose-700">−</span><span>{neg}</span></li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500">Rule-based scoring, approximating the AWS Well-Architected Framework.</p>
          </div>
        )}

        {activeTab === 'spofs' && (
          analysis.spofs.length === 0 ? <Empty>No single points of failure detected.</Empty> : (
            <div className="divide-y divide-slate-200">
              {analysis.spofs.map((spof, idx) => (
                <Item key={idx} title={spof.nodeName} status={`${spof.impactLevel} risk`} statusClass="text-rose-700">
                  <p>{spof.explanation}</p>
                  <p><span className="text-slate-500">Fix: </span>{spof.mitigation}</p>
                </Item>
              ))}
            </div>
          )
        )}

        {activeTab === 'bottlenecks' && (
          analysis.bottlenecks.length === 0 ? <Empty>No bottlenecks detected.</Empty> : (
            <div className="divide-y divide-slate-200">
              {analysis.bottlenecks.map((btn, idx) => (
                <Item key={idx} title={btn.title} status={btn.severity.toLowerCase()} statusClass="text-amber-700">
                  <p>{btn.explanation}</p>
                  <p><span className="text-slate-500">Mitigation: </span>{btn.mitigation}</p>
                </Item>
              ))}
            </div>
          )
        )}

        {activeTab === 'security' && (
          analysis.securityIssues.length === 0 ? <Empty>No security issues detected.</Empty> : (
            <div className="divide-y divide-slate-200">
              {analysis.securityIssues.map((sec, idx) => (
                <Item key={idx} title={sec.title} status={sec.severity.toLowerCase()} statusClass={sec.severity === 'CRITICAL' ? 'text-rose-700' : 'text-amber-700'}>
                  <p>{sec.explanation}</p>
                  <p><span className="text-slate-500">Best practice: </span>{sec.recommendation}</p>
                </Item>
              ))}
            </div>
          )
        )}

        {/* Configuration Validity - "is this legal AWS config?", never "is this a good design"
            and never "did a simulated request succeed" (the Simulation panel). */}
        {activeTab === 'validation' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">Configuration AWS itself would reject or mishandle, independent of design quality.</p>
            {validationFindings.length === 0 ? <Empty>No configuration errors found.</Empty> : (
              <div className="divide-y divide-slate-200">
                {validationFindings.map(f => (
                  <Item key={f.id} title={f.resource} status={f.severity} statusClass={SEVERITY_TEXT[f.severity] || SEVERITY_TEXT.MEDIUM}>
                    <p className="text-slate-700">{f.problem}</p>
                    <p>{f.whyItMatters}</p>
                    <p className="text-slate-500">{f.awsRule}</p>
                    <p><span className="text-slate-500">Recommendation: </span>{f.recommendation}</p>
                  </Item>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Architecture Risks - "is this a GOOD design?". A valid, successfully-simulating
            architecture can still land findings here (engine/analysis/architecturalFindings.ts). */}
        {activeTab === 'risks' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">Design risk only; does not mean the configuration is invalid or that requests fail.</p>
            {riskFindings.length === 0 ? <Empty>No architectural risks found.</Empty> : (
              <div className="divide-y divide-slate-200">
                {riskFindings.map(f => (
                  <Item key={f.id} title={f.resource} status={`${f.severity} · ${f.subcategory.replace(/_/g, ' ')}`} statusClass={SEVERITY_TEXT[f.severity] || SEVERITY_TEXT.MEDIUM}>
                    <p className="text-slate-700">{f.problem}</p>
                    <p>{f.whyItMatters}</p>
                    <p className="text-slate-500">{f.awsRule}</p>
                    <p><span className="text-slate-500">Recommendation: </span>{f.recommendation}</p>
                  </Item>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
