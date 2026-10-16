import React, { memo } from 'react';
import { CompassHandles } from './CompassHandles.tsx';
import { ServiceNodeData } from '../../types/index.ts';
import { SERVICE_MAP } from '../../data/serviceCatalog.ts';
import { AwsServiceIcon } from '../icons/AwsServiceIcons.tsx';
import { XCircle, CheckCircle2, AlertTriangle } from 'lucide-react';

export const ServiceNode = memo((props: any) => {
  const { data, selected } = props;
  const nodeData = data as ServiceNodeData;
  const serviceDef = SERVICE_MAP[nodeData.serviceId] || {
    name: nodeData.label || 'AWS Service',
    category: nodeData.category || 'Compute',
    color: '#ED7100',
    iconName: nodeData.serviceId
  };

  const asgInstance = nodeData.customConfig?.asgInstance;
  const isFailed = nodeData.health === 'failed';
  const isDegraded = nodeData.health === 'degraded';
  const isSimActive = nodeData.isSimulating;
  // Set by the canvas from engine/analysis/strayComponents.ts; display only.
  const strayReasons: string[] | undefined = (nodeData as any).strayReasons;

  // Visual halo for active simulation, failure, or degradation - driven entirely by the
  // simulation/failure engines' real `health`/`isSimulating` state, never decorative.
  let iconWrapperClasses = 'service-node-icon transition-all duration-200';
  if (isFailed) {
    iconWrapperClasses += ' ring-2 ring-rose-500 rounded-lg p-0.5 bg-rose-50 dark:bg-rose-950/60';
  } else if (isSimActive) {
    iconWrapperClasses += ' ring-4 ring-amber-400 rounded-lg p-0.5 shadow-lg shadow-amber-300/60 scale-105';
  } else if (isDegraded) {
    iconWrapperClasses += ' ring-2 ring-amber-400 rounded-lg p-0.5 bg-amber-50 dark:bg-amber-950/60';
  } else if (strayReasons && !selected) {
    iconWrapperClasses += ' outline outline-2 outline-dashed outline-amber-400 outline-offset-2 rounded-lg';
  } else if (selected) {
    iconWrapperClasses += ' ring-2 ring-circuit-600 rounded-lg p-0.5 shadow-md shadow-circuit-200 dark:shadow-circuit-900';
  }

  return (
    <div className="flex flex-col items-center justify-center p-1 select-none group min-w-[100px] max-w-[140px] text-center" title={strayReasons ? strayReasons.join(' · ') : undefined}>
      {nodeData.customConfig?.asgAlarm && <span className="text-[10px] bg-amber-100 text-amber-900 px-2 rounded">{nodeData.customConfig.asgAlarm.state}</span>}
      {nodeData.customConfig?.asgRuntime && <span className="text-[10px] bg-blue-100 text-blue-900 px-2 rounded">Desired: {nodeData.customConfig.asgRuntime.desired}</span>}
      {asgInstance && <span className={`text-[10px] rounded px-2 py-0.5 mb-1 ${asgInstance.state === 'InService' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800 motion-safe:animate-pulse'}`}>{asgInstance.state}</span>}
      <CompassHandles />

      {/* Official AWS Service Icon */}
      <div className="relative flex items-center justify-center">
        <div className={iconWrapperClasses}>
          <AwsServiceIcon serviceId={nodeData.serviceId} size={50} />
        </div>

        {/* Failed overlay tag */}
        {isFailed && (
          <div className="absolute -top-2 -right-2 bg-rose-600 text-white rounded-full p-0.5 shadow-md">
            <XCircle className="w-3.5 h-3.5 fill-current" />
          </div>
        )}

        {/* Active Simulation Spinner Badge */}
        {isSimActive && (
          <div className="absolute -top-2 -right-2 bg-amber-500 text-slate-900 rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-bold animate-ping-slow shadow-md">
            ●
          </div>
        )}

        {/* Degraded overlay tag - distinct from Failed (red X): still serving traffic, but not
            at full health (e.g. one target down behind a load balancer that still has others). */}
        {isDegraded && !isFailed && !isSimActive && (
          <div className="absolute -top-2 -right-2 bg-amber-500 text-white rounded-full p-0.5 shadow-md">
            <AlertTriangle className="w-3.5 h-3.5 fill-current text-white" />
          </div>
        )}
      </div>

      {/* Clean Service Label under the icon (matches reference diagram) */}
      <div className="mt-1.5 px-1 leading-tight w-full min-w-0">
        <span className="text-[12px] font-semibold text-slate-900 dark:text-slate-100 tracking-tight block [overflow-wrap:anywhere]">
          {nodeData.label || serviceDef.name}
        </span>
        {nodeData.notes && (
          <span className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
            {nodeData.notes}
          </span>
        )}
      </div>

    </div>
  );
});

ServiceNode.displayName = 'ServiceNode';
