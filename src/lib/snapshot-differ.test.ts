import { describe, it, expect } from "vitest";
import { diffSnapshots } from "./snapshot-differ";
import type { RouteRecord, RoutevizSnapshot, Finding } from "./routeviz-types";

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
    dnsAnswers: [],
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

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "app-example-com-no_auth_layer",
    routeSlug: "app-example-com",
    type: "no_auth_layer",
    severity: "medium",
    title: "app.example.com has no auth layer",
    evidence: "No access list found.",
    nextCheck: "Add auth.",
    ...overrides,
  };
}

function makeSnapshot(overrides: { routes?: RouteRecord[]; findings?: Finding[] } = {}): RoutevizSnapshot {
  return {
    id: "snap-1",
    generatedAt: "2026-04-20T10:00:00.000Z",
    generatedLabel: "Apr 20",
    hostLabel: "miniserver",
    hostAddress: "192.168.1.5",
    dnsBaseline: { mode: "disabled", value: "", helper: "" },
    scanConfig: { manualEnabled: true, intervalEnabled: true, intervalMinutes: 5, retentionLimit: 576, driftIntervalDays: 7, lastCompletedAt: null, nextScheduledAt: null },
    connectors: [],
    workloads: [],
    routes: overrides.routes ?? [makeRoute()],
    findings: overrides.findings ?? [],
    workloadFindings: [],
    changes: [],
  };
}

// ── route_added / route_removed ───────────────────────────────────────────────

describe("diffSnapshots — route_added", () => {
  it("detects new route in current snapshot", () => {
    const prev = makeSnapshot({ routes: [] });
    const curr = makeSnapshot({ routes: [makeRoute()] });
    const changes = diffSnapshots(prev, curr);
    expect(changes.some((c) => c.kind === "route_added" && c.routeSlug === "app-example-com")).toBe(true);
  });

  it("route_added is low severity", () => {
    const prev = makeSnapshot({ routes: [] });
    const curr = makeSnapshot({ routes: [makeRoute()] });
    const change = diffSnapshots(prev, curr).find((c) => c.kind === "route_added");
    expect(change?.severity).toBe("low");
  });

  it("does not fire route_added for route present in both", () => {
    const snap = makeSnapshot();
    const changes = diffSnapshots(snap, snap);
    expect(changes.some((c) => c.kind === "route_added")).toBe(false);
  });
});

describe("diffSnapshots — route_removed", () => {
  it("detects route removed from current snapshot", () => {
    const prev = makeSnapshot({ routes: [makeRoute()] });
    const curr = makeSnapshot({ routes: [] });
    const changes = diffSnapshots(prev, curr);
    expect(changes.some((c) => c.kind === "route_removed" && c.routeSlug === "app-example-com")).toBe(true);
  });

  it("route_removed is high severity", () => {
    const prev = makeSnapshot({ routes: [makeRoute()] });
    const curr = makeSnapshot({ routes: [] });
    const change = diffSnapshots(prev, curr).find((c) => c.kind === "route_removed");
    expect(change?.severity).toBe("high");
  });
});

// ── match_lost / match_recovered ──────────────────────────────────────────────

describe("diffSnapshots — match_lost", () => {
  it("fires when route transitions from matched to unmatched", () => {
    const prev = makeSnapshot({ routes: [makeRoute({ matchState: "matched" })] });
    const curr = makeSnapshot({ routes: [makeRoute({ matchState: "unmatched" })] });
    const changes = diffSnapshots(prev, curr);
    expect(changes.some((c) => c.kind === "match_lost")).toBe(true);
  });

  it("fires when route transitions from matched to ambiguous", () => {
    const prev = makeSnapshot({ routes: [makeRoute({ matchState: "matched" })] });
    const curr = makeSnapshot({ routes: [makeRoute({ matchState: "ambiguous" })] });
    expect(diffSnapshots(prev, curr).some((c) => c.kind === "match_lost")).toBe(true);
  });

  it("match_lost is high severity", () => {
    const prev = makeSnapshot({ routes: [makeRoute({ matchState: "matched" })] });
    const curr = makeSnapshot({ routes: [makeRoute({ matchState: "unmatched" })] });
    const change = diffSnapshots(prev, curr).find((c) => c.kind === "match_lost");
    expect(change?.severity).toBe("high");
  });

  it("does not fire when already unmatched in both", () => {
    const prev = makeSnapshot({ routes: [makeRoute({ matchState: "unmatched" })] });
    const curr = makeSnapshot({ routes: [makeRoute({ matchState: "unmatched" })] });
    expect(diffSnapshots(prev, curr).some((c) => c.kind === "match_lost")).toBe(false);
  });
});

describe("diffSnapshots — match_recovered", () => {
  it("fires when route transitions from unmatched to matched", () => {
    const prev = makeSnapshot({ routes: [makeRoute({ matchState: "unmatched" })] });
    const curr = makeSnapshot({ routes: [makeRoute({ matchState: "matched" })] });
    expect(diffSnapshots(prev, curr).some((c) => c.kind === "match_recovered")).toBe(true);
  });

  it("match_recovered is low severity", () => {
    const prev = makeSnapshot({ routes: [makeRoute({ matchState: "ambiguous" })] });
    const curr = makeSnapshot({ routes: [makeRoute({ matchState: "matched" })] });
    const change = diffSnapshots(prev, curr).find((c) => c.kind === "match_recovered");
    expect(change?.severity).toBe("low");
  });
});

// ── cert_expiry_warning ───────────────────────────────────────────────────────

describe("diffSnapshots — cert_expiry_warning", () => {
  it("fires when cert crosses into the 30-day window", () => {
    const prev = makeSnapshot({ routes: [makeRoute({ tlsDaysRemaining: 45 })] });
    const curr = makeSnapshot({ routes: [makeRoute({ tlsDaysRemaining: 14 })] });
    expect(diffSnapshots(prev, curr).some((c) => c.kind === "cert_expiry_warning")).toBe(true);
  });

  it("is medium severity", () => {
    const prev = makeSnapshot({ routes: [makeRoute({ tlsDaysRemaining: 45 })] });
    const curr = makeSnapshot({ routes: [makeRoute({ tlsDaysRemaining: 14 })] });
    const change = diffSnapshots(prev, curr).find((c) => c.kind === "cert_expiry_warning");
    expect(change?.severity).toBe("medium");
  });

  it("does not fire when cert was already in window in prev", () => {
    const prev = makeSnapshot({ routes: [makeRoute({ tlsDaysRemaining: 20 })] });
    const curr = makeSnapshot({ routes: [makeRoute({ tlsDaysRemaining: 14 })] });
    expect(diffSnapshots(prev, curr).some((c) => c.kind === "cert_expiry_warning")).toBe(false);
  });

  it("does not fire when cert is still outside window", () => {
    const prev = makeSnapshot({ routes: [makeRoute({ tlsDaysRemaining: 60 })] });
    const curr = makeSnapshot({ routes: [makeRoute({ tlsDaysRemaining: 45 })] });
    expect(diffSnapshots(prev, curr).some((c) => c.kind === "cert_expiry_warning")).toBe(false);
  });

  it("does not fire when tlsDaysRemaining is null", () => {
    const prev = makeSnapshot({ routes: [makeRoute({ tlsDaysRemaining: null })] });
    const curr = makeSnapshot({ routes: [makeRoute({ tlsDaysRemaining: null })] });
    expect(diffSnapshots(prev, curr).some((c) => c.kind === "cert_expiry_warning")).toBe(false);
  });

  it("includes days remaining in description", () => {
    const prev = makeSnapshot({ routes: [makeRoute({ tlsDaysRemaining: 45 })] });
    const curr = makeSnapshot({ routes: [makeRoute({ tlsDaysRemaining: 7 })] });
    const change = diffSnapshots(prev, curr).find((c) => c.kind === "cert_expiry_warning");
    expect(change?.description).toContain("7 days");
  });
});

// ── container_down ────────────────────────────────────────────────────────────

describe("diffSnapshots — container_down", () => {
  it("fires when a related workload transitions from running to stopped", () => {
    const wRunning = { name: "my-app", image: "myapp:1.0", state: "running", role: "container", createdAt: null, composeProject: null, serviceName: null, composePath: null, publishedPorts: [], exposedPorts: [], networks: [], mounts: [], networkMode: "bridge", dockerSocketMount: "none" as const, latestImageTag: null, imageUpdateStatus: "unknown" as const };
    const wStopped = { ...wRunning, state: "exited" };
    const prev = makeSnapshot({ routes: [makeRoute({ relatedWorkloads: [wRunning] })] });
    const curr = makeSnapshot({ routes: [makeRoute({ relatedWorkloads: [wStopped] })] });
    expect(diffSnapshots(prev, curr).some((c) => c.kind === "container_down")).toBe(true);
  });

  it("container_down is high severity", () => {
    const wRunning = { name: "my-app", image: "myapp:1.0", state: "running", role: "container", createdAt: null, composeProject: null, serviceName: null, composePath: null, publishedPorts: [], exposedPorts: [], networks: [], mounts: [], networkMode: "bridge", dockerSocketMount: "none" as const, latestImageTag: null, imageUpdateStatus: "unknown" as const };
    const wStopped = { ...wRunning, state: "exited" };
    const prev = makeSnapshot({ routes: [makeRoute({ relatedWorkloads: [wRunning] })] });
    const curr = makeSnapshot({ routes: [makeRoute({ relatedWorkloads: [wStopped] })] });
    const change = diffSnapshots(prev, curr).find((c) => c.kind === "container_down");
    expect(change?.severity).toBe("high");
  });

  it("does not fire when workload was already stopped in prev", () => {
    const wStopped = { name: "my-app", image: "myapp:1.0", state: "exited", role: "container", createdAt: null, composeProject: null, serviceName: null, composePath: null, publishedPorts: [], exposedPorts: [], networks: [], mounts: [], networkMode: "bridge", dockerSocketMount: "none" as const, latestImageTag: null, imageUpdateStatus: "unknown" as const };
    const prev = makeSnapshot({ routes: [makeRoute({ relatedWorkloads: [wStopped] })] });
    const curr = makeSnapshot({ routes: [makeRoute({ relatedWorkloads: [wStopped] })] });
    expect(diffSnapshots(prev, curr).some((c) => c.kind === "container_down")).toBe(false);
  });
});

// ── finding_appeared / finding_resolved ───────────────────────────────────────

describe("diffSnapshots — finding_appeared", () => {
  it("fires for new high-severity finding", () => {
    const finding = makeFinding({ severity: "high" });
    const prev = makeSnapshot({ findings: [] });
    const curr = makeSnapshot({ findings: [finding] });
    expect(diffSnapshots(prev, curr).some((c) => c.kind === "finding_appeared")).toBe(true);
  });

  it("does not fire for new medium/low severity findings (noise reduction)", () => {
    const finding = makeFinding({ severity: "medium" });
    const prev = makeSnapshot({ findings: [] });
    const curr = makeSnapshot({ findings: [finding] });
    expect(diffSnapshots(prev, curr).some((c) => c.kind === "finding_appeared")).toBe(false);
  });

  it("does not fire for finding present in both snapshots", () => {
    const finding = makeFinding({ severity: "high" });
    const snap = makeSnapshot({ findings: [finding] });
    expect(diffSnapshots(snap, snap).some((c) => c.kind === "finding_appeared")).toBe(false);
  });
});

describe("diffSnapshots — finding_resolved", () => {
  it("fires when high-severity finding disappears", () => {
    const finding = makeFinding({ severity: "high" });
    const prev = makeSnapshot({ findings: [finding] });
    const curr = makeSnapshot({ findings: [] });
    expect(diffSnapshots(prev, curr).some((c) => c.kind === "finding_resolved")).toBe(true);
  });

  it("finding_resolved is low severity", () => {
    const finding = makeFinding({ severity: "high" });
    const prev = makeSnapshot({ findings: [finding] });
    const curr = makeSnapshot({ findings: [] });
    const change = diffSnapshots(prev, curr).find((c) => c.kind === "finding_resolved");
    expect(change?.severity).toBe("low");
  });
});

// ── sort order ────────────────────────────────────────────────────────────────

describe("diffSnapshots — sort order", () => {
  it("returns high changes before medium and low", () => {
    const prev = makeSnapshot({ routes: [], findings: [] });
    const curr = makeSnapshot({
      routes: [
        makeRoute({ slug: "a", entrypoint: "a.com" }),
        makeRoute({ slug: "b", entrypoint: "b.com" }),
      ],
      findings: [makeFinding({ id: "a-no_auth", routeSlug: "a", severity: "high" })],
    });
    const changes = diffSnapshots(prev, curr);
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    for (let i = 1; i < changes.length; i++) {
      expect(order[changes[i - 1]!.severity]).toBeLessThanOrEqual(order[changes[i]!.severity]);
    }
  });
});

describe("diffSnapshots — empty snapshots", () => {
  it("returns no changes when both snapshots are empty", () => {
    const empty = makeSnapshot({ routes: [], findings: [] });
    expect(diffSnapshots(empty, empty)).toHaveLength(0);
  });

  it("returns no changes when snapshots are identical", () => {
    const snap = makeSnapshot();
    expect(diffSnapshots(snap, snap)).toHaveLength(0);
  });
});
