import Link from "next/link";
import type { ReactNode } from "react";

import { compactFindingTypeLabel } from "@/lib/finding-copy";
import type { FindingSeverity } from "@/lib/ops-ledger-types";

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
}

export function OverviewStatusBoard({
  statusLine,
  scanSummary,
  criticalCount,
  expiredCertificateCount,
  unmatchedTargetCount,
  managementSurfaceCount,
  urgentItems,
}: OverviewStatusBoardProps) {
  const statTiles = [
    {
      label: "Critical",
      value: String(criticalCount),
      note: "open critical queue",
      tone: criticalCount > 0 ? "danger" : "muted",
      href: "/findings?bucket=critical",
    },
    {
      label: "Expired certs",
      value: String(expiredCertificateCount),
      note: "open expired certs",
      tone: expiredCertificateCount > 0 ? "danger" : "muted",
      href: "/findings?bucket=certificate_expired",
    },
    {
      label: "Broken routes",
      value: String(unmatchedTargetCount),
      note: "open broken routes",
      tone: unmatchedTargetCount > 0 ? "warning" : "muted",
      href: "/findings?bucket=unmatched_target",
    },
    {
      label: "Mgmt surfaces",
      value: String(managementSurfaceCount),
      note: "open management surfaces",
      tone: managementSurfaceCount > 0 ? "warning" : "muted",
      href: "/findings?bucket=management",
    },
  ] as const;

  return (
    <section className="rounded-[1rem] border border-border bg-panel px-4 py-4 shadow-[0_18px_44px_rgba(0,0,0,0.18)] sm:px-5 sm:py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-mono text-[0.78rem] uppercase tracking-[0.2em] text-muted">
            Overview
          </div>
          <h2 className="mt-2 text-[1.12rem] font-semibold tracking-[-0.04em] text-balance sm:text-[1.38rem]">
            {statusLine}
          </h2>
          <p className="mt-2 text-sm text-muted">{scanSummary}</p>
        </div>
        <Link
          href="/findings"
          className="inline-flex items-center rounded-full border border-border bg-panel-2 px-3 py-2 text-sm text-muted transition hover:border-accent/28 hover:text-foreground"
        >
          Open all findings
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {statTiles.map((tile) => (
          <OverviewStatTile key={tile.label} {...tile} />
        ))}
      </div>

      <div className="mt-4 text-xs text-muted sm:text-sm">
        Tiles open the live queue, then each item drills into its service path.
      </div>

      <div className="mt-5 rounded-[0.95rem] border border-border bg-panel-2">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <div className="text-sm font-medium text-foreground">Needs attention now</div>
            <div className="mt-1 text-xs text-muted">
              Top issues from the current snapshot.
            </div>
          </div>
          <Link
            href="/findings?bucket=critical"
            className="inline-flex items-center rounded-full border border-danger/25 bg-danger/10 px-3 py-1.5 text-xs text-danger transition hover:border-danger/40"
          >
            Open critical queue
          </Link>
        </div>

        {urgentItems.length > 0 ? (
          <div className="divide-y divide-border">
            {urgentItems.map((item) => (
              <UrgentItemRow key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="px-4 py-4 text-sm text-muted">No urgent findings are active right now.</div>
        )}
      </div>
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
      className="rounded-[0.95rem] border border-border bg-panel-2 px-4 py-3 transition hover:border-accent/28 hover:bg-[#1c232c] sm:py-4"
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-[0.75rem] text-sm font-semibold sm:h-11 sm:w-11",
            tone === "danger" && "bg-danger/16 text-danger",
            tone === "warning" && "bg-warning/16 text-warning",
            tone === "muted" && "bg-[#1a2129] text-[#95a2b3]",
          )}
        >
          {value}
        </span>
        <div>
          <div className="text-[0.98rem] font-medium text-foreground sm:text-base">
            {label}
          </div>
          <div className="mt-1 text-xs text-muted sm:text-sm">{note}</div>
        </div>
      </div>
    </Link>
  );
}

function UrgentItemRow({ item }: { item: OverviewUrgentItem }) {
  return (
    <Link
      href={item.href}
      className="block px-4 py-3 transition hover:bg-[#1b222b]"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{item.serviceLabel}</span>
            <SeverityBadge severity={item.severity}>
              {compactFindingTypeLabel(item.findingType)}
            </SeverityBadge>
            <span className="text-xs text-muted">{item.secondaryLabel}</span>
          </div>
          <div className="mt-2 text-sm text-foreground/92">{truncate(item.evidence, 96)}</div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-border/80 bg-[#111820] px-3 py-1.5 text-xs text-muted">
            {item.nextCheck}
          </span>
          <span className="text-sm text-accent">Open</span>
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
        "inline-flex rounded-[0.45rem] border px-2.5 py-1 text-xs leading-none",
        severity === "high" && "border-danger/25 bg-danger/14 text-danger",
        severity === "medium" && "border-warning/25 bg-warning/14 text-warning",
        severity === "low" && "border-accent/25 bg-accent/16 text-accent",
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
