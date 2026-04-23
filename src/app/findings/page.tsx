import Link from "next/link";

import { ConsoleCard, ConsolePage } from "@/components/console-page";
import {
  compactFindingHeadline,
  compactFindingNextCheck,
  compactFindingTypeLabel,
} from "@/lib/finding-copy";
import { getOpsLedgerState } from "@/lib/ops-ledger-server";
import { getFindingsBySeverity, getSeverityCounts } from "@/lib/ops-ledger.mjs";
import { buildServiceExplorerModel } from "@/lib/service-explorer";

export const dynamic = "force-dynamic";

function severityTone(severity: string) {
  if (severity === "high") {
    return "border-danger/25 bg-danger/14 text-danger";
  }

  if (severity === "medium") {
    return "border-warning/25 bg-warning/14 text-warning";
  }

  return "border-accent/25 bg-accent/14 text-accent";
}

export default async function FindingsPage() {
  const { snapshot } = await getOpsLedgerState();
  const findings = getFindingsBySeverity(snapshot);
  const severityCounts = getSeverityCounts(findings);
  const model = buildServiceExplorerModel(snapshot, null);
  const serviceMeta = new Map(
    model.services.map((service) => [
      service.id,
      {
        label: service.label,
        secondaryLabel: service.secondaryLabel,
      },
    ]),
  );
  const criticalFindings = findings.filter((finding) => finding.severity === "high");
  const watchlistFindings = findings.filter((finding) => finding.severity !== "high");

  return (
    <ConsolePage
      eyebrow="Findings"
      title="Active findings"
      description="High severity first."
      lastSyncLabel={model.lastSyncLabel}
      compactIntro
      actions={
        <>
          <span className="rounded-[0.45rem] border border-danger/25 bg-danger/14 px-3 py-1.5 text-xs text-danger sm:text-sm">
            {severityCounts.high} high
          </span>
          <span className="rounded-[0.45rem] border border-warning/25 bg-warning/14 px-3 py-1.5 text-xs text-warning sm:text-sm">
            {severityCounts.medium} medium
          </span>
          <span className="rounded-[0.45rem] border border-accent/25 bg-accent/14 px-3 py-1.5 text-xs text-accent sm:text-sm">
            {severityCounts.low} low
          </span>
        </>
      }
    >
      {criticalFindings.length > 0 ? (
        <ConsoleCard title="Critical queue" eyebrow="Act now">
          <div className="space-y-3">
            {criticalFindings.map((finding) => {
              const meta = serviceMeta.get(finding.routeSlug);

              return (
                <FindingRow
                  key={finding.id}
                  type={finding.type}
                  severity={finding.severity}
                  evidence={finding.evidence}
                  nextCheck={finding.nextCheck}
                  href={`/?service=${finding.routeSlug}#service-detail`}
                  serviceLabel={meta?.label ?? finding.routeSlug}
                  secondaryLabel={meta?.secondaryLabel ?? finding.routeSlug}
                />
              );
            })}
          </div>
        </ConsoleCard>
      ) : null}

      <ConsoleCard title="Watch list" eyebrow="Medium and low">
        <div className="space-y-3">
          {watchlistFindings.length === 0 ? (
            <div className="rounded-[0.85rem] border border-border bg-panel-2 px-4 py-4 text-sm text-muted">
              No medium or low severity findings are active in the current snapshot.
            </div>
          ) : (
            watchlistFindings.map((finding) => {
              const meta = serviceMeta.get(finding.routeSlug);

              return (
                <FindingRow
                  key={finding.id}
                  type={finding.type}
                  severity={finding.severity}
                  evidence={finding.evidence}
                  nextCheck={finding.nextCheck}
                  href={`/?service=${finding.routeSlug}#service-detail`}
                  serviceLabel={meta?.label ?? finding.routeSlug}
                  secondaryLabel={meta?.secondaryLabel ?? finding.routeSlug}
                />
              );
            })
          )}
        </div>
      </ConsoleCard>
    </ConsolePage>
  );
}

function FindingRow({
  type,
  severity,
  evidence,
  nextCheck,
  href,
  serviceLabel,
  secondaryLabel,
}: {
  type: string;
  severity: string;
  evidence: string;
  nextCheck: string;
  href: string;
  serviceLabel: string;
  secondaryLabel: string;
}) {
  return (
    <article className="rounded-[0.85rem] border border-border bg-panel-2 px-4 py-3.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-medium text-foreground/92">{serviceLabel}</div>
            <span
              className={`rounded-[0.45rem] border px-2.5 py-1 text-xs ${severityTone(severity)}`}
            >
              {compactFindingTypeLabel(type)}
            </span>
          </div>
          <div className="mt-1 break-all text-xs text-muted">{secondaryLabel}</div>
          <h3 className="mt-3 break-words text-base font-semibold tracking-[-0.02em]">
            {compactFindingHeadline(type)}
          </h3>
          <p className="mt-1 line-clamp-1 text-sm leading-6 text-muted sm:line-clamp-2">
            {evidence}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
          <span
            className={`rounded-[0.45rem] border px-2.5 py-1 text-xs ${severityTone(severity)}`}
          >
            {severity}
          </span>
          <Link
            href={href}
            className="inline-flex items-center rounded-full border border-accent/22 bg-accent/12 px-3 py-1.5 text-sm text-accent transition hover:bg-accent/18"
          >
            Open
          </Link>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-[0.16em] text-muted">Next</span>
        <span className="text-sm text-foreground/92">
          {compactFindingNextCheck(type) || nextCheck}
        </span>
      </div>
    </article>
  );
}
