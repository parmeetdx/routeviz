import Link from "next/link";

import { ConsoleCard, ConsolePage } from "@/components/console-page";
import { SuppressButton } from "@/components/suppress-button";
import {
  compactFindingHeadline,
  compactFindingNextCheck,
  compactFindingTypeLabel,
} from "@/lib/finding-copy";
import type { Finding, WorkloadFinding } from "@/lib/ops-ledger-types";
import { getOpsLedgerState, getSuppressedFindings, suppressionKey } from "@/lib/ops-ledger-server";
import { getFindingsBySeverity, getSeverityCounts } from "@/lib/ops-ledger.mjs";
import { buildServiceExplorerModel } from "@/lib/service-explorer";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  bucket?: string | string[] | undefined;
  showSuppressed?: string;
}>;

type BucketKey =
  | "all"
  | "critical"
  | "medium"
  | "low"
  | "certificate_expired"
  | "unmatched_target"
  | "management"
  | "exposure"
  | "storage";

interface FindingBucket {
  key: BucketKey;
  label: string;
  href: string;
  matches: (finding: Finding) => boolean;
  workloadMatches?: (finding: WorkloadFinding) => boolean;
}

const findingBuckets: FindingBucket[] = [
  {
    key: "all",
    label: "ALL",
    href: "/findings",
    matches: () => true,
    workloadMatches: () => true,
  },
  {
    key: "critical",
    label: "CRITICAL",
    href: "/findings?bucket=critical",
    matches: (finding) => finding.severity === "high",
    workloadMatches: (finding) => finding.severity === "high",
  },
  {
    key: "medium",
    label: "MEDIUM",
    href: "/findings?bucket=medium",
    matches: (finding) => finding.severity === "medium",
    workloadMatches: (finding) => finding.severity === "medium",
  },
  {
    key: "low",
    label: "LOW",
    href: "/findings?bucket=low",
    matches: (finding) => finding.severity === "low",
    workloadMatches: (finding) => finding.severity === "low",
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
      ["management_surface", "docker_socket_write_mount", "no_auth_layer"].includes(finding.type),
  },
  {
    key: "exposure",
    label: "CONTAINERS",
    href: "/findings?bucket=exposure",
    matches: () => false,
    workloadMatches: (finding) =>
      ["port_bypass", "image_latest", "image_stale"].includes(finding.type),
  },
  {
    key: "storage",
    label: "STORAGE",
    href: "/findings?bucket=storage",
    matches: () => false,
    workloadMatches: (finding) => finding.type === "no_backup",
  },
];

function severityClasses(severity: string) {
  if (severity === "high") return "border-danger/40 bg-danger/10 text-danger";
  if (severity === "medium") return "border-warning/40 bg-warning/10 text-warning";
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

  const [{ snapshot }, suppressedKeys] = await Promise.all([
    getOpsLedgerState(),
    getSuppressedFindings(),
  ]);

  const suppressedSet = new Set(suppressedKeys);

  const findings = (getFindingsBySeverity(snapshot) as Finding[]).filter(
    (f) => !suppressedSet.has(suppressionKey(f.type, f.routeSlug)),
  );
  const workloadFindings: WorkloadFinding[] = (snapshot.workloadFindings ?? []).filter(
    (f) => !suppressedSet.has(suppressionKey(f.type, f.workloadName)),
  );
  const severityCounts = getSeverityCounts(findings);
  const model = buildServiceExplorerModel(snapshot, null);
  const serviceMeta = new Map(
    model.services.map((service) => [
      service.id,
      { label: service.label, secondaryLabel: service.secondaryLabel },
    ]),
  );

  const bucketCounts = new Map(
    findingBuckets.map((bucket) => [
      bucket.key,
      findings.filter((f) => bucket.matches(f)).length +
        workloadFindings.filter((f) => bucket.workloadMatches?.(f) ?? false).length,
    ]),
  );

  const filteredFindings = findings.filter((finding) => activeBucket.matches(finding));
  const filteredWorkloadFindings = workloadFindings.filter(
    (finding) => activeBucket.workloadMatches?.(finding) ?? false,
  );

  const sections =
    activeBucket.key === "all"
      ? [
          {
            title: "CRITICAL",
            eyebrow: "HIGH SEVERITY",
            findings: findings.filter((f) => f.severity === "high"),
            workloadFindings: workloadFindings.filter((f) => f.severity === "high"),
          },
          {
            title: "MEDIUM",
            eyebrow: "NEEDS REVIEW",
            findings: findings.filter((f) => f.severity === "medium"),
            workloadFindings: workloadFindings.filter((f) => f.severity === "medium"),
          },
          {
            title: "LOW",
            eyebrow: "WATCH LIST",
            findings: findings.filter((f) => f.severity === "low"),
            workloadFindings: workloadFindings.filter((f) => f.severity === "low"),
          },
        ].filter((s) => s.findings.length > 0 || s.workloadFindings.length > 0)
      : [
          {
            title: activeBucket.label,
            eyebrow: "FILTERED QUEUE",
            findings: filteredFindings,
            workloadFindings: filteredWorkloadFindings,
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
          {suppressedKeys.length > 0 && (
            <Link
              href="/setup#suppressions"
              className="font-mono text-xs border border-muted/25 bg-muted/5 px-2.5 py-1 text-muted/60 hover:text-muted/90 transition"
            >
              {suppressedKeys.length} suppressed
            </Link>
          )}
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
          {section.findings.length === 0 && section.workloadFindings.length === 0 ? (
            <div className="border border-border/50 bg-panel-2 px-4 py-3 font-mono text-xs text-muted/70">
              <span className="text-accent/40 mr-1">✓</span>
              No findings active in this category.
            </div>
          ) : (
            <div className="border border-border/50">
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
                      suppressKey={suppressionKey(finding.type, finding.routeSlug)}
                    />
                  );
                })}
                {section.workloadFindings.map((finding) => (
                  <WorkloadFindingRow
                    key={finding.id}
                    type={finding.type}
                    severity={finding.severity}
                    evidence={finding.evidence}
                    workloadName={finding.workloadName}
                    nextCheck={finding.nextCheck}
                    suppressKey={suppressionKey(finding.type, finding.workloadName)}
                  />
                ))}
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
  suppressKey,
}: {
  type: string;
  severity: string;
  evidence: string;
  href: string;
  serviceLabel: string;
  secondaryLabel: string;
  suppressKey: string;
}) {
  return (
    <article className="group px-4 py-3 hover:bg-panel-2/60 transition">
      <div className="flex flex-col gap-2 md:grid md:grid-cols-[2fr_1fr_auto] md:items-start md:gap-x-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
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
          <div className="mt-1 font-mono text-xs text-foreground/70">{evidence}</div>
        </div>
        <div className="min-w-0">
          <div className="font-mono text-xs text-foreground/85">{compactFindingHeadline(type)}</div>
          <div className="mt-1 font-mono text-[0.62rem] uppercase tracking-wider text-muted/60">
            {compactFindingNextCheck(type)}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Link
            href={href}
            className="font-mono text-xs border border-accent/30 bg-accent/8 px-3 py-1.5 text-accent transition hover:bg-accent/18 hover:border-accent/55 whitespace-nowrap"
            style={{ textShadow: "0 0 6px rgba(57,255,122,0.3)" }}
          >
            open→
          </Link>
          <SuppressButton suppressKey={suppressKey} />
        </div>
      </div>
    </article>
  );
}

function WorkloadFindingRow({
  type,
  severity,
  evidence,
  workloadName,
  nextCheck,
  suppressKey,
}: {
  type: string;
  severity: string;
  evidence: string;
  workloadName: string;
  nextCheck: string;
  suppressKey: string;
}) {
  return (
    <article className="group px-4 py-3 hover:bg-panel-2/60 transition">
      <div className="flex flex-col gap-2 md:grid md:grid-cols-[2fr_1fr_auto] md:items-start md:gap-x-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={[
                "h-1.5 w-1.5 shrink-0 rounded-full",
                severity === "high" ? "bg-danger" : severity === "medium" ? "bg-warning" : "bg-accent",
              ].join(" ")}
            />
            <span className="font-mono text-sm font-bold text-foreground">{workloadName}</span>
            <span className={`font-mono text-[0.62rem] uppercase tracking-wider border px-2 py-0.5 leading-none ${severityClasses(severity)}`}>
              {compactFindingTypeLabel(type)}
            </span>
            <span className={`font-mono text-[0.6rem] uppercase tracking-wider border px-1.5 py-0.5 leading-none ${severityClasses(severity)}`}>
              {severity}
            </span>
            <span className="font-mono text-[0.58rem] uppercase tracking-wider border border-muted/20 bg-muted/5 px-1.5 py-0.5 leading-none text-muted/50">
              container
            </span>
          </div>
          <div className="mt-1 font-mono text-xs text-foreground/70">{evidence}</div>
        </div>
        <div className="min-w-0">
          <div className="font-mono text-xs text-foreground/85">{compactFindingHeadline(type)}</div>
          <div className="mt-1 font-mono text-[0.62rem] uppercase tracking-wider text-muted/60">
            {nextCheck}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="font-mono text-xs border border-border/30 bg-panel-2 px-3 py-1.5 text-muted/40 whitespace-nowrap">
            no route
          </span>
          <SuppressButton suppressKey={suppressKey} />
        </div>
      </div>
    </article>
  );
}
