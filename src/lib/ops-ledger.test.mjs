import test from "node:test";
import assert from "node:assert/strict";

import {
  createFallbackSnapshot,
  getFindingsBySeverity,
  getOverviewStats,
  getRouteDetailBySlug,
  getScanSummary,
  getSeverityCounts,
} from "./ops-ledger.mjs";

const fixtureSnapshot = {
  id: "snapshot-1",
  generatedAt: "2026-04-22T21:42:00.000Z",
  generatedLabel: "Apr 22, 2:42 PM",
  hostLabel: "miniserver",
  hostAddress: "192.168.1.5",
  dnsBaseline: {
    mode: "disabled",
    value: "",
    helper:
      "DNS mismatch checks are off. Ops Ledger records answers but does not enforce a baseline.",
  },
  scanConfig: {
    manualEnabled: true,
    intervalEnabled: true,
    intervalMinutes: 5,
    retentionLimit: 576,
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
      slug: "immich-parmeetdx-synology-me",
      entrypoint: "immich.parmeetdx.synology.me",
      primaryDomain: "immich.parmeetdx.synology.me",
      edgeSource: "Nginx Proxy Manager",
      target: "192.168.1.5:8110",
      workloadLabel: "immich_server",
      matchState: "matched",
      confidence: "high",
      dnsStatus: "observed",
      dnsAnswers: ["203.0.113.10"],
      tlsDaysRemaining: 40,
      certificateLabel: "immich.parmeetdx.synology.me",
      notes: "Matched 192.168.1.5:8110 to the published host port on immich_server.",
      publicPort: null,
      privatePort: 8110,
      composeProject: "immich",
      serviceName: "immich-server",
      containerName: "immich_server",
      hostAddress: "192.168.1.5",
      sourceRecordId: 19,
      duplicateDomainCount: 1,
      sharedTargetCount: 1,
      chain: [
        "immich.parmeetdx.synology.me",
        "Nginx Proxy Manager",
        "192.168.1.5:8110",
        "immich_server",
      ],
      relatedWorkloads: [],
    },
    {
      slug: "ciscoguard-parmeetdx-synology-me",
      entrypoint: "ciscoguard.parmeetdx.synology.me",
      primaryDomain: "ciscoguard.parmeetdx.synology.me",
      edgeSource: "Nginx Proxy Manager",
      target: "192.168.1.5:8119",
      workloadLabel: "ciscoguard-web",
      matchState: "matched",
      confidence: "high",
      dnsStatus: "observed",
      dnsAnswers: ["203.0.113.10"],
      tlsDaysRemaining: 25,
      certificateLabel: "ciscoguard.parmeetdx.synology.me",
      notes: "Matched 192.168.1.5:8119 to the published host port on ciscoguard-web.",
      publicPort: null,
      privatePort: 8119,
      composeProject: "ciscoguard",
      serviceName: "web",
      containerName: "ciscoguard-web",
      hostAddress: "192.168.1.5",
      sourceRecordId: 40,
      duplicateDomainCount: 2,
      sharedTargetCount: 3,
      chain: [
        "ciscoguard.parmeetdx.synology.me",
        "Nginx Proxy Manager",
        "192.168.1.5:8119",
        "ciscoguard-web",
      ],
      relatedWorkloads: [],
    },
    {
      slug: "home-parmeetdx-synology-me",
      entrypoint: "home.parmeetdx.synology.me",
      primaryDomain: "home.parmeetdx.synology.me",
      edgeSource: "Nginx Proxy Manager",
      target: "192.168.1.5:8123",
      workloadLabel: "homeassistant",
      matchState: "matched",
      confidence: "medium",
      dnsStatus: "observed",
      dnsAnswers: ["203.0.113.10"],
      tlsDaysRemaining: 62,
      certificateLabel: "home.parmeetdx.synology.me",
      notes: "Matched 192.168.1.5:8123 to homeassistant through host-network inference.",
      publicPort: null,
      privatePort: 8123,
      composeProject: null,
      serviceName: null,
      containerName: "homeassistant",
      hostAddress: "192.168.1.5",
      sourceRecordId: 1,
      duplicateDomainCount: 1,
      sharedTargetCount: 1,
      chain: [
        "home.parmeetdx.synology.me",
        "Nginx Proxy Manager",
        "192.168.1.5:8123",
        "homeassistant",
      ],
      relatedWorkloads: [],
    },
  ],
  findings: [
    {
      id: "ciscoguard-duplicate_proxy_host",
      routeSlug: "ciscoguard-parmeetdx-synology-me",
      type: "duplicate_proxy_host",
      severity: "high",
      title: "ciscoguard.parmeetdx.synology.me exists in 2 enabled proxy host records",
      evidence: "Multiple active NPM rows resolve to 192.168.1.5:8119.",
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
};

test("getOverviewStats summarizes live snapshot counts", () => {
  const stats = getOverviewStats(fixtureSnapshot);

  assert.deepEqual(stats, {
    publicEntrypoints: 3,
    matchedRoutes: 2,
    unresolvedRoutes: 1,
    expiringCertificates: 1,
    connectorWarnings: 1,
  });
});

test("getRouteDetailBySlug returns route detail and related findings", () => {
  const route = getRouteDetailBySlug(
    fixtureSnapshot,
    "ciscoguard-parmeetdx-synology-me",
  );

  assert.equal(route?.route.entrypoint, "ciscoguard.parmeetdx.synology.me");
  assert.deepEqual(
    route?.findings.map((finding) => finding.type),
    ["duplicate_proxy_host", "shared_forward_target"],
  );
});

test("getFindingsBySeverity sorts high before medium and low", () => {
  const findings = getFindingsBySeverity(fixtureSnapshot);

  assert.equal(findings[0]?.severity, "high");
  assert.equal(findings[1]?.severity, "medium");
});

test("getSeverityCounts summarizes the queue", () => {
  assert.deepEqual(getSeverityCounts(fixtureSnapshot.findings), {
    high: 1,
    medium: 2,
    low: 0,
  });
});

test("getScanSummary describes the recurring snapshot cadence", () => {
  assert.equal(
    getScanSummary(fixtureSnapshot.scanConfig),
    "Manual scans are enabled. Recurring snapshots run every 5 minutes.",
  );
});

test("createFallbackSnapshot builds a safe empty state", () => {
  const fallback = createFallbackSnapshot({
    dockerSocketPath: "/var/run/docker.sock",
    hostAddress: "192.168.1.5",
    hostLabel: "miniserver",
    npmSqlitePath: "/docker/apps/nginx-proxy-manager/data/database.sqlite",
    dnsBaseline: {
      mode: "disabled",
      value: "",
    },
    scanConfig: {
      intervalEnabled: true,
      intervalMinutes: 5,
      retentionLimit: 576,
    },
  });

  assert.equal(fallback.routes.length, 0);
  assert.equal(fallback.findings.length, 0);
  assert.equal(fallback.connectors[0]?.status, "disconnected");
});
