# Route tables — route_tables (with internet_gateway, nat_gateway, s3_gateway_endpoint)

Status: VERIFIED FOR LISTED OPERATIONS. Verified does not mean full AWS fidelity.
Last reviewed: 2026-10-17 (second pass: one evaluator for assumed and configured routing). Implementation owner: src/engine/network/subnetRouting.ts,
src/engine/network/routeTable.ts, src/engine/simulation/adapters/networkPath.ts,
src/engine/simulation/adapters/vpcEndpoint.ts.

## Scope and resource roles

A route table node holds IPv4 routes and is associated with subnets. Modeled operations:

- Internet → resource in a subnet (internet-facing ingress through an internet gateway).
- Resource in a subnet → destination outside the VPC (internet gateway, NAT gateway, or S3/DynamoDB
  gateway endpoint prefix-list route).
- Resource → explicitly drawn S3 gateway endpoint hop (endpoint must be associated with the
  source subnet's route table).

Excluded: IPv6 and egress-only gateways, peering, transit gateways, virtual private gateways,
route propagation, edge associations, main-route-table modeling (see the toggle below).

## One evaluator for every design, lab and reference

Every subnet inside a VPC is evaluated by `subnetRouting.ts`:

- Associated route table → its routes.
- No association, "Assume route tables" on (default) → a generated standard table: public subnet
  local + 0.0.0.0/0 → the internet gateway attached to its VPC; private subnet local + 0.0.0.0/0 →
  a NAT gateway in a public subnet of the same VPC (same AZ preferred, none = local only); gateway
  endpoints never configured count as associated.
- No association, assume off → VPC main route table with the local route only.

Only resources outside every subnet, or in subnets drawn outside every VPC, use the legacy
placement checks. Internet clients are always evaluated; AWS-managed origins (CloudFront, API
Gateway) only toward public subnets, and a CloudFront VPC origin is a private connection.
Internet → private-subnet resource is reported as 403 (blocked); missing/failed gateway or no
route for egress as 504.

## Internet gateway

AWS facts (verified 2026-10-17): attach to a VPC and add a subnet route; resources need a public
IP; one internet gateway per VPC at a time; AWS refuses to detach while public IPs exist; internet
gateways are horizontally scaled and "do not cause availability risks".
Simulator: attachment = explicit VPC, else the VPC containing or touching it (border placement),
else the only VPC; "Not attached" models a gateway never attached. Failure Lab can still mark it
failed - labeled in the trace as a teaching scenario, not documented AWS behavior. Public IP is
assumed. Validation reports two gateways on one VPC.

## Configuration validation (`routingConfigurationIssues`)

One internet gateway per VPC; route table subnets in one VPC; route destination valid and unique;
IGW/NAT targets exist and belong to the table's VPC. AWS rejects these when you create them; the
simulator reports them as HIGH validation findings and in the route table / IGW panels.
Test: test/routing-validation.test.ts (ROUTE-VAL-001..005, including zero issues in shipped data).

## Configuration contract

| Field | Type/default | Validation | Effect | Persistence |
| --- | --- | --- | --- | --- |
| route table `customConfig.routeTable.routes[]` | `{ destinationCidr, target: { type: local/igw/nat/vpce/peering/tgw, targetId? } }`, default none | CIDR parse; known type; no duplicate destinations | behavior | stored in node data |
| subnet `networkIdentity.routeTableId` | route table node id, default none | must reference a route table node | behavior | stored in boundary node data |
| resource `networkIdentity.routeTableId` | override, default none | as above | behavior (simulator convenience; AWS associates subnets) | stored |
| internet gateway `networkIdentity.vpcId` / `customConfig.attachment: 'detached'` | default: VPC it is drawn inside | vpcId must reference a VPC | behavior: attachment (detached = no traffic, both modes) | stored |
| gateway endpoint `customConfig.routeTableIds` | ids, default `[]` | — | behavior: adds the prefix-list route | stored |
| scenario `assumeRouteTables` | boolean, default true | — | behavior for unassociated subnets | stored with the scenario |

## Behavior and evidence matrix

| Rule/test ID | Condition | Expected | Official source (verified 2026-10-17) | Live/conformance test |
| --- | --- | --- | --- | --- |
| RT-IGW-INGRESS-001 | Subnet table 0.0.0.0/0 → attached IGW | internet reaches resource | [Internet gateways](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html) | tests/aws-conformance/networking/route-tables-live.test.ts |
| RT-IGW-INGRESS-002 | No IGW route (even if labeled public) | failure (504) | same | same |
| RT-IGW-INGRESS-003 | IGW not attached to the VPC | failure | same | same |
| RT-IGW-INGRESS-004 | IGW detached (configured and assumed routing) | failure | same | same |
| RT-NAT-EGRESS-001 | Private 0.0.0.0/0 → NAT; NAT subnet → IGW | success via NAT | [NAT gateway use cases](https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-scenarios.html) | same |
| RT-NAT-EGRESS-002/003/004 | No default route / NAT subnet without IGW route / NAT failed | failure | same | same |
| RT-VPCE-001/002/003 | Endpoint associated / not associated / drawn hop not associated | success / failure / failure | [Gateway endpoints](https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html) | same |
| RT-LEGACY-001 | No associations, assume on | standard public/private tables generated | simulator convenience | same |
| RT-STRICT-001/002 | Assume off: unassociated = local only; associated unchanged | failure / success | Internet gateways (nondefault VPC table) | same |

## Inspector surface

Route table → Config → "Routes and subnet associations" (RouteTablePanel: routes, Public/Private
presets, subnet checkboxes). Subnet boundary → "Route table" select. S3 gateway endpoint →
"Route table associations". Internet gateway → "Internet gateway attachment" (InternetGatewayPanel: VPC attachment or detached, route tables using it). Simulation bar → "Assume route tables" checkbox.

## Relationships and execution

Route tables, IGWs and gateway endpoints are not request hops; the route decision is recorded as a
"Route table: …" trace step before the forwarding hop. NAT and IGW appear as the step target.

## Identity, authorization and network context

Routing runs before NACL/SG and IAM. A gateway endpoint provides a route, not authentication; S3
calls still need an IAM role (see tests/aws-conformance/iam/service-roles.test.ts).

## State and failures

Failed IGW, NAT gateway or endpoint health denies the affected path; internal VPC traffic is
unaffected.

## Trace and coverage

Failures carry a Route decision (component `Route`) with the route table id and reason.
Capability: route_tables NETWORK_BEHAVIOR true (engine/capability/registry.ts).

## Integration and verification

All 19 USMS lab diagrams associate `usms-public-rt` (local + 0.0.0.0/0 → IGW) and
`usms-private-rt` (local + 0.0.0.0/0 → NAT), and the S3 endpoint with the private table; every lab
gives the same outcome with "Assume route tables" on and off. Commands: `npm test`, `npm run build`.

## Reference data changes

Serverless Container (reference 10) gained a DynamoDB gateway endpoint: its ECS tasks in a private
subnet had no NAT or endpoint, so AWS would give them no route to DynamoDB. The previous engine
exempted DynamoDB from egress checks.

## Remaining work

Main route table node; route propagation; IPv6; peering/TGW transit; public IP assignment as an
explicit field.

## Explanation overlay

More information on a route table, NAT gateway or internet gateway shows each subnet's internet path
(networkPathWalkthrough) with a strict-routing what-if.
