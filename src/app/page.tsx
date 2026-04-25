import Link from "next/link";

const scanLines = [
  { prefix: "$", text: "docker compose up -d", color: "text-accent" },
  { prefix: "✓", text: "postgres healthy", color: "text-success/70" },
  { prefix: "✓", text: "routeviz started on :3000", color: "text-success/70" },
  { prefix: "▸", text: "scanning 47 containers...", color: "text-muted/60" },
  { prefix: "▸", text: "resolving 23 NPM routes...", color: "text-muted/60" },
  { prefix: "!", text: "portainer: docker socket exposed publicly", color: "text-warning" },
  { prefix: "!", text: "3 routes with no auth layer detected", color: "text-warning" },
  { prefix: "!", text: "jellyfin cert expires in 8 days", color: "text-warning" },
  { prefix: "✓", text: "snapshot saved — 23 routes mapped", color: "text-success/70" },
];

const capabilities = [
  {
    n: "01",
    label: "FREE_AND_OPEN_SOURCE",
    tags: ["MIT", "open source"],
    tagColor: "border-accent/30 bg-accent/8 text-accent/70",
    desc: "No paid tier. No hosted version. The binary you run is the binary in the repo.",
    linkLabel: "VIEW REPO »",
    labelColor: "text-accent",
  },
  {
    n: "02",
    label: "DOCKER_NATIVE",
    tags: ["docker socket", "compose", "labels"],
    tagColor: "border-sky-500/30 bg-sky-500/8 text-sky-400/80",
    desc: "Connects to your Docker socket and reads every running container, network, and label — no sidecars, no agents.",
    linkLabel: null,
    labelColor: "text-sky-400",
  },
  {
    n: "03",
    label: "NPM_INTEGRATION",
    tags: ["SQLite", "API", "proxy hosts"],
    tagColor: "border-sky-500/30 bg-sky-500/8 text-sky-400/80",
    desc: "Reads live route data from Nginx Proxy Manager via SQLite file or API. No manual config — when you add a proxy host it shows up on the next scan.",
    linkLabel: null,
    labelColor: "text-sky-400",
  },
  {
    n: "04",
    label: "TLS_MONITORING",
    tags: ["cert expiry", "per domain"],
    tagColor: "border-yellow-500/30 bg-yellow-500/8 text-yellow-400/80",
    desc: "Tracks certificate expiry per domain and surfaces findings before services go dark.",
    linkLabel: null,
    labelColor: "text-yellow-400",
  },
  {
    n: "05",
    label: "EXPOSURE_INTENT",
    tags: ["public_ok", "auth_required", "private_only"],
    tagColor: "border-orange-500/30 bg-orange-500/8 text-orange-400/80",
    desc: "Mark each route as intentionally public, auth-required, or private-only. Drift alerts fire when reality stops matching what you signed off on.",
    linkLabel: null,
    labelColor: "text-orange-400",
  },
  {
    n: "06",
    label: "DNS_BASELINE",
    tags: ["live lookup", "baseline compare"],
    tagColor: "border-violet-500/30 bg-violet-500/8 text-violet-400/80",
    desc: "Resolves live DNS answers per domain and compares them against a configured baseline — flags mismatches and unexpected changes.",
    linkLabel: null,
    labelColor: "text-violet-400",
  },
  {
    n: "07",
    label: "AUTH_DETECTION",
    tags: ["NPM access lists", "forward-auth", "authelia", "authentik"],
    tagColor: "border-red-500/30 bg-red-500/8 text-red-400/80",
    desc: "Detects NPM access lists, forward-auth headers, and known self-hosted auth signals per route. No auth layer found = finding.",
    linkLabel: null,
    labelColor: "text-red-400",
  },
  {
    n: "08",
    label: "IMAGE_VERSION_CHECKS",
    tags: ["Docker Hub", "semver", "outdated"],
    tagColor: "border-yellow-500/30 bg-yellow-500/8 text-yellow-400/80",
    desc: "Fetches latest Docker Hub tags and flags containers running outdated or unpinned images using semver comparison.",
    linkLabel: null,
    labelColor: "text-yellow-400",
  },
  {
    n: "09",
    label: "WEBHOOK_ALERTS",
    tags: ["HTTP POST", "Slack", "Discord", "Ntfy"],
    tagColor: "border-pink-500/30 bg-pink-500/8 text-pink-400/80",
    desc: "POST findings to any HTTP endpoint — Slack, Discord, Ntfy, or your own receiver. Configurable severity threshold.",
    linkLabel: null,
    labelColor: "text-pink-400",
  },
  {
    n: "10",
    label: "SNAPSHOT_HISTORY",
    tags: ["postgres", "diffable", "retention limit"],
    tagColor: "border-cyan-500/30 bg-cyan-500/8 text-cyan-400/80",
    desc: "Every scan is stored in Postgres. Compare snapshots to see exactly what changed between runs. Configurable retention.",
    linkLabel: null,
    labelColor: "text-cyan-400",
  },
  {
    n: "11",
    label: "SELF_HOSTABLE_IN_MINUTES",
    tags: ["docker compose", "postgres included"],
    tagColor: "border-accent/30 bg-accent/8 text-accent/70",
    desc: "Single docker compose up. Postgres included. No external dependencies, no cloud, no license required.",
    linkLabel: "INSTALL »",
    labelColor: "text-accent",
  },
];

const installSteps = [
  {
    n: "01",
    label: "Pull and start the container.",
    desc: "One YAML file. Mounts the Docker socket read-only.",
  },
  {
    n: "02",
    label: "Open the dashboard at :3000.",
    desc: "First scan completes in under a minute on a typical homelab.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground font-mono">

      {/* scanline texture overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.025]"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(57,255,122,0.5) 2px, rgba(57,255,122,0.5) 3px)",
          backgroundSize: "100% 3px",
        }}
      />

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 border-b border-border/60 bg-background/92 px-6 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-muted/40 text-xs">~/routeviz</span>
            <span className="text-border/60">·</span>
            <span
              className="text-accent text-sm font-bold tracking-[0.2em]"
              style={{ textShadow: "0 0 12px rgba(57,255,122,0.5)" }}
            >
              ROUTEVIZ
            </span>
            <span className="border border-accent/20 bg-accent/5 px-1.5 py-0.5 text-[0.48rem] uppercase tracking-widest text-accent/50">
              v0.1
            </span>
          </div>
          <div className="flex items-center gap-5">
            <a href="https://github.com/parmeetdx/routeviz" target="_blank" rel="noopener noreferrer"
              className="text-[0.58rem] uppercase tracking-widest text-muted/55 transition hover:text-accent/80">
              github
            </a>
            <Link
              href="/overview"
              className="border border-accent/40 bg-accent/8 px-3.5 py-1.5 text-[0.58rem] uppercase tracking-widest text-accent transition hover:border-accent/65 hover:bg-accent/15"
              style={{ textShadow: "0 0 8px rgba(57,255,122,0.28)" }}
            >
              » open app
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative z-10 overflow-hidden px-6 pb-16 pt-20">
        <div
          className="pointer-events-none absolute left-1/2 top-0 h-[480px] w-[700px] -translate-x-1/2 opacity-[0.18]"
          style={{ background: "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(57,255,122,0.4) 0%, transparent 70%)" }}
        />

        <div className="relative mx-auto max-w-6xl">
          {/* breadcrumb label */}
          <p className="mb-5 text-[0.55rem] uppercase tracking-[0.35em] text-muted/45">
            <span className="text-accent/35 mr-2">▸</span>self-hosted · open source · docker-native
          </p>

          <div className="grid gap-14 lg:grid-cols-[1fr_420px] lg:items-start">
            {/* Left */}
            <div>
              <h1 className="mb-6 text-5xl font-bold leading-[1.07] tracking-tight text-foreground lg:text-[4.25rem]">
                Know what&apos;s{" "}
                <span className="text-accent" style={{ textShadow: "0 0 28px rgba(57,255,122,0.5)" }}>
                  public
                </span>
                <br />before it&apos;s a<br />problem.
              </h1>

              <p className="mb-6 max-w-lg text-sm leading-7 text-muted/70">
                Routeviz traces every Docker container to its public exposure chain — DNS,
                reverse proxy, TLS, auth — and tells you the moment something drifts from what you intended.
                No agents. No guesswork. Two commands.
              </p>

              <div className="mb-6 flex flex-wrap gap-3">
                <Link
                  href="/overview"
                  className="border border-accent/50 bg-accent/10 px-5 py-2.5 text-[0.65rem] uppercase tracking-widest text-accent transition hover:border-accent/75 hover:bg-accent/20"
                  style={{ textShadow: "0 0 10px rgba(57,255,122,0.35)" }}
                >
                  » install in 60s
                </Link>
                <a
                  href="https://github.com/parmeetdx/routeviz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border border-border/50 bg-panel px-5 py-2.5 text-[0.65rem] uppercase tracking-widest text-muted/55 transition hover:border-accent/30 hover:text-muted/85"
                >
                  see how it works »
                </a>
              </div>

              {/* metadata strip */}
              <div className="flex flex-wrap items-center gap-3 text-[0.52rem] uppercase tracking-widest text-muted/40">
                <span>MIT licensed</span>
                <span className="text-border/50">·</span>
                <span>single binary</span>
                <span className="text-border/50">·</span>
                <span>linux / macos / arm64</span>
                <span className="text-border/50">·</span>
                <span>no cloud required</span>
              </div>
            </div>

            {/* Right: terminal */}
            <div className="border border-border/55 bg-panel shadow-[0_0_50px_rgba(57,255,122,0.04)]">
              <div className="flex items-center gap-2 border-b border-border/40 bg-panel-2/50 px-4 py-2.5">
                <span className="h-1.5 w-1.5 rounded-full bg-danger/50" />
                <span className="h-1.5 w-1.5 rounded-full bg-warning/50" />
                <span className="h-1.5 w-1.5 rounded-full bg-success/35" />
                <span className="ml-2 text-[0.5rem] uppercase tracking-widest text-muted/40">
                  routeviz — scan output
                </span>
              </div>
              <div className="space-y-1.5 p-5">
                {scanLines.map((line, i) => (
                  <div key={i} className="flex gap-3 text-xs">
                    <span className={`shrink-0 w-3 font-bold ${line.color}`}>{line.prefix}</span>
                    <span className="text-foreground/68">{line.text}</span>
                  </div>
                ))}
                <div className="flex gap-3 text-xs pt-2">
                  <span className="text-accent/45 w-3">_</span>
                  <span className="animate-pulse text-accent/30">█</span>
                </div>
              </div>
            </div>
          </div>

          {/* Stats strip */}
          <div className="mt-14 flex flex-wrap gap-px border border-border/45 bg-border/25 w-fit">
            {[
              { n: "100%", label: "self-hosted" },
              { n: "0", label: "telemetry" },
              { n: "1 cmd", label: "to install" },
              { n: "∞", label: "snapshots" },
            ].map((s) => (
              <div key={s.label} className="bg-panel px-7 py-3.5 text-center">
                <div className="text-lg font-bold text-accent" style={{ textShadow: "0 0 8px rgba(57,255,122,0.38)" }}>{s.n}</div>
                <div className="mt-0.5 text-[0.5rem] uppercase tracking-widest text-muted/45">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Exposure chain ── */}
      <section className="relative z-10 border-t border-border/40 px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <p className="mb-2 text-[0.55rem] uppercase tracking-[0.3em] text-muted/45">
            <span className="text-accent/35 mr-1.5">▸</span>how it works · the full path, traced end-to-end
          </p>
          <h2 className="mb-3 text-2xl font-bold text-foreground lg:text-3xl">
            From public DNS to a running process<br />— in one line.
          </h2>
          <p className="mb-10 max-w-lg text-sm leading-7 text-muted/60">
            Routeviz traces every request the way an attacker would. Every
            hop is captured, diffed against your last snapshot, and graded. No guesswork, no manual mapping.
          </p>

          {/* chain table */}
          <div className="border border-border/50 divide-y divide-border/35">
            {[
              { n: "01", label: "domain", value: "api.warehouse.dev", sub: "public DNS" },
              { n: "02", label: "edge", value: "Nginx Proxy Manager", sub: "reverse proxy", tag: "TLS · L4" },
              { n: "03", label: "internal", value: "192.168.1.5:8096", sub: "polaris" },
              { n: "04", label: "container", value: "polaris", sub: "/admin reachable, no auth", warn: true },
            ].map((step) => (
              <div
                key={step.n}
                className={`flex flex-wrap items-center gap-5 px-5 py-3.5 transition ${step.warn ? "bg-warning/5" : "hover:bg-panel-2/40"}`}
              >
                <span className="shrink-0 text-[0.52rem] font-bold text-accent/25 w-5 tabular-nums">{step.n}</span>
                <span className="shrink-0 text-[0.55rem] uppercase tracking-widest text-muted/45 w-16">{step.label}</span>
                <span className={`text-xs font-medium flex-1 ${step.warn ? "text-warning/90" : "text-foreground/80"}`}>{step.value}</span>
                {step.tag && (
                  <span className="text-[0.5rem] uppercase tracking-widest border border-border/50 px-1.5 py-0.5 text-muted/40">{step.tag}</span>
                )}
                {step.warn && (
                  <span className="text-[0.5rem] uppercase tracking-widest border border-warning/35 bg-warning/8 px-1.5 py-0.5 text-warning/70">EXPOSED</span>
                )}
                {!step.warn && !step.tag && (
                  <span className="text-[0.52rem] uppercase tracking-widest text-muted/35">{step.sub}</span>
                )}
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-5 px-5 py-3.5 bg-success/5">
              <span className="shrink-0 text-[0.52rem] font-bold text-success/30 w-5">05</span>
              <span className="shrink-0 text-[0.55rem] uppercase tracking-widest text-muted/45 w-16">result</span>
              <span className="text-xs font-medium text-success/85 flex-1">3 routes added · 1 cert renewed · 1 auth removed</span>
              <span className="text-[0.5rem] uppercase tracking-widest border border-success/30 bg-success/8 px-1.5 py-0.5 text-success/60">REVIEW</span>
            </div>
          </div>

          <div className="mt-5 text-[0.52rem] uppercase tracking-widest text-muted/35">
            44 containers · 18 routes mapped · <span className="text-danger/60">1 finding</span> · <span className="text-warning/60">2 warnings</span>
          </div>
        </div>
      </section>

      {/* ── Capabilities numbered list ── */}
      <section className="relative z-10 border-t border-border/40 px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 flex items-end justify-between">
            <div>
              <p className="mb-2 text-[0.55rem] uppercase tracking-[0.3em] text-muted/45">
                <span className="text-accent/35 mr-1.5">▸</span>capabilities
              </p>
              <h2 className="text-2xl font-bold text-foreground">Everything included.<br />Nothing phoned home.</h2>
            </div>
            <div className="hidden text-right text-[0.52rem] uppercase tracking-widest text-muted/35 lg:block">
              11 capabilities · 1 binary<br />shipped in the open repo
            </div>
          </div>

          <div className="divide-y divide-border/30 border border-border/40">
            {capabilities.map((cap) => (
              <div key={cap.n} className="group grid gap-4 px-5 py-5 transition hover:bg-panel-2/50 md:grid-cols-[2rem_1fr_2fr_auto]">
                {/* number */}
                <span className="text-[0.52rem] font-bold text-muted/30 tabular-nums pt-1">{cap.n}</span>

                {/* label + tags */}
                <div>
                  <div className={`mb-2.5 text-[0.65rem] font-bold uppercase tracking-wider ${cap.labelColor}`}>
                    · {cap.label}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {cap.tags.map((t) => (
                      <span key={t} className={`border px-1.5 py-0.5 text-[0.48rem] uppercase tracking-widest ${cap.tagColor}`}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                {/* description */}
                <p className="text-[0.65rem] leading-[1.75] text-muted/70">{cap.desc}</p>

                {/* link */}
                <div className="flex items-start justify-end pt-0.5">
                  {cap.linkLabel && (
                    <span className={`text-[0.52rem] uppercase tracking-widest opacity-40 group-hover:opacity-80 transition whitespace-nowrap ${cap.labelColor}`}>
                      {cap.linkLabel}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Install ── */}
      <section className="relative z-10 border-t border-border/40 bg-panel/40 px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
            <div>
              <p className="mb-3 text-[0.55rem] uppercase tracking-[0.3em] text-muted/45">
                <span className="text-accent/35 mr-1.5">▸</span>get started
              </p>
              <h2 className="mb-4 text-2xl font-bold text-foreground">Up in two commands.</h2>
              <p className="mb-8 text-sm leading-7 text-muted/60">
                Routeviz ships as a single compose stack. Postgres is included.
                Point it at your Docker socket, connect your NPM instance,
                and the first scan runs automatically.
              </p>

              <div className="mb-8 space-y-4">
                {installSteps.map((step) => (
                  <div key={step.n} className="flex gap-4">
                    <span className="shrink-0 mt-0.5 text-[0.52rem] font-bold text-accent/40 w-5">{step.n}</span>
                    <div>
                      <div className="text-xs font-bold text-foreground/80 mb-0.5">{step.label}</div>
                      <div className="text-[0.6rem] text-muted/50 leading-5">{step.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/overview"
                  className="border border-accent/50 bg-accent/10 px-5 py-2.5 text-[0.65rem] uppercase tracking-widest text-accent transition hover:border-accent/75 hover:bg-accent/20"
                  style={{ textShadow: "0 0 8px rgba(57,255,122,0.3)" }}
                >
                  » open dashboard
                </Link>
                <a
                  href="https://github.com/parmeetdx/routeviz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border border-border/50 bg-panel px-5 py-2.5 text-[0.65rem] uppercase tracking-widest text-muted/55 transition hover:border-accent/30 hover:text-muted/85"
                >
                  read the docs »
                </a>
              </div>

              <div className="mt-5 border border-border/40 bg-panel-2/60 px-4 py-2.5 text-[0.6rem] text-muted/45">
                <span className="text-accent/40 mr-1.5 font-bold">[NOTE]</span>
                Docker socket is mounted <span className="text-foreground/60">read-only</span>. Routeviz never writes to your runtime. If you want to disable the socket entirely and feed config manually, see NOSOCK env.
              </div>
            </div>

            <div className="border border-border/50 bg-panel">
              <div className="flex items-center justify-between border-b border-border/40 px-4 py-2.5">
                <span className="text-[0.5rem] uppercase tracking-widest text-muted/40">docker-compose.yml</span>
                <span className="text-[0.5rem] text-accent/35">quick start</span>
              </div>
              <pre className="overflow-x-auto p-5 text-[0.6rem] leading-[1.8] text-foreground/60">
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

      {/* ── Final CTA ── */}
      <section className="relative z-10 overflow-hidden px-6 py-28">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{ background: "radial-gradient(ellipse 65% 55% at 50% 50%, rgba(57,255,122,0.3) 0%, transparent 70%)" }}
        />
        <div className="relative mx-auto max-w-3xl text-center">
          <p className="mb-4 text-[0.55rem] uppercase tracking-[0.35em] text-muted/45">
            <span className="text-accent/35 mr-1.5">▸</span>the question worth asking
          </p>
          <h2 className="mb-6 text-4xl font-bold leading-[1.1] text-foreground lg:text-5xl">
            What&apos;s public that<br />
            <span className="text-accent" style={{ textShadow: "0 0 26px rgba(57,255,122,0.45)" }}>
              you didn&apos;t approve?
            </span>
          </h2>
          <p className="mb-10 text-sm leading-7 text-muted/60">
            Most self-hosters find out the hard way. Run Routeviz before that happens.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/overview"
              className="border border-accent/50 bg-accent/10 px-8 py-3.5 text-[0.65rem] uppercase tracking-widest text-accent transition hover:border-accent/75 hover:bg-accent/20"
              style={{ textShadow: "0 0 10px rgba(57,255,122,0.35)" }}
            >
              » open dashboard
            </Link>
            <a
              href="https://github.com/parmeetdx/routeviz"
              target="_blank"
              rel="noopener noreferrer"
              className="border border-border/50 px-8 py-3.5 text-[0.65rem] uppercase tracking-widest text-muted/50 transition hover:border-accent/25 hover:text-muted/80"
            >
              star on github »
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-border/40 px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <div>
            <span
              className="text-accent text-sm font-bold tracking-[0.22em]"
              style={{ textShadow: "0 0 10px rgba(57,255,122,0.32)" }}
            >
              ROUTEVIZ
            </span>
            <p className="mt-1 text-[0.52rem] uppercase tracking-widest text-muted/38">
              self-hosted exposure monitoring for Docker
            </p>
          </div>
          <div className="flex gap-5 text-[0.55rem] uppercase tracking-widest text-muted/40">
            <a href="https://github.com/parmeetdx/routeviz" target="_blank" rel="noopener noreferrer"
              className="transition hover:text-accent/60">github</a>
            <Link href="/overview" className="transition hover:text-accent/60">dashboard</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
