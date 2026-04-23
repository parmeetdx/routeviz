import { ConsolePage } from "@/components/console-page";
import { OverviewStatusBoard } from "@/components/overview-status-board";
import { compactFindingNextCheck } from "@/lib/finding-copy";
import { getOpsLedgerState } from "@/lib/ops-ledger-server";
import { buildServiceExplorerModel } from "@/lib/service-explorer";
import type { Finding, RouteRecord } from "@/lib/ops-ledger-types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { snapshot, recentChanges } = await getOpsLedgerState();
  const model = buildServiceExplorerModel(snapshot, null);
  const findings = snapshot.findings;
  const trackedRouteCount = model.services.length;
  const criticalCount = findings.filter((finding) => finding.severity === "high").length;
  const expiredCertificateCount = findings.filter(
    (finding) => finding.type === "certificate_expired",
  ).length;
  const unmatchedTargetCount = findings.filter(
    (finding) => finding.type === "unmatched_target",
  ).length;
  const managementSurfaceCount = findings.filter((finding) =>
    ["management_surface", "docker_socket_write_mount"].includes(finding.type),
  ).length;
  const urgentServiceCount = model.services.filter((service) =>
    service.findings.some((finding) => finding.severity === "high"),
  ).length;
  const flaggedRouteCount = model.services.filter((service) => service.findings.length > 0).length;
  const cleanRouteCount = trackedRouteCount - flaggedRouteCount;
  const certificateSummary = buildCertificateSummary(snapshot.routes);
  const statusLine = [
    `${trackedRouteCount} tracked routes`,
    urgentServiceCount > 0
      ? `${urgentServiceCount} need attention now`
      : flaggedRouteCount > 0
        ? `${flaggedRouteCount} need review`
        : "all clear right now",
    certificateSummary,
  ]
    .filter(Boolean)
    .join(" · ");
  const scanSummary = `Scan completed ${model.lastSyncLabel} · ${cleanRouteCount} clean · ${flaggedRouteCount} flagged`;
  const urgentItems = model.services
    .filter((service) => service.findings.length > 0)
    .map((service) => {
      const topFinding = [...service.findings].sort(compareFindings)[0];

      return {
        id: `${service.id}-${topFinding.id}`,
        serviceLabel: service.label,
        secondaryLabel: service.secondaryLabel,
        findingType: topFinding.type,
        severity: topFinding.severity,
        evidence: topFinding.evidence,
        nextCheck: compactFindingNextCheck(topFinding.type),
        href: `${service.href}#service-detail`,
        sortFinding: topFinding,
      };
    })
    .sort((left, right) => compareFindings(left.sortFinding, right.sortFinding))
    .slice(0, 5)
    .map(({ sortFinding: _sortFinding, ...item }) => item);

  return (
    <ConsolePage
      eyebrow="Overview"
      title="Quick glance"
      description="Open the live queue that needs attention now."
      lastSyncLabel={model.lastSyncLabel}
      hideIntro
    >
      <OverviewStatusBoard
        statusLine={statusLine}
        scanSummary={scanSummary}
        criticalCount={criticalCount}
        expiredCertificateCount={expiredCertificateCount}
        unmatchedTargetCount={unmatchedTargetCount}
        managementSurfaceCount={managementSurfaceCount}
        urgentItems={urgentItems}
        recentChanges={recentChanges}
      />
    </ConsolePage>
  );
}

function buildCertificateSummary(routes: RouteRecord[]) {
  const expired = routes
    .map((route) => route.tlsDaysRemaining)
    .filter((value): value is number => typeof value === "number" && value < 0)
    .sort((left, right) => left - right);

  if (expired.length > 0) {
    const days = Math.abs(expired[0]);
    return `${expired.length} cert${expired.length === 1 ? "" : "s"} expired${expired.length === 1 ? ` ${days} day${days === 1 ? "" : "s"} ago` : ""}`;
  }

  const upcoming = routes
    .map((route) => route.tlsDaysRemaining)
    .filter((value): value is number => typeof value === "number" && value >= 0)
    .sort((left, right) => left - right)[0];

  if (typeof upcoming === "number" && upcoming <= 30) {
    return `1 cert expires in ${upcoming} day${upcoming === 1 ? "" : "s"}`;
  }

  return null;
}

function compareFindings(left: Finding, right: Finding) {
  return severityRank(left.severity) - severityRank(right.severity) || typeRank(left.type) - typeRank(right.type);
}

function severityRank(value: Finding["severity"]) {
  if (value === "high") {
    return 0;
  }

  if (value === "medium") {
    return 1;
  }

  return 2;
}

function typeRank(value: string) {
  switch (value) {
    case "unmatched_target":
      return 0;
    case "certificate_expired":
      return 1;
    case "docker_socket_write_mount":
      return 2;
    case "management_surface":
      return 3;
    case "off_host_target":
      return 4;
    case "ambiguous_target":
      return 5;
    case "shared_forward_target":
      return 6;
    default:
      return 10;
  }
}
