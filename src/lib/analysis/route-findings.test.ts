import { describe, it, expect } from "vitest";
import {
  suppressionKey,
  hasAuthLayer,
  createFindings,
  stripImageToBaseName,
  isManagementSurface,
  matchesSelfAuthSeedList,
  matchesUserOverrides,
} from "./route-findings";
import type { ExposureIntent, Finding, RouteRecord } from "@/lib/routeviz-types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRoute(overrides: Partial<RouteRecord> = {}): RouteRecord {
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
    dnsAnswers: ["1.2.3.4"],
    tlsDaysRemaining: 60,
    certificateLabel: "app.example.com",
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

function makeIntent(overrides: Partial<ExposureIntent> = {}): ExposureIntent {
  const sevenDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  return {
    routeSlug: "app-example-com",
    routeLabel: "app.example.com",
    mode: "public_ok",
    expectedTarget: null,
    expiresAt: null,
    createdAt: sevenDaysAgo,
    updatedAt: sevenDaysAgo,
    ...overrides,
  };
}

// ── suppressionKey ────────────────────────────────────────────────────────────

describe("suppressionKey", () => {
  it("formats type:name", () => {
    expect(suppressionKey("no_auth_layer", "app-example-com")).toBe("no_auth_layer:app-example-com");
  });
});

// ── stripImageToBaseName ──────────────────────────────────────────────────────

describe("stripImageToBaseName", () => {
  it("strips registry prefix and tag", () => {
    expect(stripImageToBaseName("ghcr.io/user/portainer:latest")).toBe("portainer");
  });

  it("strips tag from simple image", () => {
    expect(stripImageToBaseName("grafana:10.0.0")).toBe("grafana");
  });

  it("handles image with no tag or prefix", () => {
    expect(stripImageToBaseName("nginx")).toBe("nginx");
  });

  it("lowercases the result", () => {
    expect(stripImageToBaseName("Portainer:CE")).toBe("portainer");
  });
});

// ── hasAuthLayer ──────────────────────────────────────────────────────────────

describe("hasAuthLayer", () => {
  it("returns false when no signals, no workloads, no selfAuth", () => {
    expect(hasAuthLayer(makeRoute())).toBe(false);
  });

  it("returns true when authSignals is non-empty", () => {
    expect(hasAuthLayer(makeRoute({ authSignals: ["npm_access_list"] }))).toBe(true);
  });

  it("returns true when authSignals has nginx_auth_request", () => {
    expect(hasAuthLayer(makeRoute({ authSignals: ["nginx_auth_request"] }))).toBe(true);
  });

  it("returns true from selfAuthDetected flag", () => {
    expect(hasAuthLayer(makeRoute({ selfAuthDetected: true }))).toBe(true);
  });

  it("returns true when AUTH_TOKEN found in related workload name", () => {
    const route = makeRoute({
      relatedWorkloads: [{ name: "authelia", image: "authelia/authelia:4.38", state: "running", role: "container", createdAt: null, composeProject: null, serviceName: null, composePath: null, publishedPorts: [], exposedPorts: [], networks: [], mounts: [], networkMode: "bridge", dockerSocketMount: "none", latestImageTag: null, imageUpdateStatus: "unknown" }],
    });
    expect(hasAuthLayer(route)).toBe(true);
  });

  it("returns true when AUTH_TOKEN found in related workload image", () => {
    const route = makeRoute({
      relatedWorkloads: [{ name: "forward-proxy", image: "thomseddon/traefik-forward-auth:latest", state: "running", role: "container", createdAt: null, composeProject: null, serviceName: null, composePath: null, publishedPorts: [], exposedPorts: [], networks: [], mounts: [], networkMode: "bridge", dockerSocketMount: "none", latestImageTag: null, imageUpdateStatus: "unknown" }],
    });
    expect(hasAuthLayer(route)).toBe(true);
  });

  it("handles missing authSignals gracefully (legacy snapshot compat)", () => {
    const route = makeRoute({ authSignals: undefined as unknown as string[] });
    expect(() => hasAuthLayer(route)).not.toThrow();
    expect(hasAuthLayer(route)).toBe(false);
  });
});

// ── isManagementSurface ───────────────────────────────────────────────────────

describe("isManagementSurface", () => {
  it("returns true for portainer image in relatedWorkloads", () => {
    const route = makeRoute({
      relatedWorkloads: [{ name: "portainer", image: "portainer/portainer-ce:latest", state: "running", role: "container", createdAt: null, composeProject: null, serviceName: null, composePath: null, publishedPorts: [], exposedPorts: [], networks: [], mounts: [], networkMode: "bridge", dockerSocketMount: "none", latestImageTag: null, imageUpdateStatus: "unknown" }],
    });
    expect(isManagementSurface(route)).toBe(true);
  });

  it("returns true when entrypoint contains a management token", () => {
    expect(isManagementSurface(makeRoute({ entrypoint: "portainer.example.com" }))).toBe(true);
  });

  it("returns false for normal app", () => {
    expect(isManagementSurface(makeRoute({ entrypoint: "app.example.com", workloadLabel: "my-app" }))).toBe(false);
  });

  it("returns true for grafana workload label", () => {
    expect(isManagementSurface(makeRoute({ workloadLabel: "grafana" }))).toBe(true);
  });
});

// ── matchesSelfAuthSeedList ───────────────────────────────────────────────────

describe("matchesSelfAuthSeedList", () => {
  it("matches jellyfin by workload label", () => {
    expect(matchesSelfAuthSeedList(makeRoute({ workloadLabel: "jellyfin" }))).toBe(true);
  });

  it("matches nextcloud by entrypoint substring", () => {
    expect(matchesSelfAuthSeedList(makeRoute({ entrypoint: "cloud.example.com", workloadLabel: "nextcloud" }))).toBe(true);
  });

  it("returns false for unknown app", () => {
    expect(matchesSelfAuthSeedList(makeRoute({ workloadLabel: "my-custom-app", entrypoint: "custom.example.com" }))).toBe(false);
  });

  it("matches immich-server from relatedWorkload image base name", () => {
    const route = makeRoute({
      relatedWorkloads: [{ name: "immich_server", image: "ghcr.io/immich-app/immich-server:latest", state: "running", role: "container", createdAt: null, composeProject: null, serviceName: null, composePath: null, publishedPorts: [], exposedPorts: [], networks: [], mounts: [], networkMode: "bridge", dockerSocketMount: "none", latestImageTag: null, imageUpdateStatus: "unknown" }],
    });
    expect(matchesSelfAuthSeedList(route)).toBe(true);
  });
});

// ── matchesUserOverrides ──────────────────────────────────────────────────────

describe("matchesUserOverrides", () => {
  it("returns false for empty overrides", () => {
    expect(matchesUserOverrides(makeRoute(), [])).toBe(false);
  });

  it("matches by entrypoint substring", () => {
    expect(matchesUserOverrides(makeRoute({ entrypoint: "app.example.com" }), ["app.example.com"])).toBe(true);
  });

  it("matches by workload label", () => {
    expect(matchesUserOverrides(makeRoute({ workloadLabel: "my-service" }), ["my-service"])).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(matchesUserOverrides(makeRoute({ workloadLabel: "MyService" }), ["myservice"])).toBe(true);
  });

  it("ignores empty override strings", () => {
    expect(matchesUserOverrides(makeRoute(), ["", "  "])).toBe(false);
  });
});

// ── createFindings — basic findings ──────────────────────────────────────────

describe("createFindings — no_auth_layer", () => {
  it("fires for route with no auth and no intent", () => {
    const findings = createFindings([makeRoute()], new Set());
    expect(findings.some((f) => f.type === "no_auth_layer")).toBe(true);
  });

  it("does not fire when authSignals present", () => {
    const findings = createFindings([makeRoute({ authSignals: ["npm_access_list"] })], new Set());
    expect(findings.some((f) => f.type === "no_auth_layer")).toBe(false);
  });

  it("does not fire when selfAuthDetected", () => {
    const findings = createFindings([makeRoute({ selfAuthDetected: true })], new Set());
    expect(findings.some((f) => f.type === "no_auth_layer")).toBe(false);
  });

  it("fires as management_surface for portainer with no auth", () => {
    const route = makeRoute({ workloadLabel: "portainer" });
    const findings = createFindings([route], new Set());
    expect(findings.some((f) => f.type === "management_surface")).toBe(true);
    expect(findings.some((f) => f.type === "no_auth_layer")).toBe(false);
  });

  it("is suppressed when suppression key matches", () => {
    const suppressed = new Set(["no_auth_layer:app-example-com"]);
    const findings = createFindings([makeRoute()], suppressed);
    expect(findings.some((f) => f.type === "no_auth_layer")).toBe(false);
  });
});

describe("createFindings — match state findings", () => {
  it("fires ambiguous_target for ambiguous match", () => {
    const findings = createFindings([makeRoute({ matchState: "ambiguous", authSignals: ["npm_access_list"] })], new Set());
    expect(findings.some((f) => f.type === "ambiguous_target")).toBe(true);
  });

  it("fires unmatched_target for unmatched route", () => {
    const findings = createFindings([makeRoute({ matchState: "unmatched", selfAuthDetected: true })], new Set());
    expect(findings.some((f) => f.type === "unmatched_target")).toBe(true);
  });

  it("fires off_host_target for off_host route", () => {
    const findings = createFindings([makeRoute({ matchState: "off_host", selfAuthDetected: true })], new Set());
    expect(findings.some((f) => f.type === "off_host_target")).toBe(true);
  });

  it("fires host_mode_inference for medium confidence", () => {
    const findings = createFindings([makeRoute({ confidence: "medium", selfAuthDetected: true })], new Set());
    expect(findings.some((f) => f.type === "host_mode_inference")).toBe(true);
  });
});

describe("createFindings — certificate findings", () => {
  it("fires certificate_expiring when tlsDaysRemaining <= 30", () => {
    const findings = createFindings([makeRoute({ tlsDaysRemaining: 14, selfAuthDetected: true })], new Set());
    expect(findings.some((f) => f.type === "certificate_expiring")).toBe(true);
  });

  it("fires certificate_expired when tlsDaysRemaining < 0", () => {
    const findings = createFindings([makeRoute({ tlsDaysRemaining: -3, selfAuthDetected: true })], new Set());
    expect(findings.some((f) => f.type === "certificate_expired")).toBe(true);
  });

  it("does not fire when tlsDaysRemaining > 30", () => {
    const findings = createFindings([makeRoute({ tlsDaysRemaining: 60, selfAuthDetected: true })], new Set());
    expect(findings.some((f) => f.type === "certificate_expiring" || f.type === "certificate_expired")).toBe(false);
  });

  it("does not fire when tlsDaysRemaining is null", () => {
    const findings = createFindings([makeRoute({ tlsDaysRemaining: null, selfAuthDetected: true })], new Set());
    expect(findings.some((f) => f.type === "certificate_expiring" || f.type === "certificate_expired")).toBe(false);
  });
});

describe("createFindings — DNS findings", () => {
  it("fires dns_unresolved when dnsStatus is unresolved", () => {
    const findings = createFindings([makeRoute({ dnsStatus: "unresolved", selfAuthDetected: true })], new Set());
    expect(findings.some((f) => f.type === "dns_unresolved")).toBe(true);
  });

  it("fires dns_mismatch when dnsStatus is mismatch", () => {
    const findings = createFindings([makeRoute({ dnsStatus: "mismatch", selfAuthDetected: true })], new Set());
    expect(findings.some((f) => f.type === "dns_mismatch")).toBe(true);
  });

  it("does not fire for dnsStatus observed", () => {
    const findings = createFindings([makeRoute({ dnsStatus: "observed", selfAuthDetected: true })], new Set());
    expect(findings.some((f) => f.type === "dns_unresolved" || f.type === "dns_mismatch")).toBe(false);
  });
});

describe("createFindings — duplicate and shared target", () => {
  it("fires duplicate_proxy_host when duplicateDomainCount > 1", () => {
    const findings = createFindings([makeRoute({ duplicateDomainCount: 2, selfAuthDetected: true })], new Set());
    expect(findings.some((f) => f.type === "duplicate_proxy_host")).toBe(true);
  });

  it("fires shared_forward_target when sharedTargetCount > 1", () => {
    const findings = createFindings([makeRoute({ sharedTargetCount: 3, selfAuthDetected: true })], new Set());
    expect(findings.some((f) => f.type === "shared_forward_target")).toBe(true);
  });

  it("shared_forward_target is medium severity for count 2", () => {
    const findings = createFindings([makeRoute({ sharedTargetCount: 2, selfAuthDetected: true })], new Set());
    const f = findings.find((f) => f.type === "shared_forward_target");
    expect(f?.severity).toBe("low");
  });

  it("shared_forward_target is medium severity for count >= 3", () => {
    const findings = createFindings([makeRoute({ sharedTargetCount: 3, selfAuthDetected: true })], new Set());
    const f = findings.find((f) => f.type === "shared_forward_target");
    expect(f?.severity).toBe("medium");
  });
});

describe("createFindings — docker socket write mount", () => {
  it("fires docker_socket_write_mount for read_write socket", () => {
    const route = makeRoute({
      selfAuthDetected: true,
      relatedWorkloads: [{ name: "portainer", image: "portainer/portainer-ce:latest", state: "running", role: "container", createdAt: null, composeProject: null, serviceName: null, composePath: null, publishedPorts: [], exposedPorts: [], networks: [], mounts: [], networkMode: "bridge", dockerSocketMount: "read_write", latestImageTag: null, imageUpdateStatus: "unknown" }],
    });
    const findings = createFindings([route], new Set());
    expect(findings.some((f) => f.type === "docker_socket_write_mount")).toBe(true);
  });

  it("does not fire for read_only socket", () => {
    const route = makeRoute({
      selfAuthDetected: true,
      relatedWorkloads: [{ name: "portainer", image: "portainer/portainer-ce:latest", state: "running", role: "container", createdAt: null, composeProject: null, serviceName: null, composePath: null, publishedPorts: [], exposedPorts: [], networks: [], mounts: [], networkMode: "bridge", dockerSocketMount: "read_only", latestImageTag: null, imageUpdateStatus: "unknown" }],
    });
    const findings = createFindings([route], new Set());
    expect(findings.some((f) => f.type === "docker_socket_write_mount")).toBe(false);
  });
});

// ── createFindings — intent_drift ─────────────────────────────────────────────

describe("createFindings — intent_drift", () => {
  const OLD = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const RECENT = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();

  it("fires private_only drift when route is public and intent is old enough", () => {
    const intent = makeIntent({ mode: "private_only", updatedAt: OLD, createdAt: OLD });
    const map = new Map([["app-example-com", intent]]);
    const findings = createFindings([makeRoute({ selfAuthDetected: true })], new Set(), map, 7);
    expect(findings.some((f) => f.type === "intent_drift")).toBe(true);
  });

  it("does NOT fire private_only drift within drift interval", () => {
    const intent = makeIntent({ mode: "private_only", updatedAt: RECENT, createdAt: RECENT });
    const map = new Map([["app-example-com", intent]]);
    const findings = createFindings([makeRoute({ selfAuthDetected: true })], new Set(), map, 7);
    expect(findings.some((f) => f.type === "intent_drift")).toBe(false);
  });

  it("fires auth_required drift when no auth layer and intent is old enough", () => {
    const intent = makeIntent({ mode: "auth_required", updatedAt: OLD, createdAt: OLD });
    const map = new Map([["app-example-com", intent]]);
    const findings = createFindings([makeRoute()], new Set(), map, 7);
    expect(findings.some((f) => f.type === "intent_drift")).toBe(true);
  });

  it("does NOT fire auth_required drift when auth layer present", () => {
    const intent = makeIntent({ mode: "auth_required", updatedAt: OLD, createdAt: OLD });
    const map = new Map([["app-example-com", intent]]);
    const findings = createFindings([makeRoute({ authSignals: ["npm_access_list"] })], new Set(), map, 7);
    expect(findings.some((f) => f.type === "intent_drift")).toBe(false);
  });

  it("fires target_changed drift when expectedTarget does not match", () => {
    const intent = makeIntent({ expectedTarget: "192.168.1.5:8000", updatedAt: OLD, createdAt: OLD });
    const map = new Map([["app-example-com", intent]]);
    const findings = createFindings([makeRoute({ selfAuthDetected: true })], new Set(), map, 7);
    expect(findings.some((f) => f.type === "intent_drift")).toBe(true);
  });

  it("does NOT fire target_changed when expectedTarget matches route target", () => {
    const intent = makeIntent({ expectedTarget: "192.168.1.5:8080", updatedAt: OLD, createdAt: OLD });
    const map = new Map([["app-example-com", intent]]);
    const findings = createFindings([makeRoute({ selfAuthDetected: true })], new Set(), map, 7);
    expect(findings.some((f) => f.type === "intent_drift")).toBe(false);
  });

  it("fires temporary_public expired drift for expired intent", () => {
    const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const intent = makeIntent({ mode: "temporary_public", expiresAt: pastDate, updatedAt: OLD, createdAt: OLD });
    const map = new Map([["app-example-com", intent]]);
    const findings = createFindings([makeRoute({ selfAuthDetected: true })], new Set(), map, 7);
    expect(findings.some((f) => f.type === "intent_drift")).toBe(true);
  });

  it("does NOT fire for public_ok intent with no other drift", () => {
    const intent = makeIntent({ mode: "public_ok", updatedAt: OLD, createdAt: OLD });
    const map = new Map([["app-example-com", intent]]);
    const findings = createFindings([makeRoute()], new Set(), map, 7);
    expect(findings.some((f) => f.type === "intent_drift")).toBe(false);
    expect(findings.some((f) => f.type === "no_auth_layer")).toBe(false);
  });

  it("intent_drift is suppressed by suppression key", () => {
    const intent = makeIntent({ mode: "private_only", updatedAt: OLD, createdAt: OLD });
    const map = new Map([["app-example-com", intent]]);
    const suppressed = new Set(["intent_drift:app-example-com"]);
    const findings = createFindings([makeRoute({ selfAuthDetected: true })], suppressed, map, 7);
    expect(findings.some((f) => f.type === "intent_drift")).toBe(false);
  });

  it("respects custom driftIntervalDays", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const intent = makeIntent({ mode: "private_only", updatedAt: twoHoursAgo, createdAt: twoHoursAgo });
    const map = new Map([["app-example-com", intent]]);
    // 7 day default: should not fire (only 2 hours old)
    expect(createFindings([makeRoute({ selfAuthDetected: true })], new Set(), map, 7).some((f) => f.type === "intent_drift")).toBe(false);
    // 0 days: should fire immediately
    expect(createFindings([makeRoute({ selfAuthDetected: true })], new Set(), map, 0).some((f) => f.type === "intent_drift")).toBe(true);
  });
});

describe("createFindings — finding severity ordering", () => {
  it("returns high findings before medium and low", () => {
    const route = makeRoute({
      matchState: "unmatched",
      duplicateDomainCount: 2,
      tlsDaysRemaining: 20,
      selfAuthDetected: true,
    });
    const findings = createFindings([route], new Set());
    const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    for (let i = 1; i < findings.length; i++) {
      expect(severityOrder[findings[i - 1]!.severity]).toBeLessThanOrEqual(severityOrder[findings[i]!.severity]);
    }
  });
});

describe("createFindings — no findings for clean route", () => {
  it("produces no findings for a fully healthy route", () => {
    const route = makeRoute({
      selfAuthDetected: true,
      matchState: "matched",
      confidence: "high",
      tlsDaysRemaining: 90,
      dnsStatus: "observed",
      duplicateDomainCount: 1,
      sharedTargetCount: 1,
    });
    const findings = createFindings([route], new Set());
    expect(findings).toHaveLength(0);
  });
});
