# Contributing to Routeviz

Thanks for your interest in contributing. Here's everything you need to get started.

## Prerequisites

- Node 20+
- Docker and Docker Compose (for full local testing with a real NPM/Docker setup)
- A running Postgres instance (or use the bundled compose setup)

## Local development

```bash
git clone https://github.com/parmeetdx/routeviz.git
cd routeviz
npm install
```

Copy the example env and configure it:

```bash
cp .env.example .env.local
```

At minimum set `DATABASE_URL` in `.env.local`:

```
DATABASE_URL=postgresql://routeviz:changeme@localhost:5432/routeviz
```

Start a local Postgres (or use Docker):

```bash
docker run -d --name routeviz-pg \
  -e POSTGRES_DB=routeviz \
  -e POSTGRES_USER=routeviz \
  -e POSTGRES_PASSWORD=changeme \
  -p 5432:5432 \
  postgres:16-alpine
```

Start the dev server:

```bash
npm run dev
# Open http://localhost:3000
```

The background worker runs as a separate process. To also run it locally:

```bash
node src/worker/index.mjs
```

## Testing

```bash
npm test              # run the full test suite
npm run test:watch    # watch mode
npm run test:coverage # coverage report
```

Type check:

```bash
npx tsc --noEmit
```

All tests and the type check must pass before opening a PR. CI will verify both.

## Branching

- Branch from `main`
- Use descriptive branch names: `fix/npm-token-refresh`, `feat/traefik-connector`
- Open a PR against `main`

## Code style

- TypeScript strict mode is enforced
- No comments unless the "why" is non-obvious
- No new dependencies without discussion
- Keep PRs focused — one concern per PR

## Architecture notes

- [src/lib/routeviz-types.ts](src/lib/routeviz-types.ts) — shared type definitions; keep this the single source of truth
- [src/lib/snapshot.ts](src/lib/snapshot.ts) — scan pipeline: connectors → routes → findings
- [src/lib/analysis/](src/lib/analysis/) — route matching, finding generation, workload analysis
- [src/lib/collectors/](src/lib/collectors/) — per-connector data fetchers (npm, docker, dns)
- [migrations/](migrations/) — numbered SQL migration files; add a new file for schema changes, never edit existing ones

## Adding a connector

1. Add a new collector in `src/lib/collectors/<name>.ts` that returns `EdgeRouteInput[]`
2. Add the connector type to `ConnectorType` in `routeviz-types.ts`
3. Add options interface (e.g. `NameConnectorOptions`) and wire it into `ConnectorOptions` and `ConnectorConfig`
4. Handle the new type in `buildSnapshot()` in `snapshot.ts`
5. Add the connector to `CONNECTOR_DEFS` in `setup-console.tsx` and remove it from `CONNECTOR_COMING_SOON`
6. Add normalization in `settings.ts` (`normalizeConnector`)

## Reporting bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml) — include logs, steps to reproduce, and your setup details.

## Questions

Open a [GitHub Discussion](https://github.com/parmeetdx/routeviz/discussions) for questions that aren't bugs or feature requests.
