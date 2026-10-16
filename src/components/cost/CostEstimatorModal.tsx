import React, { useState, useMemo } from 'react';
import { useArchitecture } from '../../context/ArchitectureContext.tsx';
import { calculateArchitectureCost, HOURS_PER_MONTH, COST_REGIONS, type CostRegion } from '../../engine/cost/costCalculator.ts';
import { AwsServiceIcon } from '../icons/AwsServiceIcons.tsx';
import { Download } from 'lucide-react';
import { Modal, modalButton } from '../ui/Modal.tsx';

interface CostEstimatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CostEstimatorModal: React.FC<CostEstimatorModalProps> = ({ isOpen, onClose }) => {
  const { nodes, scenario, setScenario } = useArchitecture();
  const [activeTab, setActiveTab] = useState<'invoice' | 'recommendations'>('invoice');
  const [timeframe, setTimeframe] = useState<'hourly' | 'daily' | 'monthly' | 'annual'>('monthly');

  // Local traffic level override for interactive bill simulation
  const [simulatedTraffic, setSimulatedTraffic] = useState<string>(scenario.trafficLevel || 'normal');
  const [region, setRegion] = useState<CostRegion>('us-east-1');

  const report = useMemo(() => {
    return calculateArchitectureCost(nodes, simulatedTraffic, region);
  }, [nodes, simulatedTraffic, region]);

  if (!isOpen) return null;

  // Multiplier based on timeframe
  const timeframeMultiplier =
    timeframe === 'hourly' ? 1 / HOURS_PER_MONTH :
    timeframe === 'daily' ? 24 / HOURS_PER_MONTH :
    timeframe === 'annual' ? 12 : 1;

  const totalCost = report.monthlyTotal * timeframeMultiplier;
  const timeframeLabel =
    timeframe === 'hourly' ? '/ hr' :
    timeframe === 'daily' ? '/ day' :
    timeframe === 'annual' ? '/ yr' : '/ mo';

  // Category bar colors (distribution meter only)
  const CATEGORY_COLORS: Record<string, string> = {
    'Compute': 'bg-orange-500',
    'Storage': 'bg-lime-500',
    'Databases': 'bg-purple-500',
    'Networking & Content Delivery': 'bg-sky-500',
    'Security, Identity & Compliance': 'bg-rose-500',
    'Management & Governance': 'bg-pink-500'
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(report, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `aws-bill-estimate-${simulatedTraffic}-traffic.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const segment = (active: boolean) =>
    `px-2 py-1 rounded text-[11px] font-medium transition-colors ${active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'}`;
  const tab = (active: boolean) =>
    `pb-2 text-xs font-medium border-b-2 transition-colors ${active ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`;

  const summary = [
    { label: 'Total', value: totalCost, strong: true },
    { label: 'Compute', value: (report.byCategory['Compute'] || 0) * timeframeMultiplier },
    { label: 'Storage', value: (report.byCategory['Storage'] || 0) * timeframeMultiplier },
    { label: 'Networking', value: (report.byCategory['Networking & Content Delivery'] || 0) * timeframeMultiplier }
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Cost Estimator"
      meta={`${report.regionLabel} pricing`}
      size="xl"
      closeLabel="Close cost estimator"
      flush
      footer={
        <button onClick={handleExportJson} className={modalButton.secondary} title="Download detailed JSON invoice">
          <Download className="w-3.5 h-3.5" />
          <span>Export Bill</span>
        </button>
      }
    >
      {/* Controls */}
      <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Region</span>
          <div className="flex items-center gap-0.5">
            {COST_REGIONS.map(r => (
              <button
                key={r.id}
                onClick={() => setRegion(r.id)}
                title={`Approximate ${r.label} regional pricing (blended premium over US baseline, not a live per-SKU quote)`}
                className={segment(region === r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Traffic</span>
          <div className="flex items-center gap-0.5">
            {[
              { id: 'low', label: 'Low (0.5x)' },
              { id: 'normal', label: 'Normal (1x)' },
              { id: 'high', label: 'High (2.5x)' },
              { id: 'very_high', label: 'Peak (5x)' },
              { id: '10x', label: '10x Surge' },
              { id: '100x', label: '100x Surge' }
            ].map(t => (
              <button
                key={t.id}
                onClick={() => {
                  setSimulatedTraffic(t.id);
                  setScenario(prev => ({ ...prev, trafficLevel: t.id as any }));
                }}
                className={segment(simulatedTraffic === t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-0.5 ml-auto">
          {(['hourly', 'daily', 'monthly', 'annual'] as const).map(tf => (
            <button key={tf} onClick={() => setTimeframe(tf)} className={`${segment(timeframe === tf)} capitalize`}>
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="px-5 py-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summary.map(item => (
          <div key={item.label}>
            <div className="text-xs text-slate-500">{item.label}</div>
            <div className={`font-mono text-slate-900 mt-0.5 ${item.strong ? 'text-xl font-semibold' : 'text-base font-medium'}`}>
              ${item.value.toFixed(2)}
              <span className="text-xs font-normal text-slate-500 font-sans ml-1">{timeframeLabel}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Category distribution */}
      {report.monthlyTotal > 0 && (
        <div className="px-5 pb-4">
          <div className="h-1.5 w-full rounded-full bg-slate-100 flex overflow-hidden">
            {Object.entries(report.byCategory).map(([cat, amount]) => {
              const pct = (amount / report.monthlyTotal) * 100;
              if (pct < 1) return null;
              return (
                <div
                  key={cat}
                  style={{ width: `${pct}%` }}
                  className={`${CATEGORY_COLORS[cat] || 'bg-slate-500'} h-full`}
                  title={`${cat}: $${amount.toFixed(2)}/mo (${pct.toFixed(1)}%)`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="px-5 border-b border-slate-200 flex gap-5">
        <button onClick={() => setActiveTab('invoice')} className={tab(activeTab === 'invoice')}>
          Resources ({report.nodeCosts.length})
        </button>
        <button onClick={() => setActiveTab('recommendations')} className={tab(activeTab === 'recommendations')}>
          Optimizations{report.recommendations.length > 0 ? ` (${report.recommendations.length})` : ''}
        </button>
      </div>

      <div className="px-5 py-4">
        {activeTab === 'invoice' && (
          report.nodeCosts.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">No services on the canvas.</p>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                  <th className="py-2 pr-4 font-medium">Resource</th>
                  <th className="py-2 pr-4 font-medium">Category</th>
                  <th className="py-2 pr-4 font-medium">Configuration</th>
                  <th className="py-2 pr-4 font-medium text-right">Line items</th>
                  <th className="py-2 font-medium text-right">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {report.nodeCosts.map(item => (
                  <tr key={item.nodeId}>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2.5">
                        <AwsServiceIcon serviceId={item.serviceId} size={20} />
                        <div>
                          <div className="font-medium text-slate-900">{item.nodeName}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{item.serviceId}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 text-slate-600">{item.category}</td>
                    <td className="py-2.5 pr-4 font-mono text-[11px] text-slate-700">
                      {item.configurationSummary}
                      {item.freeTierEligible && <span className="ml-2 font-sans text-emerald-700">Free Tier</span>}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono text-[11px] text-slate-500">
                      {item.lineItems.map((li, idx) => (
                        <div key={idx} className="truncate max-w-xs ml-auto">
                          {li.name}: ${li.cost.toFixed(2)}
                        </div>
                      ))}
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="font-mono font-medium text-slate-900">
                        ${(item.monthlyCost * timeframeMultiplier).toFixed(2)}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400">
                        ≈ ${(item.hourlyCost).toFixed(4)}/hr
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200">
                  <td colSpan={4} className="py-2.5 pr-4 text-right text-xs text-slate-500">Total</td>
                  <td className="py-2.5 text-right font-mono font-semibold text-slate-900">
                    ${totalCost.toFixed(2)}
                    <span className="text-xs font-normal text-slate-500 ml-1">{timeframeLabel}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          )
        )}

        {activeTab === 'recommendations' && (
          report.recommendations.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">No cost optimizations found.</p>
          ) : (
            <div className="divide-y divide-slate-200">
              {report.recommendations.map(tip => (
                <div key={tip.id} className="py-3 first:pt-0 space-y-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <h4 className="text-sm font-medium text-slate-900">
                      {tip.title}
                      <span className={`ml-2 text-xs font-normal capitalize ${
                        tip.severity === 'high' ? 'text-rose-600' : tip.severity === 'medium' ? 'text-amber-600' : 'text-slate-500'
                      }`}>{tip.severity}</span>
                    </h4>
                    {tip.estimatedMonthlySavings && (
                      <span className="text-xs font-mono text-emerald-700 shrink-0">
                        Save ~${tip.estimatedMonthlySavings.toFixed(2)}/mo
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{tip.description}</p>
                </div>
              ))}
            </div>
          )
        )}

        <p className="mt-4 text-[11px] text-slate-500">
          Estimate only. Regional pricing is an approximate blended premium; free-tier allowances are applied to eligible resources.
        </p>
      </div>
    </Modal>
  );
};
