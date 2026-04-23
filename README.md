# Ops Ledger

Ops Ledger is a local-first dashboard for self-hosted service inventory, routing visibility, and exposure-chain mapping.

The current product direction is intentionally narrow:

- Open-source and self-hosted v1
- One Dockerized app
- First connector set: Nginx Proxy Manager, Docker, DNS, and TLS checks
- Latest-snapshot-only persistence
- Findings that surface broken or risky public routes

## Local Development

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Initial Focus

- Represent the route from public domain to proxy target to live runtime
- Show findings for mismatched, unresolved, or risky exposure
- Prepare the app for a self-hosted scanner with connector-specific ingestion and a generic exposure model

## Repo Notes

- App entry: `src/app/page.tsx`
- Global styling: `src/app/globals.css`
- Product requirements: `docs/PRD.md`
