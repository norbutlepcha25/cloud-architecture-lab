import { AnalyticsNotice } from '../../analytics/AnalyticsNotice.tsx';
import React from 'react';
import { fallbackContributors, loadContributors, type Contributor } from '../../utils/contributors.ts';
import { ArrowRight, GitBranch, MessageSquare, Bug, ShieldAlert, Play, Layers, BookOpen, Copy, Check, Terminal, Users, School, FlaskConical, XCircle, FileDown, FileUp, HardDrive, ImageDown, ExternalLink } from 'lucide-react';
import { AwsServiceIcon } from '../icons/AwsServiceIcons.tsx';
import { VpcGroupIcon, PublicSubnetGroupIcon, PrivateSubnetGroupIcon } from '../icons/AwsGroupIcons.tsx';
import { COURSE_LABS } from '../../data/courseLabs.ts';
import { useTheme } from '../../utils/theme.ts';
import { ThemeToggle } from '../layout/ThemeToggle.tsx';

const repository = 'https://github.com/norbutlepcha25/cloud-architecture-lab';
function useContributors() {
  const [contributors, setContributors] = React.useState(fallbackContributors);
  React.useEffect(() => {
    if (typeof fetch !== 'function') return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    loadContributors(controller.signal)
      .then(humans => { if (!controller.signal.aborted) setContributors(humans); })
      .catch(() => { /* Offline, malformed response or rate limit: retain curated credits. */ })
      .finally(() => window.clearTimeout(timeout));
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, []);
  return contributors;
}

function ContributorCard({ c }: { c: Contributor }) {
  const [broken, setBroken] = React.useState(false);
  const label = c.name ?? c.login;
  return <li><a href={`https://github.com/${c.login}`} target="_blank" rel="noopener noreferrer">
    {broken ? <span className="home-avatar" aria-hidden="true">{label.slice(0, 2)}</span>
      : <img className="home-avatar" src={c.avatar} alt="" width={56} height={56} loading="lazy" onError={() => setBroken(true)} />}
    <span className="home-person"><strong>{label}</strong><small>@{c.login}{c.contributions ? ` · ${c.contributions} commit${c.contributions === 1 ? '' : 's'}` : ''}</small></span>
  </a></li>;
}

// ── Illustrative scenarios ──────────────────────────────────────────────────
// Static teaching pictures drawn with the canvas's own icons and frame colours. They are not engine
// output: they show the kind of decision trace the lab produces.
type Status = 'ok' | 'deny' | 'down';
type DNode = { id: string; serviceId: string; label: string; sub: string; x: number; y: number; status?: Status };
type DEdge = { from: string; to: string; label?: string; status: Status };
type TraceLine = { step: string; detail: string; result: 'ALLOW' | 'DENY' | 'OK' | 'FAIL' | 'INFO' };
type Scenario = { id: string; tab: string; title: string; summary: string; nodes: DNode[]; edges: DEdge[]; trace: TraceLine[]; final: string; finalOk: boolean; sources: Array<[string, string]> };

// Diagram coordinates (viewBox 560 × 420). Node x/y is the icon centre.
const VIEW_W = 560, VIEW_H = 420;
const ROW = { public: 96, app: 211, data: 326 };
const frontDoor = (rdsStatus?: Status): DNode[] => [
  { id: 'client', serviceId: 'user', label: 'Client', sub: 'Internet', x: 52, y: ROW.public },
  { id: 'igw', serviceId: 'internet_gateway', label: 'Internet gateway', sub: 'igw', x: 150, y: ROW.public },
  { id: 'alb', serviceId: 'alb', label: 'ALB', sub: '10.0.1.10', x: 300, y: ROW.public },
  { id: 'ecs', serviceId: 'ecs', label: 'ECS task', sub: '10.0.2.24', x: 450, y: ROW.app },
  { id: 'rds', serviceId: 'rds', label: 'RDS', sub: '10.0.3.5', x: 450, y: ROW.data, status: rdsStatus },
];

const scenarios: Scenario[] = [
  {
    id: 'allowed', tab: 'Request succeeds', title: 'Client → ALB → ECS → RDS',
    summary: 'Every hop is checked: routes, network ACLs, security groups and target health. Each one allows the request.',
    nodes: frontDoor(),
    edges: [
      { from: 'client', to: 'igw', label: 'HTTPS', status: 'ok' },
      { from: 'igw', to: 'alb', label: '443', status: 'ok' },
      { from: 'alb', to: 'ecs', label: 'HTTP 8080', status: 'ok' },
      { from: 'ecs', to: 'rds', label: 'TCP 5432', status: 'ok' },
    ],
    trace: [
      { step: 'Route', detail: '0.0.0.0/0 → igw · public subnet', result: 'OK' },
      { step: 'ALB listener', detail: 'HTTPS :443 → target group', result: 'OK' },
      { step: 'Target health', detail: 'ECS task 10.0.2.24 healthy', result: 'OK' },
      { step: 'NACL inbound', detail: 'rule 100 · TCP 5432 · 10.0.2.0/24', result: 'ALLOW' },
      { step: 'Security group', detail: 'db-sg · TCP 5432 from app-sg', result: 'ALLOW' },
    ],
    final: 'SUCCESS', finalOk: true,
    sources: [['Internet gateways', 'https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html'], ['ALB target health', 'https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html'], ['Network ACLs', 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html'], ['Security groups', 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html']],
  },
  {
    id: 'sg', tab: 'Security group blocks', title: 'ECS → RDS on TCP 5432',
    summary: 'One rule points at the wrong CIDR. The lab shows exactly which rule was checked and why the source did not match.',
    nodes: frontDoor('deny'),
    edges: [
      { from: 'client', to: 'igw', label: 'HTTPS', status: 'ok' },
      { from: 'igw', to: 'alb', label: '443', status: 'ok' },
      { from: 'alb', to: 'ecs', label: 'HTTP 8080', status: 'ok' },
      { from: 'ecs', to: 'rds', label: 'TCP 5432', status: 'deny' },
    ],
    trace: [
      { step: 'ALB → ECS', detail: 'listener, target health', result: 'OK' },
      { step: 'Route', detail: '10.0.3.0/24 → local', result: 'OK' },
      { step: 'NACL inbound', detail: 'rule 100 · TCP 5432', result: 'ALLOW' },
      { step: 'Security group', detail: 'db-sg allows 10.0.1.0/24 only', result: 'DENY' },
      { step: 'Reason', detail: 'source 10.0.2.24 not in 10.0.1.0/24', result: 'INFO' },
    ],
    final: 'REQUEST FAILED', finalOk: false,
    sources: [['Security groups', 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html'], ['Route tables', 'https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Route_Tables.html'], ['Network ACLs', 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html']],
  },
  {
    id: 'nat', tab: 'NAT gateway fails', title: 'Failure Lab: NAT gateway down',
    summary: 'Failures change the model, not just the colour. Internet-bound traffic stops; traffic that stays inside the VPC can keep working.',
    nodes: [
      { id: 'inet', serviceId: 'user', label: 'Internet', sub: 'public API', x: 52, y: ROW.public },
      { id: 'igw', serviceId: 'internet_gateway', label: 'Internet gateway', sub: 'igw', x: 150, y: ROW.public },
      { id: 'nat', serviceId: 'nat_gateway', label: 'NAT gateway', sub: 'unavailable', x: 300, y: ROW.public, status: 'down' },
      { id: 'ec2', serviceId: 'ec2', label: 'EC2', sub: '10.0.2.30', x: 450, y: ROW.app },
      { id: 'rds', serviceId: 'rds', label: 'RDS', sub: '10.0.3.5', x: 450, y: ROW.data },
    ],
    edges: [
      { from: 'ec2', to: 'nat', label: '0.0.0.0/0', status: 'down' },
      { from: 'nat', to: 'igw', status: 'down' },
      { from: 'igw', to: 'inet', status: 'down' },
      { from: 'ec2', to: 'rds', label: 'TCP 5432', status: 'ok' },
    ],
    trace: [
      { step: 'Inject', detail: 'NAT gateway → unavailable', result: 'INFO' },
      { step: 'EC2 → Internet', detail: '0.0.0.0/0 → nat (blackhole)', result: 'FAIL' },
      { step: 'EC2 → RDS', detail: '10.0.3.0/24 → local', result: 'OK' },
      { step: 'Security group', detail: 'db-sg · TCP 5432 from app-sg', result: 'ALLOW' },
      { step: 'Blast radius', detail: 'outbound only · database unaffected', result: 'INFO' },
    ],
    final: 'PARTIAL OUTAGE', finalOk: false,
    sources: [['NAT gateways', 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html'], ['Route tables', 'https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Route_Tables.html'], ['Well-Architected: Reliability', 'https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/welcome.html']],
  },
];

// A node's footprint is the icon plus its two caption lines, so edges stop short of the labels.
const NODE_HALF_W = 34, NODE_TOP = 26, NODE_BOTTOM = 52;
function clip(a: DNode, b: DNode) {
  const ac = (NODE_BOTTOM - NODE_TOP) / 2, bc = ac;
  const ax = a.x, ay = a.y + ac, bx = b.x, by = b.y + bc;
  const dx = bx - ax, dy = by - ay, hh = (NODE_TOP + NODE_BOTTOM) / 2 + 3;
  const t = Math.min(dx ? (NODE_HALF_W + 3) / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  return [ax + dx * t, ay + dy * t];
}
const pct = (v: number, of: number) => `${(v / of) * 100}%`;
const box = (x: number, y: number, w: number, h: number): React.CSSProperties => ({ left: pct(x, VIEW_W), top: pct(y, VIEW_H), width: pct(w, VIEW_W), height: pct(h, VIEW_H) });

function ScenarioDiagram({ s }: { s: Scenario }) {
  const byId = new Map(s.nodes.map(n => [n.id, n]));
  const rds = byId.get('rds')!;
  return <div className="home-canvas" role="img" aria-label={`${s.title}. ${s.summary}`}>
    <div className="home-frame home-frame-vpc" style={box(116, 22, 432, 388)}><span><VpcGroupIcon size={16} />VPC · 10.0.0.0/16</span></div>
    <div className="home-frame home-frame-public" style={box(196, 44, 340, 108)}><span><PublicSubnetGroupIcon size={16} />Public subnet · 10.0.1.0/24</span></div>
    <div className="home-frame home-frame-private" style={box(196, 160, 340, 108)}><span><PrivateSubnetGroupIcon size={16} />Private subnet · 10.0.2.0/24</span></div>
    <div className="home-frame home-frame-private" style={box(196, 276, 340, 124)}><span><PrivateSubnetGroupIcon size={16} />Private subnet · 10.0.3.0/24</span></div>
    <div className="home-frame home-frame-sg" style={box(rds.x - 60, rds.y - 34, 120, 94)}><span>db-sg</span></div>
    <svg className="home-edges" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>{(['ok', 'deny', 'down'] as Status[]).map(k => <marker key={k} id={`home-arrow-${k}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" className={`home-arrow-${k}`} /></marker>)}</defs>
      {s.edges.map((e, i) => {
        const [x1, y1] = clip(byId.get(e.from)!, byId.get(e.to)!), [x2, y2] = clip(byId.get(e.to)!, byId.get(e.from)!);
        return <g key={i} className={`home-edge home-edge-${e.status}`} style={{ animationDelay: `${i * 0.3}s` }}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} markerEnd={`url(#home-arrow-${e.status})`} vectorEffect="non-scaling-stroke" />
        </g>;
      })}
    </svg>
    {s.edges.map((e, i) => {
      if (!e.label) return null;
      const [x1, y1] = clip(byId.get(e.from)!, byId.get(e.to)!), [x2, y2] = clip(byId.get(e.to)!, byId.get(e.from)!);
      const vertical = Math.abs(x1 - x2) < 1;
      return <span key={i} className={`home-edge-label home-edge-label-${e.status}${vertical ? ' is-vertical' : ''}`} style={{ left: pct((x1 + x2) / 2 + (vertical ? 8 : 0), VIEW_W), top: pct((y1 + y2) / 2, VIEW_H), animationDelay: `${i * 0.3}s` }}>{e.label} {e.status === 'ok' ? '✓' : '✕'}</span>;
    })}
    {s.nodes.map(n => <div key={n.id} className={`home-snode${n.status ? ` is-${n.status}` : ''}`} style={{ left: pct(n.x, VIEW_W), top: pct(n.y, VIEW_H) }}>
      <span className="home-snode-icon"><AwsServiceIcon serviceId={n.serviceId} size={44} />{n.status === 'down' && <XCircle className="home-snode-badge" size={16} />}{n.status === 'deny' && <ShieldAlert className="home-snode-badge" size={16} />}</span>
      <strong>{n.label}</strong><small>{n.sub}</small>
    </div>)}
  </div>;
}

function ScenarioExplorer() {
  const [active, setActive] = React.useState(0);
  const s = scenarios[active];
  const tabs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    const next = (active + step + scenarios.length) % scenarios.length;
    setActive(next); tabs.current[next]?.focus();
  };
  return <div className="home-explorer">
    <div className="home-tabs" role="tablist" aria-label="Example scenarios" onKeyDown={onKey}>
      {scenarios.map((x, i) => <button key={x.id} ref={el => { tabs.current[i] = el; }} role="tab" id={`home-tab-${x.id}`} aria-selected={i === active} aria-controls="home-scenario-panel" tabIndex={i === active ? 0 : -1} onClick={() => setActive(i)}>{x.tab}</button>)}
    </div>
    <div className="home-explorer-body" role="tabpanel" id="home-scenario-panel" aria-labelledby={`home-tab-${s.id}`} key={s.id}>
      <div className="home-explorer-diagram"><ScenarioDiagram s={s} /></div>
      <div className="home-trace">
        <div className="home-trace-bar"><span /><span /><span /><em>trace · {s.title}</em></div>
        <ol>{s.trace.map((t, i) => <li key={i} style={{ animationDelay: `${0.2 + i * 0.18}s` }}><span className="home-trace-step">{String(i + 1).padStart(2, '0')}</span><span className="home-trace-text"><b>{t.step}</b>{t.detail}</span><span className={`home-trace-result home-trace-${t.result.toLowerCase()}`}>{t.result}</span></li>)}</ol>
        <p className={`home-trace-final ${s.finalOk ? 'is-ok' : 'is-bad'}`} style={{ animationDelay: `${0.2 + s.trace.length * 0.18}s` }}>FINAL: {s.final}</p>
        <p className="home-trace-summary">{s.summary}</p>
        <p className="home-trace-sources">AWS docs: {s.sources.map(([label, url], i) => <React.Fragment key={url}>{i > 0 && ' · '}<a href={url} target="_blank" rel="noopener noreferrer">{label}</a></React.Fragment>)}</p>
      </div>
    </div>
    <p className="home-explorer-note">Illustrative examples. Coverage varies by service; the lab labels what is modeled and what is simplified.</p>
  </div>;
}

// ── Interface guide ─────────────────────────────────────────────────────────
// Mirrors USER_MANUAL.md; keep the two in step when the UI changes.
type GuideRow = { area: number; element: string; does: string; how: string };
const guideAreas = ['Top bar', 'Service library', 'Canvas', 'Inspector', 'Simulation bar', 'Failure Lab strip'];
const guideRows: GuideRow[] = [
  { area: 1, element: 'Design · Simulate · Failure Lab', does: 'The three modes. The canvas, library and inspector stay visible; only what is active changes.', how: 'Click a tab. Design is the default.' },
  { area: 1, element: 'Analyze', does: 'Opens the scorecard: Scorecard, Single Points of Failure, Bottlenecks, Security Audit, Configuration Validity and Architecture Risks.', how: 'Click Analyze, then switch tabs inside the panel.' },
  { area: 1, element: 'Labs', does: 'Guided course labs with objectives and a stated simulation scope.', how: 'Pick a lab, then Load reference or Run reference simulation.' },
  { area: 1, element: '$/mo', does: 'Cost estimator by load, timeframe and pricing region, with an itemised bill.', how: 'Click the green chip. Export Bill saves the bill as JSON.' },
  { area: 1, element: 'Home · New', does: 'Home returns to this page. New resets the canvas to a default VPC with public and private subnets.', how: 'Save or download your work before pressing New.' },
  { area: 1, element: 'Download Image · Export', does: 'Save a PNG of the diagram, or download, upload and draft your workspace as JSON.', how: 'See “Save, share and export” below.' },
  { area: 2, element: 'Services tab', does: 'Searchable library of 300+ AWS services with their official icons.', how: 'Search or filter by category, then drag a service onto the canvas or press +.' },
  { area: 2, element: 'VPC & Groups tab', does: 'Containers: VPC, public subnet, private subnet, Availability Zone, security group, Region and account.', how: 'Drag onto the canvas, then drop services inside them.' },
  { area: 3, element: 'Nodes and connections', does: 'Your architecture. Services must sit inside a subnet to be valid.', how: 'Drag from a dot on the right or bottom edge to a dot on another node. Click a line to inspect it.' },
  { area: 3, element: 'Right-click a node', does: 'Sets its health: Online, Slow or Outage.', how: 'Works in any mode, so you can fail one NAT gateway or database.' },
  { area: 3, element: 'Reference Diagrams · Layers', does: 'Load a verified example architecture, or show and hide types of components.', how: 'Buttons at the top-left and top-right of the canvas.' },
  { area: 4, element: 'Service settings', does: 'Configuration for the selected node: addresses, ports, rules, health. Subnets can enable a NACL rule set.', how: 'Select a node. ECS nodes have More information for a cluster explorer.' },
  { area: 4, element: 'Connection settings', does: 'Connection meaning (request path, dependency, manages, route association, target registration), protocol and coupling mode.', how: 'Select a line. Only request path and dependency call affect simulation.' },
  { area: 5, element: 'Method · Path · Load', does: 'Describes the request to send and how much traffic to model.', how: 'Choose GET/POST/PUT/DELETE, a path such as /products, and a load level.' },
  { area: 5, element: 'Send Request · Event Timeline', does: 'Runs the request and lists every hop with its result and explanation.', how: 'Click a timeline card to jump the canvas to that step. Replay with the playback and speed controls.' },
  { area: 5, element: 'AWS Explanation · Task Flow', does: 'The full decision trace (what, where, why, which AWS rule), and a toggle that highlights task-flow lines.', how: 'Open AWS Explanation after a request, especially when one fails.' },
  { area: 6, element: 'AZ outage · Restore All', does: 'Takes down every resource in AZ-A or AZ-B, then brings them back.', how: 'Switch to Failure Lab, inject, then send the request again to see what still works.' },
  { area: 6, element: 'Case Study', does: 'A fixed walkthrough of how a slow query can cascade into an outage.', how: 'A teaching narrative. It does not analyse your own diagram.' },
];

function InterfaceSketch() {
  return <div className="home-sketch" role="img" aria-label="Layout of the lab: 1 top bar, 2 service library on the left, 3 canvas in the middle, 4 inspector on the right, 5 simulation bar at the bottom, 6 Failure Lab strip under the top bar.">
    <div className="home-sketch-top"><b>1</b><span className="home-sketch-tabs"><i className="is-on">Design</i><i>Simulate</i><i>Failure Lab</i><i>Analyze</i><i>Labs</i></span><span className="home-sketch-actions"><i>$/mo</i><i>Image</i><i>Export</i></span></div>
    <div className="home-sketch-strip"><b>6</b>AZ-A outage · AZ-B outage · Restore All</div>
    <div className="home-sketch-main">
      <div className="home-sketch-lib"><b>2</b><i className="is-on">Services</i><i>VPC &amp; Groups</i>{['ec2', 'ecs', 'rds', 'alb', 'lambda'].map(id => <span key={id}><AwsServiceIcon serviceId={id} size={18} /></span>)}</div>
      <div className="home-sketch-canvas"><b>3</b><div className="home-sketch-vpc"><VpcGroupIcon size={12} /><div><span><AwsServiceIcon serviceId="alb" size={22} /></span><span><AwsServiceIcon serviceId="ecs" size={22} /></span><span><AwsServiceIcon serviceId="rds" size={22} /></span></div></div></div>
      <div className="home-sketch-inspector"><b>4</b><i /><i /><i /><i className="short" /></div>
    </div>
    <div className="home-sketch-bottom"><b>5</b><i>GET</i><i className="wide">/products</i><i className="is-on">Send Request</i><i>AWS Explanation</i></div>
  </div>;
}

function InterfaceGuide() {
  return <section id="guide" className="home-section home-guide home-reveal"><h2>How the lab is laid out.</h2><p className="home-section-lead">Six areas, numbered below. The table explains every control, area by area.</p>
    <InterfaceSketch />
    <div className="home-table-wrap"><table className="home-table">
      <caption className="home-visually-hidden">Interface guide: each control, what it does, and how to use it</caption>
      <thead><tr><th scope="col">Area</th><th scope="col">Control</th><th scope="col">What it does</th><th scope="col">How to use it</th></tr></thead>
      <tbody>{guideRows.map((r, i) => <tr key={r.element} className={i === 0 || guideRows[i - 1].area !== r.area ? 'is-first' : ''}>
        <td>{(i === 0 || guideRows[i - 1].area !== r.area) && <span className="home-area"><b>{r.area}</b>{guideAreas[r.area - 1]}</span>}</td>
        <th scope="row">{r.element}</th><td>{r.does}</td><td>{r.how}</td>
      </tr>)}</tbody>
    </table></div>
    <p className="home-explorer-note">More detail in the <a href={`${repository}/blob/main/USER_MANUAL.md`} target="_blank" rel="noopener noreferrer">user manual</a>.</p>
  </section>;
}

// ── Save, share and export ──────────────────────────────────────────────────
const workFeatures = [
  { icon: FileDown, name: 'Download JSON', where: 'Export → Download JSON', text: 'Saves the whole workspace — nodes, connections, configuration and simulation state — as a file named after your draft. Pick a folder where your browser supports it.' },
  { icon: FileUp, name: 'Upload JSON', where: 'Export → Upload JSON', text: 'Opens a saved workspace file (up to 20 MB) and replaces the current canvas, after asking you to confirm.' },
  { icon: HardDrive, name: 'Save and resume a draft', where: 'Export → Save draft / Resume draft', text: 'Keeps one draft in this browser so you can pick up where you left off. It is cleared with browser data, so download a JSON copy as a backup.' },
  { icon: ImageDown, name: 'Download the diagram as an image', where: 'Top bar → Download Image', text: 'A 1920 × 1080 PNG at 2× resolution on a white background, framed to fit every component, with each official AWS icon and its label as shown on the canvas.' },
];

function WorkFeatures() {
  return <section id="save" className="home-section home-save home-reveal"><h2>Save, share and export.</h2><p className="home-section-lead">Your work stays on your device. Move it between computers with a JSON file, or drop the diagram into a report.</p>
    <div className="home-save-grid">
      <ul className="home-save-list home-stagger">{workFeatures.map(f => <li key={f.name}><f.icon size={24} /><div><h3>{f.name}</h3><p className="home-save-where">{f.where}</p><p>{f.text}</p></div></li>)}</ul>
      <figure className="home-png" aria-label="Example of a downloaded architecture image">
        <div className="home-png-bar"><ImageDown size={15} />aws-architecture-diagram.png<span>1920 × 1080</span></div>
        <div className="home-png-body">
          <div className="home-png-vpc"><span className="home-png-tag"><VpcGroupIcon size={14} />VPC</span>
            <div className="home-png-subnet is-public"><span className="home-png-tag"><PublicSubnetGroupIcon size={14} />Public subnet</span><div className="home-png-row">{[['alb', 'ALB'], ['nat_gateway', 'NAT gateway']].map(([id, l]) => <span key={id}><AwsServiceIcon serviceId={id} size={34} />{l}</span>)}</div></div>
            <div className="home-png-subnet is-private"><span className="home-png-tag"><PrivateSubnetGroupIcon size={14} />Private subnet</span><div className="home-png-row">{[['ecs', 'ECS service'], ['rds', 'RDS']].map(([id, l]) => <span key={id}><AwsServiceIcon serviceId={id} size={34} />{l}</span>)}</div></div>
          </div>
        </div>
        <figcaption>Illustration of an exported PNG. Connection handles are hidden in the export; lines stay.</figcaption>
      </figure>
    </div>
  </section>;
}

// ── Official AWS documentation ──────────────────────────────────────────────
// Every AWS concept, rule and asset the page refers to, linked to its official source.
const awsDocs: Array<{ group: string; links: Array<[string, string]> }> = [
  { group: 'Networking', links: [
    ['What is Amazon VPC?', 'https://docs.aws.amazon.com/vpc/latest/userguide/what-is-amazon-vpc.html'],
    ['Subnets', 'https://docs.aws.amazon.com/vpc/latest/userguide/configure-subnets.html'],
    ['Subnet CIDR blocks', 'https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html'],
    ['Route tables', 'https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Route_Tables.html'],
    ['Internet gateways', 'https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html'],
    ['NAT gateways', 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html'],
    ['Gateway endpoints', 'https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html'],
  ] },
  { group: 'Security', links: [
    ['Security groups', 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html'],
    ['Network ACLs', 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html'],
    ['IAM policy evaluation logic', 'https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html'],
  ] },
  { group: 'Compute and containers', links: [
    ['Amazon EC2', 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/concepts.html'],
    ['Amazon ECS', 'https://docs.aws.amazon.com/AmazonECS/latest/developerguide/Welcome.html'],
    ['Amazon EKS', 'https://docs.aws.amazon.com/eks/latest/userguide/what-is-eks.html'],
    ['AWS Lambda', 'https://docs.aws.amazon.com/lambda/latest/dg/welcome.html'],
    ['Amazon EC2 Auto Scaling', 'https://docs.aws.amazon.com/autoscaling/ec2/userguide/what-is-amazon-ec2-auto-scaling.html'],
  ] },
  { group: 'Load balancing and data', links: [
    ['Application Load Balancer', 'https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html'],
    ['Target group health checks', 'https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html'],
    ['Amazon RDS', 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Welcome.html'],
  ] },
  { group: 'Resilience and operations', links: [
    ['Regions and Availability Zones', 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-regions-availability-zones.html'],
    ['Well-Architected: Reliability pillar', 'https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/welcome.html'],
    ['Amazon CloudWatch', 'https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/WhatIsCloudWatch.html'],
    ['AWS Pricing', 'https://aws.amazon.com/pricing/'],
  ] },
  { group: 'Icons and trademarks', links: [
    ['AWS Architecture Icons', 'https://aws.amazon.com/architecture/icons/'],
    ['AWS Trademark Guidelines', 'https://aws.amazon.com/trademark-guidelines/'],
  ] },
];

function AwsDocs() {
  return <section id="aws-docs" className="home-section home-docs home-reveal"><h2>Learn it from the source.</h2><p className="home-section-lead">AWS behaviour on this page and in the lab is based on the official AWS documentation. When the lab and AWS disagree, AWS is right — please <a href={`${repository}/issues/new?title=AWS%20behaviour%3A%20`} target="_blank" rel="noopener noreferrer">report it</a>.</p>
    <div className="home-docs-grid home-stagger">{awsDocs.map(g => <div key={g.group}><h3>{g.group}</h3><ul>{g.links.map(([label, url]) => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer">{label}<ExternalLink size={14} aria-hidden="true" /></a></li>)}</ul></div>)}</div>
  </section>;
}

// ── Quick start ─────────────────────────────────────────────────────────────
const quickStarts = [
  { id: 'browser', tab: 'In the browser', lines: null as string[] | null },
  { id: 'local', tab: 'Run locally', lines: ['git clone https://github.com/norbutlepcha25/cloud-architecture-lab.git', 'cd cloud-architecture-lab', 'npm install', 'npm run dev'] },
  { id: 'docker', tab: 'Docker', lines: ['git clone https://github.com/norbutlepcha25/cloud-architecture-lab.git', 'cd cloud-architecture-lab', 'docker compose up --build', '# then open http://localhost:8080'] },
];

function QuickStart({ onStart }: { onStart: () => void }) {
  const [active, setActive] = React.useState(0);
  const [copied, setCopied] = React.useState(false);
  const q = quickStarts[active];
  const copy = async () => {
    try { await navigator.clipboard.writeText(q.lines!.filter(l => !l.startsWith('#')).join('\n')); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard unavailable */ }
  };
  return <div className="home-quick">
    <div className="home-tabs home-tabs-dark" role="tablist" aria-label="Ways to start">
      {quickStarts.map((x, i) => <button key={x.id} role="tab" aria-selected={i === active} aria-controls="home-quick-panel" onClick={() => { setActive(i); setCopied(false); }}>{x.tab}</button>)}
    </div>
    <div className="home-terminal" role="tabpanel" id="home-quick-panel">
      <div className="home-trace-bar"><span /><span /><span /><em>{q.lines ? 'terminal' : 'browser'}</em>{q.lines && <button className="home-copy" onClick={copy} aria-label="Copy commands">{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copied' : 'Copy'}</button>}</div>
      {q.lines
        ? <pre>{q.lines.map(l => <code key={l} className={l.startsWith('#') ? 'is-comment' : ''}>{l.startsWith('#') ? l : <><i>$</i> {l}</>}</code>)}</pre>
        : <div className="home-terminal-browser"><p>Nothing to install. No AWS account, no credentials, no bill.</p><button className="home-primary" onClick={onStart}>Open the lab <ArrowRight size={19} /></button></div>}
    </div>
  </div>;
}


const useCases = [
  { icon: School, name: 'Classrooms', text: 'Give every student the same architecture and let them break it safely, without shared cloud accounts.' },
  { icon: BookOpen, name: 'Self-study', text: 'Check your understanding of routing, security groups and IAM before you touch a real account.' },
  { icon: Users, name: 'Workshops', text: 'Run a session in a browser tab. Export the workspace as JSON and pick it up later.' },
  { icon: Terminal, name: 'Design reviews', text: 'Sketch an idea, send a request through it, and talk about why it fails.' },
];

// Scroll animation: `.home-reveal` blocks fade up as they enter view; children of `.home-stagger`
// follow one after another. Content is hidden only once the observer is running, and never when the
// visitor asks for reduced motion, so the page still reads fully if this effect does not run.
function useScrollEffects(root: React.RefObject<HTMLDivElement>) {
  React.useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onScroll = () => {
      const max = el.scrollHeight - el.clientHeight;
      el.style.setProperty('--home-progress', String(max > 0 ? el.scrollTop / max : 0));
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver !== 'function') return () => el.removeEventListener('scroll', onScroll);
    el.querySelectorAll('.home-stagger').forEach(list => Array.from(list.children).forEach((child, i) => (child as HTMLElement).style.setProperty('--i', String(Math.min(i, 12)))));
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    el.querySelectorAll('.home-reveal').forEach(target => observer.observe(target));
    el.classList.add('home-reveal-ready');
    return () => { observer.disconnect(); el.removeEventListener('scroll', onScroll); el.classList.remove('home-reveal-ready'); };
  }, [root]);
}

export function HomePage({ onStart }: { onStart: () => void }) {
  const contributors = useContributors();
  const [theme, toggleTheme] = useTheme();
  const rootRef = React.useRef<HTMLDivElement>(null);
  useScrollEffects(rootRef);
  return <div className="lab-home" data-theme={theme} ref={rootRef}>
    <div className="home-progress" aria-hidden="true" />
    <a className="home-skip" href="#home-main">Skip to content</a>
    <div className="home-nav-wrap"><header className="home-nav"><a href="#" className="home-brand"><Layers size={28} />Cloud Architecture Lab</a><nav aria-label="Home navigation"><a href="#see-it">See it work</a><a href="#guide">Guide</a><a href="#save">Save &amp; export</a><a href="#labs">Labs</a><a href="#aws-docs">AWS docs</a><ThemeToggle theme={theme} onToggle={toggleTheme} className="home-theme-toggle" iconSize={18} /><button className="home-nav-cta" onClick={onStart}>Open the lab <ArrowRight size={16} /></button></nav></header></div>
    <main id="home-main">
      <div className="home-hero-wrap"><section className="home-hero">
        <div>
          <h1>Build an architecture.<br /><span>Find out why it works.</span></h1>
          <p className="home-lead">Explore AWS architecture in your browser. Connect services, configure their behavior, send simulated requests, and see where a design succeeds or breaks — with the reason for every decision.</p>
          <div className="home-cta"><button className="home-primary" onClick={onStart}>Start exploring <ArrowRight size={19} /></button><a className="home-secondary" href="#see-it">See an example</a></div>
          <p className="home-small">No AWS account required. No cloud resources provisioned.</p>
        </div>
        <div className="home-hero-trace" aria-hidden="true">
          <div className="home-trace-bar"><span /><span /><span /><em>simulate · ECS → RDS :5432</em></div>
          <ol>
            <li><span className="home-trace-step">01</span><span className="home-trace-text"><b>Route</b>10.0.3.0/24 → local</span><span className="home-trace-result home-trace-ok">OK</span></li>
            <li><span className="home-trace-step">02</span><span className="home-trace-text"><b>NACL</b>rule 100 · TCP 5432</span><span className="home-trace-result home-trace-allow">ALLOW</span></li>
            <li><span className="home-trace-step">03</span><span className="home-trace-text"><b>Security group</b>source 10.0.2.24</span><span className="home-trace-result home-trace-deny">DENY</span></li>
          </ol>
          <p className="home-trace-final is-bad"><ShieldAlert size={17} /> Source not in 10.0.1.0/24</p>
        </div>
      </section>
      <section className="home-stats home-stagger home-reveal" aria-label="At a glance">
        <div><strong>0</strong><span>AWS accounts or credentials needed</span></div>
        <div><strong>$0</strong><span>cloud bill — nothing is provisioned</span></div>
        <div><strong>{COURSE_LABS.length}</strong><span>guided labs with reference diagrams</span></div>
        <div><strong>Every hop</strong><span>explained: route, NACL, security group, IAM</span></div>
      </section></div>

      <section id="see-it" className="home-section home-reveal"><h2>Follow a request. Read the decision.</h2><p className="home-section-lead">Pick a scenario. The diagram shows the path; the trace shows each rule the lab checked.</p><ScenarioExplorer /></section>

      <section className="home-about home-reveal"><h2>A diagram you can experiment with.</h2><div><p>Cloud Architecture Lab is an independent, open-source learning environment for students, educators, and anyone curious about cloud system design. It brings architecture diagrams together with configuration, request traces, failure experiments, and guided labs.</p><p>Simulation coverage varies by service. Use the explanations and coverage indicators to understand what is modeled; some behaviors are partial or simplified.</p></div></section>

      <section id="how-it-works" className="home-section home-reveal"><h2>Your first experiment</h2><p className="home-section-lead">Start with a guided lab or build your own architecture.</p><ol className="home-steps home-stagger">
        <li><BookOpen /><h3>Choose a starting point</h3><p>Open the lab, then choose Labs or Reference Diagrams. Load an example or start with the default network.</p></li>
        <li><Layers /><h3>Build and configure</h3><p>Add services from the palette, connect them, and select a resource to edit its settings. More information opens supported component views.</p></li>
        <li><Play /><h3>Send a request</h3><p>Choose your request settings and send it through the architecture. Read the timeline to see each decision and its explanation.</p></li>
        <li><ShieldAlert /><h3>Test your assumptions</h3><p>Try Failure Lab, review Analyze, and refine the design. Use Export to save your workspace as JSON and continue later.</p></li>
      </ol></section>

      <InterfaceGuide />

      <WorkFeatures />

      <section className="home-section home-quickstart home-reveal"><div><h2>Open it in a tab, or run it yourself.</h2><p className="home-section-lead">The lab is a static web app. Use the hosted version, or run your own copy for a class.</p></div><QuickStart onStart={onStart} /></section>

      <section id="labs" className="home-section home-labs home-reveal"><h2>{COURSE_LABS.length} labs, from IAM to observability.</h2><p className="home-section-lead">Each lab loads ready-made diagrams: a working design and a broken one to diagnose.</p><ol className="home-stagger">
        {COURSE_LABS.map(l => <li key={l.id}><span>{String(l.number).padStart(2, '0')}</span>{l.title}</li>)}
      </ol><button className="home-secondary" onClick={onStart}>Open the labs <ArrowRight size={17} /></button></section>

      <section className="home-section home-uses home-reveal"><h2>Made for learning together.</h2><ul className="home-stagger">
        {useCases.map(u => <li key={u.name}><u.icon size={22} /><div><h3>{u.name}</h3><p>{u.text}</p></div></li>)}
      </ul></section>

      <AwsDocs />

      <section id="community" className="home-community home-reveal"><div><h2>Everyone is welcome<br />to help shape the lab.</h2><p>You do not need to be an AWS expert to contribute. Ask a question, share a teaching idea, report unexpected behavior, improve a lab, or propose a code change.</p><p>Feedback lives in the public GitHub repository. A GitHub account is needed to post; you can browse without one.</p></div><div className="home-community-actions home-stagger">
        <a href={`${repository}/issues/new?title=Bug%3A%20&body=What%20happened%3F%0A%0ASteps%20to%20reproduce%3A%0A%0AExpected%20behavior%3A%0A%0ALab%20or%20service%3A%0A`} target="_blank" rel="noopener noreferrer"><Bug /><div><h3>Report an issue</h3><p>Describe the behavior and how to reproduce it.</p></div><ArrowRight /></a>
        <a href={`${repository}/issues/new?title=Feedback%3A%20&body=My%20question%2C%20idea%2C%20or%20feedback%3A%0A`} target="_blank" rel="noopener noreferrer"><MessageSquare /><div><h3>Leave a comment or idea</h3><p>Start a feedback thread, or comment on an existing issue.</p></div><ArrowRight /></a>
        <a href={repository} target="_blank" rel="noopener noreferrer"><GitBranch /><div><h3>Contribute to the project</h3><p>Explore the source, documentation, and open issues.</p></div><ArrowRight /></a>
      </div></section>
      <section className="home-section home-contributors home-reveal"><h2>People building the lab</h2><ul className="home-stagger">{contributors.map(c => <ContributorCard key={c.login} c={c} />)}</ul></section>
    </main>
    <div className="home-footer-wrap"><footer className="home-footer">
      <div className="home-footer-brand"><a href="#" className="home-brand"><Layers size={24} />Cloud Architecture Lab</a><p>Open source · MIT License</p><button onClick={onStart}>Open the lab <ArrowRight size={16} /></button></div>
      <nav aria-label="Footer: Learn"><h3>Learn</h3><a href="#see-it">See it work</a><a href="#how-it-works">First experiment</a><a href="#guide">Interface guide</a><a href="#save">Save &amp; export</a><a href="#labs">Guided labs</a><a href="#aws-docs">AWS documentation</a></nav>
      <nav aria-label="Footer: Project"><h3>Project</h3><a href={repository} target="_blank" rel="noopener noreferrer">Source on GitHub</a><a href={`${repository}/issues`} target="_blank" rel="noopener noreferrer">Issues</a><a href={`${repository}/blob/main/USER_MANUAL.md`} target="_blank" rel="noopener noreferrer">User manual</a></nav>
      <p className="home-disclaimer">Cloud Architecture Lab is an independent, open-source educational project. It is not affiliated with, endorsed by, or sponsored by Amazon Web Services, Inc. or Amazon.com, Inc. Amazon Web Services, AWS, and related service names and icons are trademarks of Amazon.com, Inc. or its affiliates, used here for identification and educational purposes only. Simulated behavior is an approximation and is not official AWS documentation.</p>
      <AnalyticsNotice />
    </footer></div>
  </div>;
}
