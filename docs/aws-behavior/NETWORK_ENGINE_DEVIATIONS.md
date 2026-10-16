# Network Engine: Documented Deviations from Real AWS

Companion to `docs/target-architecture/NETWORK_ENGINE.md` (design) and
`src/engine/network/` (implementation - Phase 5 of `docs/target-architecture/MIGRATION_PLAN.md`).
Every simplification the engine makes relative to real, documented AWS behavior
(`docs/aws-behavior/NETWORKING_BEHAVIOR.md`) is listed here, per the implementation's own
completion criteria ("AWS behavior deviations are documented").

## 1. No real per-node IP addressing

Real AWS assigns each ENI a real private IP (and optionally a public/Elastic IP). This simulator
has no such model - canvas nodes are positioned freely, not assigned addresses. Consequences:

- `packet.ts`'s `derivePlaceholderIp()` produces a deterministic, reproducible **placeholder**
  address from a node's id (so traces are stable across runs), not a real assigned IP. It is never
  used for actual containment/overlap decisions in the live simulator - only for display in a
  `Packet`'s `source.ip`/`destination.ip` fields when a caller constructs one directly.
- Security Group **CIDR-based** source matching (`securityGroup.ts`'s `evaluateSecurityGroup` with
  a `source: { type: 'cidr' }` rule) is fully implemented and unit-tested (`test/network-engine.test.ts`
  N14), but is **not wired into the live per-hop trace** (`checkNetworkFirewalls`), because doing so
  would require inventing a synthetic source address for every hop and pretending it is real. Only
  the **Security-Group-reference** form of an SG rule (`source: { type: 'securityGroup' }`) is wired
  live, because that uses genuinely real data already on the canvas (`ServiceNodeData.securityGroupIds`)
  - see `checkNetworkFirewalls`'s new `sourceNode` parameter.
- `Packet.sourcePort` is always `undefined` in `buildPacket()` - a real ephemeral client port is
  not modeled at all. `destinationPort` is filled from a small default-port table
  (`defaultPortForProtocol`), which is a reasonable approximation for the handful of protocols this
  app models (HTTPS→443, HTTP→80, SQL→3306, DNS→53, gRPC→443) but not a substitute for a real port
  scanner or per-node service-port configuration.

## 2. Route tables are load-bearing for internet, NAT and gateway endpoint paths (2026-10-17)

Superseded: subnets associated with a route table node now decide internet ingress, NAT/IGW
egress and gateway endpoint use live (`engine/network/subnetRouting.ts`, spec
[docs/behavior/route_tables.md](../behavior/route_tables.md)). Remaining deviations:

- Unassociated subnets: "Assume route tables" on generates standard public/private tables (a
  simulator convenience, not AWS's main-table behavior); off gives the AWS main table of a new VPC
  (local route only). Resources outside any subnet or VPC keep legacy placement checks.
- "The internet" is a fixed documentation address (203.0.113.10). Routes scoped to specific
  public ranges are matched against that address only.
- Public IPv4 assignment is assumed for resources in a subnet routed to an internet gateway.
- IGW attachment defaults to the VPC it is inside or touches (else the only VPC); the panel can name a VPC or mark it not attached. AWS refuses to detach while public IPs exist; the simulator does not.
- IGW failure is a teaching scenario; AWS documents internet gateways as highly available.
- Invalid routes (other-VPC targets, duplicates) are reported by validation instead of being refused at edit time.
- Explicit private-IPv4 routing (`liveRouting.ts`) still evaluates local routes only and runs
  only when the destination has an explicit private IP.
- IPv6, egress-only gateways, peering, transit gateways and virtual private gateways are not
  simulated as transit.

## 3. Single-account, single-region model

`securityGroup.ts`'s SG-reference rules and every existing boundary concept
(`security_group`/`public_subnet`/`private_subnet`/`vpc`) assume one implicit AWS account and
region. Real AWS supports cross-account Security Group references and multi-region VPC peering;
this engine models neither, consistent with `docs/aws-behavior/IAM_BEHAVIOR.md`'s own scoping of
cross-account concerns as out of scope for this simulator.

## 4. NACL protocol/port matching is heuristic, not a real protocol/port database

`nacl.ts`'s `ruleMatchesProtocol` matches on the rule's free-text `type` field plus a small set of
hardcoded protocol/port associations (SQL→3306, HTTP→80, HTTPS→443) inherited unchanged from the
original inline implementation in `networkFirewalls.ts`. A rule authored with unconventional text
in its `type` field, or a service running on a non-default port, may not match as a real AWS NACL
(which matches on actual protocol number and numeric port range, never free text) would. This is an
existing, pre-existing simplification this refactor preserves rather than changes - see
`docs/audit/NETWORKING_GAPS.md`'s original NACL findings.

## 5. Security Group statefulness is modeled per-call, not per-actual-connection

Real AWS Security Groups track actual TCP/UDP connection state per 5-tuple. This engine's
`connectionState: 'new' | 'established'` parameter (`securityGroup.ts`) lets a caller assert
statefulness for a given evaluation, but nothing in the live simulator currently tracks a real
connection-state table across hops - the live per-hop trace only ever evaluates `'new'` connections
(matching today's existing behavior, where the return leg is instead handled entirely by the
separate stateless-NACL-return check in `networkFirewalls.ts`'s `checkCustomNaclReturn`). The
`'established'` path exists and is correctly tested (N16) as a real capability for any future
caller that does track connection state (e.g. a future explicit "return leg" SG check), but nothing
in `requestSimulator.ts` invokes it yet - which is itself the correct behavior, since real AWS never
needs a return-leg SG check at all (that's what statefulness means); only the NACL return check is
needed, because NACLs are stateless.

## 6. DNS, ENI, and Availability Zone are modeled at the data level only

Per this implementation's scope constraint ("only implement features supported by the existing
architecture model"), three of the requested primitives are represented as existing data fields
rather than new active engine behavior:

- **ENI**: not a separate node type. An ENI's one behaviorally-relevant property - "does this
  resource have a network interface that must live in exactly one subnet" - is exactly what
  `containment.ts`'s `SUBNET_REQUIRED_SERVICE_IDS` / `deriveSubnetForNode` already model, unchanged
  by this pass.
- **Availability Zone**: `ServiceNodeData.az: AvailabilityZone` already exists and is authored per
  node; this engine does not add AZ-aware routing (e.g. same-AZ-preferred target selection) since no
  existing reference architecture or test exercises that distinction.
- **DNS**: `ProtocolType` already includes `'DNS'`; no dedicated "DNS resolution" trace step exists
  before a route is resolved (the design sketch in `docs/target-architecture/TRACE_ENGINE.md` shows
  one as a future illustrative example, not a committed feature). Adding an unconditional new step
  to every traversal risked breaking existing step-count/step-order assertions in `test/engine.test.ts`
  for no behavioral gain, so it was deliberately left out of this pass.

## 7. What is NOT a deviation - genuinely real, live-wired improvements in this pass

For clarity, these are **not** approximations - they are real behavior now enforced in the live
simulator, not just in standalone tests:

- NACL first-match/implicit-deny evaluation (`nacl.ts`, used by `networkFirewalls.ts`) - unchanged
  behavior from before this refactor, now with one shared, independently-tested implementation.
- NAT Gateway placement and egress-chain validation (`nat.ts`, used by both
  `adapters/natGatewayHop.ts` and `adapters/networkPath.ts`) - unchanged behavior, now shared.
- Security-Group-reference enforcement (`checkNetworkFirewalls`'s new `sourceNode` parameter) - a
  genuinely new, live capability: a Security Group rule can now reference another Security Group by
  id and have that reference enforced against the real attached-Security-Group data of whichever
  node is actually the source of a given hop (`test/network-engine.test.ts` N18).

## Live explicit inbound context increment (2026-10-16)

Live forwarding and supported child calls now pass explicit source private IPv4
and optional connection destinationPort to the existing inbound NACL/SG evaluators.
Unknown source or omitted port retains the legacy educational abstraction and is
disclosed by trace metadata. See live-firewall-context.test.ts. This does not
implement egress, all transport normalization, return routes or real response ports;
legacy checkCustomNaclReturn heuristics remain. Do not infer full network fidelity.
