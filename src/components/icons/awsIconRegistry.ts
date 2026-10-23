// Comprehensive mapping from service ID to official AWS SVG asset in src/components/serviceIcon

// Vite eager glob import of all official SVG icons
const svgModules: Record<string, string> = import.meta.glob('../serviceIcon/*.svg', {
  eager: true,
  import: 'default'
});

// Normalized lookup map: filename -> url
const iconFileToUrlMap: Record<string, string> = {};
for (const [path, url] of Object.entries(svgModules)) {
  const filename = path.split('/').pop() || '';
  if (filename) {
    iconFileToUrlMap[filename] = url;
  }
}

// Map service ID to official SVG filename
const SERVICE_ID_TO_SVG_FILE: Record<string, string> = {
  // Third-party brands (Simple Icons, CC0 1.0: https://simpleicons.org). Trademarks belong to their owners.
  'github': 'third-party-github.svg',
  'gitlab': 'third-party-gitlab.svg',
  'bitbucket': 'third-party-bitbucket.svg',
  'docker_hub': 'third-party-docker.svg',

  // Compute
  'ec2': 'amazon-ec2.svg',
  'lambda': 'aws-lambda.svg',
  'ecs': 'amazon-elastic-container-service.svg',
  'eks': 'amazon-elastic-kubernetes-service.svg',
  'fargate': 'aws-fargate.svg',
  'app_runner': 'aws-app-runner.svg',
  'batch': 'aws-batch.svg',
  'elastic_beanstalk': 'aws-elastic-beanstalk.svg',
  'lightsail': 'amazon-lightsail.svg',
  'outposts': 'aws-outposts-family.svg',
  'outposts_rack': 'aws-outposts-rack.svg',
  'outposts_servers': 'aws-outposts-servers.svg',
  'wavelength': 'aws-wavelength.svg',
  'local_zones': 'aws-local-zones.svg',
  'auto_scaling': 'aws-auto-scaling.svg',
  'ec2_image_builder': 'amazon-ec2-image-builder.svg',
  'nitro_enclaves': 'aws-nitro-enclaves.svg',
  'parallel_cluster': 'aws-parallel-cluster.svg',
  'simspace_weaver': 'aws-sim-space-weaver.svg',
  'app2container': 'aws-application-migration-service.svg',
  'copilot_cli': 'aws-tools-and-sdks.svg',
  'snowball_compute': 'aws-snowball-edge.svg',
  'elastic_load_balancing_comp': 'elastic-load-balancing.svg',

  // Storage
  's3': 'amazon-simple-storage-service.svg',
  's3_glacier': 'amazon-simple-storage-service-glacier.svg',
  'ebs': 'amazon-elastic-block-store.svg',
  'efs': 'amazon-efs.svg',
  'fsx_lustre': 'amazon-fsx-for-lustre.svg',
  'fsx_ontap': 'amazon-fsx-for-net-app-ontap.svg',
  'fsx_openzfs': 'amazon-fsx-for-open-zfs.svg',
  'fsx_windows': 'amazon-fsx-for-wfs.svg',
  'storage_gateway': 'aws-storage-gateway.svg',
  'backup': 'aws-backup.svg',
  'elastic_disaster_recovery': 'aws-elastic-disaster-recovery.svg',
  'snowball': 'aws-snowball.svg',
  'snowcone': 'aws-snowball.svg',
  'snowmobile': 'aws-snowball.svg',
  'file_cache': 'amazon-file-cache.svg',
  's3_outposts': 'amazon-s3-on-outposts.svg',
  's3_object_lambda': 'amazon-simple-storage-service.svg',

  // Databases
  'aurora': 'amazon-aurora.svg',
  'aurora_serverless': 'amazon-aurora.svg',
  'aurora_dsql': 'amazon-aurora.svg',
  'rds': 'amazon-rds.svg',
  'rds_proxy': 'amazon-rds.svg',
  'dynamodb': 'amazon-dynamo-db.svg',
  'dynamodb_accelerator': 'amazon-dynamo-db.svg',
  'elasticache': 'amazon-elasti-cache.svg',
  'elasticache_serverless': 'amazon-elasti-cache.svg',
  'memorydb': 'amazon-memory-db.svg',
  'documentdb': 'amazon-document-db.svg',
  'keyspaces': 'amazon-keyspaces.svg',
  'neptune': 'amazon-neptune.svg',
  'neptune_analytics': 'amazon-neptune.svg',
  'timestream': 'amazon-timestream.svg',
  'qldb': 'amazon-managed-blockchain.svg',
  'qldb_ledger': 'amazon-managed-blockchain.svg',
  'dms': 'aws-database-migration-service.svg',

  // Networking
  'vpc': 'amazon-virtual-private-cloud.svg',
  'alb': 'elastic-load-balancing.svg',
  'nlb': 'elastic-load-balancing.svg',
  'application_load_balancer': 'elastic-load-balancing.svg',
  'network_load_balancer': 'elastic-load-balancing.svg',
  'gateway_load_balancer': 'elastic-load-balancing.svg',
  'cloudfront': 'amazon-cloud-front.svg',
  'route53': 'amazon-route-53.svg',
  // VPC resources use AWS's resource icons (Architecture Icons package, Resource-Icons), not the VPC service icon.
  'route_tables': 'amazon-vpc-router.svg',
  'route53_resolver': 'amazon-route-53.svg',
  'transit_gateway': 'aws-transit-gateway.svg',
  'direct_connect': 'aws-direct-connect.svg',
  'nat_gateway': 'amazon-vpc-nat-gateway.svg',
  'internet_gateway': 'amazon-vpc-internet-gateway.svg',
  's3_gateway_endpoint': 'amazon-vpc-endpoints.svg',
  's3_endpoint': 'amazon-vpc-endpoints.svg',
  'vpn_gateway': 'aws-site-to-site-vpn.svg',
  'privatelink': 'aws-private-link.svg',
  'vpc_lattice': 'amazon-vpc-lattice.svg',
  'vpc_peering': 'amazon-vpc-peering-connection.svg',
  'global_accelerator': 'aws-global-accelerator.svg',
  'network_firewall': 'aws-network-firewall.svg',
  'network_firewall_sec': 'aws-network-firewall.svg',
  'api_gateway': 'amazon-api-gateway.svg',
  'app_mesh': 'aws-app-mesh.svg',
  'cloud_map': 'aws-cloud-map.svg',
  'cloud_wan': 'aws-cloud-wan.svg',
  'client_vpn': 'aws-client-vpn.svg',

  // Security
  'iam': 'aws-identity-and-access-management.svg',
  'kms': 'aws-key-management-service.svg',
  'secrets_manager': 'aws-secrets-manager.svg',
  'cognito': 'amazon-cognito.svg',
  'shield': 'aws-shield.svg',
  'waf': 'aws-waf.svg',
  'security_hub': 'aws-security-hub.svg',
  'guardduty': 'amazon-guard-duty.svg',
  'inspector': 'amazon-inspector.svg',
  'macie': 'amazon-macie.svg',
  'detective': 'amazon-detective.svg',
  'acm': 'aws-certificate-manager.svg',
  'cloudhsm': 'aws-cloud-hsm.svg',
  'iam_identity_center': 'aws-iam-identity-center.svg',
  'verified_permissions': 'amazon-verified-permissions.svg',
  'audit_manager': 'aws-audit-manager.svg',
  'artifact': 'aws-artifact.svg',
  'firewall_manager': 'aws-firewall-manager.svg',
  'clean_rooms': 'aws-clean-rooms.svg',
  'security_lake': 'amazon-security-lake.svg',
  'permissions_boundary': 'aws-identity-and-access-management.svg',
  'access_analyzer': 'aws-identity-and-access-management.svg',

  // Messaging & Integration
  'sqs': 'amazon-simple-queue-service.svg',
  'sqs_dlq': 'amazon-simple-queue-service.svg',
  'sns': 'amazon-simple-notification-service.svg',
  'sns_fifo': 'amazon-simple-notification-service.svg',
  'eventbridge': 'amazon-event-bridge.svg',
  'eventbridge_scheduler': 'amazon-event-bridge.svg',
  'step_functions': 'aws-step-functions.svg',
  'swf': 'aws-step-functions.svg',
  'pipes': 'amazon-event-bridge.svg',
  'appsync': 'aws-app-sync.svg',
  'mq': 'amazon-mq.svg',
  'ses': 'amazon-simple-email-service.svg',
  'mwaa': 'amazon-managed-workflows-for-apache-airflow.svg',
  'appflow': 'amazon-app-flow.svg',
  'b2b_data_interchange': 'aws-b2b-data-interchange.svg',
  'pinpoint_msg': 'amazon-pinpoint.svg',
  'kinesis_data_streams_msg': 'amazon-kinesis-data-streams.svg',

  // Analytics
  'athena': 'amazon-athena.svg',
  'athena_federated': 'amazon-athena.svg',
  'emr': 'amazon-emr.svg',
  'emr_serverless': 'amazon-emr.svg',
  'redshift': 'amazon-redshift.svg',
  'redshift_serverless': 'amazon-redshift.svg',
  'redshift_data_sharing': 'amazon-redshift.svg',
  'kinesis_data_streams': 'amazon-kinesis-data-streams.svg',
  'kinesis_firehose': 'amazon-data-firehose.svg',
  'kinesis_analytics': 'amazon-managed-service-for-apache-flink.svg',
  'managed_flink': 'amazon-managed-service-for-apache-flink.svg',
  'msk': 'amazon-managed-streaming-for-apache-kafka.svg',
  'msk_serverless': 'amazon-managed-streaming-for-apache-kafka.svg',
  'opensearch': 'amazon-open-search-service.svg',
  'opensearch_serverless': 'amazon-open-search-service.svg',
  'lake_formation': 'aws-lake-formation.svg',
  'glue': 'aws-glue.svg',
  'glue_databrew': 'aws-glue-data-brew.svg',
  'quicksight': 'amazon-quick.svg',
  'datazone': 'amazon-data-zone.svg',
  'data_exchange': 'aws-data-exchange.svg',

  // AI & ML
  'bedrock': 'amazon-bedrock.svg',
  'bedrock_agent': 'amazon-bedrock-agent-core.svg',
  'sagemaker': 'amazon-sage-maker.svg',
  'sagemaker_studio': 'amazon-sage-maker-studio-lab.svg',
  'sagemaker_canvas': 'amazon-sage-maker-ai.svg',
  'sagemaker_jumpstart': 'amazon-sage-maker.svg',
  'q_developer': 'amazon-q.svg',
  'q_business': 'amazon-q.svg',
  'textract': 'amazon-textract.svg',
  'rekognition': 'amazon-rekognition.svg',
  'comprehend': 'amazon-comprehend.svg',
  'transcribe': 'amazon-transcribe.svg',
  'translate': 'amazon-translate.svg',
  'polly': 'amazon-polly.svg',
  'lex': 'amazon-lex.svg',
  'personalize': 'amazon-personalize.svg',
  'forecast': 'amazon-forecast.svg',
  'fraud_detector': 'amazon-fraud-detector.svg',
  'kendra': 'amazon-kendra.svg',
  'augmented_ai': 'amazon-augmented-ai-a2-i.svg',
  'codewhisperer': 'amazon-code-whisperer.svg',
  'codeguru': 'amazon-code-guru.svg',
  'devops_guru': 'amazon-dev-ops-guru.svg',
  'deeplens': 'amazon-lookout-for-vision.svg',
  'deepcomposer': 'amazon-augmented-ai-a2-i.svg',

  // Management & Governance
  'cloudwatch': 'amazon-cloud-watch.svg',
  'cloudwatch_logs': 'amazon-cloud-watch.svg',
  'cloudwatch_metrics': 'amazon-cloud-watch.svg',
  'cloudwatch_alarms': 'amazon-cloud-watch.svg',
  'cloudwatch_rum': 'amazon-cloud-watch.svg',
  'cloudwatch_evidently': 'amazon-cloud-watch.svg',
  'cloudwatch_synthetics': 'amazon-cloud-watch.svg',
  'cloudtrail': 'aws-cloud-trail.svg',
  'config': 'aws-config.svg',
  'systems_manager': 'aws-systems-manager.svg',
  'control_tower': 'aws-control-tower.svg',
  'organizations': 'aws-organizations.svg',
  'trusted_advisor': 'aws-trusted-advisor.svg',
  'well_architected': 'aws-well-architected-tool.svg',
  'resilience_hub': 'aws-resilience-hub.svg',
  'fis': 'aws-fault-injection-service.svg',
  'fault_injection_simulator': 'aws-fault-injection-service.svg',
  'compute_optimizer': 'aws-compute-optimizer.svg',
  'compute_optimizer_mgmt': 'aws-compute-optimizer.svg',
  'health_dashboard': 'aws-health-dashboard.svg',
  'grafana': 'amazon-managed-grafana.svg',
  'prometheus': 'amazon-managed-service-for-prometheus.svg',
  'service_catalog': 'aws-service-catalog.svg',
  'license_manager': 'aws-license-manager.svg',
  'proton': 'aws-proton.svg',
  'opsworks': 'aws-systems-manager.svg',
  'resource_groups': 'aws-resource-access-manager.svg',

  // Developer Tools
  'codepipeline': 'aws-code-pipeline.svg',
  'codebuild': 'aws-code-build.svg',
  'codedeploy': 'aws-code-deploy.svg',
  'codecommit': 'aws-code-commit.svg',
  'codeartifact': 'aws-code-artifact.svg',
  'cloudformation': 'aws-cloud-formation.svg',
  'cdk': 'aws-cloud-development-kit.svg',
  'xray': 'aws-x-ray.svg',
  'cloud9': 'aws-cloud9.svg',
  'cloudshell': 'aws-cloud-shell.svg',
  'codecatalyst': 'amazon-code-catalyst.svg',
  'app_composer': 'aws-infrastructure-composer.svg',
  'codeguru_reviewer': 'amazon-code-guru.svg',
  'codeguru_profiler': 'amazon-code-guru.svg',
  'device_farm_dev': 'aws-device-farm.svg',
  'aws_cli': 'aws-command-line-interface.svg',
  'sam_cli': 'aws-tools-and-sdks.svg',

  // Containers
  'ecr': 'amazon-elastic-container-registry.svg',
  'ecr_registry': 'amazon-elastic-container-registry.svg',
  'fargate_container': 'aws-fargate.svg',
  'app_runner_container': 'aws-app-runner.svg',
  'rosa': 'red-hat-open-shift-service-on-aws.svg',
  'bottlerocket_os': 'bottlerocket.svg',
  'copilot_tool': 'aws-tools-and-sdks.svg',
  'app2container_tool': 'aws-application-migration-service.svg',
  'finch': 'amazon-elastic-container-service.svg',
  'ecs_anywhere_ctr': 'amazon-ecs-anywhere.svg',
  'eks_anywhere_ctr': 'amazon-eks-anywhere.svg',

  // Frontend Web & Mobile
  'amplify': 'aws-amplify.svg',
  'amplify_studio': 'aws-amplify.svg',
  'device_farm': 'aws-device-farm.svg',
  'location_service': 'amazon-location-service.svg',
  'appsync_mobile': 'aws-app-sync.svg',
  'cognito_mobile': 'amazon-cognito.svg',
  'serverless_api_web': 'amazon-api-gateway.svg',
  'mobile_analytics': 'amazon-pinpoint.svg',

  // Migration & Transfer
  'datasync': 'aws-data-sync.svg',
  'transfer_family': 'aws-transfer-family.svg',
  'transfer_sftp': 'aws-transfer-family.svg',
  'transfer_ftps': 'aws-transfer-family.svg',
  'mgm': 'aws-application-migration-service.svg',
  'mgn_migration': 'aws-application-migration-service.svg',
  'migration_hub': 'aws-application-migration-service.svg',
  'server_migration_service': 'aws-application-migration-service.svg',
  'cloudadopt': 'aws-application-migration-service.svg',
  'application_discovery': 'aws-application-discovery-service.svg',
  'migration_evaluator': 'aws-migration-evaluator.svg',
  'mainframe_modernization': 'aws-mainframe-modernization.svg',
  'dms_migration': 'aws-database-migration-service.svg',
  'schema_conversion_tool': 'aws-database-migration-service.svg',
  'snowball_migration': 'aws-snowball.svg',

  // Media Services
  'medialive': 'aws-elemental-media-live.svg',
  'mediapackage': 'aws-elemental-media-package.svg',
  'mediaconvert': 'aws-elemental-media-convert.svg',
  'mediatailor': 'aws-elemental-media-tailor.svg',
  'mediaconnect': 'aws-elemental-media-connect.svg',
  'ivs': 'amazon-interactive-video-service.svg',
  'kinesis_video': 'amazon-kinesis-video-streams.svg',
  'elastic_transcoder': 'aws-elemental-media-convert.svg',
  'kinesis_video_media': 'amazon-kinesis-video-streams.svg',
  'elemental_appliances': 'aws-elemental-appliances-software.svg',
  'nimble_studio': 'aws-deadline-cloud.svg',
  'ground_station_media': 'aws-ground-station.svg',

  // Business Applications
  'connect': 'amazon-connect.svg',
  'voice_id': 'amazon-connect.svg',
  'contact_lens': 'amazon-connect.svg',
  'wisdom': 'amazon-connect.svg',
  'customer_profiles': 'amazon-connect.svg',
  'connect_cases': 'amazon-connect.svg',
  'pinpoint': 'amazon-pinpoint.svg',
  'pinpoint_email': 'amazon-pinpoint.svg',
  'chime': 'amazon-chime.svg',
  'chime_sdk': 'amazon-chime-sdk.svg',
  'workmail': 'amazon-work-mail.svg',
  'workdocs': 'amazon-work-docs.svg',
  'wickr': 'aws-wickr.svg',
  'honeycode': 'aws-app-studio.svg',

  // End User Computing
  'workspaces': 'amazon-work-spaces.svg',
  'workspaces_web': 'amazon-work-spaces.svg',
  'workspaces_core': 'amazon-work-spaces.svg',
  'workspaces_thin_client': 'amazon-work-spaces.svg',
  'virtual_desktop': 'amazon-work-spaces.svg',
  'secure_browser': 'amazon-work-spaces.svg',
  'appstream': 'amazon-dcv.svg',
  'remote_desktop': 'amazon-dcv.svg',
  'worklink': 'amazon-work-spaces.svg',

  // IoT
  'iot_core': 'aws-iot-core.svg',
  'iot_greengrass': 'aws-iot-greengrass.svg',
  'iot_device_management': 'aws-iot-device-management.svg',
  'iot_device_defender': 'aws-iot-device-defender.svg',
  'iot_sitewise': 'aws-iot-site-wise.svg',
  'iot_events': 'aws-iot-events.svg',
  'iot_twinmaker': 'aws-iot-twin-maker.svg',
  'iot_fleetwise': 'aws-iot-fleet-wise.svg',
  'iot_analytics': 'aws-iot-core.svg',
  'iot_things_graph': 'aws-iot-core.svg',
  'iot_roborunner': 'aws-iot-core.svg',
  'iot_1click': 'aws-iot-core.svg',
  'iot_button': 'aws-iot-core.svg',
  'iot_device_tester': 'aws-iot-device-management.svg',
  'iot_lorawan': 'aws-iot-core.svg',

  // Cloud Financial Management
  'cost_explorer': 'aws-cost-explorer.svg',
  'budgets': 'aws-budgets.svg',
  'cost_and_usage': 'aws-cost-and-usage-report.svg',
  'billing_conductor': 'aws-billing-conductor.svg',
  'savings_plans': 'savings-plans.svg',
  'pricing_calculator': 'aws-cost-explorer.svg',
  'cost_categories': 'aws-cost-explorer.svg',
  'cost_anomaly_detection': 'aws-cost-explorer.svg',
  'migration_evaluator_cost': 'aws-migration-evaluator.svg',

  // Blockchain & Quantum
  'braket': 'amazon-braket.svg',
  'quantum_simulator': 'amazon-braket.svg',
  'managed_blockchain': 'amazon-managed-blockchain.svg',
  'managed_blockchain_query': 'amazon-managed-blockchain.svg',
  'web3_rpc': 'amazon-managed-blockchain.svg',

  // Robotics & Satellite
  'ground_station': 'aws-ground-station.svg',
  'satellite_antenna': 'aws-ground-station.svg',
  'orbital_telemetry': 'aws-ground-station.svg',
  'robomaker': 'aws-iot-core.svg',
  'robomaker_sim': 'aws-iot-core.svg',
  'simspace_weaver_sim': 'aws-sim-space-weaver.svg'
};

/**
 * Get the SVG asset URL for an AWS service ID or name.
 * Returns undefined if no exact SVG file matches.
 */
export function getAwsSvgIconUrl(serviceId?: string): string | undefined {
  if (!serviceId || typeof serviceId !== 'string') return undefined;

  const file = SERVICE_ID_TO_SVG_FILE[serviceId];
  if (file && iconFileToUrlMap[file]) {
    return iconFileToUrlMap[file];
  }

  // Fallback check if serviceId directly matches a file like amazon-ec2.svg
  const directFile = `${serviceId}.svg`;
  if (iconFileToUrlMap[directFile]) {
    return iconFileToUrlMap[directFile];
  }

  // Fallback check for normalized name matches in iconFileToUrlMap
  const norm = serviceId.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [f, url] of Object.entries(iconFileToUrlMap)) {
    const base = f.replace('.svg', '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const baseNoPrefix = base.replace(/^amazon/, '').replace(/^aws/, '');
    if (base === norm || baseNoPrefix === norm) {
      return url;
    }
  }

  return undefined;
}
