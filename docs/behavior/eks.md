# EKS workload snapshot coverage

The EKS icon represents either a Kubernetes workload Service snapshot or a control-plane reference. Legacy VPC-hosted EKS nodes use `replicas` as the initial desired, running and Ready counts. Legacy global/reference-only EKS nodes represent control-plane metadata. Explicit `customConfig.eks` overrides these defaults without rewriting saved architectures.

The More information overlay displays cluster grouping, namespace, Deployment, Service, aggregate pod snapshots and containers. Editing the right panel persists configuration immediately. Matching nonempty cluster names group snapshots visually; they do not create Kubernetes membership, compute placement or shared control-plane state. External ALB/NLB, IAM and ECR resources remain on the architecture canvas.

## Implemented rules

- Application requests require valid configuration and matching Ready pod endpoints. Running pods and desired replicas alone do not establish readiness. The selector abstraction is one exact label value, not the full Kubernetes label selector language.
- A control-plane reference cannot serve application requests. An explicitly unavailable control plane does not automatically invalidate an observed existing Ready data path; HPA reconciliation estimates are unavailable.
- Load balancer adapters exclude EKS workload snapshots with no matching Ready endpoints. This is endpoint eligibility, not a simulation of controller reconciliation or AWS target registration/health-check timing.
- Direct internet client nodes cannot reach a ClusterIP by drawing an edge. Other ingress still depends on the existing network/firewall model. Setting Service type LoadBalancer does not provision or infer an ALB/NLB.
- Traffic, multiple replicas, multi-AZ and an ASG never instantly create EKS pods.
- CPU HPA exposes an opt-in basic estimate: ceil(observed running pods × observed utilization / target), bounded to configured min/max. Metrics, CPU requests and a running sample are required. Applying the estimate changes desired replicas only.

## Explicit limitations

This is PARTIAL coverage, not a Kubernetes runtime. Scheduling, pod startup, readiness probes, rolling updates, eviction, node failure, per-pod ENIs, EndpointSlice/kube-proxy, DNS, NetworkPolicy, Kubernetes API authorization, IRSA/Pod Identity, controller reconciliation and saturation are not implemented here. Existing generic IAM/network coverage is not proof of EKS-specific identity or pod networking. The normal Ready-only path does not support publishNotReadyAddresses. Port mappings are annotations, not a full Service packet translation engine. NodePort and LoadBalancer are configuration annotations; real exposure is not inferred. Fargate profiles and EC2/node autoscaler fields describe compute but do not execute placement or provision nodes. HPA tolerance, stabilization, missing pod metrics and rollout semantics are excluded, so its value is labeled an estimate.

## Sources and regression evidence

- [AWS Kubernetes concepts](https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-concepts.html)
- [AWS EKS scaling](https://docs.aws.amazon.com/eks/latest/userguide/autoscaling.html)
- [AWS Fargate profiles](https://docs.aws.amazon.com/eks/latest/userguide/fargate-profile.html)
- [AWS Load Balancer Controller](https://docs.aws.amazon.com/eks/latest/userguide/aws-load-balancer-controller.html)
- [Kubernetes Services](https://kubernetes.io/docs/concepts/services-networking/service/)
- [Kubernetes HPA algorithm](https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/)

`test/eks-live.test.ts` documents rule IDs, sources, scenarios and expected/actual assertions for endpoint readiness, selectors, control-plane separation, validation, scaling prerequisites, external access and load balancer eligibility. `test/ui/ui-integration.test.ts` verifies opt-in display, nested containers, persisted readiness, unrelated configuration preservation and keyboard dismissal/focus restoration. Existing lab/reference architectures remain regression inputs.

## Connectable control-plane illustrations

The EKS architecture reference tags its managed group, API server, etcd, controllers
and scheduler with explicit component metadata. The inspector describes them as
regional, AWS-managed control-plane components, not “Regional Virtual Network”
(the latter describes a VPC). Logical boxes represent replicated components, not
individual provisioned servers. See the [Kubernetes component descriptions](https://kubernetes.io/docs/concepts/architecture/).

API server, etcd, controllers and scheduler boxes expose canvas connection handles.
Only documented conceptual pairs are admitted as `manages` relationships: API
server with etcd/controllers/scheduler/worker or its endpoint, workers with the
endpoint, and an administrator with the endpoint. Cross-cluster component pairs
are rejected. Controllers and schedulers interact through the API server; these
illustrations do not execute API requests, scheduling or reconciliation. Ordinary
VPC/subnet boundaries remain non-connectable, and component request edges remain
invalid. Tests in `test/eks-reference.test.ts` and the UI suite cover classification,
management edge creation, duplicate handling and network-boundary isolation.

## API endpoint versus kube-apiserver communication

Both EKS references draw the endpoint as an access address leading to kube-apiserver,
not as an independent worker-management actor. Worker-to-API-server arrows mean
kubelet watches assigned Pod state and reports status via the cluster private
endpoint. Separate API-server-to-worker arrows describe kubelet operations for
logs, attach and port-forward. Controllers and scheduler originate watch/update
relationships to the API server; etcd persists API state. These relationships are
not a serial application request pipeline and do not execute reconciliation.

This is a logical communication diagram, not a separate direct network bypass of
the endpoint: worker API calls still use the endpoint address. Drawing a supported
worker/endpoint management annotation remains valid for address-level diagrams.
The references instead collapse that access path into the worker/server arrow and
label it explicitly. Source: [Kubernetes node/control-plane communication](https://kubernetes.io/docs/concepts/architecture/control-plane-node-communication/).
`EKS-COMM-001` checks both references for server/worker paths, endpoint separation,
controller/scheduler direction and non-traversable management edges.

## AWS-managed API NLB

AWS explicitly documents that the EKS managed endpoint uses an NLB to load-balance
Kubernetes API servers. The separate image-based reference displays endpoint → managed NLB → API
server replicas for public access. The earlier single-cluster and multi-cluster
references retain the simpler endpoint → API server view, without explicit NLB
or Availability Zone layouts. Each independent cluster retains its own
endpoint and managed NLB. API server and etcd boxes are aggregate replicated
components, not one fixed API/etcd pair in each Availability Zone. Native private
API access uses EKS-managed ENIs rather than an ordinary customer PrivateLink
endpoint. The worker links continue to label their private endpoint path.

The NLB is an annotated control-plane component with editable management handles
and a right-side description, not a customer NLB service node. It therefore does
not invoke the application NLB adapter or add a separately configurable workload
load balancer. Its internal routing, targets and health checks are not simulated.
`test/eks-image-reference.test.ts` verifies the separate managed-NLB reference
and its non-request links.
Source: [AWS EKS control plane](https://docs.aws.amazon.com/eks/latest/best-practices/control-plane.html).

## Reference integrity correction (2026-10-16)

Reference 15 pointed its explicit scenario at a missing `eks-workload` node. The
observed three-Ready-pod workload snapshot has been restored inside subnet B with
an explicit workload role. Existing supplied component positions and management
edges are preserved. Readiness and containment regression tests establish this
bounded scenario; they do not implement scheduling or node/pod failure propagation.
