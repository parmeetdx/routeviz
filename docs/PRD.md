# Routeviz PRD

## Summary

Routeviz is an open-source, self-hosted dashboard for homelab and self-hosted operators who expose services through reverse proxies, tunnels, and Docker-published ports.

The v1 product is intentionally narrow:

- One self-hosted app
- First connector set: Nginx Proxy Manager API, Docker, DNS, and TLS checks
- One current-state view of exposure chains
- Findings that surface risky or broken public routes

The product goal is not to be a generic inventory tool. It must help users catch something they would otherwise miss in the chain from public entrypoint to runtime target.
The product model should stay generic even though the first connector is Nginx Proxy Manager.

## Why Now

There is a real gap between existing tools:

- Homepage and Homarr are primarily launchers
- Network visualization tools do not explain public exposure chains
- Enterprise application dependency tools do not understand Nginx Proxy Manager or homelab Docker stacks

The opportunity is to ship a focused operational map before the category gets crowded. The risk is that the product is merely interesting instead of useful. V1 therefore has to optimize for actionable findings, not breadth.

## Product Thesis

Self-hosters do not mainly need more dashboards. They need one trustworthy answer to:

`entrypoint -> edge system -> upstream target -> live workload -> current risk`

If Routeviz can make that chain obvious and can flag mismatches, dead targets, DNS issues, or impending TLS problems, it earns repeat usage. If it only restates information the operator already knows, it will be discarded.

## Target User

Primary user:

- Solo self-hoster or homelab operator
- Runs multiple Dockerized services
- Uses a reverse proxy, tunnel, or direct port exposure for at least some public routes
- Wants better operational visibility without adopting enterprise tooling

Secondary user:

- Indie founder or operator running internal tools on a small VPS or home-server setup

Initial adopter segment:

- Nginx Proxy Manager users, because the first edge connector ships there

## Product Principles

- Self-hosted first
- Open source first
- Read-only by default
- Findings over dashboards
- Current-state truth over historical analytics
- Low-install-friction over architectural purity
- Connector-specific ingestion, connector-agnostic core model

## Goals For V1

- Show the current exposure chain for every public endpoint discovered by the supported connector set
- Match edge-system upstream targets to live Docker containers or services where possible
- Check DNS resolution for exposed domains when DNS is part of the exposure path
- Check TLS certificate expiry for exposed domains or hostnames when applicable
- Surface findings that indicate broken, drifting, or risky exposure
- Ship as a single self-hosted app with minimal configuration
- Keep the core schema and UI language broad enough to support additional edge connectors later
- Protect the dashboard with simple built-in authentication

## Non-Goals For V1

- SaaS product or hosted control plane
- Paid tier or cloud infrastructure
- Multi-node fleet management
- Write access into NPM, Docker, or DNS providers
- Reverse proxy editing or container management
- Long-term history, drift timelines, or change analytics
- Team collaboration, RBAC, or enterprise governance

## V1 Scope

### In Scope

- Open-source self-hosted web app
- Single-container deployment
- First edge connector: Nginx Proxy Manager via authenticated API
- Docker discovery via mounted Docker socket
- DNS resolution lookups for exposed domains
- TLS expiry checks
- Latest-snapshot-only persistence
- Single-user built-in authentication
- Findings and exposure-chain views

### Out Of Scope

- Shipping Traefik, Caddy, SWAG/nginx config, tunnel, or Kubernetes connectors in v1
- Direct database readers for Nginx Proxy Manager internals in v1
- Backup orchestration
- Uptime monitoring replacement
- Alerting and notification pipelines
- Historical comparison views
- Hosted sync or remote agents
- Multi-user auth, SSO, or external identity providers

## Core User Questions

Routeviz v1 should answer:

- What is publicly exposed right now?
- Where does each public endpoint route?
- Which routes do not map cleanly to a live Docker workload?
- Which domains, hostnames, or certificates look risky right now?
- Which public routes appear orphaned or stale?

## Core Data Sources

Routeviz v1 collects from only three primary sources plus one derived check layer.

The first release supports only one edge connector, but the model should account for adjacent systems that self-hosters commonly use.

### Edge Connector In V1: Nginx Proxy Manager

- Proxy host entries
- Domain names
- Forward host and port
- SSL metadata when available
- Authenticated access token obtained from the NPM API token endpoint

### Docker Socket

- Running containers
- Names and labels
- Ports
- Networks

### DNS Lookups

- A records
- AAAA records
- CNAME records when applicable

### Derived Checks

- TLS certificate expiry
- Route matching and mismatch detection

## NPM Connector Strategy

V1 makes a concrete connector decision:

- Support Nginx Proxy Manager through its authenticated API
- Do not read NPM's internal database in MVP

Reasons for the API-first decision:

- It avoids coupling the product to NPM storage internals
- It works regardless of whether NPM is backed by SQLite or another database
- It keeps deployment documentation simpler than supporting multiple ingestion modes on day one

The connector boundary should still allow a future direct-database adapter if API-based setup proves too brittle or too annoying for self-hosted users.

## NPM Connector Auth Flow

Nginx Proxy Manager's official API schema uses a credential exchange at `POST /api/tokens`.

- Request body uses `identity` and `secret`
- Successful responses return a bearer token and expiry timestamp
- The official schema also allows a 2FA challenge response

V1 connector behavior should be:

- Ask the operator to create a dedicated NPM user for Routeviz instead of reusing a personal admin login
- Exchange those credentials for an access token during connector setup
- Store the returned access token and expiry metadata
- Do not persist the NPM password after setup

Because the official API surface checked for v1 exposes an access token and expiry, but not a documented refresh token flow, Routeviz should not invent one.

Practical v1 consequence:

- Scheduled scans run only while a valid NPM access token is present
- When the token expires, Routeviz marks the connector as requiring re-authentication
- The UI should surface this as a connector action, not as a silent scan failure

If 2FA is required on the NPM account, v1 should treat that connector as manual re-auth only unless a documented non-interactive flow is confirmed later.

## Similar Systems To Account For

These are not all in v1, but the product model should leave room for them:

### Reverse Proxies

- Traefik
- Caddy
- SWAG or plain nginx
- HAProxy

### Tunnel-Based Exposure

- Cloudflare Tunnel
- Tailscale Funnel or similar hostname-based tunnels

### Direct Exposure

- Docker containers with published host ports and no reverse proxy

The key requirement is that these sources can all be normalized into the same core chain even if their raw configuration formats differ.

## Exposure Model

Routeviz should model exposure generically:

`entrypoint -> edge source -> route -> target endpoint -> workload -> finding`

Examples of an `entrypoint`:

- Domain or subdomain
- Tunnel hostname
- Public IP and port

Examples of an `edge source`:

- Reverse proxy
- Tunnel
- Direct port publish

V1 only implements domain-based reverse-proxy routes from Nginx Proxy Manager, but the schema and UI should use generic concepts so additional connectors do not require a redesign.

## Core Entity Model

The internal normalized model should be centered on exposure truth, not on bookmarks or generic assets.

Core entities:

- `entrypoints`
- `edge_sources`
- `routes`
- `targets`
- `workloads`
- `findings`
- `snapshots`

## Example Exposure Chain

Example service chain for Immich:

- Entrypoint: `immich.example.com`
- Edge source: Nginx Proxy Manager
- Forward target: `192.168.1.5:8110`
- Matched workload: Docker container or Compose service serving Immich
- DNS state: resolves to expected public endpoint
- TLS state: valid, with expiry date
- Findings: none or one of the issue types below

## Product Architecture

V1 should be a single self-hosted app with four internal parts:

### Web UI

- Overview page
- Exposure chains page
- Route or service detail page
- Scan status and configuration surfaces

### Read-Only Scanner

- Reads connector metadata from supported edge sources
- Reads live Docker state
- Performs DNS lookups
- Performs TLS expiry checks

### Normalizer

- Converts raw source data into a single normalized graph
- Attempts to match upstream targets to Docker-backed workloads
- Produces findings from mismatches and unresolved links

### Connector Boundary

- Connector adapters may be vendor-specific
- The normalized graph must not require NPM-specific field names
- UI should present source type and vendor, but rely on connector-agnostic entities internally

### Local Store

- Stores app configuration
- Stores the latest successful normalized snapshot only

## Persistence Model

V1 is current-state only.

- Each scan builds a new snapshot
- The snapshot is written under a new `snapshot_id`
- Validation runs before the snapshot becomes active
- Readers resolve data only through an `active_snapshot_id`
- A successful scan replaces the previous snapshot by updating `active_snapshot_id` inside one SQLite transaction
- A failed or partial scan never changes the active snapshot pointer
- No historical timeline is retained in v1

This keeps the product focused on present operational truth instead of analytics.

## Scan Flow

Recommended scan flow:

1. Load proxy routes from Nginx Proxy Manager
2. Load live Docker containers and networking metadata
3. Resolve DNS for each exposed domain
4. Check TLS expiry for each exposed domain
5. Match upstream targets to live Docker containers or services
6. Generate findings
7. Store the normalized latest snapshot

## Scan Trigger Model

V1 should support two scan modes:

- manual scan from the UI
- optional interval-based scan

Recommended defaults:

- run the first scan immediately after connector setup succeeds
- keep recurring scans disabled by default
- allow the operator to enable a configurable interval later
- treat 30 minutes as a reasonable initial interval option once scheduling is enabled

If any connector is missing required auth at scan time:

- skip that connector rather than fabricating partial data
- preserve the previously active snapshot
- show a connector-auth warning in the UI

## Docker Matching Strategy

The matching logic is load-bearing. V1 should not rely on naive IP:port equality alone.

Matching should proceed in tiers:

1. Published-port match
   Match when the route target resolves to the scanned host and the target port maps cleanly to a published container port.
2. Service-name or alias match
   Match when the route target host equals a container name, Compose service name, or known network alias and the port aligns.
3. Host-mode and loopback inference
   Handle `127.0.0.1`, `localhost`, and host-network containers explicitly instead of treating them as normal bridge-network targets.
4. Ambiguity guardrail
   If more than one workload is a plausible match, do not silently choose one. Emit an `ambiguous_target` finding with the competing candidates and their evidence.
5. Unknown-target guardrail
   If no trustworthy local Docker match exists and there are no plausible competing candidates, keep the route unmatched and emit an `unmatched_target` finding instead of fabricating a workload association.

V1 matching should rely on Docker runtime metadata first:

- container names
- network aliases exposed by Docker
- published ports
- host-network status

V1 should not require Compose-specific labels or direct Compose file parsing to produce a match.

Compose-related labels may be captured as supporting metadata when present, but they should not be a hard dependency for the matcher. This keeps the matching logic tied to observable runtime state rather than orchestration-specific conventions.

Loopback and host-mode inference should default to lower confidence than direct published-port or network-alias matches.

- A `localhost` or `127.0.0.1` route should not become a high-confidence match on port evidence alone
- If multiple host-mode or loopback candidates share the same plausible port, emit `ambiguous_target`
- Route detail should make it obvious when the workload link came from loopback inference rather than stronger evidence

Each match should carry:

- confidence level
- match reason
- supporting evidence

This evidence should flow through to the route detail view and findings copy.

## Findings Model

The product should lead with findings, not raw inventory.

Recommended v1 finding types:

- `unmatched_target`: a route forwards to a host:port that does not map confidently to a live local Docker workload
- `ambiguous_target`: more than one workload could plausibly satisfy the target
- `dns_mismatch`: DNS resolution does not align with the expected public entry point
- `tls_expiring`: certificate expiry is inside a configurable threshold
- `route_unresolved`: a route exists but required lookup or matching failed
- `orphan_public_route`: a public route exists but backing runtime evidence is weak or missing

## DNS Mismatch Baseline

`dns_mismatch` needs an explicit baseline. V1 should not guess.

During setup, the operator should choose one DNS baseline mode:

- reference hostname
- manual expected public endpoint
- disabled

Recommended mode:

- `reference hostname`: the operator provides one known-good public hostname that should resolve to the same public edge as the routes being scanned

Fallback mode:

- `manual expected public endpoint`: the operator enters a public IP or canonical hostname

Optional assist, not default truth source:

- an external public-IP lookup can suggest a value, but should remain opt-in because DDNS, CDN, and proxying setups can make auto-detection misleading

V1 finding behavior:

- only emit `dns_mismatch` when a baseline is configured
- compare A/AAAA answers against the expected terminal public endpoint when using direct-IP baselines
- compare canonical hostname or terminal resolution chain when using hostname baselines
- if the operator intentionally fronts services with a CDN or other intermediary that obscures the terminal IP, they should disable `dns_mismatch` until a connector-aware rule exists

## Finding Explanation Model

Each finding should explain:

- what was observed
- why Routeviz thinks it matters
- how confident the system is
- what the operator should check next

Example copy for `unmatched_target`:

`immich.example.com` routes through Nginx Proxy Manager to `192.168.1.5:8110`, but the latest scan did not find a confident local Docker workload match for that target. This may mean the container is down, the published port changed, the target points to another node, or the route no longer reflects reality.

Suggested next checks:

- confirm the NPM forward host and port
- verify whether the service runs on this Docker host
- verify the container is running and publishing the expected port

Example copy for `ambiguous_target`:

`photos.example.com` routes to `media:8080`, and the latest scan found more than one plausible Docker workload that could satisfy that target on the scanned host. Routeviz did not choose one automatically because the route-to-workload link is not trustworthy enough yet.

Suggested next checks:

- confirm which container or service is intended to receive this route
- verify network aliases and container naming on the relevant Docker network
- verify whether old or duplicate workloads should be removed

## V1 UX

The UI should remain narrow. Three primary views are enough:

### Overview

- Count of public entrypoints
- Count of matched routes
- Count of broken or unresolved routes
- Count of expiring certificates
- Findings list ordered by severity

### Exposure Chains

- One row per public entrypoint in v1
- Shows `entrypoint -> edge target -> matched workload -> status`
- Optimized for quick scanning and sorting

### Route Detail

- Full chain for a single public route
- Supporting evidence from NPM, Docker, DNS, and TLS checks
- Match confidence and evidence trail
- Clear explanation of why a finding exists and what to check next
- Connector-auth warnings when a source cannot be scanned with the current token

## Auth Model

Even in read-only mode, Routeviz exposes sensitive operational information. Basic auth belongs in v1.

V1 auth should be intentionally simple:

- enabled by default
- single local admin credential or shared password configured through environment or first-run setup
- session-based access to the UI
- same auth gate for any app endpoints that expose snapshot data

The goal is to prevent accidental exposure, not to solve enterprise identity.

## Deployment Model

Routeviz v1 should be easy to run:

- One Docker container for the app
- Mounted Docker socket
- Network access to NPM plus a dedicated NPM user login for the first connector setup flow
- One local volume for Routeviz's own SQLite database and config

The install story should fit the expectations of `r/selfhosted` and `r/homelab`: local, inspectable, and easy to tear down.

## Success Criteria For Early Validation

V1 is successful if early users can say:

- "This showed me which services are truly public."
- "This caught a mismatch or stale route I would not have seen quickly."
- "I could install it without adopting someone else's cloud."

Operational validation signals:

- Users actually run the scanner after starring the repo
- Users report real findings, not just interest in the idea
- Users ask for history, drift comparison, alerts, or multi-node support because they hit current limits
- Usage signals are visible within the first 3-6 months after launch, not just as a launch-week spike

## Launch Strategy

Ship the MVP quickly as an open-source self-hosted tool.

Early distribution targets:

- `r/selfhosted`
- `r/homelab`
- GitHub discovery from related homelab tooling audiences

The goal of launch is not vanity stars alone. The goal is evidence of repeat usage and clear product pressure from real operators.

## Post-MVP Expansion Path

The micro-SaaS angle remains part of the long-term strategy, but it is explicitly not part of the MVP.

Potential later expansion:

- Hosted control plane
- Historical scans and drift detection
- Multi-node inventory
- Remote agents or connectors
- Alerts and notification workflows

## Hosted Phase Gate

Do not build the hosted layer until the self-hosted product demonstrates both within the first 6 months after public launch:

- Meaningful active usage, not just stars
- Repeated demand for capabilities that latest-snapshot local mode cannot satisfy

Good indicators include:

- A few hundred active self-hosted users
- Repeated requests for history, drift detection, remote access, or multi-node support
- Clear evidence that operators are hitting the ceiling of the local-only model

Because the product is self-hosted and privacy-sensitive, this proof will likely come from opt-in signals such as issue activity, discussions, community reports, and direct user feedback. Stars alone do not satisfy the gate.

## Technical Milestones

1. Finalize the self-hosted local-first PRD and product language
2. Implement latest-snapshot local persistence with an explicit active-snapshot pointer
3. Add first edge connector with Nginx Proxy Manager API ingestion
4. Add Docker discovery and matching with confidence and evidence capture
5. Add DNS and TLS checks plus findings generation
6. Build the UI against real normalized snapshot output
7. Add built-in auth and deployment hardening
8. Validate the product with real homelab users before expanding scope

## Open Questions

- Which second connector matters most after NPM: Traefik, Caddy, tunnel-based exposure, or direct Docker port publishing?
- How configurable should DNS mismatch detection be for reverse-proxy, tunnel, and CDN edge cases?
