import Link from "next/link";
import type { ReactNode } from "react";

import { compactFindingTypeLabel } from "@/lib/finding-copy";
import type { FindingSeverity, SnapshotChange } from "@/lib/ops-ledger-types";

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export interface OverviewUrgentItem {
  id: string;
  serviceLabel: string;
  secondaryLabel: string;
  findingType: string;
  severity: FindingSeverity;
  evidence: string;
  nextCheck: string;
  href: string;
}

export interface OverviewStatusBoardProps {
  statusLine: string;
  scanSummary: string;
  criticalCount: number;
  expiredCertificateCount: number;
  unmatchedTargetCount: number;
  managementSurfaceCount: number;
  urgentItems: OverviewUrgentItem[];
  recentChanges: SnapshotChange[];
}

export function OverviewStatusBoard({
  statusLine,
  scanSummary,
  criticalCount,
  expiredCertificateCount,
  unmatchedTargetCount,
  managementSurfaceCount,
  urgentItems,
  recentChanges,
}: OverviewStatusBoardProps) {
  const statTiles = [
    {
      label: "CRITICAL",
      value: String(criticalCount),
      note: "open critical queue",
      tone: criticalCount > 0 ? "danger" : "muted",
      href: "/findings?bucket=critical",
    },
    {
      label: "CERT_EXP",
      value: String(expiredCertificateCount),
      note: "open expired certs",
      tone: expiredCertificateCount > 0 ? "danger" : "muted",
      href: "/findings?bucket=certificate_expired",
    },
    {
      label: "BROKEN",
      value: String(unmatchedTargetCount),
      note: "open broken routes",
      tone: unmatchedTargetCount > 0 ? "warning" : "muted",
      href: "/findings?bucket=unmatched_target",
    },
    {
      label: "MGMT_SRF",
      value: String(managementSurfaceCount),
      note: "open management surfaces",
      tone: managementSurfaceCount > 0 ? "warning" : "muted",
      href: "/findings?bucket=management",
    },
  ] as const;

  return (
    <section className="border border-border bg-panel shadow-[0_0_40px_rgba(57,255,122,0.04)]">
      {/* ── Board header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
        <div>
          <div className="flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-[0.3em] text-muted/70 mb-2">
            <span className="text-accent/50">##</span>
            <span>SYSTEM OVERVIEW</span>
            <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          </div>
          <h2 className="font-mono text-base font-bold text-foreground tracking-tight sm:text-lg"
            style={{ textShadow: "0 0 16px rgba(57,255,122,0.2)" }}>
            {statusLine}
          </h2>
          <p className="mt-1 font-mono text-xs text-muted">{scanSummary}</p>
        </div>
        <Link
          href="/findings"
          className="font-mono text-xs border border-accent/25 bg-accent/8 px-3 py-1.5 text-accent transition hover:bg-accent/15 hover:border-accent/50"
          style={{ textShadow: "0 0 6px rgba(57,255,122,0.35)" }}
        >
          [view all findings]
        </Link>
      </div>

      {/* ── Stat tiles ── */}
      <div className="grid grid-cols-2 gap-px bg-border/40 xl:grid-cols-4">
        {statTiles.map((tile) => (
          <OverviewStatTile key={tile.label} {...tile} />
        ))}
      </div>

      {/* ── Hint text ── */}
      <div className="border-t border-b border-border/50 px-4 py-2 font-mono text-[0.65rem] text-muted/60 sm:px-5">
        <span className="text-accent/30 mr-1">$</span>
        Tiles drill into the live queue → each item traces its service path.
      </div>

      {/* ── Needs attention table ── */}
      <div>
        {/* Distinct table header */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-panel-2 px-4 py-2.5 sm:px-5">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[0.65rem] text-accent/60">▸</span>
            <div>
              <div className="font-mono text-xs font-bold text-foreground tracking-widest uppercase">
                NEEDS ATTENTION
              </div>
              <div className="font-mono text-[0.62rem] text-muted/70 mt-0.5">
                Top issues · current snapshot
              </div>
            </div>
          </div>
          <Link
            href="/findings?bucket=critical"
            className={cn(
              "font-mono text-xs border px-3 py-1.5 transition",
              criticalCount > 0
                ? "border-danger/40 bg-danger/10 text-danger glow-pulse-danger hover:bg-danger/18"
                : "border-border/60 bg-panel text-muted hover:border-border",
            )}
          >
            {criticalCount > 0 ? `[${criticalCount} critical]` : "[open queue]"}
          </Link>
        </div>

        {/* Column header row */}
        {urgentItems.length > 0 ? (
          <>
            <div className="hidden md:grid md:grid-cols-[1fr_auto] border-b border-border/40 bg-panel-2/60 px-4 py-1.5 sm:px-5">
              <div className="font-mono text-[0.6rem] uppercase tracking-[0.28em] text-muted/50">
                SERVICE / FINDING / EVIDENCE
              </div>
              <div className="font-mono text-[0.6rem] uppercase tracking-[0.28em] text-muted/50 text-right pr-16">
                NEXT CHECK
              </div>
            </div>
            <div className="divide-y divide-border/40">
              {urgentItems.map((item) => (
                <UrgentItemRow key={item.id} item={item} />
              ))}
            </div>
          </>
        ) : (
          <div className="px-4 py-4 font-mono text-xs text-muted/70">
            <span className="text-accent/40 mr-1">✓</span>
            No urgent findings active in current snapshot.
          </div>
        )}
      </div>

      {/* ── Recent changes ── */}
      {recentChanges.length > 0 && (
        <div className="border border-border/40 bg-panel">
          <div className="flex items-center justify-between border-b border-border/40 bg-panel-2/60 px-4 py-2 sm:px-5">
            <span className="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted/70">
              ▸ RECENT_CHANGES
            </span>
            <span className="font-mono text-[0.6rem] text-muted/40">
              since last scan
            </span>
          </div>
          <div className="divide-y divide-border/30">
            {recentChanges.slice(0, 8).map((ch) => (
              <Link
                key={ch.id}
                href={`/routes/${ch.routeSlug}`}
                className="flex items-start gap-3 px-4 py-2.5 transition hover:bg-panel-2 sm:px-5"
              >
                <span className={cn(
                  "mt-0.5 shrink-0 font-mono text-[0.6rem] uppercase tracking-wider px-1.5 py-0.5 border",
                  ch.severity === "high"
                    ? "border-danger/40 text-danger bg-danger/10"
                    : ch.severity === "medium"
                      ? "border-warning/40 text-warning bg-warning/10"
                      : "border-accent/30 text-accent/70 bg-accent/5",
                )}>
                  {ch.severity === "high" ? "HIGH" : ch.severity === "medium" ? "MED" : "LOW"}
                </span>
                <span className="font-mono text-xs text-foreground/80 leading-relaxed">
                  {ch.description}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function OverviewStatTile({
  label,
  value,
  note,
  tone,
  href,
}: {
  label: string;
  value: string;
  note: string;
  tone: "danger" | "warning" | "muted";
  href: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3 bg-panel px-4 py-3 transition hover:bg-panel-2 sm:py-4",
        tone === "danger" && "hover:shadow-[inset_0_0_0_1px_rgba(255,59,59,0.35)]",
        tone === "warning" && "hover:shadow-[inset_0_0_0_1px_rgba(255,184,0,0.35)]",
        tone === "muted" && "hover:shadow-[inset_0_0_0_1px_rgba(57,255,122,0.12)]",
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center font-mono text-base font-bold border",
          tone === "danger" && "border-danger/40 bg-danger/12 text-danger",
          tone === "warning" && "border-warning/40 bg-warning/12 text-warning",
          tone === "muted" && "border-border bg-panel-2 text-muted/60",
        )}
        style={
          tone === "danger" && value !== "0"
            ? { boxShadow: "0 0 10px rgba(255,59,59,0.3)" }
            : tone === "warning" && value !== "0"
              ? { boxShadow: "0 0 10px rgba(255,184,0,0.25)" }
              : undefined
        }
      >
        {value}
      </span>
      <div className="min-w-0">
        <div className="font-mono text-[0.7rem] font-bold uppercase tracking-widest text-foreground/80 truncate">
          {label}
        </div>
        <div className="font-mono text-[0.62rem] text-muted/70 truncate">{note}</div>
      </div>
    </Link>
  );
}

function UrgentItemRow({ item }: { item: OverviewUrgentItem }) {
  return (
    <Link
      href={item.href}
      className="group block px-4 py-3 transition hover:bg-panel-2/70 sm:px-5"
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* Severity dot */}
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                item.severity === "high" && "bg-danger",
                item.severity === "medium" && "bg-warning",
                item.severity === "low" && "bg-accent",
              )}
            />
            <span className="font-mono text-sm font-bold text-foreground">{item.serviceLabel}</span>
            <SeverityBadge severity={item.severity}>
              {compactFindingTypeLabel(item.findingType)}
            </SeverityBadge>
            <span className="font-mono text-[0.65rem] text-muted/70">{item.secondaryLabel}</span>
          </div>
          <div className="mt-1.5 font-mono text-xs text-foreground/75 leading-5">
            {truncate(item.evidence, 100)}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 md:gap-2">
          <span className="font-mono text-[0.65rem] uppercase tracking-wider text-muted/60">
            {item.nextCheck}
          </span>
          <span
            className="font-mono text-xs text-accent group-hover:underline"
            style={{ textShadow: "0 0 6px rgba(57,255,122,0.3)" }}
          >
            open→
          </span>
        </div>
      </div>
    </Link>
  );
}

function SeverityBadge({
  severity,
  children,
}: {
  severity: FindingSeverity;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex border font-mono px-2 py-0.5 text-[0.62rem] uppercase tracking-wider leading-none",
        severity === "high" && "border-danger/40 bg-danger/12 text-danger",
        severity === "medium" && "border-warning/40 bg-warning/12 text-warning",
        severity === "low" && "border-accent/30 bg-accent/10 text-accent",
      )}
    >
      {children}
    </span>
  );
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
