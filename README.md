# Cloud Architecture Lab

> Cloud Architecture Lab is an independent, open-source educational project. It is not affiliated with, endorsed by, or sponsored by Amazon Web Services, Inc. or Amazon.com, Inc. Amazon Web Services, AWS, and related service names and icons are trademarks of Amazon.com, Inc. or its affiliates, used here for identification and educational purposes only. Simulated behavior is an approximation and is not official AWS documentation.

An interactive, in-browser architecture simulator for learning AWS concepts: cloud resilience, networking, and system design. Drag AWS services onto a canvas, wire them together, and run request simulations that model documented AWS behavior — not just a static diagram tool.

Built with React, TypeScript, [@xyflow/react](https://reactflow.dev/), and Tailwind CSS.

New to the app? See [USER_MANUAL.md](USER_MANUAL.md) for how to build, connect, simulate, and break architectures.

## What it does

- **Design** architectures on a canvas using real AWS service icons, VPCs, subnets, and security boundaries.
- **Simulate** requests end-to-end — the engine models ALB health-check failover, Multi-AZ database failover, Auto Scaling, NAT/Internet Gateway routing, CloudFront caching, WAF filtering, SQS decoupling, and more.
- **Enforce real AWS rules**, not just draw boxes:
  - A resource dropped outside every subnet boundary is geometrically invalid and the simulation fails, exactly as AWS would refuse it.
  - A VPC's CIDR block is automatically carved into non-overlapping subnet ranges as you add Public/Private subnets, refusing splits that would violate AWS's `/28` minimum subnet size.
  - Security Groups (stateful, instance-level, allow-list) and Network ACLs (stateless, subnet-level, deny-list) are independently configurable and evaluated in the real order a packet crosses them.
- **Break things on purpose**: fail an EC2 instance, take down an Availability Zone, remove a NAT Gateway — and watch the simulation explain exactly what happens and why.
- **Reference architectures**: a library of pre-built, verified diagrams (3-tier VPC, serverless containers with Cognito/API Gateway/Cloud Map, event-driven SQS decoupling, EC2 Auto Scaling failure recovery, NACL vs Security Group, and more) that all pass their own automated tests.
- **Interactive tools**: student challenges with automated rubric scoring, PNG export, and a Markdown/JSON architecture report export.

## Getting started

```bash
npm install
npm run dev       # start the dev server
npm test          # run the engine test suite
npm run build      # type-check + production build
```

### Running with Docker

This is a static single-page app with no backend, so it's served with nginx rather than a
Node.js server at runtime - a multi-stage build compiles it once, then discards the whole
Node/npm toolchain, leaving a small (~80MB) image with nothing to patch for Node/npm CVEs.

```bash
docker compose up --build   # then open http://localhost:8080
```

or without Compose:

```bash
docker build -t cloud-architecture-lab .
docker run -p 8080:80 cloud-architecture-lab
```

## Project structure

```text
src/
  engine/
    simulation/     request traversal engine, network firewall (NACL/SG) checks
    analysis/        SPOF detection, bottleneck detection, multidimensional scoring
    layout/          geometric containment (subnet/VPC placement), CIDR allocation
  data/              AWS service catalog, reference architecture templates, student challenges
  context/           React state (canvas nodes/edges, simulation, analysis)
  components/        canvas, inspector panel, palette, modals
test/
  engine.test.ts     engine + reference-architecture test suite (run with `npm test`)
```

The engine (`src/engine/`) is plain TypeScript with no React dependency, so its behavior is fully covered by `test/engine.test.ts` independent of the UI.

## Contributing

Contributions are welcome — this project is used as a teaching tool, so student contributions are especially encouraged. See [CONTRIBUTING.md](CONTRIBUTING.md) for the fork-and-PR workflow and what makes a good pull request.

## License

MIT — see [LICENSE](LICENSE).

### Trademarks

Cloud Architecture Lab is an independent, open-source educational project. It is not affiliated with, endorsed by, or sponsored by Amazon Web Services, Inc. or Amazon.com, Inc. Amazon Web Services, AWS, and related service names and icons are trademarks of Amazon.com, Inc. or its affiliates, used here for identification and educational purposes only. Simulated behavior is an approximation and is not official AWS documentation.

The AWS service and resource icons under `src/components/serviceIcon/`, and the VPC/subnet group glyphs in `src/components/icons/AwsGroupIcons.tsx`, are AWS's own [Architecture Icons](https://aws.amazon.com/architecture/icons/), used here under AWS's asset-package terms for building architecture diagrams. They are not covered by this project's MIT license and remain AWS's assets.

### Landing-page contributor credits

The home page loads all pages of GitHub's public contributor list for
`norbutlepcha25/cloud-architecture-lab` whenever the page opens. No token or server
is required. GitHub caches contributor data, so newly attributed commits may take
time to appear; comments and unmerged pull requests do not automatically become
commit credits. See [GitHub's contributor endpoint](https://docs.github.com/en/rest/repos/repos#list-repository-contributors).

Accounts identified as bots, known AI-agent logins, and explicit `-bot`/`-agent`
account suffixes are filtered. GitHub cannot reliably identify every AI account;
add confirmed agent usernames to `excludedContributorLogins` in
`src/utils/contributors.ts`. Human accounts remain eligible even when they use AI
assistance. If the API is offline, rate-limited, invalid, or exceeds the ten-second
refresh timeout, the page retains the curated fallback credits. A successful empty
response displays no contributor cards. Contributor cards render directly on the home page; no contribution-history
link is shown.

### Usage analytics

Optional Umami integration tracks visits, geographic breakdowns and lab activity,
including active time. Set the public `VITE_UMAMI_*` build settings from
[.env.example](.env.example); tracking is off until configured. See
[analytics setup and metrics](docs/analytics.md) for activation, dashboard reports,
Docker/CI configuration and privacy controls.
