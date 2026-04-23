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
    <section className="rounded-[1.4rem] border border-border bg-panel px-5 py-5 shadow-[0_12px_40px_rgba(0,0,0,0.24)] lg:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-4xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted">
            {eyebrow}
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-balance sm:text-3xl">
            {title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
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
        "rounded-[1.35rem] border border-border bg-panel px-5 py-5 shadow-[0_10px_34px_rgba(0,0,0,0.18)]",
        className,
      )}
    >
      <div className="mb-4">
        {eyebrow ? (
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">{title}</h2>
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
    <div className="rounded-[1rem] border border-border bg-panel-2 px-4 py-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted">
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{value}</div>
      <div className="mt-2 text-sm leading-6 text-muted">{note}</div>
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
    neutral: "border-border bg-panel-2 text-foreground/90",
    accent: "border-accent/25 bg-accent/14 text-accent",
    success: "border-success/25 bg-success/14 text-success",
    warning: "border-warning/25 bg-warning/14 text-warning",
    danger: "border-danger/25 bg-danger/14 text-danger",
  };

  return (
    <span
      className={cn(
        "inline-flex rounded-[0.45rem] border px-3 py-1.5 text-sm leading-none",
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
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-start justify-between gap-4 rounded-[0.9rem] border border-border bg-panel-2 px-4 py-3"
        >
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted">
            {item.label}
          </div>
          <div className="max-w-[64%] text-right text-sm leading-6 text-foreground/92">
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

  return <Badge label={`${state} / ${confidence}`} tone={tone} />;
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
    <article className="rounded-[1rem] border border-border bg-panel-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h3 className="text-base font-semibold tracking-[-0.02em]">{title}</h3>
          <div className="mt-2">
            <Badge label={type} tone={tone} />
          </div>
        </div>
        <Link
          href={href}
          className="rounded-full border border-border bg-panel px-3 py-1.5 text-sm text-muted transition hover:border-accent/30 hover:text-foreground"
        >
          Open route
        </Link>
      </div>
      <p className="mt-4 text-sm leading-7 text-muted">{evidence}</p>
      <p className="mt-3 text-sm leading-7 text-foreground/92">{nextCheck}</p>
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
      className="text-accent underline decoration-transparent underline-offset-4 transition hover:decoration-accent"
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
    <div className="space-y-4">
      <div className="flex h-28 items-end gap-2 rounded-[1rem] border border-border bg-panel-2 px-4 py-4">
        {recentPoints.length === 0 ? (
          <div className="text-sm text-muted">No history yet.</div>
        ) : (
          recentPoints.map((point) => {
            const height = Math.max(
              12,
              Math.round((point.findingCount / highestFindingCount) * 84),
            );

            return (
              <div key={point.id} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className={cn(
                    "w-full rounded-full bg-accent/75",
                    point.highSeverityCount > 0 && "bg-danger/80",
                  )}
                  style={{ height }}
                  title={`${point.label}: ${point.findingCount} findings`}
                />
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
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
      <p className="text-sm leading-7 text-muted">
        Bar height tracks total findings per snapshot. Red bars indicate at least one
        high-severity finding.
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
    <div className="space-y-3">
      {workloads.length === 0 ? (
        <div className="rounded-[0.9rem] border border-border bg-panel-2 px-4 py-3 text-sm text-muted">
          No related workloads were resolved for this route.
        </div>
      ) : (
        workloads.map((workload) => (
          <article
            key={workload.name}
            className="rounded-[0.95rem] border border-border bg-panel-2 px-4 py-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-success" />
                  <h3 className="text-base font-semibold tracking-[-0.02em]">
                    {workload.name}
                  </h3>
                </div>
                <p className="mt-2 font-mono text-xs text-muted">{workload.image}</p>
              </div>
              <Badge label={workload.state} tone="success" />
            </div>
            <div className="mt-4 grid gap-2 text-sm leading-6 text-muted md:grid-cols-2">
              <div>Role: {workload.serviceName ?? workload.role}</div>
              <div>Network mode: {workload.networkMode}</div>
              <div>
                Published ports:{" "}
                {workload.publishedPorts.length > 0
                  ? workload.publishedPorts.join(", ")
                  : "none"}
              </div>
              <div>
                Exposed ports:{" "}
                {workload.exposedPorts.length > 0
                  ? workload.exposedPorts.join(", ")
                  : "none"}
              </div>
              <div>
                Compose project: {workload.composeProject ?? "not composed"}
              </div>
              <div>
                Docker socket: {workload.dockerSocketMount.replaceAll("_", " ")}
              </div>
            </div>
            {workload.composePath ? (
              <div className="mt-3 font-mono text-xs text-muted">
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
    <div className="space-y-3">
      {steps.map((step, index) => (
        <div key={`${step}-${index}`} className="flex items-stretch gap-4">
          <div className="flex w-6 shrink-0 flex-col items-center">
            <div className="mt-1 h-2.5 w-2.5 rounded-full border border-border bg-foreground/60" />
            {index < steps.length - 1 ? (
              <div className="mt-2 flex-1 border-l border-dashed border-border" />
            ) : null}
          </div>
          <div className="flex-1 rounded-[0.95rem] border border-border bg-panel-2 px-4 py-3 text-sm leading-7 text-foreground/92">
            {step}
          </div>
        </div>
      ))}
    </div>
  );
}
