import Link from "next/link";

import { ConsoleCard, ConsolePage } from "@/components/console-page";
import {
  compactFindingHeadline,
  compactFindingNextCheck,
  compactFindingTypeLabel,
} from "@/lib/finding-copy";
import type { Finding } from "@/lib/ops-ledger-types";
import { getOpsLedgerState } from "@/lib/ops-ledger-server";
import { getFindingsBySeverity, getSeverityCounts } from "@/lib/ops-ledger.mjs";
import { buildServiceExplorerModel } from "@/lib/service-explorer";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  bucket?: string | string[] | undefined;
}>;

type BucketKey =
  | "all"
  | "critical"
  | "medium"
  | "low"
  | "certificate_expired"
  | "unmatched_target"
  | "management";

interface FindingBucket {
  key: BucketKey;
  label: string;
  href: string;
  matches: (finding: Finding) => boolean;
}

const findingBuckets: FindingBucket[] = [
  {
    key: "all",
    label: "ALL",
    href: "/findings",
    matches: () => true,
  },
  {
    key: "critical",
    label: "CRITICAL",
    href: "/findings?bucket=critical",
    matches: (finding) => finding.severity === "high",
  },
  {
    key: "medium",
    label: "MEDIUM",
    href: "/findings?bucket=medium",
    matches: (finding) => finding.severity === "medium",
  },
  {
    key: "low",
    label: "LOW",
    href: "/findings?bucket=low",
    matches: (finding) => finding.severity === "low",
  },
  {
    key: "certificate_expired",
    label: "CERT_EXP",
    href: "/findings?bucket=certificate_expired",
    matches: (finding) => finding.type === "certificate_expired",
  },
  {
    key: "unmatched_target",
    label: "BROKEN",
    href: "/findings?bucket=unmatched_target",
    matches: (finding) => finding.type === "unmatched_target",
  },
  {
    key: "management",
    label: "MGMT",
    href: "/findings?bucket=management",
    matches: (finding) =>
      ["management_surface", "docker_socket_write_mount"].includes(finding.type),
  },
];

function severityClasses(severity: string) {
  if (severity === "high") {
    return "border-danger/40 bg-danger/10 text-danger";
  }

  if (severity === "medium") {
    return "border-warning/40 bg-warning/10 text-warning";
  }

  return "border-accent/30 bg-accent/8 text-accent";
}

export default async function FindingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const resolvedSearchParams = await searchParams;
  const requestedBucket = Array.isArray(resolvedSearchParams.bucket)
    ? resolvedSearchParams.bucket[0]
    : resolvedSearchParams.bucket;
  const activeBucket =
    findingBuckets.find((bucket) => bucket.key === requestedBucket) ?? findingBuckets[0];

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

  const bucketCounts = new Map(
    findingBuckets.map((bucket) => [
      bucket.key,
      findings.filter((finding) => bucket.matches(finding)).length,
    ]),
  );

  const filteredFindings = findings.filter((finding) => activeBucket.matches(finding));
  const sections =
    activeBucket.key === "all"
      ? [
          {
            title: "CRITICAL",
            eyebrow: "HIGH SEVERITY",
            findings: findings.filter((finding) => finding.severity === "high"),
          },
          {
            title: "MEDIUM",
            eyebrow: "NEEDS REVIEW",
            findings: findings.filter((finding) => finding.severity === "medium"),
          },
          {
            title: "LOW",
            eyebrow: "WATCH LIST",
            findings: findings.filter((finding) => finding.severity === "low"),
          },
        ].filter((section) => section.findings.length > 0)
      : [
          {
            title: activeBucket.label,
            eyebrow: "FILTERED QUEUE",
            findings: filteredFindings,
          },
        ];

  return (
    <ConsolePage
      eyebrow="Findings"
      title="issue_board"
      description="Select a filter bucket → open the affected service route."
      lastSyncLabel={model.lastSyncLabel}
      compactIntro
      actions={
        <>
          <span className={`font-mono text-xs border px-2.5 py-1 ${severityClasses("high")}`}>
            {severityCounts.high} HIGH
          </span>
          <span className={`font-mono text-xs border px-2.5 py-1 ${severityClasses("medium")}`}>
            {severityCounts.medium} MED
          </span>
          <span className={`font-mono text-xs border px-2.5 py-1 ${severityClasses("low")}`}>
            {severityCounts.low} LOW
          </span>
        </>
      }
    >
      {/* ── Filter bucket bar ── */}
      <ConsoleCard title="Filter Queue" eyebrow="BUCKETS">
        <div className="flex flex-wrap gap-1.5">
          {findingBuckets.map((bucket) => {
            const active = bucket.key === activeBucket.key;
            const count = bucketCounts.get(bucket.key) ?? 0;

            return (
              <Link
                key={bucket.key}
                href={bucket.href}
                className={[
                  "inline-flex items-center gap-2 font-mono text-xs border px-3 py-1.5 transition",
                  active
                    ? "border-accent/50 bg-accent/12 text-accent"
                    : "border-border/60 bg-panel-2 text-muted/80 hover:border-accent/30 hover:text-foreground/80",
                ].join(" ")}
              >
                {active ? <span className="text-accent/60">&gt;</span> : null}
                <span>{bucket.label}</span>
                <span className="font-mono text-[0.6rem] border border-current/20 bg-black/20 px-1.5 py-0.5 tabular-nums">
                  {count}
                </span>
              </Link>
            );
          })}
        </div>
      </ConsoleCard>

      {/* ── Finding sections ── */}
      {sections.map((section) => (
        <ConsoleCard key={section.title} title={section.title} eyebrow={section.eyebrow}>
          {section.findings.length === 0 ? (
            <div className="border border-border/50 bg-panel-2 px-4 py-3 font-mono text-xs text-muted/70">
              <span className="text-accent/40 mr-1">✓</span>
              No findings active in this category.
            </div>
          ) : (
            <div className="border border-border/50">
              {/* Table column header */}
              <div className="hidden md:grid md:grid-cols-[2fr_1fr_auto] gap-x-4 border-b border-border/50 bg-panel-2 px-4 py-1.5">
                <div className="font-mono text-[0.58rem] uppercase tracking-[0.3em] text-muted/50">
                  SERVICE / TYPE / EVIDENCE
                </div>
                <div className="font-mono text-[0.58rem] uppercase tracking-[0.3em] text-muted/50">
                  HEADLINE
                </div>
                <div className="font-mono text-[0.58rem] uppercase tracking-[0.3em] text-muted/50 text-right pr-2">
                  ACTION
                </div>
              </div>
              <div className="divide-y divide-border/40">
                {section.findings.map((finding) => {
                  const meta = serviceMeta.get(finding.routeSlug);

                  return (
                    <FindingRow
                      key={finding.id}
                      type={finding.type}
                      severity={finding.severity}
                      evidence={finding.evidence}
                      href={`/routes?service=${finding.routeSlug}#service-detail`}
                      serviceLabel={meta?.label ?? finding.routeSlug}
                      secondaryLabel={meta?.secondaryLabel ?? finding.routeSlug}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </ConsoleCard>
      ))}
    </ConsolePage>
  );
}

function FindingRow({
  type,
  severity,
  evidence,
  href,
  serviceLabel,
  secondaryLabel,
}: {
  type: string;
  severity: string;
  evidence: string;
  href: string;
  serviceLabel: string;
  secondaryLabel: string;
}) {
  return (
    <article className="group px-4 py-3 hover:bg-panel-2/60 transition">
      <div className="flex flex-col gap-2 md:grid md:grid-cols-[2fr_1fr_auto] md:items-start md:gap-x-4">
        {/* Col 1: service + type + evidence */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* Severity indicator */}
            <span
              className={[
                "h-1.5 w-1.5 shrink-0 rounded-full",
                severity === "high" ? "bg-danger" : severity === "medium" ? "bg-warning" : "bg-accent",
              ].join(" ")}
            />
            <span className="font-mono text-sm font-bold text-foreground">{serviceLabel}</span>
            <span className={`font-mono text-[0.62rem] uppercase tracking-wider border px-2 py-0.5 leading-none ${severityClasses(severity)}`}>
              {compactFindingTypeLabel(type)}
            </span>
            <span className={`font-mono text-[0.6rem] uppercase tracking-wider border px-1.5 py-0.5 leading-none ${severityClasses(severity)}`}>
              {severity}
            </span>
          </div>
          <div className="mt-1 font-mono text-[0.65rem] text-muted/70 truncate">{secondaryLabel}</div>
          <div className="mt-1 font-mono text-xs text-foreground/70 line-clamp-1">{evidence}</div>
        </div>

        {/* Col 2: headline + next-check */}
        <div className="min-w-0">
          <div className="font-mono text-xs text-foreground/85">{compactFindingHeadline(type)}</div>
          <div className="mt-1 font-mono text-[0.62rem] uppercase tracking-wider text-muted/60">
            {compactFindingNextCheck(type)}
          </div>
        </div>

        {/* Col 3: action */}
        <div className="flex items-center">
          <Link
            href={href}
            className="font-mono text-xs border border-accent/30 bg-accent/8 px-3 py-1.5 text-accent transition hover:bg-accent/18 hover:border-accent/55 whitespace-nowrap"
            style={{ textShadow: "0 0 6px rgba(57,255,122,0.3)" }}
          >
            open→
          </Link>
        </div>
      </div>
    </article>
  );
}
