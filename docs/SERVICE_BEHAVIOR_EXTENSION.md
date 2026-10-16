# Incremental service behavior development

Required companion: [shared behavior governance and service-by-name workflow](SERVICE_BEHAVIOR_GOVERNANCE.md). Use its [service specification template](behavior/SERVICE_TEMPLATE.md) for missing behavior documents.

Implement one bounded service behavior at a time. “Full AWS” is not a useful acceptance criterion: enumerate observable behaviors, official references, positive/negative tests, and explicit exclusions first.

## Repeatable workflow

1. Inspect the live request path, service registry, configuration validator, failure model, capability registry, and existing conformance tests. A standalone model is not proof of live integration.
2. Write a behavior matrix: configuration, incoming requests, outgoing dependencies, network identity, IAM identity, health/failure, and unsupported cases. Cite official AWS documentation for each AWS rule.
3. Extend a dedicated service model under `src/engine/service/models/`. Reuse network and IAM evaluators; do not place AWS decisions in React or infer connectivity from an edge alone.
4. Connect the model to the live adapters and validator. Preserve request identity through transparent network hops. Represent observed state separately from desired state.
5. Record decisions during execution. UI explanations must describe that same stored execution, not independently simulate it again.
6. Test success, configuration errors, network denial, IAM denial, unavailable service, surviving dependencies, and interactions with existing services. Run reference architecture regressions and build checks.
7. Expose configuration inputs in the existing inspector. Update evidence and limitations conservatively; model registration does not justify FULL coverage.

Suggested next increment: ECS task startup dependencies (ECR, execution role, logging/secrets), followed by scheduler recovery. Treat EKS as a separate model, not an alias for ECS.

## ECS increment implemented here

- ECS uses a dedicated running-service model for awsvpc on EC2 or Fargate.
- Desired and observed running counts are distinct. Zero running tasks prevents service execution and excludes that target from normal ALB selection.
- Availability does not imply instantaneous scaling, replacement, or unlimited real-world capacity. Saturation and scheduler timing are explicitly unmodeled.
- Application API calls use `iamRole` as the task role and `ecs-tasks.amazonaws.com` for modeled role assumption. An execution role does not grant the application permissions.
- Existing inspector supports launch type and desired/running counts. Task-role policy authoring is still via the architecture data (`iamRole`); this increment does not add a policy editor.
- `customConfig.resourceArn` on an API destination supplies its authorization resource. Omitted ARNs still use legacy synthetic resources: use explicit ARNs for meaningful policy tests.
- Test evidence: `test/ecs-live.test.ts` covers task roles, explicit deny, boundaries, trust, endpoint identity, RDS connectivity, zero tasks, ALB selection, and stored-result consistency.

Official references:
- https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html
- https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-networking-awsvpc.html
- https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html
- https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html
- https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html

## Integration boundaries and limitations

The UI now calls `runLiveSimulation`, which enables IAM checks on supported API hops. Existing direct `runSimulation` callers retain compatibility defaults; they do not automatically establish IAM conformance. The separate unified pipeline remains separate. This is not a claim that all engines have been consolidated.

`traceFromSimulation` preserves the live verdict and recorded explanations. Legacy decisions without a verified AWS rule reference explicitly identify that missing evidence. Independent `explainHop` remains a diagnostic API; it is not the authoritative UI run result.

Not included: ECS bridge/host/none networking, placement capacity, task startup, image pulls, execution-role use, autoscaling policies, scheduler timing, per-task ENIs, service discovery, deployment rollouts, EKS expansion, or correcting all existing ALB failure semantics. Valid but unsupported ECS networking modes are reported as unsupported. ECS must remain partial coverage.

## Regression fixture correction

`SVC-SQS-SUCCESS-001` previously placed its ECS producer in the helper's default global location. Its producer is now in a private subnet, consistent with the modeled awsvpc requirement. Success/status assertions remain unchanged. The test's existing 202 acknowledgment describes the simulator abstraction; it must not be treated as proof of the actual SQS API HTTP response code.

## Shared consistency increment (2026-10-16)

See [implementation evidence](target-architecture/SERVICE_CONSISTENCY_PROGRESS.md) and [DynamoDB child-call scope](behavior/dynamodb.md). Live forwarding and supported dependency calls share simulation/applicationHop.ts. Required and optional child failures have independent evidence sinks; optional denial no longer fails the parent. Result kinds and explicit packet context are recorded. The standalone unified/interaction engines remain diagnostics, and the broader workflow/network migration remains incomplete.
