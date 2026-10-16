import React from 'react';
import type { ServiceNodeData } from '../../types/index.ts';
import { Server, HardDrive } from 'lucide-react';
import { EC2_INSTANCE_TYPES, EC2_OS_IMAGES, EBS_VOLUME_TYPES } from '../../engine/cost/costCalculator.ts';

/** Service-owned configuration surface; behavioral decisions stay in the engine. */
export function Ec2ConfigurationPanel({ data: nodeData, onChange }: { data: ServiceNodeData; onChange: (patch: Partial<ServiceNodeData>) => void }) {
  return (
    <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 border-b border-slate-200 pb-2">
        <Server className="w-3.5 h-3.5 text-orange-600" />
        <span>Amazon EC2 Instance Configuration</span>
      </div>

      {/* OS Image / AMI */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          Amazon Machine Image (AMI / OS)
        </label>
        <select
          value={nodeData.customConfig?.osImage || 'al2023'}
          onChange={(e) => onChange({
            customConfig: { ...nodeData.customConfig, osImage: e.target.value }
          } as any)}
          className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-circuit-600 font-sans"
        >
          {EC2_OS_IMAGES.map(img => (
            <option key={img.id} value={img.id}>{img.label}</option>
          ))}
        </select>
      </div>

      {/* Instance Type / Size */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          Instance Type / Size
        </label>
        <select
          value={nodeData.customConfig?.instanceType || 't3.micro'}
          onChange={(e) => onChange({
            customConfig: { ...nodeData.customConfig, instanceType: e.target.value }
          } as any)}
          className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-circuit-600 font-mono"
        >
          {['General Purpose', 'Compute Optimized', 'Memory Optimized', 'Accelerated / GPU'].map(family => (
            <optgroup key={family} label={family}>
              {Object.entries(EC2_INSTANCE_TYPES)
                .filter(([_, def]) => def.family === family)
                .map(([key, def]) => (
                  <option key={key} value={key}>
                    {key} • {def.vCpu} vCPU, {def.ramGb}GB (${(def.hourly * 730).toFixed(2)}/mo)
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Purchasing Option */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          Purchasing Option
        </label>
        <select
          value={nodeData.customConfig?.purchasingOption || 'on_demand'}
          onChange={(e) => onChange({
            customConfig: { ...nodeData.customConfig, purchasingOption: e.target.value }
          } as any)}
          className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-circuit-600 text-xs"
        >
          <option value="on_demand">On-Demand (Standard hourly)</option>
          <option value="savings_plan_1yr">Compute Savings Plan 1-Yr (~35% discount)</option>
          <option value="savings_plan_3yr">Compute Savings Plan 3-Yr (~55% discount)</option>
          <option value="spot">Spot Instances (Up to 70% discount, interruptible)</option>
        </select>
      </div>

      {/* EBS Root Storage Volume */}
      <div className="space-y-2 pt-1 border-t border-slate-200">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
          <span className="flex items-center gap-1">
            <HardDrive className="w-3.5 h-3.5 text-slate-500" />
            EBS Volume Storage
          </span>
          <span className="font-mono text-circuit-600 font-bold">
            {nodeData.customConfig?.ebsVolumeSizeGb || 30} GB
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Volume Type</label>
            <select
              value={nodeData.customConfig?.ebsVolumeType || 'gp3'}
              onChange={(e) => onChange({
                customConfig: { ...nodeData.customConfig, ebsVolumeType: e.target.value }
              } as any)}
              className="w-full px-2 py-1 text-xs rounded bg-white border border-slate-300 font-mono"
            >
              {Object.entries(EBS_VOLUME_TYPES).map(([k, def]) => (
                <option key={k} value={k}>{k.toUpperCase()} (${def.costPerGb}/GB)</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Size (GB)</label>
            <input
              type="number"
              min="8"
              max="2000"
              value={nodeData.customConfig?.ebsVolumeSizeGb || 30}
              onChange={(e) => onChange({
                customConfig: { ...nodeData.customConfig, ebsVolumeSizeGb: Number(e.target.value) }
              } as any)}
              className="w-full px-2 py-1 text-xs rounded bg-white border border-slate-300 font-mono"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
