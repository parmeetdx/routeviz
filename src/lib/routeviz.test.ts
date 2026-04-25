// @ts-nocheck — routeviz.mjs is plain JS with no type declarations
import { describe, it, expect } from "vitest";

import {
  createFallbackSnapshot,
  getFindingsBySeverity,
  getOverviewStats,
  getRouteDetailBySlug,
  getScanSummary,
  getSeverityCounts,
  getConnectorSummary,
  getRoutesWithFindings,
  getHistoryPoints,
  slugify,
  getDnsBaselineHelper,
} from "./routeviz.mjs";

const baseRoute = {
  edgeSource: "Nginx Proxy Manager",
  sourceType: "npm",
  target: "192.168.1.5:8080",
  workloadLabel: "my-app",
  matchState: "matched",
  confidence: "high",
  dnsStatus: "observed",
  dnsAnswers: ["203.0.113.10"],
  certificateProvider: null,
  notes: "",
  publicPort: null,
  composeProject: null,
  serviceName: null,
  containerName: null,
  hostAddress: "192.168.1.5",
  duplicateDomainCount: 1,
  sharedTargetCount: 1,
  authSignals: [],
  selfAuthDetected: false,
  chain: [],
  relatedWorkloads: [],
};

const fixtureSnapshot = {
  id: "snapshot-1",
  generatedAt: "2026-04-22T21:42:00.000Z",
  generatedLabel: "Apr 22, 2:42 PM",
  hostLabel: "miniserver",
  hostAddress: "192.168.1.5",
  dnsBaseline: {
    mode: "disabled",
    value: "",
    helper: "DNS mismatch checks are off. Routeviz records answers but does not enforce a baseline.",
  },
  scanConfig: {
    manualEnabled: true,
    intervalEnabled: true,
    intervalMinutes: 5,
    retentionLimit: 576,
    driftIntervalDays: 7,
    lastCompletedAt: "2026-04-22T21:42:00.000Z",
    nextScheduledAt: "2026-04-22T21:47:00.000Z",
  },
  connectors: [
    {
      id: "docker",
      label: "Docker socket",
      kind: "runtime",
      status: "connected",
      requiresAction: false,
      hint: "Read 62 running containers from /var/run/docker.sock.",
      details: "Live Docker data is available.",
    },
    {
      id: "npm",
      label: "Nginx Proxy Manager",
      kind: "reverse_proxy",
      status: "degraded",
      requiresAction: true,
      hint: "NPM SQLite store not found on this host.",
      details: "Expected a readable SQLite file.",
    },
  ],
  routes: [
    {
      ...baseRoute,
      slug: "immich-parmeetdx-synology-me",
      entrypoint: "immich.parmeetdx.synology.me",
      primaryDomain: "immich.parmeetdx.synology.me",
      target: "192.168.1.5:8110",
      workloadLabel: "immich_server",
      tlsDaysRemaining: 40,
      certificateLabel: "immich.parmeetdx.synology.me",
      privatePort: 8110,
      sourceRecordId: "19",
    },
    {
      ...baseRoute,
      slug: "ciscoguard-parmeetdx-synology-me",
      entrypoint: "ciscoguard.parmeetdx.synology.me",
      primaryDomain: "ciscoguard.parmeetdx.synology.me",
      target: "192.168.1.5:8119",
      workloadLabel: "ciscoguard-web",
      tlsDaysRemaining: 25,
      certificateLabel: "ciscoguard.parmeetdx.synology.me",
      privatePort: 8119,
      sourceRecordId: "40",
      duplicateDomainCount: 2,
      sharedTargetCount: 3,
    },
    {
      ...baseRoute,
      slug: "home-parmeetdx-synology-me",
      entrypoint: "home.parmeetdx.synology.me",
      primaryDomain: "home.parmeetdx.synology.me",
      target: "192.168.1.5:8123",
      workloadLabel: "homeassistant",
      matchState: "matched",
      confidence: "medium",
      tlsDaysRemaining: 62,
      certificateLabel: "home.parmeetdx.synology.me",
      privatePort: 8123,
      sourceRecordId: "1",
    },
  ],
  findings: [
    {
      id: "ciscoguard-duplicate_proxy_host",
      routeSlug: "ciscoguard-parmeetdx-synology-me",
      type: "duplicate_proxy_host",
      severity: "high",
      title: "ciscoguard.parmeetdx.synology.me exists in 2 enabled proxy host records",
      evidence: "Multiple active proxy host records resolve to 192.168.1.5:8119.",
      nextCheck: "Archive the extra proxy host record.",
    },
    {
      id: "ciscoguard-shared_forward_target",
      routeSlug: "ciscoguard-parmeetdx-synology-me",
      type: "shared_forward_target",
      severity: "medium",
      title: "3 routes share 192.168.1.5:8119",
      evidence: "This entrypoint shares the same forward target as two other routes.",
      nextCheck: "Confirm every extra hostname is intentional.",
    },
    {
      id: "home-host_mode_inference",
      routeSlug: "home-parmeetdx-synology-me",
      type: "host_mode_inference",
      severity: "medium",
      title: "home.parmeetdx.synology.me relies on host-network inference",
      evidence: "Matched 192.168.1.5:8123 to homeassistant through host-network inference.",
      nextCheck: "Prefer explicit alias targeting if you want this route to stay easy to verify.",
    },
  ],
  workloadFindings: [],
  changes: [],
};

// ── getOverviewStats ──────────────────────────────────────────────────────────

describe("getOverviewStats", () => {
  it("summarizes live snapshot counts", () => {
    const stats = getOverviewStats(fixtureSnapshot);
    expect(stats).toEqual({
      publicEntrypoints: 3,
      matchedRoutes: 2,
      unresolvedRoutes: 1,
      expiringCertificates: 1,
      connectorWarnings: 1,
    });
  });

  it("returns all zeros for empty snapshot", () => {
    const empty = { ...fixtureSnapshot, routes: [], findings: [], connectors: [] };
    expect(getOverviewStats(empty)).toEqual({
      publicEntrypoints: 0,
      matchedRoutes: 0,
      unresolvedRoutes: 0,
      expiringCertificates: 0,
      connectorWarnings: 0,
    });
  });

  it("counts expired cert (tlsDaysRemaining < 0) as expiring", () => {
    const snap = { ...fixtureSnapshot, routes: [{ ...fixtureSnapshot.routes[0], tlsDaysRemaining: -5 }] };
    expect(getOverviewStats(snap).expiringCertificates).toBe(1);
  });

  it("does not count routes with null tlsDaysRemaining as expiring", () => {
    const snap = { ...fixtureSnapshot, routes: [{ ...fixtureSnapshot.routes[0], tlsDaysRemaining: null }] };
    expect(getOverviewStats(snap).expiringCertificates).toBe(0);
  });
});

// ── getRouteDetailBySlug ──────────────────────────────────────────────────────

describe("getRouteDetailBySlug", () => {
  it("returns route detail and related findings", () => {
    const route = getRouteDetailBySlug(fixtureSnapshot, "ciscoguard-parmeetdx-synology-me");
    expect(route?.route.entrypoint).toBe("ciscoguard.parmeetdx.synology.me");
    expect(route?.findings.map((f) => f.type)).toEqual(["duplicate_proxy_host", "shared_forward_target"]);
  });

  it("returns null for unknown slug", () => {
    expect(getRouteDetailBySlug(fixtureSnapshot, "nonexistent-slug")).toBeNull();
  });

  it("returns empty findings array when no findings for route", () => {
    const detail = getRouteDetailBySlug(fixtureSnapshot, "immich-parmeetdx-synology-me");
    expect(detail?.findings).toEqual([]);
  });
});

// ── getFindingsBySeverity ─────────────────────────────────────────────────────

describe("getFindingsBySeverity", () => {
  it("sorts high before medium and low", () => {
    const findings = getFindingsBySeverity(fixtureSnapshot);
    expect(findings[0]?.severity).toBe("high");
    expect(findings[1]?.severity).toBe("medium");
  });

  it("does not mutate the original findings array", () => {
    const original = [...fixtureSnapshot.findings];
    getFindingsBySeverity(fixtureSnapshot);
    expect(fixtureSnapshot.findings).toEqual(original);
  });

  it("returns empty array for snapshot with no findings", () => {
    expect(getFindingsBySeverity({ ...fixtureSnapshot, findings: [] })).toEqual([]);
  });
});

// ── getSeverityCounts ─────────────────────────────────────────────────────────

describe("getSeverityCounts", () => {
  it("counts by severity correctly", () => {
    expect(getSeverityCounts(fixtureSnapshot.findings)).toEqual({ high: 1, medium: 2, low: 0 });
  });

  it("returns all zeros for empty findings", () => {
    expect(getSeverityCounts([])).toEqual({ high: 0, medium: 0, low: 0 });
  });

  it("counts low severity findings", () => {
    const findings = [{ ...fixtureSnapshot.findings[0], severity: "low" }];
    expect(getSeverityCounts(findings).low).toBe(1);
  });
});

// ── getScanSummary ────────────────────────────────────────────────────────────

describe("getScanSummary", () => {
  it("describes recurring snapshot cadence", () => {
    expect(getScanSummary(fixtureSnapshot.scanConfig)).toBe(
      "Manual scans are enabled. Recurring snapshots run every 5 minutes.",
    );
  });

  it("describes disabled interval", () => {
    expect(getScanSummary({ ...fixtureSnapshot.scanConfig, intervalEnabled: false })).toBe(
      "Manual scans are enabled. Recurring scans are disabled.",
    );
  });

  it("reflects custom interval", () => {
    expect(getScanSummary({ ...fixtureSnapshot.scanConfig, intervalMinutes: 60 })).toContain("60 minutes");
  });
});

// ── getConnectorSummary ───────────────────────────────────────────────────────

describe("getConnectorSummary", () => {
  it("counts total and needsAttention", () => {
    const result = getConnectorSummary(fixtureSnapshot.connectors);
    expect(result.total).toBe(2);
    expect(result.needsAttention).toBe(1);
    expect(result.items).toHaveLength(2);
  });

  it("returns zero needsAttention when all connectors are healthy", () => {
    const healthy = fixtureSnapshot.connectors.map((c) => ({ ...c, requiresAction: false }));
    expect(getConnectorSummary(healthy).needsAttention).toBe(0);
  });

  it("returns empty items for empty input", () => {
    const result = getConnectorSummary([]);
    expect(result.total).toBe(0);
    expect(result.needsAttention).toBe(0);
  });
});

// ── getRoutesWithFindings ─────────────────────────────────────────────────────

describe("getRoutesWithFindings", () => {
  it("attaches findings to matching routes", () => {
    const routes = getRoutesWithFindings(fixtureSnapshot);
    const ciscoguard = routes.find((r) => r.slug === "ciscoguard-parmeetdx-synology-me");
    expect(ciscoguard?.findings).toHaveLength(2);
  });

  it("attaches empty findings array to routes with no findings", () => {
    const routes = getRoutesWithFindings(fixtureSnapshot);
    const immich = routes.find((r) => r.slug === "immich-parmeetdx-synology-me");
    expect(immich?.findings).toEqual([]);
  });

  it("returns same count of routes as snapshot", () => {
    const routes = getRoutesWithFindings(fixtureSnapshot);
    expect(routes).toHaveLength(fixtureSnapshot.routes.length);
  });
});

// ── getHistoryPoints ──────────────────────────────────────────────────────────

describe("getHistoryPoints", () => {
  it("maps snapshots to history points", () => {
    const points = getHistoryPoints([fixtureSnapshot]);
    expect(points).toHaveLength(1);
    expect(points[0]?.id).toBe("snapshot-1");
    expect(points[0]?.label).toBe("Apr 22, 2:42 PM");
    expect(points[0]?.publicEntrypoints).toBe(3);
    expect(points[0]?.findingCount).toBe(3);
    expect(points[0]?.highSeverityCount).toBe(1);
  });

  it("returns empty array for empty input", () => {
    expect(getHistoryPoints([])).toEqual([]);
  });
});

// ── slugify ───────────────────────────────────────────────────────────────────

describe("slugify", () => {
  it("lowercases and replaces non-alphanumeric with hyphens", () => {
    expect(slugify("app.Example.com")).toBe("app-example-com");
  });

  it("removes leading and trailing hyphens", () => {
    expect(slugify("  hello world  ")).toBe("hello-world");
  });

  it("collapses consecutive special chars into single hyphen", () => {
    expect(slugify("foo...bar")).toBe("foo-bar");
  });

  it("handles already-clean slug", () => {
    expect(slugify("my-app")).toBe("my-app");
  });

  it("handles empty string", () => {
    expect(slugify("")).toBe("");
  });
});

// ── getDnsBaselineHelper ──────────────────────────────────────────────────────

describe("getDnsBaselineHelper", () => {
  it("returns disabled message for disabled mode", () => {
    const msg = getDnsBaselineHelper({ mode: "disabled", value: "" });
    expect(msg).toContain("DNS mismatch checks are off");
  });

  it("includes reference hostname in message", () => {
    const msg = getDnsBaselineHelper({ mode: "reference_hostname", value: "home.example.com" });
    expect(msg).toContain("home.example.com");
  });

  it("includes manual endpoint in message", () => {
    const msg = getDnsBaselineHelper({ mode: "manual_endpoint", value: "1.2.3.4" });
    expect(msg).toContain("1.2.3.4");
  });
});

// ── createFallbackSnapshot ────────────────────────────────────────────────────

describe("createFallbackSnapshot", () => {
  const minimalSettings = {
    dockerSocketPath: "/var/run/docker.sock",
    hostAddress: "192.168.1.5",
    hostLabel: "miniserver",
    npmSqlitePath: "/docker/apps/npm/database.sqlite",
    dnsBaseline: { mode: "disabled", value: "" },
    scanConfig: { intervalEnabled: true, intervalMinutes: 5, retentionLimit: 576, driftIntervalDays: 7 },
  };

  it("builds a safe empty state", () => {
    const fallback = createFallbackSnapshot(minimalSettings);
    expect(fallback.routes).toHaveLength(0);
    expect(fallback.findings).toHaveLength(0);
    expect(fallback.connectors[0]?.status).toBe("disconnected");
  });

  it("uses hostLabel from settings", () => {
    const fallback = createFallbackSnapshot(minimalSettings);
    expect(fallback.hostLabel).toBe("miniserver");
  });

  it("uses hostAddress from settings", () => {
    const fallback = createFallbackSnapshot(minimalSettings);
    expect(fallback.hostAddress).toBe("192.168.1.5");
  });

  it("sets id to fallback", () => {
    const fallback = createFallbackSnapshot(minimalSettings);
    expect(fallback.id).toBe("fallback");
  });

  it("includes custom message in docker connector hint", () => {
    const fallback = createFallbackSnapshot(minimalSettings, "Custom message here");
    expect(fallback.connectors[0]?.hint).toBe("Custom message here");
  });

  it("includes driftIntervalDays from settings", () => {
    const fallback = createFallbackSnapshot({ ...minimalSettings, scanConfig: { ...minimalSettings.scanConfig, driftIntervalDays: 14 } });
    expect(fallback.scanConfig.driftIntervalDays).toBe(14);
  });
});
