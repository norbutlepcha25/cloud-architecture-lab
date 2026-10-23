# User Manual — Cloud Architecture Lab

This is a guide for people *using* the simulator (students, instructors, self-learners) —
how to build an architecture, run it, break it, and read the results. For developer/engineering
documentation see [README.md](README.md), [CONTRIBUTING.md](CONTRIBUTING.md), and `docs/`.

## 1. Getting started

```bash
npm install
npm run dev   # opens the app in your browser
```

The app is called **Cloud Architecture Lab** in the header, subtitled "Design, simulate, and
break AWS cloud architectures."

## 2. The three modes

The header has three tabs that switch the app's mode. Canvas, palette, inspector and simulation
controls stay visible in all three — only what's *active* changes:

- **Design** — build and edit your architecture. Default mode.
- **Simulate** — send a simulated request through your architecture and watch it play out.
- **Failure Lab** — inject failures (adds a control strip under the header) and see what breaks.

Two more header buttons open overlays instead of switching mode: **Analyze** (architecture
scoring) and **Labs** (course lab instructions/references) — see §7 and §9.

## 3. Building an architecture

**Add a service:** open the **service library** on the left. Either drag a service onto the
canvas, or hover a row and click its **+** ("Add to canvas") button. Use the search box or the
category dropdown to find one of the 300+ AWS services. The **VPC & Groups** tab has network/
security containers (VPC, Public Subnet, Private Subnet, Availability Zone, Security Group, AWS
Region, AWS Account) — add these the same way (drag, or click the row/its + button).

**Place it correctly:** compute/storage/database services generally need to sit inside a subnet
boundary on the canvas — a node dropped outside every subnet is geometrically invalid and will
fail simulation, the same way AWS would refuse it.

**Give a subnet Network ACL rules:** select a public/private subnet and click **Enable NACL rule
set** in its inspector to attach a numbered inbound/outbound rule set (view/edit it via **View
NACL Rules**). This is a fresh, complete rule set with return traffic already allowed — it won't
trigger the "addressing problem 3.1" banner on the canvas, which only appears for the specific
missing-ephemeral-return-rule condition that reference diagram is about, not for having a NACL at
all.

**Connect two services:** every node has small connector dots on its edges — drag from a
dot to any dot on another node. Connectable components have exactly eight dots at the
compass directions; each dot supports both incoming and outgoing connections.
You can't connect a node to itself, connect directly to a VPC/subnet/AZ/security-group container,
or create a duplicate connection. A default protocol is guessed from the target (e.g. `SQL` into
RDS, `Message` into SQS/SNS, `DNS` from Route 53, otherwise `HTTP`) — you can change it afterward.

**Look inside an ECS cluster:** select an ECS node and click **More information** to open the ECS
explorer — a full breakdown of the cluster's services, tasks, and containers. In the right-hand
sidebar, a **Cluster** boundary box stays visible above whatever else you're editing, holding only
the cluster's own services — a load balancer or database is never drawn inside it, since those are
separate AWS resources, not part of the cluster. Instead they show as their own icon box outside
the boundary, connected by an arrow: inbound above (e.g. an ALB routing in — shown once even if it
fans out to several of the cluster's services, with a caption naming all of them) and outbound
below (e.g. a database a service calls) — real configured connections, not a simulated result.
Each service's own box shows its live state: a small square per running task — colored
green/amber/red to match that service's health — plus a dashed square for each task that's desired
but not yet running. A service actually targeted by an inbound connection gets a small "routed to
these tasks" note right above that row (and "these tasks call out" below it, for outbound) — this
points at the whole task pool rather than one specific task, since the simulator doesn't track
individual task identities, only an aggregate count; that's also the real behavior of an ALB target
group, which routes to whichever registered tasks are healthy, not one fixed task. It updates the
moment you change desired/running task counts or health, so you can watch it react as you edit.
Click a service's name to jump straight to its network details.

**Move an existing connection on the canvas:** hover over or select the line to reveal
the two four-direction arrow controls. Hover near a compass dot to reveal the same move arrow. Drag either control onto a connection dot on any
side or corner of a component. Each component has eight shared compass dots: N, NE, E, SE, S, SW, W and NW. Any dot can send or receive a connection. No inspector is required. Alternatively, choose **Source side** and **Target side** in the right-hand
Connection Inspector (all eight compass directions). Moving to another side of the same
node preserves the edge ID, protocol, label, step number and other settings. Moving to
a different resource checks the existing interaction; unsupported connections and
self-loops are rejected. Dropping on empty space keeps the original connection.
These controls apply to loaded labs and references as well as new diagrams. Export
saves the chosen handles in JSON; repository source files are updated through the
normal reference/lab export workflow.

## 4. Understanding connection lines

Click any connection line to open its inspector panel. Two independent settings live there, and
they mean different things — don't confuse them.

### Connection meaning (what the line represents)

The **Connection meaning** dropdown sets what kind of relationship a line is:

| Meaning | Line style at rest | What it means |
|---|---|---|
| Request path | solid | Carries live requests during simulation — this is normal application traffic. |
| Dependency call | dashed | One service calls another it depends on (e.g. app → database), without necessarily being the traced request path. |
| Manages resource | dotted | A control-plane "manages/configures" relationship — not traffic. |
| Route association | dash-dot | A route table associated with a subnet. |
| Target registration | fine dots | A load balancer's registration of a target (e.g. ALB → EC2/ECS/Lambda target). |

Only **Request path** and **Dependency call** currently affect request simulation; management,
route-association and target-registration behavior is descriptive, not yet simulated.

If you pick a protocol that doesn't match what the target service actually speaks (e.g. `SQL`
into an S3 bucket, `DNS` into an RDS instance), it won't be silently accepted — check **Analyze →
Configuration Validity** (§7), which flags the mismatch, explains what the target is actually
modeled to accept, and suggests the fix.

### Simulation status (color, animation, thickness)

Separately from the static line style above, a connection's **color, animation and thickness**
reflect what's happening *right now* in a simulation — this overlays on top of the static style
and takes over while a request runs:

- **Gray, gently pulsing** — idle, not currently part of a running/traced flow.
- **Blue, moving dots, thicker** — actively carrying the traced request right now.
- **Blue/green flash at the target** — this hop just completed successfully.
- **Red, thicker, with a stopped pulse at the blocked point** — this hop failed; the marker sits
  exactly where the request was blocked (e.g. at a Security Group or NACL), not at the target.
- **Faded/dimmed** — exists, but not part of the currently highlighted flow.

The small badge on a line shows either its protocol (e.g. `HTTP`) or, once you've run a
simulation, a numbered step badge — click it to jump the Event Timeline (§5) to that hop.

### Coupling Mode (how a failure/delay propagates)

Also on the connection inspector: **Coupling Mode**, with three options:

- **Synchronous (Blocking — Caller waits)** — the default. If the downstream service is slow or
  fails, that failure/latency propagates immediately back to the caller. This models a direct
  blocking call (e.g. a web app calling its database over SQL/HTTP).
- **Asynchronous (Decoupled buffer)** — models a message queue/event bus in between. The caller
  hands off and moves on; a slow or failing downstream doesn't block it. This is the "shock
  absorber" pattern (e.g. SQS in front of a database) that protects upstream services from
  downstream trouble.
- **Cached (Fast local edge lookup)** — models a fast local/cache read instead of a live call.

Coupling Mode is about *failure/latency propagation direction*, while Connection meaning is about
*what the line represents architecturally* — a request-path connection can be either tightly
(synchronous) or loosely (asynchronous) coupled.

## 5. Running a simulation

Switch to **Simulate** mode (or just use the controls bar — it's visible in Design mode too).
Set:

- **Method** (GET/POST/PUT/DELETE) and **Path** (e.g. `/products`).
- **Load** — traffic level: Low (1 req/s), Normal (10 req/s), High (100 req/s), 10x Surge Spike,
  100x Extreme Spike. Higher levels show more traveling packets on active connections and let you
  see load-balancer fan-out across multiple healthy targets.

Click **Send Request** to run it. Once a result exists:

- The **Event Timeline** appears above the controls bar: one card per hop, in order, with a
  timestamp, protocol, OK/FAILED indicator and a plain-language explanation. Click a card to
  scrub the canvas to that step. Use **Minimize timeline** if it's in your way.
- Use the transport controls (step back/forward, play/pause, reset, 0.5x/1x/2x speed) to replay
  the request hop by hop.
- Click **AWS Explanation** to open the full decision trace — what happened, where, why, and
  which AWS rule caused it, for the last simulated request.
- The result pill shows `HTTP {status} ({latency}ms)` — red for failure, otherwise its status
  color.

## 6. Failure Lab

Switch to **Failure Lab** mode for a dedicated control strip:

- **Simulate AZ-A Outage** / **Simulate AZ-B Outage** — takes down every resource in that
  Availability Zone.
- **Restore All** — brings everything back online.
- **Case Study: Cascading Outage** — a fixed, illustrative walkthrough of how a slow query can
  cascade into a full outage. This is a general teaching narrative, independent of your own
  canvas — it doesn't analyze what you built.

For finer-grained control, **right-click any node** and use **Simulate Health State**
(Online / Slow / Outage), or open its status panel for the same **Healthy / Degrade / Fail**
toggle with a shown failure reason. This works in any mode, not just Failure Lab, and lets you
fail one specific instance, NAT gateway, database, etc. rather than a whole AZ.

After injecting a failure, re-run a simulation (§5) to see how it propagates — and check whether
it propagates further than it should (a resilience gap) or is correctly contained.

## 7. Analyze

Click **Analyze** in the header to open the resilience/scorecard modal. Tabs:

- **Multidimensional Scorecard** — Availability, Resilience, Fault Tolerance, Scalability, and
  Security & Isolation, each scored with strengths/weaknesses.
- **Single Points of Failure** — resources whose failure alone would take down the architecture,
  with risk level and a recommended fix.
- **Bottlenecks & Capacity** — capacity/scaling concerns with severity and mitigation advice.
- **Security Audit** — security issues with best-practice guidance.
- **Configuration Validity** — structural correctness problems (bad CIDRs, invalid routes,
  malformed security rules, dangling connections) with the AWS rule being violated.
- **Architecture Risks** — design-quality risks (public exposure, missing redundancy, blast
  radius, dependency concentration).

This is a different question from "did my request succeed?" (§5) — Analyze judges the
architecture's overall quality, not one simulated request.

## 8. Cost estimator

The header's green **$/mo** chip opens a full cost simulator: pick a traffic load and a timeframe
(hourly/daily/monthly/annual) to see a total bill, broken down by Compute, Storage, and
Networking, plus an itemized per-resource invoice and FinOps savings suggestions. **Export Bill**
downloads it as JSON.

**Pricing Region:** toggle between **United States**, **Europe**, and **Asia Pacific** to see how
the same architecture's bill changes by region. United States is the baseline (matches every price
shown elsewhere by default); Europe and Asia Pacific apply an approximate regional premium per
resource category (compute/storage/database/networking) grounded in AWS's real, well-known
regional pricing pattern — not a live per-SKU quote. Treat it as "roughly how much more," not an
exact bill; a couple of services that genuinely bill one flat global rate in real AWS (Route 53,
EKS's control-plane fee) don't change with region, by design.

## 9. Reference diagrams, drafts, and labs

- **Reference Diagrams** (top-left of the canvas) — loads a pre-built, verified architecture (3-tier
  VPC, event-driven SQS decoupling, NACL vs. Security Group, Auto Scaling failure recovery, and
  more) onto the canvas, replacing what's there.
- **Save as reference** (inside Reference Diagrams) — exports a standalone diagram JSON file. Place it in `src/data/references/` and restart the dev server or rebuild to add it to the shared catalogue. A browser copy is also kept when storage is available.
- **Export** (header) — your own work. Give it a name in **Draft name**; **Save draft** /
  **Resume draft** keep one slot in this browser (cleared if you clear browser data); **Download
  JSON** / **Upload JSON** give you a portable file named after your draft.
- **Labs** (header) — course lab instructions, each with objectives and a stated simulation
  scope. **Load reference** puts a lab's reference snapshot on the canvas without running it;
  **Run reference simulation** / **Check reference configuration** loads it and immediately runs
  it. There's no separate scoring UI — "completing" a lab means using the normal Send
  Request / Check Configuration / Evaluate Policy controls (§5) and reading the result. The small
  download icon next to a reference card exports its JSON — edit it and place it in
  `src/data/labs/` (see that folder's README) to make a permanent change; there's no upload button
  for lab references, unlike drafts.

## 10. Exporting your work

- **Download Image** — a PNG snapshot of the canvas as currently shown (including whatever
  health/failure state is visible). Connection handle dots are hidden in the exported image; connection lines remain visible.
- **Export** — name, download, or upload a complete JSON workspace, including simulation
  state. Choose a save location using the browser file picker where supported; otherwise
  the browser download settings determine the location. Browser draft save/resume is here too.

## Tips

- If a request fails, use **AWS Explanation** before guessing — it names the exact rule and
  location that blocked it.
- A red stopped-pulse marker on a connection is more informative than the line just turning red:
  its position tells you *where* the request died, not just *that* it did.
- Coupling Mode changes what a downstream failure does to the caller — if you want to demonstrate
  a resilience improvement, try switching a synchronous dependency to asynchronous and re-running
  the same failure scenario.

- NTL, CTD