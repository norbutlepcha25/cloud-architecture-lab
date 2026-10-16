import React from 'react';
import type { ServiceNodeData } from '../../types/index.ts';
import { Cpu } from 'lucide-react';

/** Service-owned configuration surface; behavioral decisions stay in the engine. */
export function LambdaConfigurationPanel({ data: nodeData, onChange }: { data: ServiceNodeData; onChange: (patch: Partial<ServiceNodeData>) => void }) {
  return (
    <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 border-b border-slate-200 pb-2">
        <Cpu className="w-3.5 h-3.5 text-amber-600" />
        <span>AWS Lambda Function Configuration</span>
      </div>

      {/* CPU Architecture */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          Instruction Set Architecture
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChange({
              customConfig: { ...nodeData.customConfig, architecture: 'arm64' }
            } as any)}
            className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all ${
              (nodeData.customConfig?.architecture || 'arm64') === 'arm64'
                ? 'bg-circuit-50 border-circuit-500 text-circuit-800'
                : 'bg-white border-slate-200 text-slate-600'
            }`}
          >
            arm64 (Graviton2, -20% cost)
          </button>
          <button
            type="button"
            onClick={() => onChange({
              customConfig: { ...nodeData.customConfig, architecture: 'x86_64' }
            } as any)}
            className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all ${
              nodeData.customConfig?.architecture === 'x86_64'
                ? 'bg-circuit-50 border-circuit-500 text-circuit-800'
                : 'bg-white border-slate-200 text-slate-600'
            }`}
          >
            x86_64
          </button>
        </div>
      </div>

      {/* Memory Allocation */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          Allocated Memory: {nodeData.customConfig?.memoryMb || 256} MB
        </label>
        <input
          type="range"
          min="128"
          max="3008"
          step="128"
          value={nodeData.customConfig?.memoryMb || 256}
          onChange={(e) => onChange({
            customConfig: { ...nodeData.customConfig, memoryMb: Number(e.target.value) }
          } as any)}
          className="w-full accent-circuit-600"
        />
      </div>

      <label className="block text-xs font-semibold text-slate-700">Timeout (seconds)
        <input type="number" min={1} max={900} className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1"
          value={nodeData.customConfig?.timeoutSeconds ?? 3}
          onChange={(e) => onChange({ customConfig: { ...nodeData.customConfig, timeoutSeconds: Number(e.target.value) } } as any)} />
        <span className="block font-normal text-slate-500 mt-1">Default 3 s, maximum 900 s. As an SQS consumer it must not exceed the queue's visibility timeout.</span>
      </label>

      <label className="block text-xs font-semibold text-slate-700">Simulated processing result
        <select className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1"
          value={nodeData.customConfig?.processingResult ?? 'SUCCEEDED'}
          onChange={(e) => onChange({ customConfig: { ...nodeData.customConfig, processingResult: e.target.value } } as any)}>
          <option value="SUCCEEDED">Function succeeds</option><option value="FAILED">Function returns an error</option>
        </select>
      </label>
    </div>
  );
}
