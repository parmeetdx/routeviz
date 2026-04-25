import { describe, it, expect } from "vitest";
import {
  getPrimaryDomain,
  isHostLikeTarget,
  buildRelatedWorkloads,
  serializeWorkload,
  applySharedTargetCounts,
  matchRouteToWorkload,
} from "./route-match";
import type { EdgeRouteInput, PersistedSettings, RouteRecord } from "@/lib/routeviz-types";
import type { DockerWorkload } from "@/lib/collectors/docker";

function makeEdgeRoute(overrides: Partial<EdgeRouteInput> = {}): EdgeRouteInput {
  return {
    sourceType: "npm",
    sourceName: "Nginx Proxy Manager",
    sourceId: "1",
    domains: ["app.example.com"],
    targetHost: "192.168.1.5",
    targetPort: 8080,
    authSignals: [],
    rawHints: [],
    duplicateDomainCount: 1,
    ...overrides,
  };
}

function makeWorkload(overrides: Partial<DockerWorkload> = {}): DockerWorkload {
  return {
    id: "abc123",
    name: "my-app",
    image: "myapp:1.2.3",
    latestImageTag: null,
    imageUpdateStatus: "unknown",
    state: "running",
    createdAt: new Date().toISOString(),
    composeProject: "myproject",
    serviceName: "app",
    composePath: null,
    aliases: ["my-app"],
    internalIps: ["172.20.0.5"],
    publishedPorts: [],
    exposedPorts: [8080],
    networks: ["bridge"],
    mounts: [],
    networkMode: "bridge",
    dockerSocketMount: "none",
    ...overrides,
  };
}

function makeSettings(overrides: Partial<PersistedSettings> = {}): PersistedSettings {
  return {
    dockerSocketPath: "/var/run/docker.sock",
    hostAddress: "192.168.1.5",
    hostLabel: "miniserver",
    npmConnectorMode: "sqlite",
    npmSqlitePath: "",
    npmApiUrl: "",
    npmApiToken: "",
    dnsBaseline: { mode: "disabled", value: "" },
    scanConfig: { intervalEnabled: true, intervalMinutes: 5, retentionLimit: 576, driftIntervalDays: 7 },
    webhookConfig: { enabled: false, url: "", severityThreshold: "high", lastDeliveryAt: null, lastDeliveryStatus: null },
    authOverrides: [],
    suppressedFindings: [],
    ...overrides,
  };
}

function makeRouteRecord(overrides: Partial<RouteRecord> = {}): RouteRecord {
  return {
    slug: "app-example-com",
    entrypoint: "app.example.com",
    primaryDomain: "app.example.com",
    edgeSource: "Nginx Proxy Manager",
    sourceType: "npm",
    target: "192.168.1.5:8080",
    workloadLabel: "my-app",
    matchState: "matched",
    confidence: "high",
    dnsStatus: "observed",
    dnsAnswers: [],
    tlsDaysRemaining: 60,
    certificateLabel: null,
    certificateProvider: null,
    notes: "",
    publicPort: null,
    privatePort: 8080,
    composeProject: "myproject",
    serviceName: "app",
    containerName: "my-app",
    hostAddress: "192.168.1.5",
    sourceRecordId: "1",
    duplicateDomainCount: 1,
    sharedTargetCount: 1,
    authSignals: [],
    selfAuthDetected: false,
    chain: [],
    relatedWorkloads: [],
    ...overrides,
  };
}

// ── getPrimaryDomain ──────────────────────────────────────────────────────────

describe("getPrimaryDomain", () => {
  it("returns the first domain", () => {
    expect(getPrimaryDomain(makeEdgeRoute({ domains: ["a.com", "b.com"] }))).toBe("a.com");
  });

  it("returns null for empty domains array", () => {
    expect(getPrimaryDomain(makeEdgeRoute({ domains: [] }))).toBeNull();
  });

  it("returns single domain correctly", () => {
    expect(getPrimaryDomain(makeEdgeRoute({ domains: ["example.com"] }))).toBe("example.com");
  });
});

// ── isHostLikeTarget ──────────────────────────────────────────────────────────

describe("isHostLikeTarget", () => {
  const settings = makeSettings({ hostAddress: "192.168.1.5", hostLabel: "miniserver" });
  const hostCandidates = new Set(["192.168.1.5", "miniserver", "localhost"]);

  it("matches localhost", () => {
    expect(isHostLikeTarget("localhost", settings, hostCandidates)).toBe(true);
  });

  it("matches 127.0.0.1", () => {
    expect(isHostLikeTarget("127.0.0.1", settings, hostCandidates)).toBe(true);
  });

  it("matches ::1", () => {
    expect(isHostLikeTarget("::1", settings, hostCandidates)).toBe(true);
  });

  it("matches 0.0.0.0", () => {
    expect(isHostLikeTarget("0.0.0.0", settings, hostCandidates)).toBe(true);
  });

  it("matches host label", () => {
    expect(isHostLikeTarget("miniserver", settings, hostCandidates)).toBe(true);
  });

  it("matches host IP from candidates", () => {
    expect(isHostLikeTarget("192.168.1.5", settings, hostCandidates)).toBe(true);
  });

  it("returns false for external IP", () => {
    expect(isHostLikeTarget("8.8.8.8", settings, hostCandidates)).toBe(false);
  });

  it("returns false for container alias on a different network", () => {
    expect(isHostLikeTarget("my-container", settings, hostCandidates)).toBe(false);
  });
});

// ── buildRelatedWorkloads ─────────────────────────────────────────────────────

describe("buildRelatedWorkloads", () => {
  it("returns empty array when workload is null", () => {
    expect(buildRelatedWorkloads(null, [])).toEqual([]);
  });

  it("returns only matched workload when no compose project", () => {
    const w = makeWorkload({ composeProject: null });
    const result = buildRelatedWorkloads(w, [w]);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("my-app");
  });

  it("returns all workloads in the same compose project", () => {
    const w1 = makeWorkload({ id: "1", name: "app", composeProject: "myproject" });
    const w2 = makeWorkload({ id: "2", name: "db", composeProject: "myproject" });
    const w3 = makeWorkload({ id: "3", name: "other", composeProject: "other-project" });
    const result = buildRelatedWorkloads(w1, [w1, w2, w3]);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.name)).toContain("app");
    expect(result.map((r) => r.name)).toContain("db");
    expect(result.map((r) => r.name)).not.toContain("other");
  });

  it("maps publishedPorts to port:port string format", () => {
    const w = makeWorkload({
      composeProject: null,
      publishedPorts: [{ publicPort: 80, privatePort: 8080, hostIp: "0.0.0.0" }],
    });
    const result = buildRelatedWorkloads(w, [w]);
    expect(result[0]?.publishedPorts).toEqual(["80:8080"]);
  });

  it("populates imageUpdateStatus on related workload", () => {
    const w = makeWorkload({ imageUpdateStatus: "outdated", latestImageTag: "2.0.0", composeProject: null });
    const result = buildRelatedWorkloads(w, [w]);
    expect(result[0]?.imageUpdateStatus).toBe("outdated");
    expect(result[0]?.latestImageTag).toBe("2.0.0");
  });
});

// ── serializeWorkload ─────────────────────────────────────────────────────────

describe("serializeWorkload", () => {
  it("maps all expected fields", () => {
    const w = makeWorkload({
      publishedPorts: [{ publicPort: 3000, privatePort: 3000, hostIp: null }],
    });
    const result = serializeWorkload(w);
    expect(result.id).toBe("abc123");
    expect(result.name).toBe("my-app");
    expect(result.publishedPorts).toEqual(["3000:3000"]);
    expect(result.imageUpdateStatus).toBe("unknown");
    expect(result.aliases).toEqual(["my-app"]);
  });

  it("uses serviceName as role when present", () => {
    const result = serializeWorkload(makeWorkload({ serviceName: "web" }));
    expect(result.role).toBe("web");
  });

  it("falls back to container when no serviceName", () => {
    const result = serializeWorkload(makeWorkload({ serviceName: null }));
    expect(result.role).toBe("container");
  });
});

// ── applySharedTargetCounts ───────────────────────────────────────────────────

describe("applySharedTargetCounts", () => {
  it("sets sharedTargetCount to 1 for unique targets", () => {
    const routes = [
      makeRouteRecord({ target: "192.168.1.5:8080" }),
      makeRouteRecord({ slug: "b", target: "192.168.1.5:8081" }),
    ];
    const result = applySharedTargetCounts(routes);
    expect(result[0]?.sharedTargetCount).toBe(1);
    expect(result[1]?.sharedTargetCount).toBe(1);
  });

  it("sets correct count for shared targets", () => {
    const routes = [
      makeRouteRecord({ slug: "a", target: "192.168.1.5:8080" }),
      makeRouteRecord({ slug: "b", target: "192.168.1.5:8080" }),
      makeRouteRecord({ slug: "c", target: "192.168.1.5:8080" }),
    ];
    const result = applySharedTargetCounts(routes);
    expect(result.every((r) => r.sharedTargetCount === 3)).toBe(true);
  });

  it("returns empty array for empty input", () => {
    expect(applySharedTargetCounts([])).toEqual([]);
  });

  it("does not mutate the original array", () => {
    const routes = [makeRouteRecord({ target: "192.168.1.5:8080" })];
    const original = routes[0]?.sharedTargetCount;
    applySharedTargetCounts(routes);
    expect(routes[0]?.sharedTargetCount).toBe(original);
  });
});

// ── matchRouteToWorkload ──────────────────────────────────────────────────────
// Probe functions are injected via the optional _probes parameter so tests
// never open real sockets.

const noProbes = {
  tcpProbe: async () => false,
  httpAuthProbe: async () => false,
};

describe("matchRouteToWorkload — published port match", () => {
  const settings = makeSettings({ hostAddress: "192.168.1.5" });
  const hostCandidates = new Set(["192.168.1.5"]);

  it("matches via published port (high confidence)", async () => {
    const workload = makeWorkload({ publishedPorts: [{ publicPort: 8080, privatePort: 8080, hostIp: "0.0.0.0" }] });
    const route = makeEdgeRoute({ targetHost: "192.168.1.5", targetPort: 8080 });
    const result = await matchRouteToWorkload(route, [workload], settings, hostCandidates, noProbes);
    expect(result.matchState).toBe("matched");
    expect(result.confidence).toBe("high");
    expect(result.workload?.name).toBe("my-app");
  });

  it("returns ambiguous when multiple workloads publish same host port", async () => {
    const w1 = makeWorkload({ id: "1", name: "app1", publishedPorts: [{ publicPort: 8080, privatePort: 8080, hostIp: "0.0.0.0" }] });
    const w2 = makeWorkload({ id: "2", name: "app2", publishedPorts: [{ publicPort: 8080, privatePort: 8080, hostIp: "0.0.0.0" }] });
    const route = makeEdgeRoute({ targetHost: "192.168.1.5", targetPort: 8080 });
    const result = await matchRouteToWorkload(route, [w1, w2], settings, hostCandidates, noProbes);
    expect(result.matchState).toBe("ambiguous");
  });
});

describe("matchRouteToWorkload — host-mode inference", () => {
  const settings = makeSettings({ hostAddress: "192.168.1.5" });
  const hostCandidates = new Set(["192.168.1.5"]);

  it("matches via host-mode inference (medium confidence)", async () => {
    const workload = makeWorkload({ networkMode: "host", exposedPorts: [8123], publishedPorts: [] });
    const route = makeEdgeRoute({ targetHost: "192.168.1.5", targetPort: 8123 });
    const result = await matchRouteToWorkload(route, [workload], settings, hostCandidates, noProbes);
    expect(result.matchState).toBe("matched");
    expect(result.confidence).toBe("medium");
  });
});

describe("matchRouteToWorkload — alias match", () => {
  const settings = makeSettings({ hostAddress: "192.168.1.5" });
  const hostCandidates = new Set(["192.168.1.5"]);

  it("matches via container alias (high confidence)", async () => {
    const workload = makeWorkload({ aliases: ["my-app"], exposedPorts: [8080], networkMode: "bridge" });
    const route = makeEdgeRoute({ targetHost: "my-app", targetPort: 8080 });
    const result = await matchRouteToWorkload(route, [workload], settings, hostCandidates, noProbes);
    expect(result.matchState).toBe("matched");
    expect(result.confidence).toBe("high");
  });

  it("returns ambiguous when multiple aliases match", async () => {
    const w1 = makeWorkload({ id: "1", name: "a", aliases: ["shared-name"], exposedPorts: [8080] });
    const w2 = makeWorkload({ id: "2", name: "b", aliases: ["shared-name"], exposedPorts: [8080] });
    const route = makeEdgeRoute({ targetHost: "shared-name", targetPort: 8080 });
    const result = await matchRouteToWorkload(route, [w1, w2], settings, hostCandidates, noProbes);
    expect(result.matchState).toBe("ambiguous");
  });
});

describe("matchRouteToWorkload — internal IP match", () => {
  const settings = makeSettings({ hostAddress: "192.168.1.5" });
  const hostCandidates = new Set(["192.168.1.5"]);

  it("matches via internal container IP (high confidence)", async () => {
    const workload = makeWorkload({ internalIps: ["172.20.0.10"], exposedPorts: [8080] });
    const route = makeEdgeRoute({ targetHost: "172.20.0.10", targetPort: 8080 });
    const result = await matchRouteToWorkload(route, [workload], settings, hostCandidates, noProbes);
    expect(result.matchState).toBe("matched");
    expect(result.confidence).toBe("high");
  });
});

describe("matchRouteToWorkload — off-host and unmatched", () => {
  const settings = makeSettings({ hostAddress: "192.168.1.5" });
  const hostCandidates = new Set(["192.168.1.5"]);

  it("returns off_host for external IP with no workload match", async () => {
    const route = makeEdgeRoute({ targetHost: "8.8.8.8", targetPort: 443 });
    const result = await matchRouteToWorkload(route, [], settings, hostCandidates, noProbes);
    expect(result.matchState).toBe("off_host");
  });

  it("returns unmatched for host-like target with no workload and closed port", async () => {
    const route = makeEdgeRoute({ targetHost: "192.168.1.5", targetPort: 9999 });
    const result = await matchRouteToWorkload(route, [], settings, hostCandidates, noProbes);
    expect(result.matchState).toBe("unmatched");
  });
});

// ── createRouteRecord ─────────────────────────────────────────────────────────

import { createRouteRecord } from "./route-match";
import type { MatchResult } from "./route-match";

function makeMatchResult(overrides: Partial<MatchResult> = {}): MatchResult {
  return {
    matchState: "matched",
    confidence: "high",
    workload: null,
    relatedWorkloads: [],
    notes: "test match",
    ...overrides,
  };
}

describe("createRouteRecord", () => {
  const noop = () => false;

  it("builds a route record with correct slug and entrypoint", async () => {
    const route = makeEdgeRoute({ domains: ["app.example.com"], sourceId: "42" });
    const match = makeMatchResult();
    const record = await createRouteRecord(route, match, ["1.2.3.4"], "observed", "192.168.1.5", [], noop, noop, noProbes);
    expect(record.slug).toBe("app-example-com");
    expect(record.entrypoint).toBe("app.example.com");
    expect(record.primaryDomain).toBe("app.example.com");
  });

  it("uses sourceId as slug when no domain", async () => {
    const route = makeEdgeRoute({ domains: [], sourceId: "99" });
    const match = makeMatchResult({ matchState: "unmatched" });
    const record = await createRouteRecord(route, match, [], "unresolved", "192.168.1.5", [], noop, noop, noProbes);
    expect(record.slug).toBe("route-99");
    expect(record.entrypoint).toBe("route-99");
  });

  it("computes tlsDaysRemaining from tls.expiresAt", async () => {
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const route = makeEdgeRoute({ tls: { enabled: true, certName: "*.example.com", expiresAt: future } });
    const match = makeMatchResult();
    const record = await createRouteRecord(route, match, [], "observed", "192.168.1.5", [], noop, noop, noProbes);
    expect(record.tlsDaysRemaining).toBeGreaterThan(0);
    expect(record.certificateLabel).toBe("*.example.com");
  });

  it("sets tlsDaysRemaining null when no tls", async () => {
    const route = makeEdgeRoute({ tls: undefined });
    const match = makeMatchResult();
    const record = await createRouteRecord(route, match, [], "observed", "192.168.1.5", [], noop, noop, noProbes);
    expect(record.tlsDaysRemaining).toBeNull();
  });

  it("uses workload serviceName as workloadLabel when present", async () => {
    const workload = makeWorkload({ serviceName: "web", name: "myproject-web-1" });
    const match = makeMatchResult({ workload, relatedWorkloads: [] });
    const route = makeEdgeRoute();
    const record = await createRouteRecord(route, match, [], "observed", "192.168.1.5", [], noop, noop, noProbes);
    expect(record.workloadLabel).toBe("web");
  });

  it("falls back to workload name when no serviceName", async () => {
    const workload = makeWorkload({ serviceName: null, name: "standalone-app" });
    const match = makeMatchResult({ workload, relatedWorkloads: [] });
    const route = makeEdgeRoute();
    const record = await createRouteRecord(route, match, [], "observed", "192.168.1.5", [], noop, noop, noProbes);
    expect(record.workloadLabel).toBe("standalone-app");
  });

  it("uses host:port as workloadLabel for off_host routes", async () => {
    const match = makeMatchResult({ matchState: "off_host", workload: null });
    const route = makeEdgeRoute({ targetHost: "10.0.0.50", targetPort: 9000 });
    const record = await createRouteRecord(route, match, [], "observed", "192.168.1.5", [], noop, noop, noProbes);
    expect(record.workloadLabel).toBe("10.0.0.50:9000");
  });

  it("sets selfAuthDetected true when matchesSeedList returns true", async () => {
    const route = makeEdgeRoute();
    const match = makeMatchResult();
    const record = await createRouteRecord(route, match, [], "observed", "192.168.1.5", [], () => true, noop, noProbes);
    expect(record.selfAuthDetected).toBe(true);
  });

  it("sets selfAuthDetected true when matchesOverrides returns true", async () => {
    const route = makeEdgeRoute();
    const match = makeMatchResult();
    const record = await createRouteRecord(route, match, [], "observed", "192.168.1.5", ["my-app"], noop, () => true, noProbes);
    expect(record.selfAuthDetected).toBe(true);
  });

  it("preserves authSignals from route", async () => {
    const route = makeEdgeRoute({ authSignals: ["npm_access_list"] });
    const match = makeMatchResult();
    const record = await createRouteRecord(route, match, [], "observed", "192.168.1.5", [], noop, noop, noProbes);
    expect(record.authSignals).toContain("npm_access_list");
  });

  it("sets correct target string", async () => {
    const route = makeEdgeRoute({ targetHost: "172.20.0.5", targetPort: 3000 });
    const match = makeMatchResult();
    const record = await createRouteRecord(route, match, [], "observed", "192.168.1.5", [], noop, noop, noProbes);
    expect(record.target).toBe("172.20.0.5:3000");
  });

  it("passes through dnsAnswers and dnsStatus", async () => {
    const route = makeEdgeRoute();
    const match = makeMatchResult();
    const record = await createRouteRecord(route, match, ["1.2.3.4", "5.6.7.8"], "ok", "192.168.1.5", [], noop, noop, noProbes);
    expect(record.dnsAnswers).toEqual(["1.2.3.4", "5.6.7.8"]);
    expect(record.dnsStatus).toBe("ok");
  });
});
