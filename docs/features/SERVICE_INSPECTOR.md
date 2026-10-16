# Service-specific inspector accordions

Implemented 2026-10-16. Overview and Config remain tabs, with Overview selected initially. Teaching Notes and the supporting configuration sections use collapsed, independently expandable accordions. Service selection resets accordion expansion state while retaining the selected tab; closing a section keeps its local form state. No architecture configuration is reset by opening or closing a section.

## Ownership

- InspectorAccordion.tsx provides a native button with aria-expanded, aria-controls, visible keyboard focus and a hidden content container. Hidden contents remain mounted to preserve experiment/form state but are excluded from keyboard navigation and the accessibility tree.
- inspectorProfile.ts routes service-specific surfaces and placement controls. It is UI metadata, not an AWS behavior engine.
- Ec2ConfigurationPanel, S3ConfigurationPanel, DatabaseConfigurationPanel and LambdaConfigurationPanel own the existing forms previously embedded in ServiceInspector.
- EcsConfigurationPanel, endpoint, IAM, networking, managed operations and ASG panels retain their existing update and validation paths.
- EksConfigurationPanel edits the existing eksConfiguration contract, delegates validation to validateEks, and distinguishes workload snapshots from managed control-plane references. The full explorer remains available.

## Visibility rules

- EC2 exposes its machine/image/storage configuration and instance role. S3 exposes bucket settings. Database, Lambda, ECS and EKS expose their own controls.
- No universal task/instance replicas slider. Counts belong to service-owned workload or ASG configuration.
- RDS standby configuration appears only for RDS. Other services do not inherit that toggle. Existing saved configuration is preserved.
- AZ/subnet/network identity controls appear only for the explicit applicable inspector profile. EKS control-plane references do not receive workload network or SG attachment controls. Regional managed services such as S3 receive no per-instance AZ placement form.
- CloudWatch receives ASG controls only when actually linked as a group's alarm; unrelated metrics panels do not get an empty scaling section.
- Common display labels, costs, drawing layout, overview and teaching information remain separate sections. Connections and boundary configuration have their own collapsed settings section.
- Services without a dedicated configuration panel show a coverage note plus applicable shared controls. No fabricated service settings are generated from arbitrary catalog fields.

## Future service changes

Add or extend the service-owned panel and inspectorProfile routing when supported editable configuration is introduced. Reuse the shared accordion. Do not restore universal capacity/replication/standby fields. Keep configuration semantics in service/shared engines and label metadata/cost-only assumptions. Verify that service selection removes unrelated controls, that sections start collapsed, and that edits survive toggle and persistence.

## Verification

UI integration covers collapsed defaults and aria relationships, selection reset, EC2/S3/RDS/Lambda/ECS/EKS scoping, EKS edits and retained values, metadata-only coverage, connection/boundary expansion, and existing inspector operations. Full npm test and npm run build are required. Browser visual check: collapsed subnet inspector in dark theme; service behavior/interaction checks use the React/jsdom integration suite.
