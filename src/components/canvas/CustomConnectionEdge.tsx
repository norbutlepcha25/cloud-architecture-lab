import React, { memo, useState } from 'react';
import { MoveGlyph } from './MoveGlyph.tsx';
import { EdgeProps, getBezierPath, getStraightPath, getSmoothStepPath, EdgeLabelRenderer, BaseEdge } from '@xyflow/react';
import { ConnectionData, FlowStatus } from '../../types/index.ts';
import { useArchitecture } from '../../context/ArchitectureContext.tsx';
import { relationshipKind, RelationshipKind } from '../../engine/architecture/relationships.ts';

/** Static dash pattern per "Connection meaning" (RelationshipKind) - lets a line read as
 *  request/dependency/manages/etc. at rest, independent of simulation status. Status-driven
 *  overrides below (active/failed/pending) take priority over this while a request is running,
 *  same as they already did for color and width - this only fills in the otherwise-solid default. */
const RELATIONSHIP_DASH: Record<RelationshipKind, string | undefined> = {
  request: undefined, // solid - direct request/response traffic
  dependency: '6,3', // dashed - calls another service it depends on
  authorization: '4,3', // policy relationship, not request traffic
  manages: '2,3', // dotted - control-plane "manages/configures" edge
  'route-association': '8,2,2,2', // dash-dot - route table association
  'target-registration': '1,4' // fine dots - load balancer target registration
};

/** How many simultaneous traveling packets an "active" hop renders, by traffic level - the load
 *  a student picks in Send Request should be visually countable, not just a backend number. Real
 *  req/s at "high"/"10x"/"100x" would be unreadable (or unusably slow) as literal dot-for-dot SVG
 *  animations, so this is a capped, monotonically-increasing visual proxy for volume, not a literal
 *  packets-per-second simulation. */
const PACKET_COUNT_BY_TRAFFIC_LEVEL: Record<string, number> = {
  low: 1,
  normal: 4,
  high: 10,
  '10x': 18,
  '100x': 28
};

/** Mirrors `engine/simulation/adapters/loadBalancer.ts`'s own `LOAD_BALANCER_SERVICE_IDS` /
 *  `COMPUTE_TARGET_SERVICE_IDS` - which serviceIds actually fan traffic out across multiple
 *  registered targets, and which serviceIds are the kind of target a load balancer routes to. */
const LOAD_BALANCER_SERVICE_IDS = ['alb', 'nlb', 'api_gateway'];
const COMPUTE_TARGET_SERVICE_IDS = ['ec2', 'ecs', 'fargate', 'lambda'];

export const CustomConnectionEdge = memo(({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
  selected
}: EdgeProps) => {
  const { setActiveStepIndex, setSelectedEdgeId, scenario, nodes, edges } = useArchitecture();
  const [isHovered, setIsHovered] = useState(false);
  const packetCount = PACKET_COUNT_BY_TRAFFIC_LEVEL[scenario.trafficLevel] ?? 1;

  // A single simulated request only ever picks ONE target - that's real ALB/NLB behavior, not a
  // bug. But once the traffic level implies multiple CONCURRENT requests (packetCount > 1), a real
  // load balancer really does spread them across every healthy registered target, not funnel them
  // all down whichever single edge the one traced request happened to use. This computes this
  // edge's fair share of the total packet stream when it's one of several healthy siblings behind
  // the same load balancer, so the canvas actually shows the fan-out a student expects to see.
  const sourceNode = nodes.find(n => n.id === source);
  const isFromLoadBalancer = Boolean(sourceNode && LOAD_BALANCER_SERVICE_IDS.includes(sourceNode.data.serviceId));
  let fanOutShare: number | null = null;
  if (isFromLoadBalancer && sourceNode) {
    const albIsInPlay = Boolean(sourceNode.data.isSimulating) || (sourceNode.data.simulationStatus && sourceNode.data.simulationStatus !== 'idle');
    if (albIsInPlay) {
      const healthySiblingEdgeIds = edges
        .filter(e => e.source === source)
        .map(e => {
          const targetNode = nodes.find(n => n.id === e.target);
          return targetNode && COMPUTE_TARGET_SERVICE_IDS.includes(targetNode.data.serviceId) && targetNode.data.health === 'healthy'
            ? e.id
            : null;
        })
        .filter((edgeId): edgeId is string => edgeId !== null);

      const myIndex = healthySiblingEdgeIds.indexOf(id);
      if (myIndex !== -1 && healthySiblingEdgeIds.length > 1) {
        const base = Math.floor(packetCount / healthySiblingEdgeIds.length);
        const remainder = packetCount % healthySiblingEdgeIds.length;
        fanOutShare = base + (myIndex < remainder ? 1 : 0);
      }
    }
  }
  const isFanOutTarget = fanOutShare !== null;
  const fanOutHasTraffic = isFanOutTarget && fanOutShare! > 0;

  const edgeData = (data as unknown as ConnectionData) || {
    protocol: 'HTTP',
    interactionType: 'synchronous',
    isCriticalDependency: true,
    timeoutMs: 2500
  };

  const {
    flowStatus,
    flowStepNumber,
    flowStepIndex,
    flowAction,
    flowLatency,
    flowExplanation,
    flowStatusCode,
    isSimulating,
    isFailing
  } = edgeData;

  // Keep the former orthogonal value compatible with existing diagrams.
  const isStraight = edgeData.lineStyle !== 'curved';
  const endpointsAligned = sourceX === targetX || sourceY === targetY;
  const pathBuilder = isStraight
    ? (endpointsAligned ? getStraightPath : getSmoothStepPath)
    : getBezierPath;
  const [defaultEdgePath, defaultLabelX, defaultLabelY] = pathBuilder({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 0
  });

  let edgePath = defaultEdgePath;
  let labelX = defaultLabelX;
  let labelY = defaultLabelY;

  if (!isStraight && edgeData.curveOffset) {
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const len = Math.hypot(dx, dy) || 1;
    const perpX = -dy / len;
    const perpY = dx / len;
    const offset = edgeData.curveOffset;
    const midX = (sourceX + targetX) / 2 + perpX * offset;
    const midY = (sourceY + targetY) / 2 + perpY * offset;
    edgePath = `M ${sourceX} ${sourceY} Q ${midX} ${midY} ${targetX} ${targetY}`;
    labelX = (sourceX + 2 * midX + targetX) / 4;
    labelY = (sourceY + 2 * midY + targetY) / 4;
  }

  // Determine effective flow status
  let effectiveStatus: FlowStatus = flowStatus || 'idle';
  if (!flowStatus) {
    if (isFailing || edgeData.hasMissingReturnBlock) effectiveStatus = 'failed';
    else if (isSimulating) effectiveStatus = 'active';
    else if (flowStepNumber || (edgeData as any)?.stepNumber) effectiveStatus = 'completed';
    else effectiveStatus = 'idle';
  }

  const displayStep = flowStepNumber || (edgeData as any)?.stepNumber;

  // Determine Stroke Colors & Widths based on task flow and signals
  let coreStroke = edgeData.signalType === 'inbound_request'
    ? '#0284C7'
    : edgeData.hasMissingReturnBlock
    ? '#DC2626'
    : 'var(--canvas-edge, #475569)';
  let strokeWidth = selected ? 2.5 : 1.5;
  let strokeDasharray: string | undefined = edgeData.hasMissingReturnBlock
    ? '6,4'
    : RELATIONSHIP_DASH[relationshipKind(edgeData)];
  let animation: string | undefined = undefined;
  let opacity = 1;

  if (effectiveStatus === 'active') {
    coreStroke = edgeData.signalType === 'inbound_request' ? '#0284C7' : '#2563EB';
    strokeWidth = 3.5;
    strokeDasharray = '8,4';
    animation = 'flow-active 2s linear infinite';
  } else if (effectiveStatus === 'failed' || edgeData.hasMissingReturnBlock) {
    coreStroke = '#DC2626'; // Crimson Red
    strokeWidth = 3;
    strokeDasharray = '6,4';
  } else if (effectiveStatus === 'completed') {
    coreStroke = edgeData.signalType === 'outbound_response' && !edgeData.hasMissingReturnBlock
      ? '#059669'
      : '#2563EB';
    strokeWidth = 2.5;
  } else if (effectiveStatus === 'pending') {
    coreStroke = '#93C5FD'; // Soft Sky Blue
    strokeWidth = 2;
    strokeDasharray = '4,4';
  } else if (effectiveStatus === 'dimmed') {
    coreStroke = '#CBD5E1'; // Dimmed Slate
    strokeWidth = 1.2;
    opacity = 0.28;
  } else if (selected) {
    coreStroke = '#2563EB';
    strokeWidth = 2.5;
  } else if (effectiveStatus === 'idle') {
    // A connection that exists but isn't part of any active/rendered task flow still reads as
    // "alive" rather than inert - a slow breathing pulse, never mistaken for the moving-particle
    // "active" state.
    animation = 'edge-idle-pulse 2.6s ease-in-out infinite';
  }

  // Load-balancer fan-out override: a sibling target edge carrying its share of concurrent traffic
  // reads as "in flow", never as dimmed/pending, even though the one traced request didn't happen
  // to pick it.
  if (fanOutHasTraffic && effectiveStatus !== 'active') {
    coreStroke = '#2563EB';
    strokeWidth = Math.max(strokeWidth, 2.5);
    opacity = 1;
  }

  // Approximate midpoint-ish location (65% from source to target) to anchor a stationary
  // "blocked here" indicator for a failed hop - a straight-line lerp is a good enough anchor for a
  // bezier/quadratic curve at this zoom level, and avoids needing a DOM path-length lookup.
  const blockedPointX = sourceX + (targetX - sourceX) * 0.65;
  const blockedPointY = sourceY + (targetY - sourceY) * 0.65;

  const handleBadgeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (flowStepIndex !== undefined) {
      setActiveStepIndex(flowStepIndex);
    }
    setSelectedEdgeId(id);
  };

  return (
    <g
      className="transition-opacity duration-300"
      style={{ opacity }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 1. Glowing Halo Stroke for Highlighted Flow Lines */}
      {effectiveStatus === 'active' && (
        <path
          d={edgePath}
          fill="none"
          stroke="#60A5FA"
          strokeWidth={10}
          strokeOpacity={0.3}
          strokeLinecap="round"
          className="transition-all pointer-events-none"
        />
      )}

      {effectiveStatus === 'failed' && (
        <path
          d={edgePath}
          fill="none"
          stroke="#F87171"
          strokeWidth={10}
          strokeOpacity={0.35}
          strokeLinecap="round"
          className="transition-all pointer-events-none"
        />
      )}

      {effectiveStatus === 'completed' && (
        <path
          d={edgePath}
          fill="none"
          stroke="#93C5FD"
          strokeWidth={6}
          strokeOpacity={0.2}
          strokeLinecap="round"
          className="transition-all pointer-events-none"
        />
      )}

      {/* 2. Interactive invisible wide stroke to make hovering and clicking easier */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        className="cursor-pointer"
        onClick={() => setSelectedEdgeId(id)}
      />

      {/* 3. Core Task Flow Line */}
      {/* Native reconnect anchors remain the hit targets; glyphs never intercept dragging. */}
      {[
        { x: sourceX, y: sourceY, position: sourcePosition },
        { x: targetX, y: targetY, position: targetPosition },
      ].map((end, index) => {
        return <svg key={index} x={end.x - 8} y={end.y - 8} width={16} height={16}
          viewBox="0 0 24 24" className="connection-move-glyph" aria-hidden="true"><MoveGlyph /></svg>;
      })}
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: coreStroke,
          strokeWidth: isHovered && effectiveStatus !== 'dimmed' ? strokeWidth + 0.8 : strokeWidth,
          strokeDasharray,
          animation,
          transition: 'stroke 0.25s ease, stroke-width 0.2s ease, opacity 0.3s ease'
        }}
      />

      {/* 4. Animated Traveling Energy Packets (Representing the Live Flow of Task) - one packet
          stream per in-flight request, so the traffic level a student picked is something they can
          actually count on the wire, not just a number in a dropdown. Evenly spaced via a negative
          `begin` offset per packet (a standard SMIL trick) so the whole stream is visible
          immediately instead of "filling in" one packet at a time. */}
      {(effectiveStatus === 'active' || fanOutHasTraffic) && !edgeData.hasMissingReturnBlock && !edgeData.signalType && (() => {
        const renderCount = isFanOutTarget ? fanOutShare! : packetCount;
        return (
          <>
            {Array.from({ length: renderCount }, (_, i) => {
              const beginOffset = `-${(i / renderCount).toFixed(3)}s`;
              return (
                <React.Fragment key={i}>
                  {/* Outer glow circle */}
                  <circle r="6" fill="#3B82F6" opacity="0.6">
                    <animateMotion dur="1.8s" begin={beginOffset} repeatCount="indefinite" path={edgePath} />
                  </circle>
                  {/* Inner bright packet core */}
                  <circle r="3.5" fill="#FFFFFF" stroke="#2563EB" strokeWidth="1.5">
                    <animateMotion dur="1.8s" begin={beginOffset} repeatCount="indefinite" path={edgePath} />
                  </circle>
                </React.Fragment>
              );
            })}
          </>
        );
      })()}

      {/* Blocked/failed hop: the packet travels toward the target, stops at the point the actual
          rule blocked it (not the target itself - it never arrived), then retries. A stationary
          red pulse marks exactly where it stopped, distinct from the moving-particle "active"
          state and from the plain static red line a merely-not-yet-explained failure would show. */}
      {effectiveStatus === 'failed' && !edgeData.signalType && (
        <>
          <circle r="6" fill="#EF4444" opacity="0.8">
            <animateMotion dur="2.6s" repeatCount="indefinite" path={edgePath} keyPoints="0;0.65;0.65;0" keyTimes="0;0.5;0.75;1" />
          </circle>
          <circle r="3" fill="#FFFFFF" stroke="#DC2626" strokeWidth="1.5">
            <animateMotion dur="2.6s" repeatCount="indefinite" path={edgePath} keyPoints="0;0.65;0.65;0" keyTimes="0;0.5;0.75;1" />
          </circle>
          <circle
            cx={blockedPointX}
            cy={blockedPointY}
            r={7}
            fill="none"
            stroke="#DC2626"
            strokeWidth={2}
            style={{ animation: 'edge-blocked-pulse 1.4s ease-in-out infinite' }}
          />
        </>
      )}

      {/* Success: one brief flash where the packet arrives, the instant a hop completes - keyed
          on which step this is so it plays once per transition, not continuously. */}
      {effectiveStatus === 'completed' && !isFailing && (
        <circle key={`flash-${flowStepIndex ?? 'x'}`} cx={targetX} cy={targetY} r={9} fill="#10B981">
          <animate attributeName="opacity" values="0.9;0.9;0" keyTimes="0;0.2;1" dur="0.7s" fill="freeze" />
          <animate attributeName="r" values="4;13" keyTimes="0;1" dur="0.7s" fill="freeze" />
        </circle>
      )}

      {/* Signal Type: Inbound Request (Always running packet) */}
      {edgeData.signalType === 'inbound_request' && (
        <>
          <circle r="5.5" fill="#0284C7" opacity="0.4">
            <animateMotion dur="2.6s" repeatCount="indefinite" path={edgePath} />
          </circle>
          <circle r="3" fill="#38BDF8" stroke="#0369A1" strokeWidth="1.2">
            <animateMotion dur="2.6s" repeatCount="indefinite" path={edgePath} />
          </circle>
        </>
      )}

      {/* Signal Type: Outbound Response with Missing Return Rule (Red dropped packet) */}
      {edgeData.signalType === 'outbound_response' && edgeData.hasMissingReturnBlock && (
        <>
          <circle r="6" fill="#EF4444" opacity="0.75">
            <animateMotion dur="3s" repeatCount="indefinite" path={edgePath} keyPoints="0;0.58;0.58;0" keyTimes="0;0.55;0.8;1" />
          </circle>
          <circle r="3" fill="#FFFFFF" stroke="#DC2626" strokeWidth="1.5">
            <animateMotion dur="3s" repeatCount="indefinite" path={edgePath} keyPoints="0;0.58;0.58;0" keyTimes="0;0.55;0.8;1" />
          </circle>
        </>
      )}

      {/* Signal Type: Outbound Response when Fixed (Green delivered packet) */}
      {edgeData.signalType === 'outbound_response' && !edgeData.hasMissingReturnBlock && (
        <>
          <circle r="5.5" fill="#10B981" opacity="0.5">
            <animateMotion dur="2.6s" repeatCount="indefinite" path={edgePath} />
          </circle>
          <circle r="3" fill="#FFFFFF" stroke="#059669" strokeWidth="1.2">
            <animateMotion dur="2.6s" repeatCount="indefinite" path={edgePath} />
          </circle>
        </>
      )}

      {/* Subtle traveling particle on completed flow lines */}
      {effectiveStatus === 'completed' && !isFailing && !edgeData.signalType && (
        <circle r="3" fill="#2563EB" opacity="0.7">
          <animateMotion dur="3.2s" repeatCount="indefinite" path={edgePath} />
        </circle>
      )}

      {/* 5. Flow Step Badge & Protocol Tag */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
            zIndex: isHovered ? 99999 : (effectiveStatus === 'active' ? 1005 : 1001)
          }}
          className="nodrag nopan select-none group flex flex-col items-center"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Stateless Block Warning Badge (Callout from problem 3.1) */}
          {edgeData.hasMissingReturnBlock && (
            <div className="mb-1 flex items-center gap-1.5 px-2 py-0.5 rounded bg-white border border-rose-300 text-rose-700 whitespace-nowrap dark:bg-slate-900">
              <span className="text-[10px] font-semibold">Missing NACL return rule</span>
            </div>
          )}

          {displayStep ? (
            <div
              onClick={handleBadgeClick}
              className="relative flex items-center justify-center cursor-pointer transition-transform hover:scale-115 active:scale-95"
              title={`Task Flow Step ${displayStep}: Click to trace`}
            >
              {effectiveStatus === 'active' && (
                <span className="absolute -inset-1.5 rounded-full bg-circuit-400 animate-ping opacity-60" />
              )}
              <div
                className={`flex items-center justify-center font-bold font-mono shadow-md transition-all ${
                  effectiveStatus === 'active'
                    ? 'w-7 h-7 rounded-full bg-circuit-600 text-white text-xs ring-4 ring-circuit-200 ring-offset-1 z-10'
                    : effectiveStatus === 'failed' || edgeData.hasMissingReturnBlock
                    ? 'w-6 h-6 rounded-full bg-rose-600 text-white text-xs ring-2 ring-rose-300'
                    : effectiveStatus === 'pending'
                    ? 'w-5 h-5 rounded-full bg-white border-2 border-circuit-400 text-circuit-600 text-[10px] dark:bg-slate-900 dark:text-circuit-300'
                    : effectiveStatus === 'dimmed'
                    ? 'w-5 h-5 rounded-full bg-slate-200 text-slate-500 text-[10px]'
                    : 'w-6 h-6 rounded-full bg-slate-900 text-white text-xs hover:bg-circuit-600 dark:bg-slate-200 dark:text-slate-900'
                }`}
              >
                {effectiveStatus === 'failed' || edgeData.hasMissingReturnBlock ? '!' : displayStep}
              </div>
            </div>
          ) : (
            <div
              onClick={() => setSelectedEdgeId(id)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border transition-all cursor-pointer ${
                effectiveStatus === 'active'
                  ? 'bg-circuit-50 text-circuit-700 border-circuit-400 ring-2 ring-circuit-300 shadow-sm'
                  : effectiveStatus === 'failed' || edgeData.hasMissingReturnBlock
                  ? 'bg-rose-50 text-rose-700 border-rose-300'
                  : edgeData.signalType === 'inbound_request'
                  ? 'bg-circuit-50 text-circuit-700 border-circuit-300'
                  : edgeData.signalType === 'outbound_response' && !edgeData.hasMissingReturnBlock
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : effectiveStatus === 'dimmed'
                  ? 'bg-slate-50 text-slate-400 border-slate-200 opacity-60 dark:bg-slate-900 dark:text-slate-500 dark:border-slate-700'
                  : 'bg-white text-slate-700 border-slate-300 shadow-xs hover:border-slate-400 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-600 dark:hover:border-slate-400'
              }`}
            >
              {edgeData.protocol || 'HTTP'}
            </div>
          )}

          {/* Descriptive Signal Label */}
          {edgeData.signalLabel && (
            <div className={`mt-1 px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap shadow-xs border ${
              edgeData.hasMissingReturnBlock
                ? 'bg-rose-50 text-rose-700 border-rose-300'
                : edgeData.signalType === 'inbound_request'
                ? 'bg-circuit-50 text-circuit-700 border-circuit-300'
                : 'bg-emerald-50 text-emerald-700 border-emerald-300'
            }`}>
              {edgeData.signalLabel}
            </div>
          )}

          {/* 6. Rich Interactive Tooltip on Line Hover */}
          {isHovered && effectiveStatus !== 'dimmed' && (flowAction || flowStepNumber) && (
            <div className={`absolute ${labelY < 140 ? 'top-full mt-2' : 'bottom-full mb-2'} left-1/2 -translate-x-1/2 w-60 px-3 py-2 rounded-lg bg-white border border-slate-200 shadow-lg dark:bg-slate-900 dark:border-slate-700 pointer-events-none text-left z-[99999]`}>
              {flowAction && (
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-snug mb-1">
                  {flowAction}
                </div>
              )}

              <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500 mb-1">
                <span className="font-semibold text-slate-700 dark:text-slate-200">{edgeData.protocol}</span>
                {flowLatency !== undefined && (
                  <>
                    <span>•</span>
                    <span>+{flowLatency}ms</span>
                  </>
                )}
                {flowStatusCode !== undefined && (
                  <>
                    <span>•</span>
                    <span className={flowStatusCode < 400 ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                      HTTP {flowStatusCode}
                    </span>
                  </>
                )}
              </div>

              {flowExplanation && (
                <p className="text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-2">
                  {flowExplanation}
                </p>
              )}

            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </g>
  );
});

CustomConnectionEdge.displayName = 'CustomConnectionEdge';
