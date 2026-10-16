import React from 'react';
import type { ServiceNodeData } from '../../types/index.ts';
import { Database } from 'lucide-react';
import { RDS_INSTANCE_TYPES } from '../../engine/cost/costCalculator.ts';

/** Service-owned configuration surface; behavioral decisions stay in the engine. */
export function DatabaseConfigurationPanel({ data: nodeData, onChange }: { data: ServiceNodeData; onChange: (patch: Partial<ServiceNodeData>) => void }) {
  return (
    <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 border-b border-slate-200 pb-2">
        <Database className="w-3.5 h-3.5 text-purple-600" />
        <span>Amazon RDS Database Configuration</span>
      </div>

      {/* Database Engine */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          Database Engine
        </label>
        <select
          value={nodeData.customConfig?.dbEngine || 'PostgreSQL'}
          onChange={(e) => onChange({
            customConfig: { ...nodeData.customConfig, dbEngine: e.target.value }
          } as any)}
          className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-300 text-slate-900 font-sans"
        >
          <option value="PostgreSQL">PostgreSQL (Community Edition)</option>
          <option value="MySQL">MySQL Community</option>
          <option value="Aurora PostgreSQL">Amazon Aurora (PostgreSQL Compatible)</option>
          <option value="Aurora MySQL">Amazon Aurora (MySQL Compatible)</option>
          <option value="MariaDB">MariaDB</option>
        </select>
      </div>

      {/* DB Instance Class */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          DB Instance Class
        </label>
        <select
          value={nodeData.customConfig?.dbInstanceClass || 'db.t4g.micro'}
          onChange={(e) => onChange({
            customConfig: { ...nodeData.customConfig, dbInstanceClass: e.target.value }
          } as any)}
          className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-300 text-slate-900 font-mono"
        >
          {Object.entries(RDS_INSTANCE_TYPES).map(([k, def]) => (
            <option key={k} value={k}>
              {def.label} (${(def.hourly * 730).toFixed(2)}/mo)
            </option>
          ))}
        </select>
      </div>

      {/* Allocated Storage */}
      <div>
        <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
          <span>Allocated Storage (gp3)</span>
          <span className="font-mono text-circuit-600 font-bold">
            {nodeData.customConfig?.storageGb || 50} GB
          </span>
        </div>
        <input
          type="range"
          min="20"
          max="1000"
          step="10"
          value={nodeData.customConfig?.storageGb || 50}
          onChange={(e) => onChange({
            customConfig: { ...nodeData.customConfig, storageGb: Number(e.target.value) }
          } as any)}
          className="w-full accent-circuit-600"
        />
      </div>
    </div>
  );
}
