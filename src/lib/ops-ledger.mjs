function formatTimestampLabel(iso) {
  const date = new Date(iso);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function getDnsBaselineHelper(dnsBaseline) {
  if (dnsBaseline.mode === "disabled") {
    return "DNS mismatch checks are off. Ops Ledger records answers but does not enforce a baseline.";
  }

  if (dnsBaseline.mode === "reference_hostname") {
    return `DNS mismatch checks compare each route answer against ${dnsBaseline.value}.`;
  }

  return `DNS mismatch checks compare each route answer against the expected endpoint ${dnsBaseline.value}.`;
}

export function createFallbackSnapshot(settings, message = "Waiting for the first successful scan.") {
  const generatedAt = new Date().toISOString();

  return {
    id: "fallback",
    generatedAt,
    generatedLabel: formatTimestampLabel(generatedAt),
    hostLabel: settings.hostLabel,
    hostAddress: settings.hostAddress ?? "unknown-host",
    dnsBaseline: {
      mode: settings.dnsBaseline.mode,
      value: settings.dnsBaseline.value,
      helper: getDnsBaselineHelper(settings.dnsBaseline),
    },
    scanConfig: {
      manualEnabled: true,
      intervalEnabled: settings.scanConfig.intervalEnabled,
      intervalMinutes: settings.scanConfig.intervalMinutes,
      retentionLimit: settings.scanConfig.retentionLimit,
      lastCompletedAt: null,
      nextScheduledAt: null,
    },
    connectors: [
      {
        id: "docker",
        label: "Docker socket",
        kind: "runtime",
        status: "disconnected",
        requiresAction: true,
        hint: message,
        details: `Expected read access to ${settings.dockerSocketPath}.`,
      },
      {
        id: "npm",
        label: "Nginx Proxy Manager",
        kind: "reverse_proxy",
        status: "degraded",
        requiresAction: true,
        hint: "No route snapshot is available yet.",
        details: `Expected a readable SQLite file at ${settings.npmSqlitePath}.`,
      },
      {
        id: "dns",
        label: "DNS lookups",
        kind: "network",
        status: "degraded",
        requiresAction: true,
        hint: "DNS checks start after the first successful route scan.",
        details: "Route lookups and baseline comparisons are recorded with each snapshot.",
      },
    ],
    workloads: [],
    routes: [],
    findings: [],
    changes: [],
  };
}

export function getOverviewStats(snapshot) {
  const publicEntrypoints = snapshot.routes.length;
  const matchedRoutes = snapshot.routes.filter(
    (route) => route.matchState === "matched" && route.confidence === "high",
  ).length;
  const unresolvedRoutes = snapshot.routes.filter((route) => {
    return route.matchState !== "matched" || route.confidence !== "high";
  }).length;
  const expiringCertificates = snapshot.routes.filter((route) => {
    return (
      typeof route.tlsDaysRemaining === "number" && route.tlsDaysRemaining <= 30
    );
  }).length;
  const connectorWarnings = snapshot.connectors.filter(
    (connector) => connector.requiresAction,
  ).length;

  return {
    publicEntrypoints,
    matchedRoutes,
    unresolvedRoutes,
    expiringCertificates,
    connectorWarnings,
  };
}

export function getRouteDetailBySlug(snapshot, slug) {
  const route = snapshot.routes.find((item) => item.slug === slug);

  if (!route) {
    return null;
  }

  return {
    route,
    findings: snapshot.findings.filter((finding) => finding.routeSlug === slug),
  };
}

export function getConnectorSummary(items) {
  return {
    total: items.length,
    needsAttention: items.filter((item) => item.requiresAction).length,
    items,
  };
}

export function getScanSummary(scanConfig) {
  if (!scanConfig.intervalEnabled) {
    return "Manual scans are enabled. Recurring scans are disabled.";
  }

  return `Manual scans are enabled. Recurring snapshots run every ${scanConfig.intervalMinutes} minutes.`;
}

export function getRoutesWithFindings(snapshot) {
  return snapshot.routes.map((route) => {
    const relatedFindings = snapshot.findings.filter(
      (finding) => finding.routeSlug === route.slug,
    );

    return {
      ...route,
      findings: relatedFindings,
    };
  });
}

export function getFindingsBySeverity(snapshot) {
  const order = {
    high: 0,
    medium: 1,
    low: 2,
  };

  return [...snapshot.findings].sort((left, right) => {
    return order[left.severity] - order[right.severity];
  });
}

export function getSeverityCounts(findings) {
  return findings.reduce(
    (accumulator, finding) => {
      accumulator[finding.severity] += 1;
      return accumulator;
    },
    { high: 0, medium: 0, low: 0 },
  );
}

export function getHistoryPoints(snapshots) {
  return snapshots.map((snapshot) => {
    const stats = getOverviewStats(snapshot);

    return {
      id: snapshot.id,
      generatedAt: snapshot.generatedAt,
      label: snapshot.generatedLabel,
      publicEntrypoints: stats.publicEntrypoints,
      matchedRoutes: stats.matchedRoutes,
      findingCount: snapshot.findings.length,
      highSeverityCount: snapshot.findings.filter(
        (finding) => finding.severity === "high",
      ).length,
    };
  });
}

export function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export { formatTimestampLabel };
