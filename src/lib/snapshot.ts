import { existsSync } from "node:fs";

import { formatTimestampLabel, getDnsBaselineHelper } from "@/lib/routeviz.mjs";
import type { Connector, ExposureIntent, PersistedSettings, RoutevizSnapshot } from "@/lib/routeviz-types";

import { scanDocker } from "@/lib/collectors/docker";
import { dedupeRoutes, fetchNpmApiRoutes, readNpmSqlite } from "@/lib/collectors/npm";
import { getDnsBaselineAnswers, getDnsStatus, lookupAnswersForDomain } from "@/lib/collectors/dns";
import { applySharedTargetCounts, createRouteRecord, getPrimaryDomain, matchRouteToWorkload, serializeWorkload } from "@/lib/analysis/route-match";
import { createFindings, matchesSelfAuthSeedList, matchesUserOverrides } from "@/lib/analysis/route-findings";
import { createWorkloadFindings } from "@/lib/analysis/workload-findings";
import { detectHostAddress, getNextScheduledAt } from "@/lib/settings";

export async function buildSnapshot(
  settings: PersistedSettings,
  exposureIntents: ExposureIntent[] = [],
): Promise<RoutevizSnapshot> {
  const hostAddress = settings.hostAddress ?? detectHostAddress() ?? "unknown-host";
  const hostCandidates = new Set<string>(
    [hostAddress, settings.hostAddress, detectHostAddress(), "localhost", "127.0.0.1"]
      .filter(Boolean)
      .map((value) => String(value)),
  );

  const connectors: Connector[] = [];
  let workloads: Awaited<ReturnType<typeof scanDocker>> = [];

  // ── Docker ────────────────────────────────────────────────────────────────────
  try {
    workloads = await scanDocker(settings.dockerSocketPath);
    connectors.push({
      id: "docker", label: "Docker socket", kind: "runtime", status: "connected", requiresAction: false,
      hint: `Read ${workloads.length} running container${workloads.length === 1 ? "" : "s"} from ${settings.dockerSocketPath}.`,
      details: "Container matching uses published ports, host-network inference, service names, and network aliases.",
      lastSyncAt: new Date().toISOString(),
    });
  } catch (error) {
    connectors.push({
      id: "docker", label: "Docker socket", kind: "runtime", status: "disconnected", requiresAction: true,
      hint: error instanceof Error ? error.message : "Could not read the Docker socket.",
      details: `Expected read access to ${settings.dockerSocketPath}.`,
      lastSyncAt: null,
    });
  }

  // ── NPM ───────────────────────────────────────────────────────────────────────
  let routes: Awaited<ReturnType<typeof applySharedTargetCounts>> = [];

  const buildRoutes = async (rows: Awaited<ReturnType<typeof fetchNpmApiRoutes>>) => {
    const canonicalRoutes = dedupeRoutes(rows);
    const baselineAnswers = await getDnsBaselineAnswers(settings);
    const routeResults = await Promise.all(
      canonicalRoutes.map(async (route) => {
        const match = await matchRouteToWorkload(route, workloads, settings, hostCandidates);
        const answers = await lookupAnswersForDomain(getPrimaryDomain(route));
        const dnsStatus = getDnsStatus(answers, settings.dnsBaseline.mode, baselineAnswers);
        return createRouteRecord(route, match, answers, dnsStatus, hostAddress, settings.authOverrides, matchesSelfAuthSeedList, matchesUserOverrides);
      }),
    );
    return applySharedTargetCounts(routeResults);
  };

  if (settings.npmConnectorMode === "api" && settings.npmApiUrl && settings.npmApiToken) {
    try {
      const rows = await fetchNpmApiRoutes(settings.npmApiUrl, settings.npmApiToken);
      routes = await buildRoutes(rows);
      connectors.push({
        id: "npm", label: "Nginx Proxy Manager", kind: "reverse_proxy", status: "connected", requiresAction: false,
        hint: `Loaded ${routes.length} active proxy host${routes.length === 1 ? "" : "s"} via NPM API.`,
        details: `Using NPM API at ${settings.npmApiUrl}.`,
        lastSyncAt: new Date().toISOString(),
      });
    } catch (error) {
      connectors.push({
        id: "npm", label: "Nginx Proxy Manager", kind: "reverse_proxy", status: "degraded", requiresAction: true,
        hint: error instanceof Error ? error.message : "Could not reach the NPM API.",
        details: `Expected a reachable NPM API at ${settings.npmApiUrl}.`,
        lastSyncAt: null,
      });
    }
  } else if (settings.npmConnectorMode === "api") {
    connectors.push({
      id: "npm", label: "Nginx Proxy Manager", kind: "reverse_proxy", status: "degraded", requiresAction: true,
      hint: "NPM API URL and token are required when using API mode.",
      details: "Enter your NPM API URL and access token in Setup.",
      lastSyncAt: null,
    });
  } else if (!settings.npmSqlitePath) {
    connectors.push({
      id: "npm", label: "Nginx Proxy Manager", kind: "reverse_proxy", status: "degraded", requiresAction: true,
      hint: "NPM connector not configured. Go to Setup to set the SQLite path or switch to API mode.",
      details: "Enter the path to your NPM database.sqlite file, or configure API access instead.",
      lastSyncAt: null,
    });
  } else if (existsSync(settings.npmSqlitePath)) {
    try {
      const rows = await readNpmSqlite(settings.npmSqlitePath);
      routes = await buildRoutes(rows);
      connectors.push({
        id: "npm", label: "Nginx Proxy Manager", kind: "reverse_proxy", status: "connected", requiresAction: false,
        hint: `Loaded ${routes.length} active proxy host${routes.length === 1 ? "" : "s"} from the local SQLite store.`,
        details: `Using ${settings.npmSqlitePath} because this host has the NPM data bind-mounted locally.`,
        lastSyncAt: new Date().toISOString(),
      });
    } catch (error) {
      connectors.push({
        id: "npm", label: "Nginx Proxy Manager", kind: "reverse_proxy", status: "degraded", requiresAction: true,
        hint: error instanceof Error ? error.message : "Could not read the NPM SQLite store.",
        details: `Expected a readable SQLite file at ${settings.npmSqlitePath}.`,
        lastSyncAt: null,
      });
    }
  } else {
    connectors.push({
      id: "npm", label: "Nginx Proxy Manager", kind: "reverse_proxy", status: "degraded", requiresAction: true,
      hint: "NPM SQLite store not found on this host.",
      details: `Expected a readable SQLite file at ${settings.npmSqlitePath}.`,
      lastSyncAt: null,
    });
  }

  // ── DNS connector status ──────────────────────────────────────────────────────
  const dnsReady = routes.some((route) => route.dnsAnswers.length > 0);
  connectors.push({
    id: "dns", label: "DNS lookups", kind: "network",
    status: dnsReady ? "connected" : "degraded",
    requiresAction: !dnsReady && routes.length > 0,
    hint: dnsReady
      ? "Resolved public answers for the current NPM route set."
      : routes.length === 0
        ? "Waiting on route data before DNS checks can run."
        : "No public answers were observed for the current route set.",
    details: "Each snapshot records observed route answers and optionally compares them against a configured baseline.",
    lastSyncAt: new Date().toISOString(),
  });

  // ── Findings ──────────────────────────────────────────────────────────────────
  const suppressed = new Set(settings.suppressedFindings ?? []);
  const intentMap = new Map(exposureIntents.map((intent) => [intent.routeSlug, intent]));
  const severityOrder = { high: 0, medium: 1, low: 2 };

  const findings = createFindings(routes, suppressed, intentMap, settings.scanConfig.driftIntervalDays).sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
  );
  const workloadFindings = createWorkloadFindings(workloads, routes, suppressed).sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
  );

  const generatedAt = new Date().toISOString();

  return {
    id: generatedAt,
    generatedAt,
    generatedLabel: formatTimestampLabel(generatedAt),
    hostLabel: settings.hostLabel,
    hostAddress,
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
      driftIntervalDays: settings.scanConfig.driftIntervalDays,
      lastCompletedAt: generatedAt,
      nextScheduledAt: getNextScheduledAt(generatedAt, settings.scanConfig.intervalEnabled, settings.scanConfig.intervalMinutes),
    },
    connectors,
    workloads: workloads.map(serializeWorkload),
    routes,
    findings,
    workloadFindings,
    changes: [],
  } satisfies RoutevizSnapshot;
}
