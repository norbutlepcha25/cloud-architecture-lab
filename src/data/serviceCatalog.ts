import type { AWSService, ServiceCategory } from '../types/index.ts';

// Helper to construct standardized AWS service definitions efficiently
const createService = (
  id: string,
  name: string,
  category: ServiceCategory,
  role: string,
  color: string,
  desc: string,
  options?: Partial<AWSService>
): AWSService => ({
  id,
  name,
  category,
  architecturalRole: role,
  color,
  iconName: id,
  description: desc,
  inputs: options?.inputs || ['HTTPS', 'HTTP'],
  outputs: options?.outputs || ['HTTPS', 'HTTP'],
  commonInteractions: options?.commonInteractions || ['HTTPS'],
  dependencies: options?.dependencies || [],
  failureModes: options?.failureModes || [`${name} quota limit exceeded`, `${name} connection timeout`],
  resilienceCharacteristics: options?.resilienceCharacteristics || ['Managed AWS high availability across Availability Zones'],
  scalabilityCharacteristics: options?.scalabilityCharacteristics || ['Elastic auto-scaling on demand'],
  securityConsiderations: options?.securityConsiderations || ['IAM least privilege and encryption at rest'],
  alternatives: options?.alternatives || [],
  teachingNotes: options?.teachingNotes || [`${name} provides managed ${category.toLowerCase()} capabilities in the AWS cloud.`],
  defaultConfig: options?.defaultConfig
});

export const AWS_SERVICES: AWSService[] = [
  // ==========================================
  // 1. CLIENT & INGRESS (3 services)
  // ==========================================
  createService('user', 'End User / Client', 'Client / Ingress', 'Traffic ingress origin and client actor.', '#232F3E', 'Client browsers, mobile apps, and IoT devices.', {
    inputs: [], outputs: ['HTTPS', 'HTTP', 'DNS'], commonInteractions: ['HTTPS', 'DNS'],
    teachingNotes: ['Always design architectures under the assumption that client ingress traffic is bursty.']
  }),
  createService('client_ui', 'Data Transfer Hub UI', 'Client / Ingress', 'Web frontend application / client dashboard.', '#232F3E', 'Web client interface hosting user management workflows.', {
    dependencies: ['cognito', 'appsync', 'cloudfront']
  }),
  createService('api_client', 'External API Consumer', 'Client / Ingress', 'External partner services making programmatic API calls.', '#232F3E', 'Third-party webhook or B2B integration partner.', {
    outputs: ['HTTPS', 'HTTP']
  }),

  // ==========================================
  // 1b. THIRD-PARTY & EXTERNAL (outside AWS; engine/architecture/externalActors.ts)
  // ==========================================
  createService('developer', 'Developer Workstation', 'Third-Party & External', 'Developer laptop running Git and the AWS CLI.', '#475569', 'A developer outside AWS who pushes code and calls AWS public endpoints over the internet.', {
    inputs: [], outputs: ['HTTPS', 'HTTP', 'TCP'], commonInteractions: ['HTTPS'],
    securityConsiderations: ['Use IAM Identity Center or short-lived credentials; grant codecommit:GitPush only on the repositories the developer works on.'],
    teachingNotes: ['git push to CodeCommit goes to the public Git endpoint (git-codecommit.<region>.amazonaws.com) over HTTPS. It never passes through a VPC, so no internet gateway is involved.']
  }),
  createService('github', 'GitHub', 'Third-Party & External', 'Third-party Git hosting.', '#181717', 'Git repository hosting. CodePipeline uses it as a source through an AWS CodeConnections connection.', {
    inputs: ['HTTPS'], outputs: ['HTTPS', 'Event'], commonInteractions: ['HTTPS', 'Event'],
    securityConsiderations: ['The connection is authorized through the AWS Connector GitHub App; the pipeline role needs codeconnections:UseConnection.'],
    teachingNotes: ['A push to the configured branch starts the pipeline only after the connection finished its handshake (status AVAILABLE).']
  }),
  createService('gitlab', 'GitLab', 'Third-Party & External', 'Third-party Git hosting.', '#FC6D26', 'Git repository hosting. CodePipeline uses GitLab.com as a source through an AWS CodeConnections connection.', {
    inputs: ['HTTPS'], outputs: ['HTTPS', 'Event'], commonInteractions: ['HTTPS', 'Event'],
    teachingNotes: ['CodePipeline reaches GitLab through a CodeConnections connection, like GitHub and Bitbucket Cloud.']
  }),
  createService('bitbucket', 'Bitbucket', 'Third-Party & External', 'Third-party Git hosting.', '#0052CC', 'Bitbucket Cloud repositories used as a CodePipeline source through an AWS CodeConnections connection.', {
    inputs: ['HTTPS'], outputs: ['HTTPS', 'Event'], commonInteractions: ['HTTPS', 'Event'],
    teachingNotes: ['Only Bitbucket Cloud is supported by connections; installed Bitbucket Server is not.']
  }),
  createService('docker_hub', 'Docker Hub', 'Third-Party & External', 'Public container image registry.', '#2496ED', 'Third-party image registry. Workloads in private subnets need NAT or internet egress to pull from it.', {
    inputs: ['HTTPS'], outputs: ['HTTPS'], commonInteractions: ['HTTPS'],
    teachingNotes: ['A VPC endpoint does not reach Docker Hub; only ECR has interface endpoints. Private subnets need a NAT gateway.']
  }),
  createService('on_premises', 'On-Premises Data Center', 'Third-Party & External', 'Corporate network outside AWS.', '#475569', 'Servers and users in a company network that reach AWS over the internet.', {
    inputs: ['HTTPS', 'HTTP', 'TCP'], outputs: ['HTTPS', 'HTTP', 'TCP'], commonInteractions: ['HTTPS'],
    teachingNotes: ['Modeled as an internet origin. Site-to-Site VPN and Direct Connect private paths are not simulated.']
  }),

  // ==========================================
  // 2. COMPUTE (25 services)
  // ==========================================
  createService('lambda', 'AWS Lambda', 'Compute', 'Serverless event-driven compute functions.', '#ED7100', 'Executes stateless code in response to events without server management.', {
    inputs: ['HTTPS', 'Event', 'Message'], outputs: ['SQL', 'HTTPS', 'Message', 'Event'], commonInteractions: ['Event', 'HTTPS'],
    dependencies: ['dynamodb', 'rds', 'step_functions'],
    failureModes: ['Cold start latency', 'Timeout limit (15m)', 'Concurrency quota exhaustion'],
    teachingNotes: ['Lambda excels at event-driven microservices; beware of opening direct relational database sockets without RDS Proxy.']
  }),
  createService('ec2', 'Amazon EC2', 'Compute', 'General purpose virtual machine compute.', '#ED7100', 'Secure, resizable compute capacity in the cloud.', {
    inputs: ['HTTP', 'HTTPS', 'TCP'], outputs: ['SQL', 'HTTPS', 'Object access'], commonInteractions: ['HTTP', 'SQL'],
    dependencies: ['rds', 's3'], failureModes: ['Hardware retirement', 'Kernel crash', 'Disk space exhaustion'],
    teachingNotes: ['A single standalone EC2 instance is a Single Point of Failure (SPOF). Always enclose in an Auto Scaling Group.']
  }),
  createService('ecs', 'Amazon ECS', 'Compute', 'Fully managed container orchestration.', '#ED7100', 'Runs Docker containers across EC2 and AWS Fargate.', {
    inputs: ['HTTP', 'gRPC'], outputs: ['SQL', 'HTTPS', 'Object access'], dependencies: ['rds', 'dynamodb', 's3'],
    teachingNotes: ['Distribute tasks across multiple AZs behind an ALB for fault tolerance.']
  }),
  createService('fargate', 'AWS Fargate', 'Compute', 'Serverless container execution engine.', '#ED7100', 'Runs containers without managing underlying EC2 server clusters.', {
    inputs: ['HTTP', 'HTTPS', 'Event'], outputs: ['SQL', 'HTTPS', 'Object access'], dependencies: ['ecr', 's3']
  }),
  createService('eks', 'Amazon EKS', 'Compute', 'Managed Kubernetes cluster service.', '#ED7100', 'Runs standard upstream Kubernetes across multiple availability zones.', {
    inputs: ['HTTPS', 'gRPC'], outputs: ['SQL', 'HTTPS', 'Object access']
  }),
  createService('app_runner', 'AWS App Runner', 'Compute', 'Fully managed container application service.', '#ED7100', 'Builds and runs secure containerized web applications directly from code repositories.', {}),
  createService('elastic_beanstalk', 'AWS Elastic Beanstalk', 'Compute', 'PaaS application deployment service.', '#ED7100', 'Automatically handles provisioning, load balancing, and scaling for web apps.', {}),
  createService('lightsail', 'Amazon Lightsail', 'Compute', 'Simplified virtual private server (VPS).', '#ED7100', 'Easy-to-use virtual machines, storage, and networking for simple workloads.', {}),
  createService('batch', 'AWS Batch', 'Compute', 'Fully managed batch computing at scale.', '#ED7100', 'Dynamically provisions compute resources based on volume and requirements of batch jobs.', {}),
  createService('outposts', 'AWS Outposts', 'Compute', 'Native AWS infrastructure on-premises.', '#ED7100', 'Runs AWS compute and storage locally in enterprise data centers.', {}),
  createService('wavelength', 'AWS Wavelength', 'Compute', 'Ultra-low latency 5G edge compute.', '#ED7100', 'Deploys AWS compute and storage inside 5G telecommunication networks.', {}),
  createService('local_zones', 'AWS Local Zones', 'Compute', 'Geographic edge compute extensions.', '#ED7100', 'Places compute, storage, and database close to large population centers.', {}),
  createService('serverless_app_repo', 'AWS Serverless Application Repository', 'Compute', 'Serverless component catalog.', '#ED7100', 'Store and share reusable serverless architectures across teams.', {}),
  createService('ec2_auto_scaling', 'Amazon EC2 Auto Scaling', 'Compute', 'Fleet size management and instance replacement.', '#ED7100', 'Maintains application availability and scales EC2 capacity up or down automatically.', {}),
  createService('bottlerocket', 'Bottlerocket OS', 'Compute', 'Container-optimized Linux distribution.', '#ED7100', 'Minimalist, security-hardened open-source operating system built for hosting containers.', {}),
  createService('nitro_enclaves', 'AWS Nitro Enclaves', 'Compute', 'Isolated compute environments for sensitive data.', '#ED7100', 'Cryptographically isolated environments with no persistent storage or interactive access.', {}),
  createService('simspace_weaver', 'AWS SimSpace Weaver', 'Compute', 'Spatial simulation engine.', '#ED7100', 'Build dynamic, large-scale spatial simulations across multiple EC2 instances.', {}),
  createService('ec2_image_builder', 'EC2 Image Builder', 'Compute', 'Automated virtual machine image pipelines.', '#ED7100', 'Builds, tests, and deploys customized AMI images.', {}),
  createService('parallelcluster', 'AWS ParallelCluster', 'Compute', 'HPC cluster deployment tool.', '#ED7100', 'Deploy and manage High Performance Computing (HPC) clusters on AWS.', {}),
  createService('elastic_load_balancing_comp', 'Elastic Load Balancing (ELB)', 'Compute', 'Traffic distribution across compute fleets.', '#ED7100', 'Balances incoming application traffic across EC2, containers, and IP addresses.', {}),
  createService('compute_optimizer', 'AWS Compute Optimizer', 'Compute', 'Machine learning resource right-sizing.', '#ED7100', 'Recommends optimal AWS compute resources to reduce costs and improve performance.', {}),
  createService('snowball_compute', 'AWS Snowball Edge Compute', 'Compute', 'Edge data processing and migration appliance.', '#ED7100', 'On-board storage and compute for rugged, disconnected environments.', {}),
  createService('app2container', 'AWS App2Container', 'Compute', 'Container modernization tool.', '#ED7100', 'Transforms Java and .NET applications into containerized workloads.', {}),
  createService('copilot_cli', 'AWS Copilot', 'Compute', 'Container application CLI.', '#ED7100', 'Tool for developers to build, release and operate production-ready containerized apps.', {}),
  createService('ecs_anywhere', 'Amazon ECS Anywhere', 'Compute', 'On-premises container orchestration.', '#ED7100', 'Run and manage containers on customer-managed on-premises hardware.', {}),

  // ==========================================
  // 3. STORAGE (16 services)
  // ==========================================
  createService('s3', 'Amazon S3', 'Storage', 'Durable, scalable object storage service.', '#7AA116', 'Stores static web assets, media, backups, and analytical data lakes with 11 9s durability.', {
    inputs: ['HTTPS', 'Object access'], outputs: [], commonInteractions: ['HTTPS', 'Object access'],
    teachingNotes: ['Never serve static web assets directly from web servers; store them in S3 behind CloudFront.']
  }),
  createService('s3_glacier', 'Amazon S3 Glacier', 'Storage', 'Low-cost cold archive object storage.', '#7AA116', 'Long-term secure data archiving with flexible retrieval times from minutes to hours.', {}),
  createService('ebs', 'Amazon EBS', 'Storage', 'Block storage volumes for EC2 instances.', '#7AA116', 'High-performance persistent block storage for databases and file systems.', {}),
  createService('efs', 'Amazon EFS', 'Storage', 'Serverless, elastic POSIX shared file system.', '#7AA116', 'Scalable NFS file storage shared concurrently across thousands of EC2 and container instances.', {}),
  createService('fsx_windows', 'Amazon FSx for Windows File Server', 'Storage', 'Fully managed native Windows file systems.', '#7AA116', 'Built on Windows Server with full SMB protocol support and Active Directory integration.', {}),
  createService('fsx_lustre', 'Amazon FSx for Lustre', 'Storage', 'High-performance computing file system.', '#7AA116', 'Sub-millisecond latency file system optimized for machine learning and big data processing.', {}),
  createService('fsx_ontap', 'Amazon FSx for NetApp ONTAP', 'Storage', 'Enterprise NetApp storage on AWS.', '#7AA116', 'Multi-protocol file storage with NetApp snapshot and deduplication features.', {}),
  createService('fsx_openzfs', 'Amazon FSx for OpenZFS', 'Storage', 'ZFS powered high-throughput file storage.', '#7AA116', 'Delivers hundreds of thousands of IOPS with sub-millisecond latencies.', {}),
  createService('storage_gateway', 'AWS Storage Gateway', 'Storage', 'Hybrid cloud storage appliance.', '#7AA116', 'Connects on-premises applications to virtually unlimited cloud storage.', {}),
  createService('backup', 'AWS Backup', 'Storage', 'Centralized policy-based backup automation.', '#7AA116', 'Centrally manage and automate data protection across AWS services and hybrid workloads.', {}),
  createService('snowball', 'AWS Snowball', 'Storage', 'Petabyte-scale physical data transport appliance.', '#7AA116', 'Ruggedized device for migrating petabytes of data into AWS without bandwidth saturation.', {}),
  createService('snowcone', 'AWS Snowcone', 'Storage', 'Ultra-portable edge data migration device.', '#7AA116', 'Lightweight, portable edge storage and compute device for austere environments.', {}),
  createService('snowmobile', 'AWS Snowmobile', 'Storage', 'Exabyte-scale data migration truck.', '#7AA116', '45-foot rugged shipping container pulled by a semi-trailer truck for moving up to 100 PB.', {}),
  createService('elastic_disaster_recovery', 'AWS Elastic Disaster Recovery (DRS)', 'Storage', 'Block-level replication disaster recovery.', '#7AA116', 'Minimizes downtime and data loss by providing fast, reliable recovery of physical and virtual servers.', {}),
  createService('s3_outposts', 'Amazon S3 on Outposts', 'Storage', 'Local object storage for on-prem Outposts.', '#7AA116', 'Delivers S3 object storage capabilities directly inside your on-premises data center.', {}),
  createService('s3_object_lambda', 'Amazon S3 Object Lambda', 'Storage', 'Custom code data processing during S3 GET.', '#7AA116', 'Applies custom code to S3 GET requests to modify and transform data in transit.', {}),

  // ==========================================
  // 4. DATABASES (18 services)
  // ==========================================
  createService('dynamodb', 'Amazon DynamoDB', 'Databases', 'Serverless NoSQL key-value and document database.', '#C925D1', 'Single-digit millisecond response times at any scale with multi-AZ replication built-in.', {
    inputs: ['HTTPS'], outputs: [], commonInteractions: ['HTTPS'],
    teachingNotes: ['Inherently Multi-AZ with zero connection pool exhaustion risks. Ideal for serverless microservices.']
  }),
  createService('rds', 'Amazon RDS', 'Databases', 'Managed relational database service (PostgreSQL/MySQL).', '#3B48CC', 'Provides transactional relational databases with automated backups, patching, and Multi-AZ failover.', {
    inputs: ['SQL'], outputs: [], commonInteractions: ['SQL'],
    teachingNotes: ['Single-AZ RDS is a critical single point of failure (SPOF). Always enable Multi-AZ for production workloads.']
  }),
  createService('aurora', 'Amazon Aurora', 'Databases', 'High-performance cloud-native relational database.', '#3B48CC', 'Up to 5x throughput of standard MySQL and 3x PostgreSQL with 6-way cross-AZ storage replication.', {
    inputs: ['SQL'], outputs: []
  }),
  createService('aurora_serverless', 'Amazon Aurora Serverless v2', 'Databases', 'Auto-scaling on-demand relational database.', '#3B48CC', 'Instantly scales database CPU and memory capacity in fractions of a second based on load.', {
    inputs: ['SQL']
  }),
  createService('elasticache', 'Amazon ElastiCache', 'Databases', 'In-memory data store for Redis and Memcached.', '#C925D1', 'Sub-millisecond data caching to offload database query read contention.', {
    inputs: ['TCP'], outputs: []
  }),
  createService('memorydb', 'Amazon MemoryDB for Redis', 'Databases', 'Redis-compatible durable in-memory database.', '#C925D1', 'Ultra-fast performance with Multi-AZ transactional log durability.', {}),
  createService('documentdb', 'Amazon DocumentDB', 'Databases', 'MongoDB-compatible JSON document database.', '#C925D1', 'Fully managed scalable document database built for JSON data workloads.', {}),
  createService('neptune', 'Amazon Neptune', 'Databases', 'Graph database for highly connected datasets.', '#C925D1', 'Supports Gremlin and openCypher queries for fraud detection, social networks, and knowledge graphs.', {}),
  createService('timestream', 'Amazon Timestream', 'Databases', 'Fast, scalable time-series database.', '#C925D1', 'Stores and analyzes trillions of time-series events per day for IoT and DevOps telemetry.', {}),
  createService('keyspaces', 'Amazon Keyspaces', 'Databases', 'Managed Apache Cassandra-compatible database.', '#C925D1', 'Scalable, highly available serverless Cassandra database table management.', {}),
  createService('qldb', 'Amazon QLDB', 'Databases', 'Cryptographically verifiable ledger database.', '#C925D1', 'Immutable, transparent, and cryptographically verifiable transaction log database.', {}),
  createService('redshift_serverless', 'Amazon Redshift Serverless', 'Databases', 'On-demand cloud data warehouse.', '#3B48CC', 'Analyzes petabytes of structured and semi-structured data without configuring clusters.', {}),
  createService('rds_proxy', 'Amazon RDS Proxy', 'Databases', 'Fully managed database connection pooler.', '#3B48CC', 'Pools and shares database connections to prevent compute functions from exhausting DB capacity.', {}),
  createService('dms', 'AWS Database Migration Service', 'Databases', 'Homogeneous and heterogeneous database migration.', '#3B48CC', 'Migrates databases to AWS securely with continuous ongoing replication during migration.', {}),
  createService('opensearch_db', 'Amazon OpenSearch Service', 'Databases', 'Search, visualization, and vector analytics engine.', '#3B48CC', 'Interactive log analytics, full-text search, application monitoring, and vector search.', {}),
  createService('neptune_analytics', 'Amazon Neptune Analytics', 'Databases', 'Memory-optimized graph analytics engine.', '#C925D1', 'Analyzes tens of billions of graph connections in seconds.', {}),
  createService('elasticache_serverless', 'ElastiCache Serverless', 'Databases', 'Zero-management Redis and Memcached caching.', '#C925D1', 'Creates a cache in under a minute and instantly scales memory and compute.', {}),
  createService('aurora_dsql', 'Amazon Aurora DSQL', 'Databases', 'Distributed SQL transactional database.', '#3B48CC', 'Ultra-resilient distributed SQL database with multi-region active-active replication.', {}),

  // ==========================================
  // 5. NETWORKING & CONTENT DELIVERY (24 services)
  // ==========================================
  createService('vpc', 'Amazon VPC', 'Networking & Content Delivery', 'Isolated cloud virtual private network.', '#8C4FFF', 'Provisions private logically isolated virtual networks with complete IP range control.', {}),
  createService('cloudfront', 'Amazon CloudFront', 'Networking & Content Delivery', 'Global Content Delivery Network (CDN).', '#8C4FFF', 'Distributes cached content to hundreds of edge points of presence with single-digit ms latency.', {
    inputs: ['HTTPS', 'HTTP'], outputs: ['HTTPS', 'HTTP'], commonInteractions: ['HTTPS'],
    dependencies: ['s3', 'alb', 'appsync']
  }),
  createService('route53', 'Amazon Route 53', 'Networking & Content Delivery', 'Global Domain Name System (DNS) service.', '#8C4FFF', 'Highly available Anycast DNS service supporting health-checked failover routing.', {
    inputs: ['DNS'], outputs: ['HTTPS', 'HTTP'], commonInteractions: ['DNS']
  }),
  createService('alb', 'Application Load Balancer (ALB)', 'Networking & Content Delivery', 'Layer 7 HTTP/HTTPS traffic load balancer.', '#8C4FFF', 'Evaluates target health, routes by URL path/host, and terminates SSL across AZs.', {
    inputs: ['HTTPS', 'HTTP'], outputs: ['HTTP', 'gRPC'], commonInteractions: ['HTTP', 'HTTPS']
  }),
  createService('nlb', 'Network Load Balancer (NLB)', 'Networking & Content Delivery', 'Ultra-high performance Layer 4 TCP/UDP load balancer.', '#8C4FFF', 'Capable of handling millions of requests per second with ultra-low latencies and static IPs.', {}),
  createService('gateway_load_balancer', 'Gateway Load Balancer', 'Networking & Content Delivery', 'Third-party virtual appliance load balancer.', '#8C4FFF', 'Deploys and scales virtual firewalls and deep packet inspection appliances.', {}),
  createService('api_gateway', 'Amazon API Gateway', 'Networking & Content Delivery', 'Managed API frontend with rate limiting.', '#8C4FFF', 'Creates, secures, and throttles REST, HTTP, and WebSocket APIs at scale.', {
    inputs: ['HTTPS'], outputs: ['Event', 'HTTP']
  }),
  createService('appsync', 'AWS AppSync', 'Networking & Content Delivery', 'Enterprise managed GraphQL & pub/sub service.', '#8C4FFF', 'Connects client apps directly to data and events with real-time GraphQL subscriptions.', {
    inputs: ['HTTPS'], outputs: ['Event', 'HTTPS']
  }),
  createService('transit_gateway', 'AWS Transit Gateway', 'Networking & Content Delivery', 'Centralized cloud network hub.', '#8C4FFF', 'Connects thousands of Amazon VPCs and on-premises networks through a central router.', {}),
  createService('direct_connect', 'AWS Direct Connect', 'Networking & Content Delivery', 'Dedicated private physical fiber connection to AWS.', '#8C4FFF', 'Bypasses the public internet to deliver predictable, high-bandwidth hybrid networking.', {}),
  createService('privatelink', 'AWS PrivateLink', 'Networking & Content Delivery', 'Private VPC endpoint connectivity.', '#8C4FFF', 'Provides private connectivity between VPCs and AWS services without public internet exposure.', {}),
  createService('client_vpn', 'AWS Client VPN', 'Networking & Content Delivery', 'Managed client OpenVPN connection.', '#8C4FFF', 'Securely connects remote employees to AWS and on-premises network resources.', {}),
  createService('site_to_site_vpn', 'AWS Site-to-Site VPN', 'Networking & Content Delivery', 'IPsec encrypted hybrid network tunnel.', '#8C4FFF', 'Creates an encrypted IPsec connection between on-premises routers and AWS VPCs.', {}),
  createService('cloud_wan', 'AWS Cloud WAN', 'Networking & Content Delivery', 'Wide Area Network management service.', '#8C4FFF', 'Builds and monitors unified global networks across AWS and branch offices.', {}),
  createService('global_accelerator', 'AWS Global Accelerator', 'Networking & Content Delivery', 'Anycast IP internet performance accelerator.', '#8C4FFF', 'Improves application availability and latency by routing over AWS global fiber backbone.', {}),
  createService('internet_gateway', 'Internet Gateway (IGW)', 'Networking & Content Delivery', 'VPC public internet ingress/egress gateway.', '#8C4FFF', 'Enables communication between public resources in your VPC and the Internet.', {}),
  createService('nat_gateway', 'NAT Gateway', 'Networking & Content Delivery', 'Outbound internet connectivity for private subnets.', '#8C4FFF', 'Allows private instances to patch and call external APIs without allowing inbound access.', {
    // A NAT Gateway is a protocol-agnostic Layer 3/4 passthrough for outbound traffic, not an application-layer endpoint.
    inputs: ['TCP', 'HTTPS', 'HTTP']
  }),
  createService('s3_gateway_endpoint', 'S3 Gateway Endpoint', 'Networking & Content Delivery', 'Private VPC gateway route to S3 without NAT or IGW.', '#8C4FFF', 'Allows instances in private subnets to read/write Amazon S3 buckets over AWS private network without traversing internet.', {}),
  createService('route_tables', 'Route Tables', 'Networking & Content Delivery', 'Subnet packet routing rules.', '#8C4FFF', 'Contains a set of rules determining where network traffic from your subnet is directed.', {}),
  createService('network_firewall', 'AWS Network Firewall', 'Networking & Content Delivery', 'Stateful network inspection firewall.', '#8C4FFF', 'Provides stateful inspection, intrusion prevention, and web filtering for VPCs.', {}),
  createService('route53_resolver', 'Route 53 Resolver', 'Networking & Content Delivery', 'Hybrid DNS query forwarder.', '#8C4FFF', 'Enables recursive DNS lookups between AWS VPCs and on-premises DNS servers.', {}),
  createService('vpc_lattice', 'Amazon VPC Lattice', 'Networking & Content Delivery', 'Service-to-service application networking.', '#8C4FFF', 'Connects, monitors, and secures communications across microservices without network complexity.', {}),
  createService('vpc_peering', 'VPC Peering', 'Networking & Content Delivery', 'Direct non-transitive VPC network connection.', '#8C4FFF', 'Routes traffic between two VPCs using private IPv4/IPv6 addresses.', {}),
  createService('verified_access', 'AWS Verified Access', 'Networking & Content Delivery', 'Zero-Trust application access without VPN.', '#8C4FFF', 'Provides secure corporate application access using Zero Trust principles.', {}),
  createService('app_mesh', 'AWS App Mesh', 'Networking & Content Delivery', 'Service mesh for microservice observability.', '#8C4FFF', 'Provides application-level networking for microservices using the Envoy proxy.', {}),
  createService('cloud_map', 'AWS Cloud Map', 'Networking & Content Delivery', 'Service discovery for cloud resources.', '#8C4FFF', 'Maintains a live registry of application service locations (DNS/SRV records) so services can discover each other by name instead of hardcoded endpoints.', {
    inputs: ['DNS', 'HTTPS', 'HTTP'] // DNS/SRV record lookups, plus its own HTTP API for service registration/discovery
  }),

  // ==========================================
  // 6. SECURITY, IDENTITY & COMPLIANCE (26 services)
  // ==========================================
  createService('iam', 'AWS IAM', 'Security, Identity & Compliance', 'Identity and Access Management.', '#DD344C', 'Securely controls individual identity, group permissions, and role-based resource access.', {}),
  createService('cognito', 'Amazon Cognito', 'Security, Identity & Compliance', 'Customer identity and access management.', '#DD344C', 'Handles user sign-up, sign-in, MFA, and access control for web and mobile apps.', {
    inputs: ['HTTPS'], outputs: ['HTTPS']
  }),
  createService('kms', 'AWS Key Management Service (KMS)', 'Security, Identity & Compliance', 'Centralized encryption key management.', '#DD344C', 'Creates and controls encryption keys used to encrypt data across AWS services.', {}),
  createService('secrets_manager', 'AWS Secrets Manager', 'Security, Identity & Compliance', 'Database credentials and API key rotation.', '#DD344C', 'Rotates, manages, and retrieves secrets and database credentials securely.', {}),
  createService('waf', 'AWS WAF', 'Security, Identity & Compliance', 'Web application firewall against layer 7 attacks.', '#DD344C', 'Protects web apps from SQL injection, cross-site scripting, and bot traffic.', {}),
  createService('shield', 'AWS Shield', 'Security, Identity & Compliance', 'Managed Distributed Denial of Service (DDoS) protection.', '#DD344C', 'Safeguards applications running on AWS against Layer 3, 4, and 7 DDoS attacks.', {}),
  createService('guardduty', 'Amazon GuardDuty', 'Security, Identity & Compliance', 'Intelligent threat detection and continuous monitoring.', '#DD344C', 'Analyzes DNS logs, VPC flow logs, and CloudTrail events using machine learning to detect threats.', {}),
  createService('inspector', 'Amazon Inspector', 'Security, Identity & Compliance', 'Automated vulnerability management service.', '#DD344C', 'Scans AWS workloads for software vulnerabilities and unintended network exposure.', {}),
  createService('macie', 'Amazon Macie', 'Security, Identity & Compliance', 'Data security and sensitive data discovery.', '#DD344C', 'Discovers and protects sensitive data such as PII and financial records in S3 buckets.', {}),
  createService('security_hub', 'AWS Security Hub', 'Security, Identity & Compliance', 'Cloud security posture management.', '#DD344C', 'Aggregates, organizes, and prioritizes security alerts and compliance status across AWS accounts.', {}),
  createService('acm', 'AWS Certificate Manager (ACM)', 'Security, Identity & Compliance', 'Public and private SSL/TLS certificates.', '#DD344C', 'Provisions, manages, and renews SSL/TLS certificates for AWS services.', {}),
  createService('directory_service', 'AWS Directory Service', 'Security, Identity & Compliance', 'Managed Microsoft Active Directory.', '#DD344C', 'Enables directory-aware workloads to use managed Active Directory in AWS.', {}),
  createService('cloudhsm', 'AWS CloudHSM', 'Security, Identity & Compliance', 'Hardware Security Module (FIPS 140-2 Level 3).', '#DD344C', 'Dedicated hardware security modules for regulatory cryptographic compliance.', {}),
  createService('artifact', 'AWS Artifact', 'Security, Identity & Compliance', 'Compliance reports and agreements portal.', '#DD344C', 'On-demand access to AWS security compliance reports and certifications.', {}),
  createService('audit_manager', 'AWS Audit Manager', 'Security, Identity & Compliance', 'Continuous automated evidence collection.', '#DD344C', 'Continuously audits AWS usage to simplify risk assessment and regulatory compliance.', {}),
  createService('detective', 'Amazon Detective', 'Security, Identity & Compliance', 'Security investigation and root cause analysis.', '#DD344C', 'Analyzes and visualizes security data to investigate potential security issues faster.', {}),
  createService('iam_identity_center', 'AWS IAM Identity Center (SSO)', 'Security, Identity & Compliance', 'Centralized Single Sign-On (SSO).', '#DD344C', 'Manage workforce identity access centrally across multiple AWS accounts and business apps.', {}),
  createService('permissions_boundary', 'Permissions Boundaries', 'Security, Identity & Compliance', 'Delegated IAM permission guardrails.', '#DD344C', 'Sets the maximum permissions that an identity-based policy can grant to an IAM entity.', {}),
  createService('verified_permissions', 'Amazon Verified Permissions', 'Security, Identity & Compliance', 'Fine-grained application authorization engine.', '#DD344C', 'Enforces Cedar-based fine-grained permissions for custom applications.', {}),
  createService('payment_cryptography', 'AWS Payment Cryptography', 'Security, Identity & Compliance', 'PCI-compliant payment transaction processing.', '#DD344C', 'Simplifies cryptographic operations for payment processing applications.', {}),
  createService('security_lake', 'Amazon Security Lake', 'Security, Identity & Compliance', 'Centralized security data lake (OCSF).', '#DD344C', 'Automatically centralizes security data from cloud, on-premises, and custom sources.', {}),
  createService('network_firewall_sec', 'VPC Network Firewall', 'Security, Identity & Compliance', 'Stateful packet inspection engine.', '#DD344C', 'Inspects and filters traffic at the perimeter of your Amazon VPC.', {}),
  createService('openid', 'OpenID Connect (OIDC)', 'Security, Identity & Compliance', 'Federated identity authentication.', '#F59E0B', 'Exchanges enterprise identity tokens with AWS Cognito and IAM.', {}),
  createService('signer', 'AWS Signer', 'Security, Identity & Compliance', 'Code signing certificate validation.', '#DD344C', 'Ensures code trust and integrity by signing code packages and container images.', {}),
  createService('security_incident_response', 'AWS Incident Response', 'Security, Identity & Compliance', 'Automated security containment workflows.', '#DD344C', 'Orchestrates threat remediation and isolation workflows when breaches occur.', {}),
  createService('access_analyzer', 'IAM Access Analyzer', 'Security, Identity & Compliance', 'External resource access audit.', '#DD344C', 'Identifies resources shared with external entities outside of your AWS organization.', {}),

  // ==========================================
  // 7. INTEGRATION & MESSAGING (15 services)
  // ==========================================
  createService('sqs', 'Amazon SQS', 'Integration & Messaging', 'Decoupled message queue shock absorber.', '#FF4F8B', 'Buffers asynchronous traffic bursts, decoupling producers from backend datastores.', {
    inputs: ['Message'], outputs: ['Message'], commonInteractions: ['Message'],
    teachingNotes: ['The ultimate shock absorber. Spikes sit safely in queue rather than crashing database thread pools.']
  }),
  createService('sns', 'Amazon SNS', 'Integration & Messaging', 'High-throughput publish/subscribe fan-out.', '#FF4F8B', 'Publishes messages to multiple subscribers (SQS, Lambda, HTTP webhooks, SMS) simultaneously.', {
    inputs: ['Event', 'Message'], outputs: ['Message', 'Event']
  }),
  createService('eventbridge', 'Amazon EventBridge', 'Integration & Messaging', 'Serverless event bus connecting SaaS and AWS.', '#FF4F8B', 'Routes events from custom applications, SaaS partners, and AWS services using rule filtering.', {
    inputs: ['Event'], outputs: ['Event']
  }),
  createService('step_functions', 'AWS Step Functions', 'Integration & Messaging', 'Serverless visual workflow orchestrator.', '#FF4F8B', 'Orchestrates multi-step distributed workflows, retries, and error compensation logic.', {
    inputs: ['Event'], outputs: ['Event']
  }),
  createService('amazon_mq', 'Amazon MQ', 'Integration & Messaging', 'Managed Apache ActiveMQ and RabbitMQ.', '#FF4F8B', 'Managed message broker for industry-standard protocols like AMQP, MQTT, STOMP, and OpenWire.', {}),
  createService('appflow', 'Amazon AppFlow', 'Integration & Messaging', 'No-code SaaS data integration flow.', '#FF4F8B', 'Securely transfers data between SaaS applications (Salesforce, Slack) and AWS services.', {}),
  createService('mwaa', 'Amazon MWAA (Apache Airflow)', 'Integration & Messaging', 'Managed Apache Airflow workflow service.', '#FF4F8B', 'Runs Python-based Directed Acyclic Graphs (DAGs) to orchestrate data pipelines.', {}),
  createService('pipes', 'Amazon EventBridge Pipes', 'Integration & Messaging', 'Point-to-point event integrations.', '#FF4F8B', 'Creates point-to-point integrations between event producers and consumers with optional enrichment.', {}),
  createService('swf', 'Amazon Simple Workflow (SWF)', 'Integration & Messaging', 'State tracker and task coordinator.', '#FF4F8B', 'Coordinates background tasks and state tracking for distributed enterprise applications.', {}),
  createService('eventbridge_scheduler', 'EventBridge Scheduler', 'Integration & Messaging', 'Universal recurring cron and one-shot scheduler.', '#FF4F8B', 'Schedules millions of tasks and invokes hundreds of AWS services reliably on time.', {}),
  createService('b2b_data_interchange', 'AWS B2B Data Interchange', 'Integration & Messaging', 'Electronic Data Interchange (EDI) automation.', '#FF4F8B', 'Automates transformation of EDI documents into standardized JSON and XML formats.', {}),
  createService('pinpoint_msg', 'Amazon Pinpoint Messaging', 'Integration & Messaging', 'Multi-channel customer notifications.', '#FF4F8B', 'Sends transactional and promotional SMS, push notifications, and emails.', {}),
  createService('kinesis_data_streams_msg', 'Kinesis Streams Buffer', 'Integration & Messaging', 'Real-time ordered streaming ingest buffer.', '#FF4F8B', 'Captures and stores terabytes of high-volume data streams per hour.', {}),
  createService('sns_fifo', 'Amazon SNS FIFO', 'Integration & Messaging', 'Strictly ordered pub/sub topics.', '#FF4F8B', 'Provides message ordering and deduplication across multiple subscriber queues.', {}),
  createService('sqs_dlq', 'SQS Dead-Letter Queue (DLQ)', 'Integration & Messaging', 'Poison message isolation repository.', '#FF4F8B', 'Stores messages that cannot be processed successfully for diagnostic review.', {}),

  // ==========================================
  // 8. ANALYTICS (22 services)
  // ==========================================
  createService('athena', 'Amazon Athena', 'Analytics', 'Serverless interactive SQL query engine.', '#2E27AD', 'Directly queries petabytes of unstructured data stored in S3 using standard ANSI SQL.', {}),
  createService('emr', 'Amazon EMR', 'Analytics', 'Big data processing with Spark, Hadoop, and Presto.', '#2E27AD', 'Runs massive data transformation and machine learning workloads across distributed clusters.', {}),
  createService('kinesis', 'Amazon Kinesis', 'Analytics', 'Real-time streaming data ingestion and analytics.', '#2E27AD', 'Ingests and analyzes streaming video and telemetry data in real time.', {}),
  createService('kinesis_firehose', 'Amazon Data Firehose', 'Analytics', 'Streaming data delivery into data lakes.', '#2E27AD', 'Captures, transforms, and loads streaming data into S3, Redshift, and OpenSearch.', {}),
  createService('kinesis_video', 'Kinesis Video Streams', 'Analytics', 'Live video streaming and playback.', '#2E27AD', 'Streams video from millions of connected camera devices for analytics and ML.', {}),
  createService('msk', 'Amazon MSK (Apache Kafka)', 'Analytics', 'Managed Apache Kafka streaming clusters.', '#2E27AD', 'Builds and runs streaming applications using open-source Apache Kafka.', {}),
  createService('glue', 'AWS Glue', 'Analytics', 'Serverless ETL, data catalog, and schema registry.', '#2E27AD', 'Discovers, prepares, and combines data for analytics and machine learning.', {}),
  createService('glue_databrew', 'AWS Glue DataBrew', 'Analytics', 'Visual data preparation tool.', '#2E27AD', 'Clean and normalize data with 250+ pre-built transformations without writing code.', {}),
  createService('lake_formation', 'AWS Lake Formation', 'Analytics', 'Secure data lake governor and permissions.', '#2E27AD', 'Builds secure data lakes and manages granular column/row access controls centrally.', {}),
  createService('opensearch', 'Amazon OpenSearch Service', 'Analytics', 'Search and log analytics cluster.', '#2E27AD', 'Analyzes system logs, metrics, and provides fast search across business records.', {}),
  createService('redshift', 'Amazon Redshift', 'Analytics', 'Petabyte-scale analytical data warehouse.', '#2E27AD', 'Analyzes structured data across your operational databases and data lake.', {}),
  createService('quicksight', 'Amazon QuickSight', 'Analytics', 'Cloud-powered Business Intelligence (BI) service.', '#2E27AD', 'Delivers interactive dashboards, natural language queries, and machine learning insights.', {}),
  createService('clean_rooms', 'AWS Clean Rooms', 'Analytics', 'Privacy-preserving collaborative data analytics.', '#2E27AD', 'Allows organizations to analyze collective datasets without sharing raw data.', {}),
  createService('data_exchange', 'AWS Data Exchange', 'Analytics', 'Third-party commercial cloud data catalog.', '#2E27AD', 'Find, subscribe to, and use third-party datasets in the cloud.', {}),
  createService('datazone', 'Amazon DataZone', 'Analytics', 'Enterprise data management and governance portal.', '#2E27AD', 'Discovers, catalogs, and governs data across organizational boundaries.', {}),
  createService('finspace', 'Amazon FinSpace', 'Analytics', 'Financial services data analytics management.', '#2E27AD', 'Reduces data preparation time for financial analysts and quantitative modelers.', {}),
  createService('cloudsearch', 'Amazon CloudSearch', 'Analytics', 'Managed search solution for websites.', '#2E27AD', 'Simple search solution supporting multi-language indexing and faceting.', {}),
  createService('opensearch_serverless', 'OpenSearch Serverless', 'Analytics', 'On-demand serverless search and analytics.', '#2E27AD', 'Scales search indexing and search querying independently without cluster sizing.', {}),
  createService('msk_serverless', 'Amazon MSK Serverless', 'Analytics', 'Serverless Apache Kafka stream ingestion.', '#2E27AD', 'Streams data without provisioning, managing, or scaling Kafka cluster capacity.', {}),
  createService('emr_serverless', 'Amazon EMR Serverless', 'Analytics', 'Serverless big data framework execution.', '#2E27AD', 'Runs open-source analytics applications without managing cluster nodes.', {}),
  createService('redshift_data_sharing', 'Redshift Data Sharing', 'Analytics', 'Secure cross-cluster analytical data access.', '#2E27AD', 'Shares live transactional data across Redshift clusters without data copies.', {}),
  createService('athena_federated', 'Athena Federated Query', 'Analytics', 'Cross-source federated data queries.', '#2E27AD', 'Executes ANSI SQL queries across relational, NoSQL, and custom data sources.', {}),

  // ==========================================
  // 9. MACHINE LEARNING & AI (26 services)
  // ==========================================
  createService('bedrock', 'Amazon Bedrock', 'Machine Learning & AI', 'Generative AI Foundation Model service.', '#059669', 'Access leading foundation models (Claude, Titan, Llama) securely via an API.', {
    inputs: ['HTTPS'], outputs: ['HTTPS'],
    teachingNotes: ['Foundation AI models without managing GPU infrastructure. Protects data privacy by default.']
  }),
  createService('sagemaker', 'Amazon SageMaker', 'Machine Learning & AI', 'End-to-end Machine Learning platform.', '#059669', 'Build, train, tune, and deploy machine learning models at scale.', {}),
  createService('sagemaker_studio', 'SageMaker Studio', 'Machine Learning & AI', 'Web-based visual IDE for ML.', '#059669', 'Single visual interface for all machine learning development steps.', {}),
  createService('sagemaker_canvas', 'SageMaker Canvas', 'Machine Learning & AI', 'Visual no-code machine learning tool.', '#059669', 'Enables business analysts to generate accurate ML predictions without code.', {}),
  createService('rekognition', 'Amazon Rekognition', 'Machine Learning & AI', 'Computer vision and image/video analysis.', '#059669', 'Detects objects, faces, text, and inappropriate content in images and videos.', {}),
  createService('comprehend', 'Amazon Comprehend', 'Machine Learning & AI', 'Natural Language Processing (NLP) service.', '#059669', 'Extracts insights, sentiment, and relationships from unstructured text.', {}),
  createService('comprehend_medical', 'Amazon Comprehend Medical', 'Machine Learning & AI', 'HIPAA-eligible medical text extraction.', '#059669', 'Extracts medical conditions, medications, and anatomy from clinical notes.', {}),
  createService('polly', 'Amazon Polly', 'Machine Learning & AI', 'Lifelike Neural Text-to-Speech (TTS).', '#059669', 'Converts text into lifelike speech in dozens of languages with neural voices.', {}),
  createService('transcribe', 'Amazon Transcribe', 'Machine Learning & AI', 'Automatic Speech Recognition (ASR).', '#059669', 'Converts audio files and live speech into accurate text transcriptions.', {}),
  createService('translate', 'Amazon Translate', 'Machine Learning & AI', 'Neural machine language translation.', '#059669', 'Delivers fast, high-quality, and affordable natural language translation.', {}),
  createService('textract', 'Amazon Textract', 'Machine Learning & AI', 'Intelligent document text and table extraction.', '#059669', 'Extracts printed text, handwriting, and tables from scanned PDF documents.', {}),
  createService('kendra', 'Amazon Kendra', 'Machine Learning & AI', 'Intelligent enterprise search with natural language.', '#059669', 'ML-powered semantic search engine connecting enterprise content repositories.', {}),
  createService('lex', 'Amazon Lex', 'Machine Learning & AI', 'Conversational AI chatbot engine (Alexa tech).', '#059669', 'Builds conversational voice and text interfaces into web and mobile applications.', {}),
  createService('personalize', 'Amazon Personalize', 'Machine Learning & AI', 'Real-time personalized recommendations.', '#059669', 'Curates tailored product recommendations based on the same technology as Amazon.com.', {}),
  createService('forecast', 'Amazon Forecast', 'Machine Learning & AI', 'Time-series machine learning forecasting.', '#059669', 'Predicts future business metrics based on historical time-series data.', {}),
  createService('codewhisperer', 'Amazon CodeWhisperer', 'Machine Learning & AI', 'AI coding companion tool.', '#059669', 'Generates real-time code suggestions and security scans in modern IDEs.', {}),
  createService('amazon_q', 'Amazon Q', 'Machine Learning & AI', 'Generative AI assistant for business and developers.', '#059669', 'Answers business questions, analyzes data, and explains cloud architectures.', {}),
  createService('augmented_ai', 'Amazon Augmented AI (A2I)', 'Machine Learning & AI', 'Human-in-the-loop ML review workflows.', '#059669', 'Enables human review of machine learning predictions to ensure high accuracy.', {}),
  createService('deeplens', 'AWS DeepLens', 'Machine Learning & AI', 'Deep learning-enabled video camera.', '#059669', 'Video camera hardware for developers learning computer vision concepts.', {}),
  createService('deepracer', 'AWS DeepRacer', 'Machine Learning & AI', 'Autonomous 1/18th scale racing car for RL.', '#059669', 'Reinforcement learning autonomous vehicle and global developer racing league.', {}),
  createService('deepcomposer', 'AWS DeepComposer', 'Machine Learning & AI', 'Generative AI musical keyboard.', '#059669', 'Educational keyboard for exploring Generative Adversarial Networks (GANs).', {}),
  createService('panorama', 'AWS Panorama', 'Machine Learning & AI', 'Edge computer vision appliance.', '#059669', 'Brings computer vision to existing on-premises IP cameras at the edge.', {}),
  createService('monitron', 'Amazon Monitron', 'Machine Learning & AI', 'End-to-end industrial equipment monitoring.', '#059669', 'Predictive maintenance solution detecting abnormal vibration and temperature in equipment.', {}),
  createService('healthlake', 'AWS HealthLake', 'Machine Learning & AI', 'FHIR-compliant healthcare data lake.', '#059669', 'Stores, transforms, queries, and analyzes health data at petabyte scale.', {}),
  createService('healthomics', 'AWS HealthOmics', 'Machine Learning & AI', 'Genomics sequence analytics and storage.', '#059669', 'Stores and analyzes genomic, proteomic, and other biological data.', {}),
  createService('lookout_vision', 'Amazon Lookout for Vision', 'Machine Learning & AI', 'Visual defect inspection for manufacturing.', '#059669', 'Detects product defects and anomalies on automated factory assembly lines.', {}),

  // ==========================================
  // 10. MANAGEMENT & GOVERNANCE (24 services)
  // ==========================================
  createService('cloudwatch', 'Amazon CloudWatch', 'Management & Governance', 'Telemetry metrics, logs, and alarms monitoring.', '#E7157B', 'Collects metrics, logs, and triggers automated remediation alarms.', {}),
  createService('cloudtrail', 'AWS CloudTrail', 'Management & Governance', 'API call audit history and governance.', '#E7157B', 'Records every API request and user activity across AWS accounts for compliance audits.', {}),
  createService('cloudformation', 'AWS CloudFormation', 'Management & Governance', 'Infrastructure as Code (IaC) declarative templates.', '#E7157B', 'Provisions and models cloud infrastructure stacks consistently using code templates.', {
    // console/CLI/SDK API calls; CodePipeline/EventBridge-triggered stack operations; template bodies read from an S3-hosted TemplateURL
    inputs: ['HTTPS', 'HTTP', 'Event', 'Object access']
  }),
  createService('config', 'AWS Config', 'Management & Governance', 'Resource configuration tracking and compliance.', '#E7157B', 'Assesses, audits, and evaluates configurations of cloud resources against desired rules.', {}),
  createService('systems_manager', 'AWS Systems Manager', 'Management & Governance', 'Operations hub and node patch manager.', '#E7157B', 'Gives operational control over cloud and on-premises computing infrastructure.', {}),
  createService('organizations', 'AWS Organizations', 'Management & Governance', 'Multi-account management and governance.', '#E7157B', 'Centrally consolidates billing and enforces Service Control Policies (SCPs) across accounts.', {}),
  createService('control_tower', 'AWS Control Tower', 'Management & Governance', 'Automated multi-account landing zone.', '#E7157B', 'Sets up and governs a secure, compliant multi-account AWS environment with guardrails.', {}),
  createService('service_catalog', 'AWS Service Catalog', 'Management & Governance', 'Curated IT services catalog.', '#E7157B', 'Allows organizations to create and manage catalogs of approved AWS services for users.', {}),
  createService('license_manager', 'AWS License Manager', 'Management & Governance', 'Software license compliance tracking.', '#E7157B', 'Manages software licenses from vendors like Microsoft, SAP, Oracle, and IBM.', {}),
  createService('auto_scaling_mgmt', 'AWS Auto Scaling', 'Management & Governance', 'Unified predictive scaling engine.', '#E7157B', 'Monitors applications and automatically adjusts capacity across multiple resources.', {}),
  createService('well_architected', 'AWS Well-Architected Tool', 'Management & Governance', 'Architecture evaluation against AWS pillars.', '#E7157B', 'Reviews workloads against best practices: Security, Reliability, Performance, Cost, Sustainability.', {}),
  createService('proton', 'AWS Proton', 'Management & Governance', 'Automated microservice infrastructure deployment.', '#E7157B', 'Empowers platform teams to define standard infrastructure templates for developers.', {}),
  createService('resilience_hub', 'AWS Resilience Hub', 'Management & Governance', 'Application resilience scoring and testing.', '#E7157B', 'Defines, measures, and manages the resilience posture of your cloud applications.', {}),
  createService('compute_optimizer_mgmt', 'Compute Optimizer Engine', 'Management & Governance', 'Resource sizing recommendation engine.', '#E7157B', 'Analyzes configuration and utilization metrics to optimize costs.', {}),
  createService('opsworks', 'AWS OpsWorks', 'Management & Governance', 'Configuration management using Chef and Puppet.', '#E7157B', 'Automates how servers are configured, deployed, and managed across fleets.', {}),
  createService('resource_groups', 'AWS Resource Groups', 'Management & Governance', 'Tag-based resource organization.', '#E7157B', 'Manages and automates tasks on collections of AWS resources sharing tags.', {}),
  createService('trusted_advisor', 'AWS Trusted Advisor', 'Management & Governance', 'Real-time optimization recommendations.', '#E7157B', 'Inspects your environment to recommend cost reduction, performance, and security fixes.', {}),
  createService('health_dashboard', 'AWS Health Dashboard', 'Management & Governance', 'Service availability status and events.', '#E7157B', 'Provides alerts and remediation guidance when AWS experiences issues affecting your resources.', {}),
  createService('fault_injection_simulator', 'AWS FIS (Fault Injection Simulator)', 'Management & Governance', 'Controlled chaos engineering experimentation.', '#E7157B', 'Runs controlled chaos experiments on AWS workloads to test system resilience.', {}),
  createService('appconfig', 'AWS AppConfig', 'Management & Governance', 'Feature flags and dynamic configuration.', '#E7157B', 'Deploys application configurations safely and rapidly without rebuilding code.', {}),
  createService('distro_opentelemetry', 'AWS Distro for OpenTelemetry', 'Management & Governance', 'Open-source distributed telemetry collection.', '#E7157B', 'Collects distributed traces and metrics for CloudWatch and partner monitoring tools.', {}),
  createService('managed_grafana', 'Amazon Managed Grafana', 'Management & Governance', 'Interactive telemetry dashboards.', '#E7157B', 'Visualizes metrics, logs, and traces from multiple data sources securely.', {}),
  createService('managed_prometheus', 'Amazon Managed Service for Prometheus', 'Management & Governance', 'Scalable Prometheus metrics monitoring.', '#E7157B', 'Monitors containerized workloads with open-source Prometheus queries and alerting.', {}),
  createService('cloudwatch_synthetics', 'CloudWatch Synthetics', 'Management & Governance', 'Canary API and UI endpoint monitoring.', '#E7157B', 'Runs synthetic canaries 24/7 to verify that customer-facing URLs and APIs respond correctly.', {}),

  // ==========================================
  // 11. DEVELOPER TOOLS (16 services)
  // ==========================================
  createService('codecommit', 'AWS CodeCommit', 'Developer Tools', 'Secure private Git code repository.', '#2563EB', 'Hosts private Git repositories with fine-grained IAM branch permissions.', {}),
  createService('codebuild', 'AWS CodeBuild', 'Developer Tools', 'Fully managed continuous integration build service.', '#2563EB', 'Compiles source code, runs unit tests, and produces deployable software packages.', {}),
  createService('codedeploy', 'AWS CodeDeploy', 'Developer Tools', 'Automated software deployment coordinator.', '#2563EB', 'Automates zero-downtime rolling, blue/green, and canary code deployments.', {}),
  createService('codepipeline', 'AWS CodePipeline', 'Developer Tools', 'Continuous delivery and release automation.', '#2563EB', 'Automates build, test, and deployment phases of your release process.', {}),
  createService('codeartifact', 'AWS CodeArtifact', 'Developer Tools', 'Secure software package management.', '#2563EB', 'Stores, publishes, and shares npm, Maven, PyPI, and NuGet software packages.', {}),
  createService('codecatalyst', 'Amazon CodeCatalyst', 'Developer Tools', 'Unified cloud development environment.', '#2563EB', 'Integrated software development service for planning, coding, building, and deploying.', {}),
  createService('cloud9', 'AWS Cloud9', 'Developer Tools', 'Cloud browser-based Integrated Development Environment.', '#2563EB', 'Write, run, and debug code directly inside a web browser terminal.', {}),
  createService('xray', 'AWS X-Ray', 'Developer Tools', 'Distributed request tracing and service maps.', '#2563EB', 'Traces user requests end-to-end through microservices to pinpoint latency bottlenecks.', {}),
  createService('cloudshell', 'AWS CloudShell', 'Developer Tools', 'Browser-based pre-authenticated shell.', '#2563EB', 'Run AWS CLI commands and bash scripts directly from the browser with no installation.', {}),
  createService('app_composer', 'AWS Application Composer', 'Developer Tools', 'Visual serverless drag-and-drop builder.', '#2563EB', 'Visually design and build serverless architectures and auto-generates CloudFormation/SAM.', {}),
  createService('corretto', 'Amazon Corretto', 'Developer Tools', 'Multiplatform production-ready OpenJDK.', '#2563EB', 'No-cost, multiplatform, production-ready distribution of the Open Java Development Kit.', {}),
  createService('codeguru_reviewer', 'Amazon CodeGuru Reviewer', 'Developer Tools', 'Automated ML code review and security audits.', '#2563EB', 'Scans pull requests to identify critical defects, memory leaks, and security flaws.', {}),
  createService('codeguru_profiler', 'Amazon CodeGuru Profiler', 'Developer Tools', 'Production runtime CPU optimization.', '#2563EB', 'Finds an application’s most expensive lines of code and provides optimization recommendations.', {}),
  createService('device_farm_dev', 'AWS Device Farm Dev Testing', 'Developer Tools', 'Real physical device testing cloud.', '#2563EB', 'Test Android, iOS, and web apps against an extensive range of physical mobile devices.', {}),
  createService('aws_cli', 'AWS Command Line Interface (CLI)', 'Developer Tools', 'Unified command line management tool.', '#2563EB', 'Control multiple AWS services from the command line and automate through scripts.', {}),
  createService('sam_cli', 'AWS Serverless Application Model (SAM)', 'Developer Tools', 'Serverless application framework.', '#2563EB', 'Open-source framework for building serverless applications on AWS.', {}),

  // ==========================================
  // 12. CONTAINERS (12 services)
  // ==========================================
  createService('ecr_registry', 'Amazon ECR Public & Private', 'Containers', 'High-performance container registry.', '#ED7100', 'Stores and distributes Docker images with encryption, vulnerability scanning, and replication.', {}),
  createService('ecs_container', 'Amazon Elastic Container Service', 'Containers', 'Scalable container management.', '#ED7100', 'Deploys containerized applications with deep integration to the AWS ecosystem.', {}),
  createService('eks_container', 'Amazon Elastic Kubernetes Service', 'Containers', 'Certified Kubernetes container platform.', '#ED7100', 'Runs Kubernetes control planes across three availability zones with automated updates.', {}),
  createService('fargate_container', 'AWS Fargate Serverless Containers', 'Containers', 'Serverless container task execution.', '#ED7100', 'Allocates the right amount of compute eliminating the need to choose and manage instances.', {}),
  createService('app_runner_container', 'AWS App Runner Containers', 'Containers', 'Direct container web application deployment.', '#ED7100', 'Deploys web apps from container images with automatic load balancing and SSL.', {}),
  createService('rosa', 'Red Hat OpenShift on AWS (ROSA)', 'Containers', 'Managed Red Hat OpenShift clusters.', '#ED7100', 'Jointly managed OpenShift service backed by Red Hat and AWS engineers.', {}),
  createService('bottlerocket_os', 'Bottlerocket Container Host', 'Containers', 'Security-hardened container OS.', '#ED7100', 'Operating system with transactional updates built specifically to run containers safely.', {}),
  createService('copilot_tool', 'AWS Copilot CLI', 'Containers', 'Containerized release automation CLI.', '#ED7100', 'Quickly launch containerized applications on ECS and Fargate.', {}),
  createService('app2container_tool', 'App2Container Migration Tool', 'Containers', 'Legacy app containerization utility.', '#ED7100', 'Discovers and containerizes legacy applications into ECS and EKS manifests.', {}),
  createService('finch', 'Finch Open Source Client', 'Containers', 'Open-source container development tool.', '#ED7100', 'Builds, runs, and publishes container images locally without commercial license fees.', {}),
  createService('ecs_anywhere_ctr', 'ECS Anywhere Node Manager', 'Containers', 'Hybrid on-premises container agent.', '#ED7100', 'Standardizes container workflows across on-premises servers and AWS cloud.', {}),
  createService('eks_anywhere_ctr', 'EKS Anywhere On-Premises', 'Containers', 'On-premises Kubernetes software.', '#ED7100', 'Create and operate Kubernetes clusters on customer-managed on-premises hardware.', {}),

  // ==========================================
  // 13. FRONTEND WEB & MOBILE (10 services)
  // ==========================================
  createService('amplify', 'AWS Amplify', 'Frontend Web & Mobile', 'Full-stack web and mobile application framework.', '#D97706', 'Builds, ships, and hosts modern React, Vue, iOS, and Android applications.', {}),
  createService('amplify_studio', 'AWS Amplify Studio', 'Frontend Web & Mobile', 'Visual Figma-to-code application builder.', '#D97706', 'Visually build full-stack web and mobile apps with backend data bindings.', {}),
  createService('appsync_mobile', 'AppSync GraphQL API', 'Frontend Web & Mobile', 'Real-time offline data sync.', '#D97706', 'Synchronizes data across mobile devices with offline storage and conflict resolution.', {}),
  createService('device_farm', 'AWS Device Farm', 'Frontend Web & Mobile', 'Testing on real Android and iOS phones.', '#D97706', 'Run automated test suites concurrently across hundreds of real mobile devices.', {}),
  createService('location_service', 'Amazon Location Service', 'Frontend Web & Mobile', 'Geospatial maps, points of interest, and tracking.', '#D97706', 'Securely adds location data, maps, geocoding, and asset tracking to applications.', {}),
  createService('pinpoint', 'Amazon Pinpoint', 'Frontend Web & Mobile', 'User engagement and customer messaging.', '#D97706', 'Sends targeted push notifications, emails, and SMS campaigns based on user behavior.', {}),
  createService('chime_sdk', 'Amazon Chime SDK', 'Frontend Web & Mobile', 'Real-time audio, video, and screen sharing.', '#D97706', 'Embeds real-time voice, video, and screen sharing into custom web applications.', {}),
  createService('cognito_mobile', 'Cognito User Pools Mobile', 'Frontend Web & Mobile', 'Mobile auth and social login.', '#D97706', 'Adds sign-in with Apple, Google, and Amazon to native mobile apps.', {}),
  createService('serverless_api_web', 'Serverless Web API', 'Frontend Web & Mobile', 'API Gateway + Lambda mobile backend.', '#D97706', 'Powers mobile applications with auto-scaling serverless backend endpoints.', {}),
  createService('mobile_analytics', 'Pinpoint Mobile Analytics', 'Frontend Web & Mobile', 'User retention and churn analytics.', '#D97706', 'Tracks active user sessions, feature adoption, and app monetization.', {}),

  // ==========================================
  // 14. MIGRATION & TRANSFER (14 services)
  // ==========================================
  createService('dms_migration', 'AWS Database Migration Service (DMS)', 'Migration & Transfer', 'Live ongoing database replication.', '#0891B2', 'Migrates commercial and open-source databases to AWS with zero downtime.', {}),
  createService('datasync_migration', 'AWS DataSync', 'Migration & Transfer', 'Accelerated online file and object transfer.', '#0891B2', 'Transfers petabytes of data up to 10x faster than open-source tools between on-prem and AWS.', {}),
  createService('transfer_family', 'AWS Transfer Family', 'Migration & Transfer', 'Managed SFTP, FTPS, and FTP endpoints.', '#0891B2', 'Scalable SFTP/FTPS service backed directly by Amazon S3 and Amazon EFS storage.', {}),
  createService('mgn_migration', 'AWS Application Migration Service (MGN)', 'Migration & Transfer', 'Lift-and-shift server block replication.', '#0891B2', 'Minimizes downtime by replicating source servers continuously into AWS.', {}),
  createService('snowball_migration', 'Snowball Edge Migration', 'Migration & Transfer', 'Physical data migration appliance.', '#0891B2', 'Moves massive datasets where internet connection speeds are insufficient.', {}),
  createService('migration_hub', 'AWS Migration Hub', 'Migration & Transfer', 'Single tracking dashboard for cloud migrations.', '#0891B2', 'Tracks the progress of application migrations across multiple AWS and partner tools.', {}),
  createService('application_discovery', 'AWS Application Discovery Service', 'Migration & Transfer', 'On-premises server configuration discovery.', '#0891B2', 'Gathers server inventory and behavior data to plan migration projects.', {}),
  createService('server_migration_service', 'AWS Server Migration Service', 'Migration & Transfer', 'Automated virtual machine live migration.', '#0891B2', 'Coordinates live migration of on-premises VMware and Hyper-V virtual machines.', {}),
  createService('mainframe_modernization', 'AWS Mainframe Modernization', 'Migration & Transfer', 'Legacy mainframe migration and refactoring.', '#0891B2', 'Migrate, modernize, and run mainframe workloads on modern AWS infrastructure.', {}),
  createService('schema_conversion_tool', 'AWS Schema Conversion Tool (SCT)', 'Migration & Transfer', 'Heterogeneous database schema converter.', '#0891B2', 'Converts legacy Oracle and SQL Server schemas into open-source PostgreSQL/MySQL.', {}),
  createService('transfer_sftp', 'Transfer Family SFTP', 'Migration & Transfer', 'Secure File Transfer Protocol server.', '#0891B2', 'Exposes secure SFTP endpoints connecting partner vendors to S3 storage.', {}),
  createService('transfer_ftps', 'Transfer Family FTPS', 'Migration & Transfer', 'File Transfer Protocol over SSL.', '#0891B2', 'Secure legacy financial file exchange integration with Amazon S3.', {}),
  createService('migration_evaluator', 'Migration Evaluator', 'Migration & Transfer', 'TCO business case for cloud migration.', '#0891B2', 'Builds business cases and total cost of ownership models for cloud migration.', {}),
  createService('cloudadopt', 'AWS Cloud Adoption Framework', 'Migration & Transfer', 'Methodological cloud transformation framework.', '#0891B2', 'Provides structured roadmaps for organizational cloud readiness and migration.', {}),

  // ==========================================
  // 15. MEDIA SERVICES (12 services)
  // ==========================================
  createService('mediaconvert', 'AWS Elemental MediaConvert', 'Media Services', 'Broadcast-grade file-based video transcoding.', '#B91C1C', 'Converts video libraries into adaptive streaming formats (HLS, DASH) for any device.', {}),
  createService('medialive', 'AWS Elemental MediaLive', 'Media Services', 'Broadcast-grade live video encoding.', '#B91C1C', 'Encodes live video streams in real time for broadcast television and internet streaming.', {}),
  createService('mediapackage', 'AWS Elemental MediaPackage', 'Media Services', 'Live and VOD stream packaging and DRM.', '#B91C1C', 'Prepares and protects video streams with digital rights management (DRM) encryption.', {}),
  createService('mediastore', 'AWS Elemental MediaStore', 'Media Services', 'Low-latency media-optimized storage.', '#B91C1C', 'High-performance storage optimized for media delivering consistent read-after-write.', {}),
  createService('mediatailor', 'AWS Elemental MediaTailor', 'Media Services', 'Server-side video ad insertion.', '#B91C1C', 'Inserts targeted advertising into video streams without sacrificing broadcast quality.', {}),
  createService('ivs', 'Amazon Interactive Video Service (IVS)', 'Media Services', 'Low-latency live interactive video streaming.', '#B91C1C', 'Managed live streaming service (Twitch tech) for building interactive video apps.', {}),
  createService('elastic_transcoder', 'Amazon Elastic Transcoder', 'Media Services', 'Simple media transcoding in the cloud.', '#B91C1C', 'Cost-effective media file converter for web and mobile formats.', {}),
  createService('kinesis_video_media', 'Kinesis Video Consumer', 'Media Services', 'Live video analytics ingest.', '#B91C1C', 'Ingests live video feeds for processing with computer vision machine learning models.', {}),
  createService('elemental_appliances', 'Elemental On-Premises Appliances', 'Media Services', 'Hardware video processing for venues.', '#B91C1C', 'Hardware appliances for live video production in stadiums, arenas, and studios.', {}),
  createService('nimble_studio', 'Amazon Nimble Studio', 'Media Services', 'Creative studio production in the cloud.', '#B91C1C', 'Empowers creative studios to produce visual effects and animations on virtual workstations.', {}),
  createService('mediaconnect', 'AWS Elemental MediaConnect', 'Media Services', 'Reliable live video transport.', '#B91C1C', 'High-quality live video transport over IP with broadcast-grade reliability.', {}),
  createService('ground_station_media', 'Satellite Media Ingest', 'Media Services', 'Downlink video stream processing.', '#B91C1C', 'Processes live broadcast satellite telemetry and video streams.', {}),

  // ==========================================
  // 16. BUSINESS APPLICATIONS (14 services)
  // ==========================================
  createService('connect', 'Amazon Connect', 'Business Applications', 'Cloud-based omnichannel contact center.', '#0284C7', 'Provides customer service contact center with voice, chat, and AI routing in minutes.', {}),
  createService('ses', 'Amazon SES (Simple Email Service)', 'Business Applications', 'High-volume email sending and receiving.', '#0284C7', 'Reliable, cost-effective transactional and marketing email delivery service.', {}),
  createService('workmail', 'Amazon WorkMail', 'Business Applications', 'Secure corporate email and calendar.', '#0284C7', 'Business email and calendar service with support for existing desktop clients.', {}),
  createService('chime', 'Amazon Chime', 'Business Applications', 'Online meetings, chat, and business calling.', '#0284C7', 'Communications service that lets you meet, chat, and place business calls.', {}),
  createService('wickr', 'AWS Wickr', 'Business Applications', 'End-to-end encrypted enterprise messaging.', '#0284C7', 'Military-grade end-to-end encrypted messaging, voice, video, and file sharing.', {}),
  createService('supply_chain', 'AWS Supply Chain', 'Business Applications', 'ML-powered supply chain visibility.', '#0284C7', 'Mitigates supply chain risks and optimizes inventory across manufacturing networks.', {}),
  createService('appfabric', 'AWS AppFabric', 'Business Applications', 'SaaS security and audit integration.', '#0284C7', 'Connects multiple SaaS applications together to improve security and productivity.', {}),
  createService('honeycode', 'Amazon Honeycode', 'Business Applications', 'No-code mobile and web app builder.', '#0284C7', 'Build custom team productivity apps without writing programming code.', {}),
  createService('pinpoint_email', 'Pinpoint Marketing Campaigns', 'Business Applications', 'Targeted marketing communication.', '#0284C7', 'Engage customers across multiple channels with personalized messaging.', {}),
  createService('voice_id', 'Amazon Connect Voice ID', 'Business Applications', 'Real-time caller voice biometric authentication.', '#0284C7', 'Authenticates callers in real time using machine learning voice biometrics.', {}),
  createService('contact_lens', 'Contact Lens for Amazon Connect', 'Business Applications', 'Conversational analytics and sentiment analysis.', '#0284C7', 'Transcribes customer calls and flags sentiment issues during live support calls.', {}),
  createService('wisdom', 'Amazon Connect Wisdom', 'Business Applications', 'Agent real-time knowledge assistant.', '#0284C7', 'Delivers real-time customer service solutions directly to contact center agents.', {}),
  createService('customer_profiles', 'Amazon Connect Customer Profiles', 'Business Applications', 'Unified customer record aggregator.', '#0284C7', 'Consolidates customer history across disparate databases into a single view.', {}),
  createService('connect_cases', 'Amazon Connect Cases', 'Business Applications', 'Customer service case management.', '#0284C7', 'Tracks and manages customer support issues from initiation to resolution.', {}),

  // ==========================================
  // 17. END USER COMPUTING (10 services)
  // ==========================================
  createService('workspaces', 'Amazon WorkSpaces', 'End User Computing', 'Secure managed virtual desktop service (VDI).', '#7C3AED', 'Delivers cloud desktop environments to employees on any computer or tablet.', {}),
  createService('appstream', 'Amazon AppStream 2.0', 'End User Computing', 'Instant application streaming to any browser.', '#7C3AED', 'Streams desktop applications securely to web browsers without downloading software.', {}),
  createService('workspaces_web', 'Amazon WorkSpaces Web', 'End User Computing', 'Secure low-cost cloud web browser.', '#7C3AED', 'Facilitates secure employee access to internal websites without corporate VPNs.', {}),
  createService('workdocs', 'Amazon WorkDocs', 'End User Computing', 'Enterprise file storage and document sharing.', '#7C3AED', 'Secure enterprise content creation, storage, and collaboration.', {}),
  createService('worklink', 'Amazon WorkLink', 'End User Computing', 'Secure mobile browser access to internal sites.', '#7C3AED', 'Allows mobile workers to access internal web apps without storing content locally.', {}),
  createService('workspaces_core', 'Amazon WorkSpaces Core', 'End User Computing', 'VDI infrastructure for third-party brokers.', '#7C3AED', 'Provides cloud desktop infrastructure for platforms like VMware Horizon.', {}),
  createService('workspaces_thin_client', 'Amazon WorkSpaces Thin Client', 'End User Computing', 'Low-cost physical thin client desktop device.', '#7C3AED', 'Cost-effective hardware device designed to connect employees to cloud desktops.', {}),
  createService('virtual_desktop', 'Virtual Desktop Pool', 'End User Computing', 'Elastic virtual desktop capacity.', '#7C3AED', 'Maintains desktop pools scaling automatically with working hours.', {}),
  createService('remote_desktop', 'Remote Desktop Gateway', 'End User Computing', 'Encrypted RDP ingress gateway.', '#7C3AED', 'Secures remote desktop connections over standard HTTPS ports.', {}),
  createService('secure_browser', 'Secure Web Browser Instance', 'End User Computing', 'Sandboxed isolated web session.', '#7C3AED', 'Isolates web browsing sessions to prevent corporate malware infections.', {}),

  // ==========================================
  // 18. INTERNET OF THINGS (IoT) (16 services)
  // ==========================================
  createService('iot_core', 'AWS IoT Core', 'Internet of Things (IoT)', 'Secure device connectivity and message broker.', '#65A30D', 'Connects billions of IoT devices to AWS without managing infrastructure.', {}),
  createService('iot_greengrass', 'AWS IoT Greengrass', 'Internet of Things (IoT)', 'Edge runtime and local compute for devices.', '#65A30D', 'Builds, deploys, and manages edge device software and machine learning inference.', {}),
  createService('iot_analytics', 'AWS IoT Analytics', 'Internet of Things (IoT)', 'Analytics on massive IoT device telemetry.', '#65A30D', 'Cleans, processes, and analyzes high-volume device telemetry datasets.', {}),
  createService('iot_sitewise', 'AWS IoT SiteWise', 'Internet of Things (IoT)', 'Industrial equipment telemetry collection.', '#65A30D', 'Collects, stores, organizes, and visualizes industrial equipment sensor metrics.', {}),
  createService('iot_device_defender', 'AWS IoT Device Defender', 'Internet of Things (IoT)', 'IoT device security auditing and alerting.', '#65A30D', 'Audits IoT configurations and identifies security anomalies on connected fleets.', {}),
  createService('iot_device_management', 'AWS IoT Device Management', 'Internet of Things (IoT)', 'Fleet-wide IoT device tracking and updates.', '#65A30D', 'Securely onboards, organizes, monitors, and remotely manages IoT device fleets.', {}),
  createService('iot_events', 'AWS IoT Events', 'Internet of Things (IoT)', 'Event detector for equipment state changes.', '#65A30D', 'Monitors thousands of device sensors to detect equipment failure states.', {}),
  createService('iot_things_graph', 'AWS IoT Things Graph', 'Internet of Things (IoT)', 'Visual IoT application connection builder.', '#65A30D', 'Visually connects diverse devices and web services to build IoT applications.', {}),
  createService('iot_expresslink', 'AWS IoT ExpressLink', 'Internet of Things (IoT)', 'Connectivity modules for hardware manufacturers.', '#65A30D', 'Hardware modules that accelerate developing secure cloud-connected devices.', {}),
  createService('iot_roborunner', 'AWS IoT RoboRunner', 'Internet of Things (IoT)', 'Autonomous mobile robot fleet coordination.', '#65A30D', 'Builds applications that help robot fleets work together seamlessly.', {}),
  createService('iot_1click', 'AWS IoT 1-Click', 'Internet of Things (IoT)', 'Simple hardware button trigger.', '#65A30D', 'Triggers AWS Lambda functions with the click of a physical button.', {}),
  createService('iot_fleetwise', 'AWS IoT FleetWise', 'Internet of Things (IoT)', 'Automotive vehicle telemetry collection.', '#65A30D', 'Collects, transforms, and transfers vehicle data to the cloud in real time.', {}),
  createService('iot_button', 'AWS IoT Enterprise Button', 'Internet of Things (IoT)', 'Programmable Wi-Fi button device.', '#65A30D', 'Hardware button configured to trigger automated cloud operational tasks.', {}),
  createService('iot_twinmaker', 'AWS IoT TwinMaker', 'Internet of Things (IoT)', 'Digital twins of industrial physical systems.', '#65A30D', 'Builds operational digital twins of physical systems and factory floors.', {}),
  createService('iot_device_tester', 'AWS IoT Device Tester', 'Internet of Things (IoT)', 'Hardware qualification test suite.', '#65A30D', 'Tests microcontrollers and IoT devices for compatibility with AWS IoT.', {}),
  createService('iot_lorawan', 'AWS IoT Core for LoRaWAN', 'Internet of Things (IoT)', 'Long-range wireless IoT network connector.', '#65A30D', 'Connects wireless devices using the low-power Long Range WAN protocol.', {}),

  // ==========================================
  // 19. CLOUD FINANCIAL MANAGEMENT (10 services)
  // ==========================================
  createService('cost_explorer', 'AWS Cost Explorer', 'Cloud Financial Management', 'Cost and usage visualization and forecasting.', '#15803D', 'Visualize, understand, and manage your AWS costs and usage over time.', {}),
  createService('budgets', 'AWS Budgets', 'Cloud Financial Management', 'Custom cost and usage threshold alerts.', '#15803D', 'Sets custom spending limits and alerts teams when costs exceed thresholds.', {}),
  createService('cost_and_usage_report', 'AWS Cost & Usage Report (CUR)', 'Cloud Financial Management', 'Comprehensive raw billing line item data.', '#15803D', 'Delivers detailed hourly or daily billing records into an Amazon S3 bucket.', {}),
  createService('savings_plans', 'AWS Savings Plans', 'Cloud Financial Management', 'Flexible discount commitment pricing.', '#15803D', 'Save up to 72% on compute usage in exchange for a committed hourly spend.', {}),
  createService('pricing_calculator', 'AWS Pricing Calculator', 'Cloud Financial Management', 'Pre-deployment cloud architecture cost estimator.', '#15803D', 'Estimates the monthly expenditure of proposed AWS architecture topologies.', {}),
  createService('billing_conductor', 'AWS Billing Conductor', 'Cloud Financial Management', 'Custom billing and chargeback engine.', '#15803D', 'Customizes billing and allocates costs for business units and end customers.', {}),
  createService('cost_categories', 'AWS Cost Categories', 'Cloud Financial Management', 'Cost grouping and organizational mapping.', '#15803D', 'Groups cost and usage information into meaningful business structures.', {}),
  createService('cost_anomaly_detection', 'AWS Cost Anomaly Detection', 'Cloud Financial Management', 'Machine learning unexpected spend alerts.', '#15803D', 'Uses machine learning to identify anomalous spending and root causes.', {}),
  createService('migration_evaluator_cost', 'Migration Cost Evaluator', 'Cloud Financial Management', 'Business case financial modeler.', '#15803D', 'Builds financial business cases and TCO comparison reports for leadership.', {}),
  createService('aws_marketplace', 'AWS Marketplace', 'Cloud Financial Management', 'Digital software catalog and consolidated billing.', '#15803D', 'Discover, buy, and deploy third-party software billed directly on your AWS invoice.', {}),

  // ==========================================
  // 20. BLOCKCHAIN & QUANTUM (6 services)
  // ==========================================
  createService('managed_blockchain', 'Amazon Managed Blockchain', 'Blockchain & Quantum', 'Fully managed scalable blockchain networks.', '#4338CA', 'Builds and manages scalable blockchain networks using Hyperledger Fabric and Ethereum.', {}),
  createService('braket', 'Amazon Braket', 'Blockchain & Quantum', 'Quantum computing exploration environment.', '#4338CA', 'Experiment with quantum computing algorithms on diverse quantum hardware technologies.', {}),
  createService('qldb_ledger', 'Amazon QLDB Ledger', 'Blockchain & Quantum', 'Cryptographic immutable ledger.', '#4338CA', 'Maintains an immutable, cryptographically verifiable transaction history.', {}),
  createService('managed_blockchain_query', 'Managed Blockchain Query', 'Blockchain & Quantum', 'Serverless web3 blockchain data queries.', '#4338CA', 'Access standardized public blockchain data without running dedicated nodes.', {}),
  createService('quantum_simulator', 'Amazon Braket Simulators', 'Blockchain & Quantum', 'High-performance quantum circuit simulation.', '#4338CA', 'Simulates quantum algorithms on classical AWS cloud instances before running on QPUs.', {}),
  createService('web3_rpc', 'AWS Web3 RPC Endpoints', 'Blockchain & Quantum', 'Public blockchain RPC nodes.', '#4338CA', 'Connects decentralized dApps directly to public Ethereum and Bitcoin mainnets.', {}),

  // ==========================================
  // 21. ROBOTICS & SATELLITE (6 services)
  // ==========================================
  createService('robomaker', 'AWS RoboMaker', 'Robotics & Satellite', 'Cloud robotics simulation and deployment.', '#0F766E', 'Simulates and deploys ROS (Robot Operating System) robotic applications at scale.', {}),
  createService('ground_station', 'AWS Ground Station', 'Robotics & Satellite', 'Fully managed satellite ground station network.', '#0F766E', 'Controls satellite communications and ingests data downlinks directly into AWS.', {}),
  createService('simspace_weaver_sim', 'SimSpace Weaver Spatial Engine', 'Robotics & Satellite', 'City-scale spatial simulation.', '#0F766E', 'Simulates real-world cities, traffic networks, and logistics centers across clusters.', {}),
  createService('robomaker_sim', 'RoboMaker Simulation WorldForge', 'Robotics & Satellite', 'Automated 3D robotics simulation worlds.', '#0F766E', 'Generates randomized 3D indoor environments for autonomous robot testing.', {}),
  createService('satellite_antenna', 'Ground Station Antenna', 'Robotics & Satellite', 'Global antenna arrays for satellite tracking.', '#0F766E', 'Direct downlink hardware antenna array communicating with low Earth orbit satellites.', {}),
  createService('orbital_telemetry', 'Orbital Telemetry Stream', 'Robotics & Satellite', 'Satellite flight data ingest.', '#0F766E', 'Captures spacecraft telemetry metrics and orbital telemetry data in real time.', {})
];

export const SERVICE_MAP: Record<string, AWSService> = AWS_SERVICES.reduce(
  (acc, service) => {
    acc[service.id] = service;
    return acc;
  },
  {} as Record<string, AWSService>
);
