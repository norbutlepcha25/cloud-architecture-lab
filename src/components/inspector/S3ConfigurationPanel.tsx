import React from 'react';
import type { ServiceNodeData } from '../../types/index.ts';
import { HardDrive } from 'lucide-react';
import { S3_STORAGE_CLASSES } from '../../engine/cost/costCalculator.ts';

/** Service-owned configuration surface; behavioral decisions stay in the engine. */
export function S3ConfigurationPanel({ data: nodeData, onChange }: { data: ServiceNodeData; onChange: (patch: Partial<ServiceNodeData>) => void }) {
  return (
    <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 border-b border-slate-200 pb-2">
        <HardDrive className="w-3.5 h-3.5 text-emerald-600" />
        <span>Amazon S3 Bucket Configuration</span>
      </div>

      {/* Storage Class Dropdown */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          S3 Storage Class / Tier
        </label>
        <select
          value={nodeData.customConfig?.storageClass || 'STANDARD'}
          onChange={(e) => onChange({
            customConfig: { ...nodeData.customConfig, storageClass: e.target.value }
          } as any)}
          className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-circuit-600 font-sans"
        >
          {Object.entries(S3_STORAGE_CLASSES).map(([k, def]) => (
            <option key={k} value={k}>{def.label} — {def.desc}</option>
          ))}
        </select>
      </div>

      {/* Data Volume Capacity */}
      <div>
        <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
          <span>Stored Data Capacity</span>
          <span className="font-mono text-circuit-600 font-bold">
            {(nodeData.customConfig?.storageGb || 50) >= 1000
              ? `${((nodeData.customConfig?.storageGb || 50) / 1000).toFixed(1)} TB`
              : `${nodeData.customConfig?.storageGb || 50} GB`}
          </span>
        </div>
        <input
          type="range"
          min="5"
          max="10000"
          step="5"
          value={nodeData.customConfig?.storageGb || 50}
          onChange={(e) => onChange({
            customConfig: { ...nodeData.customConfig, storageGb: Number(e.target.value) }
          } as any)}
          className="w-full accent-circuit-600"
        />
        <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-0.5">
          <span>5 GB</span>
          <span>1 TB</span>
          <span>10 TB</span>
        </div>
      </div>

      {/* S3 Security & Versioning Features */}
      <div className="pt-2 border-t border-slate-200 space-y-1.5">
        <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700">
          <input
            type="checkbox"
            checked={nodeData.customConfig?.versioning !== false}
            onChange={(e) => onChange({
              customConfig: { ...nodeData.customConfig, versioning: e.target.checked }
            } as any)}
            className="rounded border-slate-300 text-circuit-600"
          />
          <span>Bucket Versioning Enabled</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700">
          <input
            type="checkbox"
            checked={nodeData.customConfig?.blockPublicAccess !== false}
            onChange={(e) => onChange({
              customConfig: { ...nodeData.customConfig, blockPublicAccess: e.target.checked }
            } as any)}
            className="rounded border-slate-300 text-circuit-600"
          />
          <span>Block All Public Access (AWS Default)</span>
        </label>
      </div>
    </div>
  );
}
