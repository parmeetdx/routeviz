import Link from "next/link";

const features = [
  {
    label: "Free & open source",
    desc: "No license fees, no telemetry, no vendor lock-in. Runs entirely on your hardware.",
  },
  {
    label: "Docker-native",
    desc: "Connects to your Docker socket and maps every running container to its public exposure chain.",
  },
  {
    label: "NPM integration",
    desc: "Reads live route data from Nginx Proxy Manager via SQLite or API — no manual config.",
  },
  {
    label: "TLS monitoring",
    desc: "Tracks certificate expiry per domain and alerts before services go dark.",
  },
  {
    label: "Exposure intent",
    desc: "Mark each route as intentionally public, auth-required, or private-only. Drift alerts when reality diverges.",
  },
  {
    label: "DNS baseline",
    desc: "Compares live DNS answers against a known-good baseline and flags unexpected changes.",
  },
  {
    label: "Auth detection",
    desc: "Probes each route for NPM access lists, forward-auth headers, and known self-auth signals.",
  },
  {
    label: "Image version checks",
    desc: "Fetches latest Docker Hub tags and flags containers running outdated or unpinned images.",
  },
  {
    label: "Workload findings",
    desc: "Detects direct port exposure, missing backups, stale containers, and Docker socket mounts.",
  },
  {
    label: "Snapshot history",
    desc: "Every scan is stored. Compare snapshots to see exactly what changed between runs.",
  },
  {
    label: "Webhook alerts",
    desc: "POST findings to any webhook — Slack, Discord, Ntfy, or your own endpoint.",
  },
  {
    label: "Self-hostable in minutes",
    desc: "Single docker compose up. Postgres included. No external dependencies.",
  },
];

const chain = [
  { label: "domain", value: "app.yourdomain.com" },
  { label: "edge", value: "Nginx Proxy Manager" },
  { label: "target", value: "192.168.1.5:8096" },
  { label: "workload", value: "jellyfin" },
];

const terminalLines = [
  { prefix: "$", text: "docker compose up -d", color: "text-accent" },
  { prefix: "✓", text: "postgres healthy", color: "text-success/70" },
  { prefix: "✓", text: "routeviz started on :3000", color: "text-success/70" },
  { prefix: "▸", text: "scanning 42 containers...", color: "text-muted/70" },
  { prefix: "▸", text: "resolving 18 NPM routes...", color: "text-muted/70" },
  { prefix: "!", text: "portainer: docker socket exposed publicly", color: "text-warning" },
  { prefix: "!", text: "3 routes with no auth layer detected", color: "text-warning" },
  { prefix: "✓", text: "snapshot saved — 42 routes mapped", color: "text-success/70" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground font-mono">

      {/* ── Nav ── */}
      <nav className="border-b border-border/50 px-6 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="text-accent text-lg font-bold tracking-widest"
              style={{ textShadow: "0 0 12px rgba(57,255,122,0.5)" }}
            >
              ROUTEVIZ
            </span>
            <span className="border border-accent/20 bg-accent/5 px-1.5 py-0.5 text-[0.55rem] uppercase tracking-widest text-accent/60">
              v0.1
            </span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/parmeetdx/routeviz"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[0.65rem] uppercase tracking-widest text-muted/70 transition hover:text-accent/80"
            >
              github
            </a>
            <Link
              href="/auth/login"
              className="border border-accent/35 bg-accent/8 px-3 py-1.5 text-[0.65rem] uppercase tracking-widest text-accent transition hover:border-accent/60 hover:bg-accent/15"
              style={{ textShadow: "0 0 6px rgba(57,255,122,0.25)" }}
            >
              open app →
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
            {/* Left: copy */}
            <div>
              <p className="mb-3 text-[0.6rem] uppercase tracking-[0.3em] text-muted/60">
                <span className="text-accent/40 mr-1">▸</span>self-hosted · open source · docker-native
              </p>
              <h1 className="text-4xl font-bold leading-tight tracking-tight text-foreground lg:text-5xl">
                Know what's public
                <br />
                <span className="text-accent" style={{ textShadow: "0 0 20px rgba(57,255,122,0.4)" }}>
                  before it's a problem.
                </span>
              </h1>
              <p className="mt-6 text-sm leading-7 text-muted/80">
                Routeviz maps every Docker container to its public exposure chain — reverse proxy, DNS, TLS, and auth — and alerts you when something drifts from what you intended.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/auth/login"
                  className="border border-accent/45 bg-accent/10 px-5 py-2.5 text-xs uppercase tracking-widest text-accent transition hover:border-accent/70 hover:bg-accent/20"
                  style={{ textShadow: "0 0 8px rgba(57,255,122,0.3)" }}
                >
                  open dashboard →
                </Link>
                <a
                  href="https://github.com/parmeetdx/routeviz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border border-border/60 bg-panel px-5 py-2.5 text-xs uppercase tracking-widest text-muted/70 transition hover:border-accent/30 hover:text-foreground/80"
                >
                  view source
                </a>
              </div>
              <p className="mt-5 text-[0.6rem] uppercase tracking-widest text-muted/50">
                <span className="text-accent/30 mr-1">$</span>
                docker compose up -d · no license required
              </p>
            </div>

            {/* Right: terminal */}
            <div className="border border-border/60 bg-panel shadow-[0_0_60px_rgba(57,255,122,0.05)]">
              <div className="flex items-center gap-2 border-b border-border/50 px-4 py-2.5">
                <span className="h-2 w-2 rounded-full bg-danger/60" />
                <span className="h-2 w-2 rounded-full bg-warning/60" />
                <span className="h-2 w-2 rounded-full bg-success/40" />
                <span className="ml-2 text-[0.55rem] uppercase tracking-widest text-muted/50">
                  routeviz — scan output
                </span>
              </div>
              <div className="space-y-1.5 p-5">
                {terminalLines.map((line, i) => (
                  <div key={i} className="flex gap-2.5 text-xs">
                    <span className={`shrink-0 w-3 ${line.color}`}>{line.prefix}</span>
                    <span className="text-foreground/75">{line.text}</span>
                  </div>
                ))}
                <div className="flex gap-2.5 text-xs pt-1">
                  <span className="text-accent/60">_</span>
                  <span className="animate-pulse text-accent/40">█</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Exposure chain ── */}
      <section className="border-y border-border/40 bg-panel/60 px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <p className="mb-2 text-[0.6rem] uppercase tracking-[0.3em] text-muted/60">
            <span className="text-accent/40 mr-1">▸</span>how it works
          </p>
          <h2 className="mb-3 text-xl font-bold text-foreground">The full exposure chain, in one view</h2>
          <p className="mb-10 text-sm text-muted/70">
            Routeviz traces every request path from public domain to Docker container — and tells you exactly what's protecting it.
          </p>
          <div className="flex flex-wrap items-center gap-0">
            {chain.map((step, i) => (
              <div key={step.label} className="flex items-center">
                <div className="border border-border/60 bg-panel-2 px-4 py-3 min-w-[140px]">
                  <div className="text-[0.52rem] uppercase tracking-[0.25em] text-muted/50 mb-1">{step.label}</div>
                  <div className="text-xs text-foreground/85">{step.value}</div>
                </div>
                {i < chain.length - 1 && (
                  <div className="px-2 text-accent/30 text-lg">→</div>
                )}
              </div>
            ))}
            <div className="flex items-center">
              <div className="px-2 text-accent/30 text-lg">→</div>
              <div className="border border-success/30 bg-success/5 px-4 py-3 min-w-[120px]">
                <div className="text-[0.52rem] uppercase tracking-[0.25em] text-success/60 mb-1">status</div>
                <div className="text-xs text-success/90">matched · high</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features grid ── */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <p className="mb-2 text-[0.6rem] uppercase tracking-[0.3em] text-muted/60">
            <span className="text-accent/40 mr-1">▸</span>capabilities
          </p>
          <h2 className="mb-10 text-xl font-bold text-foreground">Everything included. Nothing phoned home.</h2>
          <div className="grid gap-px border border-border/40 bg-border/20 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.label}
                className="bg-panel p-5 transition hover:bg-panel-2"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-accent/50 text-xs">✓</span>
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground/90">
                    {feature.label}
                  </span>
                </div>
                <p className="text-[0.65rem] leading-5 text-muted/70">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Install ── */}
      <section className="border-y border-border/40 bg-panel/60 px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
            <div>
              <p className="mb-2 text-[0.6rem] uppercase tracking-[0.3em] text-muted/60">
                <span className="text-accent/40 mr-1">▸</span>get started
              </p>
              <h2 className="mb-4 text-xl font-bold text-foreground">Up in two commands.</h2>
              <p className="mb-6 text-sm leading-7 text-muted/70">
                Routeviz ships as a single compose stack. Postgres is included. Point it at your Docker socket, connect your NPM instance, and the first scan runs automatically.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/auth/login"
                  className="border border-accent/45 bg-accent/10 px-5 py-2.5 text-xs uppercase tracking-widest text-accent transition hover:border-accent/70 hover:bg-accent/20"
                  style={{ textShadow: "0 0 8px rgba(57,255,122,0.3)" }}
                >
                  open dashboard →
                </Link>
                <a
                  href="https://github.com/parmeetdx/routeviz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border border-border/60 bg-panel px-5 py-2.5 text-xs uppercase tracking-widest text-muted/70 transition hover:border-accent/30 hover:text-foreground/80"
                >
                  read the docs
                </a>
              </div>
            </div>
            <div className="border border-border/60 bg-panel">
              <div className="border-b border-border/50 px-4 py-2.5 flex items-center justify-between">
                <span className="text-[0.55rem] uppercase tracking-widest text-muted/50">docker-compose.yml</span>
                <span className="text-[0.55rem] text-accent/40">quick start</span>
              </div>
              <pre className="overflow-x-auto p-5 text-[0.65rem] leading-5 text-foreground/70">
{`services:
  routeviz:
    image: ghcr.io/parmeetdx/routeviz:latest
    ports:
      - "3000:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    environment:
      DATABASE_URL: postgres://routeviz:secret@postgres/routeviz
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: routeviz
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: routeviz`}
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border/40 px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <span
              className="text-accent font-bold tracking-widest"
              style={{ textShadow: "0 0 10px rgba(57,255,122,0.35)" }}
            >
              ROUTEVIZ
            </span>
            <p className="mt-1 text-[0.58rem] uppercase tracking-widest text-muted/50">
              self-hosted exposure monitoring for Docker
            </p>
          </div>
          <div className="flex gap-6 text-[0.6rem] uppercase tracking-widest text-muted/50">
            <a
              href="https://github.com/parmeetdx/routeviz"
              target="_blank"
              rel="noopener noreferrer"
              className="transition hover:text-accent/70"
            >
              github
            </a>
            <Link href="/auth/login" className="transition hover:text-accent/70">
              dashboard
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
