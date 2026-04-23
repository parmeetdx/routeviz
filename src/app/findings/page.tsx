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
    label: "All",
    href: "/findings",
    matches: () => true,
  },
  {
    key: "critical",
    label: "Critical",
    href: "/findings?bucket=critical",
    matches: (finding) => finding.severity === "high",
  },
  {
    key: "medium",
    label: "Medium",
    href: "/findings?bucket=medium",
    matches: (finding) => finding.severity === "medium",
  },
  {
    key: "low",
    label: "Low",
    href: "/findings?bucket=low",
    matches: (finding) => finding.severity === "low",
  },
  {
    key: "certificate_expired",
    label: "Expired certs",
    href: "/findings?bucket=certificate_expired",
    matches: (finding) => finding.type === "certificate_expired",
  },
  {
    key: "unmatched_target",
    label: "Broken routes",
    href: "/findings?bucket=unmatched_target",
    matches: (finding) => finding.type === "unmatched_target",
  },
  {
    key: "management",
    label: "Mgmt surfaces",
    href: "/findings?bucket=management",
    matches: (finding) =>
      ["management_surface", "docker_socket_write_mount"].includes(finding.type),
  },
];

function severityTone(severity: string) {
  if (severity === "high") {
    return "border-danger/25 bg-danger/14 text-danger";
  }

  if (severity === "medium") {
    return "border-warning/25 bg-warning/14 text-warning";
  }

  return "border-accent/25 bg-accent/14 text-accent";
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
            title: "Critical",
            eyebrow: "High severity",
            findings: findings.filter((finding) => finding.severity === "high"),
          },
          {
            title: "Medium",
            eyebrow: "Needs review",
            findings: findings.filter((finding) => finding.severity === "medium"),
          },
          {
            title: "Low",
            eyebrow: "Watch list",
            findings: findings.filter((finding) => finding.severity === "low"),
          },
        ].filter((section) => section.findings.length > 0)
      : [
          {
            title: activeBucket.label,
            eyebrow: "Filtered queue",
            findings: filteredFindings,
          },
        ];

  return (
    <ConsolePage
      eyebrow="Findings"
      title="Issue board"
      description="Choose a category, then open the affected service."
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
      <ConsoleCard title="Browse by category" eyebrow="Quick filters">
        <div className="flex flex-wrap gap-2">
          {findingBuckets.map((bucket) => {
            const active = bucket.key === activeBucket.key;

            return (
              <Link
                key={bucket.key}
                href={bucket.href}
                className={
                  active
                    ? "inline-flex items-center gap-2 rounded-full border border-accent/28 bg-accent/14 px-3 py-2 text-sm text-foreground"
                    : "inline-flex items-center gap-2 rounded-full border border-border bg-panel-2 px-3 py-2 text-sm text-muted transition hover:border-accent/28 hover:text-foreground"
                }
              >
                <span>{bucket.label}</span>
                <span className="rounded-full bg-[#111820] px-2 py-0.5 text-xs text-muted">
                  {bucketCounts.get(bucket.key) ?? 0}
                </span>
              </Link>
            );
          })}
        </div>
      </ConsoleCard>

      {sections.map((section) => (
        <ConsoleCard key={section.title} title={section.title} eyebrow={section.eyebrow}>
          {section.findings.length === 0 ? (
            <div className="rounded-[0.85rem] border border-border bg-panel-2 px-4 py-4 text-sm text-muted">
              No findings are active in this category.
            </div>
          ) : (
            <div className="space-y-2.5">
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
    <article className="rounded-[0.8rem] border border-border bg-panel-2 px-4 py-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-foreground">{serviceLabel}</div>
            <span
              className={`rounded-[0.45rem] border px-2.5 py-1 text-xs ${severityTone(severity)}`}
            >
              {compactFindingTypeLabel(type)}
            </span>
            <span className="rounded-[0.45rem] border border-border bg-[#111820] px-2.5 py-1 text-xs text-muted">
              {severity}
            </span>
          </div>
          <div className="mt-1 truncate text-xs text-muted">{secondaryLabel}</div>
          <div className="mt-2 text-sm text-foreground/92">
            {compactFindingHeadline(type)}
          </div>
          <div className="mt-1 line-clamp-1 text-sm text-muted">{evidence}</div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs uppercase tracking-[0.16em] text-muted">
            {compactFindingNextCheck(type)}
          </span>
          <Link
            href={href}
            className="inline-flex items-center rounded-full border border-accent/22 bg-accent/12 px-3 py-1.5 text-sm text-accent transition hover:bg-accent/18"
          >
            Open service
          </Link>
        </div>
      </div>
    </article>
  );
}
