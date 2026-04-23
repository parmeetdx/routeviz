import Link from "next/link";
import type { ReactNode } from "react";

import type { RelatedWorkload, SnapshotHistoryPoint } from "@/lib/ops-ledger-types";

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <section className="border border-border bg-panel px-5 py-5 shadow-[0_0_30px_rgba(57,255,122,0.04)]">
      <div className="flex items-center gap-3 mb-4">
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-muted/70">
          <span className="text-accent/50 mr-1">##</span>{eyebrow}
        </span>
        <div className="flex-1 border-t border-border/60" />
      </div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-4xl">
          <h1 className="font-mono text-2xl font-bold tracking-tight text-balance sm:text-3xl"
            style={{ textShadow: "0 0 20px rgba(57,255,122,0.15)" }}>
            {title}
          </h1>
          <p className="mt-3 max-w-3xl font-mono text-xs leading-7 text-muted/80">
            {description}
          </p>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </section>
  );
}

export function SurfaceCard({
  title,
  eyebrow,
  children,
  className,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "border border-border bg-panel px-5 py-5 shadow-[0_0_24px_rgba(57,255,122,0.03)]",
        className,
      )}
    >
      <div className="mb-4 flex items-center gap-3 pb-3 border-b border-border/60">
        <span className="font-mono text-accent/50 text-xs">▸</span>
        <div>
          {eyebrow ? (
            <div className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-muted/70">
              {eyebrow}
            </div>
          ) : null}
          <h2 className="font-mono text-sm font-bold text-foreground/90 tracking-tight">{title}</h2>
        </div>
        <div className="flex-1 border-t border-border/40" />
      </div>
      {children}
    </section>
  );
}

export function MetricTile({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="border border-border bg-panel-2 px-4 py-4">
      <div className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-muted/70">
        {label}
      </div>
      <div className="mt-3 font-mono text-3xl font-bold tabular-nums text-foreground"
        style={{ textShadow: "0 0 16px rgba(57,255,122,0.2)" }}>
        {value}
      </div>
      <div className="mt-2 font-mono text-xs leading-6 text-muted/70">{note}</div>
    </div>
  );
}

export function Badge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
}) {
  const classes = {
    neutral: "border-border/60 bg-panel-2 text-foreground/80",
    accent: "border-accent/35 bg-accent/10 text-accent",
    success: "border-success/35 bg-success/10 text-success",
    warning: "border-warning/35 bg-warning/10 text-warning",
    danger: "border-danger/35 bg-danger/10 text-danger",
  };

  return (
    <span
      className={cn(
        "inline-flex border font-mono px-2.5 py-1 text-[0.65rem] uppercase tracking-wider leading-none",
        classes[tone],
      )}
    >
      {label}
    </span>
  );
}

export function KeyValueList({
  items,
}: {
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="border border-border divide-y divide-border/50">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-start justify-between gap-4 px-4 py-2.5 hover:bg-panel-2/50 transition"
        >
          <div className="font-mono text-[0.62rem] uppercase tracking-[0.24em] text-muted/70">
            {item.label}
          </div>
          <div className="max-w-[64%] text-right font-mono text-xs leading-6 text-foreground/85">
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export function RouteStateBadge({
  state,
  confidence,
}: {
  state: string;
  confidence: string;
}) {
  let tone: "success" | "warning" | "danger" | "accent" = "danger";

  if (state === "matched" && confidence === "high") {
    tone = "success";
  } else if (state === "direct") {
    tone = "accent";
  } else if (state === "matched" || state === "off_host" || state === "ambiguous") {
    tone = "warning";
  }

  return <Badge label={`${state}/${confidence}`} tone={tone} />;
}

export function FindingListItem({
  title,
  type,
  evidence,
  nextCheck,
  href,
  severity,
}: {
  title: string;
  type: string;
  evidence: string;
  nextCheck: string;
  href: string;
  severity: string;
}) {
  const tone =
    severity === "high"
      ? "danger"
      : severity === "medium"
        ? "warning"
        : "accent";

  return (
    <article className="border border-border bg-panel-2 px-4 py-3 hover:bg-panel-2/80 transition">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h3 className="font-mono text-sm font-bold tracking-tight">{title}</h3>
          <div className="mt-2">
            <Badge label={type} tone={tone} />
          </div>
        </div>
        <Link
          href={href}
          className="font-mono text-xs border border-accent/30 bg-accent/8 px-3 py-1.5 text-accent transition hover:bg-accent/18"
          style={{ textShadow: "0 0 6px rgba(57,255,122,0.3)" }}
        >
          open→
        </Link>
      </div>
      <p className="mt-3 font-mono text-[0.65rem] leading-6 text-muted/70">{evidence}</p>
      <p className="mt-2 font-mono text-xs leading-6 text-foreground/80">{nextCheck}</p>
    </article>
  );
}

export function TableLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="font-mono text-accent text-xs underline decoration-transparent underline-offset-4 transition hover:decoration-accent"
      style={{ textShadow: "0 0 6px rgba(57,255,122,0.3)" }}
    >
      {children}
    </Link>
  );
}

export function SnapshotHistoryChart({
  history,
}: {
  history: SnapshotHistoryPoint[];
}) {
  const recentPoints = history.slice(-18);
  const highestFindingCount = Math.max(
    1,
    ...recentPoints.map((point) => point.findingCount),
  );

  return (
    <div className="space-y-3">
      <div className="flex h-28 items-end gap-1.5 border border-border bg-panel-2 px-4 py-4">
        {recentPoints.length === 0 ? (
          <div className="font-mono text-xs text-muted/70">
            <span className="text-accent/40 mr-1">$</span>
            No history yet.
          </div>
        ) : (
          recentPoints.map((point) => {
            const height = Math.max(
              10,
              Math.round((point.findingCount / highestFindingCount) * 80),
            );

            return (
              <div key={point.id} className="flex flex-1 flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "w-full",
                    point.highSeverityCount > 0
                      ? "bg-danger/70"
                      : "bg-accent/50",
                  )}
                  style={{
                    height,
                    boxShadow: point.highSeverityCount > 0
                      ? "0 0 6px rgba(255,59,59,0.4)"
                      : "0 0 4px rgba(57,255,122,0.3)",
                  }}
                  title={`${point.label}: ${point.findingCount} findings`}
                />
                <span className="font-mono text-[0.5rem] uppercase tracking-wider text-muted/50">
                  {new Date(point.generatedAt).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            );
          })
        )}
      </div>
      <p className="font-mono text-[0.65rem] leading-6 text-muted/70">
        <span className="text-accent/40 mr-1">$</span>
        Bar height = total findings per snapshot. Red bars = at least one HIGH severity.
      </p>
    </div>
  );
}

export function WorkloadStack({
  workloads,
}: {
  workloads: RelatedWorkload[];
}) {
  return (
    <div className="border border-border divide-y divide-border/50">
      {workloads.length === 0 ? (
        <div className="px-4 py-3 font-mono text-xs text-muted/70">
          <span className="text-accent/40 mr-1">$</span>
          No related workloads resolved for this route.
        </div>
      ) : (
        workloads.map((workload) => (
          <article
            key={workload.name}
            className="px-4 py-4 hover:bg-panel-2/50 transition"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" style={{ boxShadow: "0 0 6px rgba(57,255,122,0.5)" }} />
                  <h3 className="font-mono text-sm font-bold tracking-tight">
                    {workload.name}
                  </h3>
                </div>
                <p className="mt-1.5 font-mono text-[0.65rem] text-muted/70">{workload.image}</p>
              </div>
              <Badge label={workload.state} tone="success" />
            </div>
            <div className="mt-3 grid gap-1.5 font-mono text-[0.65rem] leading-6 text-muted/80 md:grid-cols-2">
              <div>role: {workload.serviceName ?? workload.role}</div>
              <div>network: {workload.networkMode}</div>
              <div>
                published:{" "}
                {workload.publishedPorts.length > 0
                  ? workload.publishedPorts.join(", ")
                  : "none"}
              </div>
              <div>
                exposed:{" "}
                {workload.exposedPorts.length > 0
                  ? workload.exposedPorts.join(", ")
                  : "none"}
              </div>
              <div>compose: {workload.composeProject ?? "not composed"}</div>
              <div>
                socket: {workload.dockerSocketMount.replaceAll("_", " ")}
              </div>
            </div>
            {workload.composePath ? (
              <div className="mt-2 font-mono text-[0.62rem] text-muted/60">
                {workload.composePath}
              </div>
            ) : null}
          </article>
        ))
      )}
    </div>
  );
}

export function ChainSteps({ steps }: { steps: string[] }) {
  return (
    <div className="space-y-2">
      {steps.map((step, index) => (
        <div key={`${step}-${index}`} className="flex items-stretch gap-3">
          <div className="flex w-5 shrink-0 flex-col items-center">
            <div className="mt-1.5 h-2 w-2 border border-accent/40 bg-accent/20" />
            {index < steps.length - 1 ? (
              <div className="mt-1 flex-1 border-l border-dashed border-border/60" />
            ) : null}
          </div>
          <div className="flex-1 border border-border/60 bg-panel-2 px-4 py-2.5 font-mono text-xs leading-6 text-foreground/85">
            {step}
          </div>
        </div>
      ))}
    </div>
  );
}
