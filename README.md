# Routeviz

**Self-hosted exposure chain monitor for homelabs and self-hosted stacks.**

Routeviz maps the full path from public entrypoint → reverse proxy → upstream target → live container, then flags what's broken or risky. It's built for people who run Dockerized services behind a reverse proxy and want one honest answer to: *what's actually exposed, and should it be?*

> **Status:** Early release. NPM (Nginx Proxy Manager) connector is production-ready. Traefik and additional connectors are in progress.

---

## What it does

- Reads routes from your reverse proxy (Nginx Proxy Manager via API or SQLite)
- Matches each route to a running Docker container
- Resolves DNS and checks TLS certificate expiry
- Surfaces findings: unmatched routes, DNS drift, expiring certs, unauthenticated public endpoints
- Tracks changes between scans and optionally fires a webhook on new high-severity findings

---

## Quick start

**Prerequisites:** Docker and Docker Compose on the host running your services.

```bash
# 1. Download the compose file and example env
curl -O https://raw.githubusercontent.com/parmeetdx/routeviz/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/parmeetdx/routeviz/main/.env.example
cp .env.example .env

# 2. Edit .env — at minimum set HOST_ADDRESS to your host's LAN IP
#    Run: hostname -I | awk '{print $1}'
nano .env

# 3. Start
docker compose up -d

# 4. Open http://<your-host-ip>:8141
```

On first launch you'll be prompted to create an account, then connect your reverse proxy in Setup.

---

## Configuration

All settings are managed through the Setup UI. The `.env` file only controls infrastructure-level options:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8141` | Port Routeviz listens on |
| `POSTGRES_PASSWORD` | `changeme` | Password for the internal Postgres instance — change before exposing |
| `HOST_ADDRESS` | *(auto-detected)* | Override the host IP used for route matching. Required in most Docker setups. Run `hostname -I \| awk '{print $1}'` to find it. |
| `NPM_DATA_PATH` | — | Only needed if using NPM **SQLite mode**. Path to your NPM data directory on the host (e.g. `/opt/nginx-proxy-manager/data`). Not required for API mode. |

---

## Connectors

| Connector | Status | Notes |
|---|---|---|
| Nginx Proxy Manager | ✅ Ready | API mode (recommended) or SQLite bind-mount |
| Docker | ✅ Ready | Reads running containers via Docker socket |
| DNS | ✅ Ready | Resolves public answers per route |
| Traefik | 🔜 Coming soon | — |
| Caddy | 🔜 Planned | — |

---

## Development

```bash
# Prerequisites: Node 20+, Postgres
cp .env.example .env.local
# Set DATABASE_URL in .env.local

npm install
npm run dev
# Open http://localhost:3000
```

```bash
npm test          # run test suite
npm run typecheck # type check
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for full setup and contribution guide.

---

## License

[MIT](LICENSE)
