import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { Node, Edge } from '@xyflow/react';
import type { ServiceNodeData } from '../../types/index.ts';
import { ServiceLearningPanel } from './ServiceLearningPanel.tsx';
import { LoadBalancerLesson } from './LoadBalancerLesson.tsx';
import { ScalingPolicyLesson } from './ScalingPolicyLesson.tsx';
import { EventBridgeLesson } from './EventBridgeLesson.tsx';
import { WalkthroughView } from './WalkthroughView.tsx';
import { sqsWalkthrough } from '../../engine/explain/walkthrough.ts';
import { useState } from 'react';

export const BEHAVIOR_EXPLORER_SERVICES = ['alb', 'nlb', 'cloudwatch', 'sqs', 'ec2_auto_scaling', 'auto_scaling_mgmt', 'eventbridge', 'eventbridge_scheduler', 'iam', 'ec2', 'ecr_registry'];
export function ServiceBehaviorExplorer({ node, nodes, edges, onUpdate, onClose }: {
  node: Node<ServiceNodeData>; nodes: Node<ServiceNodeData>[]; edges: Edge[];
  onUpdate: (id: string, patch: Partial<ServiceNodeData>) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const service = node.data.serviceId;
  const isBalancer = service === 'alb' || service === 'nlb';
  const isScaling = ['cloudwatch', 'sqs', 'ec2_auto_scaling', 'auto_scaling_mgmt'].includes(service);
  const isEvent = service === 'eventbridge' || service === 'eventbridge_scheduler';
  const connections = edges.filter(e => e.source === node.id || e.target === node.id);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; ref.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return createPortal(<div className="fixed inset-0 z-[11000] bg-slate-950/40 p-2 sm:p-4 flex items-center justify-center" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="service-behavior-title" tabIndex={-1} className="overlay-text w-full max-w-6xl h-[92dvh] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-xl outline-none" onKeyDown={e => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'Tab') {
        const items = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]');
        if (!items?.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { e.preventDefault(); first.focus(); }
      }
    }}>
      <header className="flex items-center justify-between gap-4 px-5 h-12 shrink-0 border-b border-slate-200"><div className="flex items-baseline gap-2 min-w-0"><h2 id="service-behavior-title" className="text-sm font-semibold text-slate-900 truncate">{node.data.label}</h2><span className="text-xs text-slate-500 truncate">Teaching example · does not change your architecture</span></div><button type="button" className="p-1.5 -mr-1.5 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100" onClick={onClose} aria-label="Close service behavior"><X className="w-4 h-4" /></button></header>
      <div className="flex-1 min-h-0 grid lg:grid-cols-[minmax(0,1fr)_340px] overflow-y-auto lg:overflow-hidden">
        <main className="min-w-0 p-5 bg-slate-50 lg:overflow-y-auto">
          {isBalancer && <LoadBalancerLesson kind={service as 'alb' | 'nlb'} />}
          {service === 'sqs' && <SqsLifecycle node={node} nodes={nodes} edges={edges} />}
          {isScaling && <ScalingPolicyLesson source={service as 'cloudwatch' | 'sqs' | 'ec2_auto_scaling' | 'auto_scaling_mgmt'} />}
          {isEvent && <EventBridgeLesson scheduler={service === 'eventbridge_scheduler'} />}
          {!isBalancer && !isScaling && !isEvent && <div className="space-y-4 text-sm">
            <h3 className="font-semibold text-sm">{service === 'ecr_registry' ? 'Image delivery across services' : 'Permission boundaries across services'}</h3>
            {(service === 'ecr_registry' ? ['Build and push container image', 'ECR repository: image tag or digest', 'ECS agent pulls image using appropriate role', 'Container starts from task definition'] : service === 'ec2' ? ['IAM role inside an instance profile', 'Profile attached to EC2 host', 'ECS agent uses container instance role', 'Application uses its separate task role'] : ['IAM role + trust policy + permissions', 'Task role → application AWS API calls', 'Execution role → supported ECS agent operations', 'Instance profile → role for EC2 host']).map((text, i) => <div key={text} className="flex gap-3 items-baseline px-4 py-2.5 border border-slate-200 rounded-md bg-white"><span className="text-xs tabular-nums text-slate-400">{i + 1}</span>{text}</div>)}
            <p className="text-xs text-slate-500">Illustration only; authorization still requires policy evaluation.</p>
          </div>}
        </main>
        <aside aria-label="Service behavior details" className="p-5 border-t lg:border-l lg:border-t-0 border-slate-200 lg:overflow-y-auto space-y-4">
          {isEvent ? <><h3 className="font-semibold text-sm">Invocation is not service scaling</h3><p className="text-sm text-slate-700">EventBridge rules and Scheduler can invoke ECS RunTask. Application Auto Scaling scheduled actions instead change the bounds of an ECS service’s scalable target.</p><a className="block text-xs text-slate-500 underline hover:text-slate-900" target="_blank" rel="noreferrer" href="https://docs.aws.amazon.com/autoscaling/application/userguide/scheduled-scaling-policy-overview.html">AWS: scheduled scaling</a></> : <ServiceLearningPanel ec2Scaling={service === 'ec2_auto_scaling'} topic={isBalancer ? 'balancing' : isScaling ? 'scaling' : service === 'ecr_registry' ? 'registry' : 'roles'} fargate={false} workspace={node.data.customConfig?.serviceLearning ?? {}} onChange={patch => onUpdate(node.id, { customConfig: { ...node.data.customConfig, serviceLearning: { ...node.data.customConfig?.serviceLearning, ...patch } } })} />}
          {service === 'sqs' && <section className="border-t border-slate-200 pt-4 text-sm text-slate-700 space-y-2"><h4 className="font-semibold text-sm text-slate-900">Queue metric requirements</h4><p>Backlog per task = ApproximateNumberOfMessagesVisible / RunningTaskCount. The running-task metric requires ECS Container Insights in this example. Missing data prevents a metric-based decision.</p><p>Choose a backlog target from acceptable queue latency divided by average processing time. SQS does not own the scaling policy. Target tracking is distinct from the three step-adjustment expressions.</p><a className="block text-xs text-slate-500 underline hover:text-slate-900" target="_blank" rel="noreferrer" href="https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-autoscaling-queue.html">AWS: SQS backlog-based ECS scaling</a></section>}
          <section className="border-t border-slate-200 pt-4 space-y-1"><h3 className="font-semibold text-xs text-slate-600">Canvas connections</h3>{!connections.length && <p className="text-sm text-slate-500">No connected resources.</p>}{connections.map(e => <p key={e.id} className="text-sm py-1.5 border-b border-slate-100">{e.source === node.id ? 'To: ' : 'From: '}{nodes.find(n => n.id === (e.source === node.id ? e.target : e.source))?.data.label || 'Missing resource'}</p>)}</section>
        </aside>
      </div>
    </div>
  </div>, document.body);
}

function SqsLifecycle({ node, nodes, edges }: { node: Node<ServiceNodeData>; nodes: Node<ServiceNodeData>[]; edges: Edge[] }) {
  const [consumerFails, setConsumerFails] = useState<boolean | undefined>(undefined);
  const walkthrough = React.useMemo(() => sqsWalkthrough(node, nodes, edges as any, { consumerFails }), [node, nodes, edges, consumerFails]);
  return <div className="mb-6 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
    <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={consumerFails === true} onChange={e => setConsumerFails(e.target.checked ? true : undefined)} />What if the consumer fails to process the message</label>
    <WalkthroughView walkthrough={walkthrough} ariaLabel="SQS message lifecycle" />
  </div>;
}
