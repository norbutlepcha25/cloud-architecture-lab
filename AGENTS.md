# AGENTS.md --- AWS Architecture Lab

## Required shared service behavior workflow

Before service, simulation, connection, reference, lab, or challenge changes, read
[docs/SERVICE_BEHAVIOR_GOVERNANCE.md](docs/SERVICE_BEHAVIOR_GOVERNANCE.md).
It defines the shared behavior invariants, ordered improvement plan, required
verification, and service-by-name implementation workflow. In an established
service-improvement conversation, a service name requests that workflow: inspect
existing behavior, create missing necessary specification/implementation/test files,
integrate with shared engines, and verify overall composition. A filename or model
registration alone does not establish behavioral support. Record unsupported scope.

Service-by-name requests: Claude Code runs this workflow with `/aws-service <service name>`
([.claude/skills/aws-service/SKILL.md](.claude/skills/aws-service/SKILL.md)). Codex uses `$aws-service <service name>`
([.agents/skills/aws-service/SKILL.md](.agents/skills/aws-service/SKILL.md)); other agents follow the shared workflow.


## 1. Project identity

**Project name:** AWS Architecture Lab\
**Package name:** `cloud-architecture-lab`\
**Purpose:** An interactive, browser-based AWS architecture simulator
for teaching cloud architecture, networking, security, resilience, and
system design.

This is an **AWS architecture simulation and learning platform**, not an
AWS Management Console clone.

The user can visually build an architecture, configure services, connect
components, simulate requests, deliberately inject failures, analyze the
architecture, and complete student challenges.

The long-term product goal is:

> Given an architecture constructed by a student, the simulator should
> model the relevant observable behavior of AWS closely enough that
> requests, permissions, networking decisions, failures, and
> architectural consequences behave like AWS --- while remaining
> deterministic, explainable, testable, and suitable for education.

------------------------------------------------------------------------

## 2. Current technology stack

The project is currently a client-side application.

-   React 18
-   TypeScript 5.7
-   Vite 6
-   Tailwind CSS 3
-   `@xyflow/react` 12 --- architecture canvas / graph
-   `lucide-react`
-   `html-to-image`
-   `clsx`
-   `tailwind-merge`

Runtime architecture:

-   Browser-based SPA
-   No backend currently required
-   Production deployment uses a static build served by nginx
-   Docker support exists

Important commands:

``` bash
npm install
npm run dev
npm test
npm run build
npm run preview
```

Docker:

``` bash
docker compose up --build
```

------------------------------------------------------------------------

## 3. Product philosophy

### What this project IS

A deterministic AWS behavioral simulator and teaching environment.

Students should be able to:

1.  Build AWS architectures visually.
2.  Configure AWS services.
3.  Connect services.
4.  Send simulated requests through the architecture.
5.  See exactly where requests succeed or fail.
6.  Understand WHY they succeeded or failed.
7.  Inject failures.
8.  Observe failure propagation.
9.  Analyze resilience and security.
10. Complete architecture challenges.

### What this project IS NOT

Do not turn this into:

-   an AWS Management Console clone
-   an AWS resource provisioning tool
-   a fake AWS UI
-   a generic diagramming application
-   a collection of disconnected service mockups

The value of the product is **behavior**, not UI imitation.

------------------------------------------------------------------------

# 4. Core engineering principle

The simulator should reproduce **observable AWS behavior relevant to
architecture decisions**, not AWS's internal implementation.

For example, we do NOT need to reproduce the internals of EC2 or the
Nitro hypervisor.

We DO need to correctly model questions such as:

-   Can this EC2 instance reach that RDS instance?
-   Which route is selected?
-   Does the NACL allow the packet?
-   Does the Security Group allow it?
-   Is return traffic allowed?
-   Can this private subnet reach the Internet?
-   Does NAT provide the required path?
-   Can this Lambda assume its execution role?
-   Does the role allow `s3:GetObject`?
-   Does an explicit IAM deny override an allow?
-   Is the target healthy?
-   What happens when a NAT gateway or AZ fails?

------------------------------------------------------------------------

# 5. AWS documentation is the source of truth

For AWS-specific behavior:

**Official AWS documentation is authoritative.**

Prioritize:

1.  AWS official service documentation
2.  AWS API/reference documentation
3.  AWS IAM documentation
4.  AWS Service Authorization Reference
5.  AWS VPC/networking documentation
6.  Other official AWS architecture documentation

Do not use an LLM's memory as the authority for AWS behavior.

Do not invent AWS semantics.

If behavior is uncertain:

``` text
UNKNOWN
```

Do not silently guess.

Every important AWS behavior should eventually have:

-   documented rule
-   implementation
-   automated test
-   explainable simulation trace

------------------------------------------------------------------------

# 6. Current project structure

The important source structure is approximately:

``` text
src/
├── App.tsx
├── main.tsx
├── index.css
│
├── types/
│   └── index.ts
│
├── context/
│   └── ArchitectureContext.tsx
│
├── data/
│   ├── serviceCatalog.ts
│   ├── serviceKnowledgeBase.ts
│   ├── referenceArchitectures.ts
│   └── studentChallenges.ts
│
├── engine/
│   ├── simulation/
│   │   ├── requestSimulator.ts
│   │   └── networkFirewalls.ts
│   │
│   ├── analysis/
│   │   ├── rulesEngine.ts
│   │   ├── spofDetector.ts
│   │   └── bottleneckDetector.ts
│   │
│   ├── layout/
│   │   ├── containment.ts
│   │   └── cidrAllocator.ts
│   │
│   ├── failure/
│   │   └── cascadingFailure.ts
│   │
│   └── cost/
│       └── costCalculator.ts
│
├── components/
│   ├── canvas/
│   ├── simulation/
│   ├── failure/
│   ├── analysis/
│   ├── inspector/
│   ├── challenges/
│   ├── cost/
│   ├── layout/
│   ├── icons/
│   └── serviceIcon/
│
└── utils/
    └── exportImage.ts

test/
└── engine.test.ts
```

There are many AWS service icons and a large service catalog. Do not
confuse service icon/catalog coverage with behavioral simulation
coverage.

------------------------------------------------------------------------

# 7. Existing major subsystems

The existing project already contains significant functionality.

### UI

The application has conceptual modes:

``` text
Design
Simulate
Failure Lab
Analyze
Challenges
```

The canvas uses React Flow / `@xyflow/react`.

### Architecture state

`ArchitectureContext.tsx` currently manages:

-   nodes
-   edges
-   node selection
-   node creation/deletion
-   boundary nodes
-   VPC/subnet relationships
-   node health
-   simulation state
-   failure controls
-   analysis
-   reference architectures
-   challenges
-   cost reporting

### Service catalog

`src/data/serviceCatalog.ts` contains a large AWS service catalog,
currently covering hundreds of services.

It contains metadata such as:

-   service name
-   category
-   description
-   architectural role
-   inputs
-   outputs
-   interactions
-   dependencies
-   failure modes
-   resilience characteristics
-   scalability characteristics
-   security considerations
-   alternatives
-   teaching notes
-   default configuration

This catalog is primarily **service metadata/knowledge**, not a complete
AWS behavior engine.

Do not turn the catalog into a giant simulation engine.

------------------------------------------------------------------------

# 8. Important existing types

`src/types/index.ts` currently includes concepts such as:

-   `AWSService`
-   `ServiceNodeData`
-   `ConnectionData`
-   `NaclRule`
-   `SubnetNaclConfig`
-   `SimulationStep`
-   `SimulationScenario`
-   `SimulationResult`
-   `SPOFItem`
-   `BottleneckItem`
-   architecture analysis types
-   student challenge types
-   service categories
-   protocols
-   availability zones
-   subnet types
-   node health

Existing protocol abstraction includes values such as:

``` text
HTTPS
HTTP
DNS
SQL
gRPC
TCP
Event
Message
Object access
```

When improving the simulation engine, do not automatically remove these
abstractions. Determine where they remain useful as an educational UI
abstraction and where a lower-level network/request model is required.

------------------------------------------------------------------------

# 9. Existing simulation system

The current request simulation is centered around:

``` text
src/engine/simulation/requestSimulator.ts
```

The current simulator already models several useful behaviors, including
architecture traversal and service-specific request behavior.

There are also networking/firewall rules in:

``` text
src/engine/simulation/networkFirewalls.ts
```

The existing implementation includes Security Group and NACL concepts.

However, the long-term goal is to refactor the simulator away from
scattered service-specific conditionals and toward reusable behavioral
engines.

Avoid growing the simulator into a huge structure like:

``` typescript
if (service === "S3") ...
else if (service === "EC2") ...
else if (service === "Lambda") ...
else if (service === "RDS") ...
```

Prefer modular service behavior models/adapters.

------------------------------------------------------------------------

# 10. Current Security Group / NACL direction

Security Groups and NACLs are already partially implemented.

The intended AWS semantics are:

### Security Groups

-   instance/ENI-level
-   stateful
-   allow rules
-   inbound/outbound rules
-   CIDR sources/destinations
-   security-group references
-   return traffic behavior

### NACLs

-   subnet-level
-   stateless
-   inbound/outbound rules
-   rule numbers
-   first matching rule
-   allow/deny
-   CIDR
-   protocol
-   port ranges

Do not collapse these into the same abstraction.

The simulator should eventually model a packet/connection and evaluate
the applicable controls in the correct order.

------------------------------------------------------------------------

# 11. Major current limitation

The existence of hundreds of services in `serviceCatalog.ts` does NOT
mean hundreds of services are fully behaviorally simulated.

Every service should eventually have an explicit simulation capability
level.

Recommended capability levels:

``` text
METADATA_ONLY
CONFIGURATION
VALIDATION
CONNECTIVITY
NETWORK_BEHAVIOR
IAM_BEHAVIOR
REQUEST_SIMULATION
FAILURE_SIMULATION
FULL_BEHAVIOR
```

Never label a service as fully simulated simply because it exists in the
catalog.

------------------------------------------------------------------------

# 12. Target simulation architecture

The desired architecture is:

``` text
React UI
   |
   v
Architecture Model
   |
   +--> Configuration Validator
   |
   +--> Request / Flow Engine
   |
   +--> Failure Engine
   |
   +--> Analysis Engine
             |
             v
       Behavioral Engines
       |
       +--> Network Engine
       |
       +--> IAM Engine
       |
       +--> Service Behavior Engine
       |
       +--> Decision Engine
       |
       +--> Trace / Explanation Engine
```

The UI should display simulation state and results.

AWS business/behavioral logic should remain outside React components.

------------------------------------------------------------------------

# 13. Target network model

Eventually, network simulation should operate conceptually as:

``` text
Request
  |
  v
Resolve source
  |
  v
Resolve destination
  |
  v
Resolve network path
  |
  v
Route evaluation
  |
  v
NACL evaluation
  |
  v
Security Group evaluation
  |
  v
Destination/service endpoint
  |
  v
Application/service behavior
  |
  v
Response
  |
  v
Return path where applicable
```

The actual pipeline may differ for particular AWS services, so do not
force every service into an identical flow.

The important requirement is that network behavior is modeled
systematically rather than through arbitrary special cases.

------------------------------------------------------------------------

# 14. Target IAM model

IAM requires a dedicated policy evaluation engine.

Do NOT implement IAM as:

``` text
if role.permissions.includes(action)
    allow
```

The simulator should model the relevant observable IAM concepts,
including where supported:

-   principal
-   action
-   resource
-   conditions
-   identity policies
-   resource policies
-   trust policies
-   role assumption
-   explicit deny
-   implicit deny
-   permissions boundaries
-   session policies
-   SCPs
-   cross-account authorization

The engine should produce an explainable decision.

Example:

``` text
Principal:
LambdaExecutionRole

Action:
s3:GetObject

Resource:
arn:aws:s3:::example-bucket/file.txt

Identity policy:
ALLOW

Explicit deny:
NONE

Conditions:
SATISFIED

Final:
ALLOW
```

If something is not implemented, document it rather than pretending it
is supported.

------------------------------------------------------------------------

# 15. Target service behavior model

Services should be modeled as behavioral adapters/models.

Conceptually:

``` text
AWSServiceModel

validateConfiguration()
resolveEndpoint()
canReceive()
canSend()
processRequest()
getDependencies()
getFailureModes()
```

The exact interface should be adapted to the existing codebase rather
than copied blindly.

Examples of deep behavior candidates:

``` text
VPC
Subnet
Route Table
Route
Internet Gateway
NAT Gateway
Security Group
NACL
ENI
VPC Endpoint
IAM
STS
EC2
Lambda
ECS
Fargate
EKS
S3
RDS
DynamoDB
ALB
NLB
API Gateway
SQS
SNS
CloudFront
Route 53
```

------------------------------------------------------------------------

# 16. Configuration vs simulation vs architecture quality

These are different concepts.

### Configuration validation

Question:

> Is this configuration valid?

Example:

-   overlapping CIDRs
-   invalid subnet
-   invalid route
-   invalid security rule
-   invalid role configuration

### Request simulation

Question:

> Will this request succeed?

Example:

``` text
EC2 → RDS:5432
```

### Architecture analysis

Question:

> Is this a good/reliable/secure architecture?

Example:

-   single point of failure
-   public database exposure
-   missing redundancy
-   bottleneck
-   large failure blast radius

Do not merge these three concepts into one rules engine.

------------------------------------------------------------------------

# 17. Target explainability model

Every important simulation decision should eventually be traceable.

A trace should contain concepts such as:

``` text
step
component
operation
input
decision
reason
AWS rule
metadata
```

Example:

``` text
1. DNS resolution
   ALLOWED

2. Route selection
   10.0.2.0/24 -> local

3. NACL inbound
   Rule 100 -> ALLOW

4. Security Group
   TCP 5432 from ECS-SG -> ALLOW

5. Destination health
   RDS -> HEALTHY

FINAL:
SUCCESS
```

Failure example:

``` text
RDS Security Group

Inbound:
TCP 5432
Source:
10.0.2.0/24

Actual source:
10.0.1.24

CIDR mismatch.

AWS behavior:
DENY

FINAL:
REQUEST FAILED
```

The simulator should eventually support both:

-   concise student-friendly explanations
-   detailed AWS technical traces

------------------------------------------------------------------------

# 18. Failure simulation philosophy

Failure Lab should modify the actual behavioral model.

It should NOT simply paint resources red.

Examples:

-   EC2 failure
-   AZ failure
-   NAT Gateway failure
-   route failure
-   Security Group denial
-   NACL denial
-   IAM denial
-   DNS failure
-   unhealthy ALB target
-   RDS unavailable
-   service dependency failure

Failure propagation must follow actual dependency relationships.

Do not automatically mark all downstream components as failed.

Example:

If NAT fails:

``` text
Private EC2 -> Internet
    FAIL

Private EC2 -> internal RDS
    MAY STILL WORK
```

depending on routing and security configuration.

------------------------------------------------------------------------

# 19. Existing analysis functionality

The project already contains:

``` text
src/engine/analysis/rulesEngine.ts
src/engine/analysis/spofDetector.ts
src/engine/analysis/bottleneckDetector.ts
```

These should remain focused on architecture analysis.

They should not become the network or IAM simulation engine.

Existing concepts include:

-   SPOF detection
-   bottleneck detection
-   architecture scoring
-   resilience analysis
-   security/architecture rules

Preserve these capabilities while improving their inputs.

------------------------------------------------------------------------

# 20. Existing layout functionality

The project has:

``` text
src/engine/layout/containment.ts
src/engine/layout/cidrAllocator.ts
```

These handle important geometric/logical architecture concerns such as:

-   VPC containment
-   subnet containment
-   resource placement
-   CIDR allocation

Existing behavior includes VPC/subnet CIDR handling and subnet placement
constraints.

Do not unnecessarily rewrite these while implementing networking
behavior.

However, distinguish:

``` text
visual containment
```

from:

``` text
actual AWS networking semantics
```

A node being visually inside a subnet is not itself the complete
definition of its AWS network identity.

------------------------------------------------------------------------

# 21. Existing failure functionality

Current failure behavior is centered around:

``` text
src/engine/failure/cascadingFailure.ts
```

Preserve the existing failure experiments while progressively connecting
them to the behavioral simulation engine.

The long-term objective is:

``` text
Failure injection
       |
       v
Resource state change
       |
       v
Behavioral engine
       |
       v
Affected requests
       |
       v
Failure propagation
       |
       v
Explainable result
```

------------------------------------------------------------------------

# 22. Reference architectures

Existing reference architectures are stored in:

``` text
src/data/referenceArchitectures.ts
```

These are important product assets.

Do not delete or casually rewrite them.

After simulation-engine changes, use them as regression scenarios.

Reference architectures should eventually have:

-   expected configuration
-   expected connectivity
-   expected failures
-   expected resilience behavior
-   automated tests

------------------------------------------------------------------------

# 23. Student challenges

Student challenges are stored in:

``` text
src/data/studentChallenges.ts
```

Challenges should eventually be capable of testing more than visual
topology.

They should be able to evaluate:

-   architecture configuration
-   connectivity
-   security
-   IAM
-   resilience
-   failure recovery

Do not break the existing challenge system while improving the
simulation engine.

------------------------------------------------------------------------

# 24. Testing philosophy

The current test suite is:

``` text
test/engine.test.ts
```

The project already has a meaningful collection of engine/reference
architecture tests.

Maintain all existing tests.

Do not weaken or delete a test just to make the implementation pass.

We need two categories of tests:

### Internal regression tests

Verify:

> The simulator behaves consistently with its own intended contracts.

### AWS conformance tests

Verify:

> The simulator behaves consistently with documented AWS behavior.

Future structure may look like:

``` text
test/
├── engine.test.ts
│
└── aws-conformance/
    ├── networking/
    ├── iam/
    ├── compute/
    ├── storage/
    ├── databases/
    ├── load-balancing/
    ├── messaging/
    ├── dns/
    └── failures/
```

------------------------------------------------------------------------

# 25. AWS conformance test format

Each AWS-specific test should document:

``` text
Test ID
AWS rule
Official source
Scenario
Architecture
Configuration
Request
Expected behavior
Actual behavior
Result
```

Example:

``` text
SG-STATEFUL-001

AWS Rule:
Security Groups are stateful.

Scenario:
Client -> EC2 TCP 443

Inbound SG:
TCP 443 allowed

Expected:
Request succeeds.

Return traffic:
Should succeed without a separate inbound return rule.

Simulator:
PASS
```

------------------------------------------------------------------------

# 26. Service implementation priority

Do NOT attempt to fully implement hundreds of AWS services
simultaneously.

Prioritize:

### Tier 1 --- networking/security

``` text
VPC
Subnet
Route Table
Route
Internet Gateway
NAT Gateway
Security Group
NACL
ENI
VPC Endpoint
DNS
Availability Zones
IAM
STS
```

### Tier 2 --- core compute

``` text
EC2
Lambda
ECS
Fargate
EKS
```

### Tier 3 --- storage/database

``` text
S3
EBS
EFS
RDS
DynamoDB
ElastiCache
```

### Tier 4 --- application/networking

``` text
ALB
NLB
API Gateway
CloudFront
Route 53
```

### Tier 5 --- messaging/event

``` text
SQS
SNS
EventBridge
Kinesis
Step Functions
```

### Tier 6 --- supporting services

``` text
ECR
KMS
Secrets Manager
Cognito
CloudWatch
WAF
and others
```

Then progressively expand coverage.

------------------------------------------------------------------------

# 27. Service capability registry

A service should explicitly advertise its simulation coverage.

Example concept:

``` text
S3

METADATA:             YES
CONFIGURATION:        YES
VALIDATION:           YES
CONNECTIVITY:         YES
NETWORK_BEHAVIOR:     PARTIAL
IAM_BEHAVIOR:         YES
REQUEST_SIMULATION:   YES
FAILURE_SIMULATION:   PARTIAL
FULL_BEHAVIOR:        NO
```

This prevents the UI from implying that every service is equally
simulated.

------------------------------------------------------------------------

# 28. Important anti-patterns

Avoid these patterns.

### Giant service conditional

``` typescript
if (serviceId === 's3') ...
else if (serviceId === 'ec2') ...
else if (serviceId === 'lambda') ...
```

Prefer service behavior modules.

### UI-owned AWS semantics

Do not put AWS rules into:

``` text
ServiceNode.tsx
ServiceInspector.tsx
ArchitectureCanvas.tsx
```

UI components should render state and collect configuration.

### Fake IAM

Do not reduce IAM to a list of strings.

### Fake networking

Do not reduce networking to:

``` text
connected = true
```

A visual connection does not necessarily imply network reachability.

### Treating all AWS services equally

Metadata-only support is acceptable.

False claims of full simulation are not.

### Rewriting working code unnecessarily

Refactor incrementally.

------------------------------------------------------------------------

# 29. Development workflow for AI agents

When working on this project:

1.  Inspect the relevant code first.
2.  Identify existing abstractions.
3.  Identify existing tests.
4.  Check AWS documentation for the behavior being changed.
5.  State the intended behavioral rule.
6.  Add or update a test.
7.  Implement the smallest appropriate change.
8.  Run regression tests.
9.  Run build/type checks.
10. Review whether existing functionality was preserved.
11. Document significant architectural changes.

For significant changes, produce a short plan before editing.

------------------------------------------------------------------------

# 30. Phase roadmap

The project is being evolved in the following phases:

``` text
Phase 0
Project safety and engineering rules

Phase 1
Complete repository reverse engineering

Phase 2
AWS behavioral specification

Phase 3
AWS conformance audit

Phase 4
Target simulation-engine architecture

Phase 5
Networking behavioral engine

Phase 6
IAM behavioral engine

Phase 7
Service behavioral engine

Phase 8
Unified request/flow simulation

Phase 9
Failure simulation engine

Phase 10
Architecture validation

Phase 11
Explainable trace engine

Phase 12
AWS conformance test suite

Phase 13
UI integration

Phase 14
Incremental service expansion

Phase 15
Final AWS simulator audit
```

Do not skip directly to broad service implementation before the
foundational networking/IAM architecture is sound.

------------------------------------------------------------------------

# 31. Phase completion criteria

A phase is not complete merely because the application builds.

A phase is complete when:

-   implementation is present
-   relevant tests exist
-   existing tests still pass
-   behavior is documented
-   AWS deviations are documented
-   simulation is deterministic
-   important decisions are explainable

For AWS behavior:

``` text
Implemented
+
Tested
+
Documented
```

is the minimum standard.

------------------------------------------------------------------------

# 32. Current project status

At the time this context file was created:

-   The UI is functional.
-   The architecture canvas is functional.
-   AWS service catalog is extensive.
-   VPC/subnet boundary concepts exist.
-   CIDR allocation exists.
-   Security Group/NACL concepts exist.
-   Request simulation exists.
-   Failure simulation exists.
-   Architecture analysis exists.
-   Cost estimation exists.
-   Reference architectures exist.
-   Student challenges exist.
-   Automated engine tests exist.
-   Docker deployment exists.

However:

-   The service catalog is much broader than behavioral simulation
    coverage.
-   Networking behavior needs to be systematically aligned with AWS
    semantics.
-   IAM requires a dedicated behavioral/policy evaluation engine.
-   Service-specific behavior should be modularized.
-   Request simulation should become a unified behavioral pipeline.
-   Failure injection should operate against the behavioral model.
-   AWS conformance tests need to be expanded significantly.
-   Explainable simulation traces should become a first-class engine
    capability.

Treat these as **known project context**, not as reasons to rewrite the
application.

------------------------------------------------------------------------

# 33. Definition of success

The simulator should eventually allow a student to construct something
like:

``` text
Internet
   |
Route 53
   |
CloudFront
   |
ALB
   |
ECS
   |
RDS
```

and simulate a request.

The simulator should show something like:

``` text
DNS resolution              ✓
Route resolution            ✓
ALB listener                ✓
ALB target health           ✓
ECS connectivity            ✓
Security Group              ✓
ECS -> RDS route            ✓
RDS Security Group          ✓
Database endpoint           ✓

FINAL: SUCCESS
```

If the student changes a rule incorrectly:

``` text
ECS -> RDS TCP 5432
              |
              X
        Security Group
```

the simulator should explain:

``` text
REQUEST FAILED

Destination:
RDS

Port:
5432

Source:
ECS task ENI

Configured RDS Security Group:
TCP 5432
Source: 10.0.2.0/24

Actual ECS source:
10.0.1.24

CIDR does not match.

AWS behavior:
DENY
```

This level of **behavior + explanation** is the ultimate target.

------------------------------------------------------------------------

# 34. Final instruction to AI agents

Always remember:

> This is an existing working educational AWS simulator being
> progressively upgraded into a behaviorally faithful AWS architecture
> simulator.

Do not destroy the existing product to achieve this.

Prefer:

``` text
Understand
→ Measure
→ Compare against AWS
→ Test
→ Refactor
→ Implement
→ Verify
```

over:

``` text
Rewrite everything
→ Hope it behaves like AWS
```

When unsure, inspect the code and AWS documentation before changing
behavior.

When behavior is uncertain, say so.

When a feature is only an approximation, label it.

When a service is not fully implemented, do not claim that it is.

The most important quality attributes are:

1.  AWS behavioral correctness
2.  Determinism
3.  Explainability
4.  Testability
5.  Maintainability
6.  Educational value
7.  Preservation of existing working functionality
