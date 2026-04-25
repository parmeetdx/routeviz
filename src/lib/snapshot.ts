import { existsSync } from "node:fs";

import { formatTimestampLabel, getDnsBaselineHelper } from "@/lib/routeviz.mjs";
import type { Connector, ConnectorConfig, ExposureIntent, NpmConnectorOptions, PersistedSettings, RouteRecord, RoutevizSnapshot } from "@/lib/routeviz-types";

import { scanDocker } from "@/lib/collectors/docker";
import { dedupeRoutes, fetchNpmApiRoutes, readNpmSqlite } from "@/lib/collectors/npm";
import { getDnsBaselineAnswers, getDnsStatus, lookupAnswersForDomain } from "@/lib/collectors/dns";
import { applySharedTargetCounts, createRouteRecord, getPrimaryDomain, matchRouteToWorkload, serializeWorkload } from "@/lib/analysis/route-match";
import { createFindings, matchesSelfAuthSeedList, matchesUserOverrides } from "@/lib/analysis/route-findings";
import { createWorkloadFindings } from "@/lib/analysis/workload-findings";
import { detectHostAddress, getNextScheduledAt } from "@/lib/settings";

async function buildRoutesFromNpmRows(
  rows: Awaited<ReturnType<typeof fetchNpmApiRoutes>>,
  workloads: Awaited<ReturnType<typeof scanDocker>>,
  settings: PersistedSettings,
  hostCandidates: Set<string>,
  hostAddress: string,
  connectorId: string,
): Promise<RouteRecord[]> {
  const edges = dedupeRoutes(rows, connectorId);
  const baselineAnswers = await getDnsBaselineAnswers(settings);
  const results = await Promise.all(
    edges.map(async (route) => {
      const match = await matchRouteToWorkload(route, workloads, settings, hostCandidates);
      const answers = await lookupAnswersForDomain(getPrimaryDomain(route));
      const dnsStatus = getDnsStatus(answers, settings.dnsBaseline.mode, baselineAnswers);
      return createRouteRecord(route, match, answers, dnsStatus, hostAddress, settings.authOverrides, matchesSelfAuthSeedList, matchesUserOverrides);
    }),
  );
  return applySharedTargetCounts(results);
}

async function refreshNpmToken(apiUrl: string, email: string, password: string): Promise<string> {
  const http = await import("node:http");
  const https = await import("node:https");
  const base = apiUrl.replace(/\/$/, "");
  const body = JSON.stringify({ identity: email, secret: password });
  const url = new URL(`${base}/api/tokens`);
  const mod = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = mod.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
        rejectUnauthorized: false,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data) as { token?: string };
            if (parsed.token) resolve(parsed.token);
            else reject(new Error("NPM did not return a token during refresh."));
          } catch {
            reject(new Error("NPM returned non-JSON during token refresh."));
          }
        });
      },
    );
    req.setTimeout(10_000, () => { req.destroy(); reject(new Error("Token refresh timed out.")); });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function runNpmConnector(
  cfg: ConnectorConfig,
  workloads: Awaited<ReturnType<typeof scanDocker>>,
  settings: PersistedSettings,
  hostCandidates: Set<string>,
  hostAddress: string,
  onTokenRefreshed?: (connectorId: string, newToken: string) => Promise<void>,
): Promise<{ connector: Connector; routes: RouteRecord[] }> {
  const opts = cfg.options as NpmConnectorOptions;

  if (opts.mode === "api") {
    if (!opts.apiUrl || !opts.apiToken) {
      return {
        connector: {
          id: cfg.id, label: cfg.label, kind: "reverse_proxy", status: "degraded", requiresAction: true,
          hint: "NPM API URL and token are required when using API mode.",
          details: "Enter your NPM API URL and access token in Setup.",
          lastSyncAt: null,
        },
        routes: [],
      };
    }

    const tryFetch = async (token: string) => fetchNpmApiRoutes(opts.apiUrl, token);

    let token = opts.apiToken;
    try {
      const rows = await tryFetch(token);
      const routes = await buildRoutesFromNpmRows(rows, workloads, settings, hostCandidates, hostAddress, cfg.id);
      return {
        connector: {
          id: cfg.id, label: cfg.label, kind: "reverse_proxy", status: "connected", requiresAction: false,
          hint: `Loaded ${routes.length} active proxy host${routes.length === 1 ? "" : "s"} via NPM API.`,
          details: `Using NPM API at ${opts.apiUrl}.`,
          lastSyncAt: new Date().toISOString(),
        },
        routes,
      };
    } catch (error) {
      const isAuthError = error instanceof Error && (
        error.message.includes("400") || error.message.includes("401") || error.message.includes("403")
      );
      if (isAuthError && opts.apiEmail && opts.apiPassword) {
        try {
          token = await refreshNpmToken(opts.apiUrl, opts.apiEmail, opts.apiPassword);
          await onTokenRefreshed?.(cfg.id, token);
          const rows = await tryFetch(token);
          const routes = await buildRoutesFromNpmRows(rows, workloads, settings, hostCandidates, hostAddress, cfg.id);
          return {
            connector: {
              id: cfg.id, label: cfg.label, kind: "reverse_proxy", status: "connected", requiresAction: false,
              hint: `Loaded ${routes.length} active proxy host${routes.length === 1 ? "" : "s"} via NPM API (token auto-refreshed).`,
              details: `Using NPM API at ${opts.apiUrl}.`,
              lastSyncAt: new Date().toISOString(),
            },
            routes,
          };
        } catch (refreshError) {
          return {
            connector: {
              id: cfg.id, label: cfg.label, kind: "reverse_proxy", status: "degraded", requiresAction: true,
              hint: refreshError instanceof Error ? refreshError.message : "Token refresh failed.",
              details: `Could not refresh NPM token for ${opts.apiUrl}.`,
              lastSyncAt: null,
            },
            routes: [],
          };
        }
      }
      return {
        connector: {
          id: cfg.id, label: cfg.label, kind: "reverse_proxy", status: "degraded", requiresAction: true,
          hint: error instanceof Error ? error.message : "Could not reach the NPM API.",
          details: opts.apiEmail
            ? `Expected a reachable NPM API at ${opts.apiUrl}.`
            : `Expected a reachable NPM API at ${opts.apiUrl}. Save credentials in Setup to enable auto-refresh.`,
          lastSyncAt: null,
        },
        routes: [],
      };
    }
  }

  // SQLite mode
  if (!opts.sqlitePath) {
    return {
      connector: {
        id: cfg.id, label: cfg.label, kind: "reverse_proxy", status: "degraded", requiresAction: true,
        hint: "NPM connector not configured. Go to Setup to set the SQLite path or switch to API mode.",
        details: "Enter the path to your NPM database.sqlite file, or configure API access instead.",
        lastSyncAt: null,
      },
      routes: [],
    };
  }
  if (!existsSync(opts.sqlitePath)) {
    return {
      connector: {
        id: cfg.id, label: cfg.label, kind: "reverse_proxy", status: "degraded", requiresAction: true,
        hint: "NPM SQLite store not found on this host.",
        details: `Expected a readable SQLite file at ${opts.sqlitePath}.`,
        lastSyncAt: null,
      },
      routes: [],
    };
  }
  try {
    const rows = await readNpmSqlite(opts.sqlitePath);
    const routes = await buildRoutesFromNpmRows(rows, workloads, settings, hostCandidates, hostAddress, cfg.id);
    return {
      connector: {
        id: cfg.id, label: cfg.label, kind: "reverse_proxy", status: "connected", requiresAction: false,
        hint: `Loaded ${routes.length} active proxy host${routes.length === 1 ? "" : "s"} from the local SQLite store.`,
        details: `Using ${opts.sqlitePath} because this host has the NPM data bind-mounted locally.`,
        lastSyncAt: new Date().toISOString(),
      },
      routes,
    };
  } catch (error) {
    return {
      connector: {
        id: cfg.id, label: cfg.label, kind: "reverse_proxy", status: "degraded", requiresAction: true,
        hint: error instanceof Error ? error.message : "Could not read the NPM SQLite store.",
        details: `Expected a readable SQLite file at ${opts.sqlitePath}.`,
        lastSyncAt: null,
      },
      routes: [],
    };
  }
}

export async function buildSnapshot(
  settings: PersistedSettings,
  exposureIntents: ExposureIntent[] = [],
  onTokenRefreshed?: (connectorId: string, newToken: string) => Promise<void>,
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

  // ── Proxy connectors ──────────────────────────────────────────────────────────
  let allRoutes: RouteRecord[] = [];

  const enabledConnectors = (settings.connectors ?? []).filter((c) => c.enabled);
  for (const cfg of enabledConnectors) {
    if (cfg.type === "npm") {
      const { connector, routes } = await runNpmConnector(cfg, workloads, settings, hostCandidates, hostAddress, onTokenRefreshed);
      connectors.push(connector);
      allRoutes = [...allRoutes, ...routes];
    } else {
      // Placeholder for connectors not yet implemented
      connectors.push({
        id: cfg.id, label: cfg.label, kind: "reverse_proxy", status: "degraded", requiresAction: false,
        hint: `${cfg.label} connector is not yet available in this version.`,
        details: "Support is coming in a future release.",
        lastSyncAt: null,
      });
    }
  }

  const routes = applySharedTargetCounts(allRoutes);

  // ── DNS connector status ──────────────────────────────────────────────────────
  const dnsReady = routes.some((route) => route.dnsAnswers.length > 0);
  connectors.push({
    id: "dns", label: "DNS lookups", kind: "network",
    status: dnsReady ? "connected" : "degraded",
    requiresAction: !dnsReady && routes.length > 0,
    hint: dnsReady
      ? "Resolved public answers for the current route set."
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
