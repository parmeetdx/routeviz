import { describe, it, expect, vi, afterEach } from "vitest";
import { createWorkloadFindings, BACKUP_TOOL_IMAGES, PERSISTENT_PATH_PREFIXES } from "./workload-findings";
import type { DockerWorkload } from "@/lib/collectors/docker";
import type { RouteRecord } from "@/lib/routeviz-types";

function makeWorkload(overrides: Partial<DockerWorkload> = {}): DockerWorkload {
  return {
    id: "abc123",
    name: "my-app",
    image: "myapp:1.2.3",
    latestImageTag: null,
    imageUpdateStatus: "unknown",
    state: "running",
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    composeProject: "myproject",
    serviceName: "app",
    composePath: null,
    aliases: [],
    internalIps: [],
    publishedPorts: [],
    exposedPorts: [],
    networks: ["bridge"],
    mounts: [],
    networkMode: "bridge",
    dockerSocketMount: "none",
    ...overrides,
  };
}

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
    relatedWorkloads: [{ name: "my-app", image: "myapp:1.2.3", state: "running", role: "container", createdAt: null, composeProject: "myproject", serviceName: "app", composePath: null, publishedPorts: [], exposedPorts: [], networks: [], mounts: [], networkMode: "bridge", dockerSocketMount: "none", latestImageTag: null, imageUpdateStatus: "unknown" }],
    ...overrides,
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

describe("BACKUP_TOOL_IMAGES constant", () => {
  it("contains expected backup tools", () => {
    expect(BACKUP_TOOL_IMAGES.has("restic")).toBe(true);
    expect(BACKUP_TOOL_IMAGES.has("duplicati")).toBe(true);
    expect(BACKUP_TOOL_IMAGES.has("kopia")).toBe(true);
  });
});

describe("PERSISTENT_PATH_PREFIXES constant", () => {
  it("contains common persistent paths", () => {
    expect(PERSISTENT_PATH_PREFIXES).toContain("/data");
    expect(PERSISTENT_PATH_PREFIXES).toContain("/config");
    expect(PERSISTENT_PATH_PREFIXES).toContain("/home");
  });
});

// ── port_bypass ───────────────────────────────────────────────────────────────

describe("createWorkloadFindings — port_bypass", () => {
  it("fires for workload with published port not in any route", () => {
    const workload = makeWorkload({
      publishedPorts: [{ publicPort: 9000, privatePort: 9000, hostIp: "0.0.0.0" }],
    });
    const findings = createWorkloadFindings([workload], [], new Set());
    expect(findings.some((f) => f.type === "port_bypass")).toBe(true);
  });

  it("does not fire when workload is linked to a route", () => {
    const workload = makeWorkload({
      name: "my-app",
      publishedPorts: [{ publicPort: 8080, privatePort: 8080, hostIp: "0.0.0.0" }],
    });
    const route = makeRoute({ relatedWorkloads: [{ name: "my-app", image: "myapp:1.2.3", state: "running", role: "container", createdAt: null, composeProject: null, serviceName: null, composePath: null, publishedPorts: [], exposedPorts: [], networks: [], mounts: [], networkMode: "bridge", dockerSocketMount: "none", latestImageTag: null, imageUpdateStatus: "unknown" }] });
    const findings = createWorkloadFindings([workload], [route], new Set());
    expect(findings.some((f) => f.type === "port_bypass")).toBe(false);
  });

  it("does not fire when port is bound to localhost only", () => {
    const workload = makeWorkload({
      publishedPorts: [{ publicPort: 9000, privatePort: 9000, hostIp: "127.0.0.1" }],
    });
    const findings = createWorkloadFindings([workload], [], new Set());
    expect(findings.some((f) => f.type === "port_bypass")).toBe(false);
  });

  it("deduplicates multiple published ports with same publicPort", () => {
    const workload = makeWorkload({
      publishedPorts: [
        { publicPort: 9000, privatePort: 9000, hostIp: "0.0.0.0" },
        { publicPort: 9000, privatePort: 9000, hostIp: "::" },
      ],
    });
    const findings = createWorkloadFindings([workload], [], new Set());
    const bypassFindings = findings.filter((f) => f.type === "port_bypass");
    expect(bypassFindings).toHaveLength(1);
    expect(bypassFindings[0]?.evidence).toContain("9000→9000");
    expect(bypassFindings[0]?.evidence).not.toContain("9000→9000, 9000→9000");
  });

  it("is suppressed when suppression key matches", () => {
    const workload = makeWorkload({
      name: "my-app",
      publishedPorts: [{ publicPort: 9000, privatePort: 9000, hostIp: "0.0.0.0" }],
    });
    const suppressed = new Set(["port_bypass:my-app"]);
    const findings = createWorkloadFindings([workload], [], suppressed);
    expect(findings.some((f) => f.type === "port_bypass")).toBe(false);
  });
});

// ── image findings ────────────────────────────────────────────────────────────

describe("createWorkloadFindings — image_outdated", () => {
  it("fires when imageUpdateStatus is outdated", () => {
    const workload = makeWorkload({ image: "myapp:1.0.0", imageUpdateStatus: "outdated", latestImageTag: "2.0.0" });
    const findings = createWorkloadFindings([workload], [], new Set());
    expect(findings.some((f) => f.type === "image_outdated")).toBe(true);
  });

  it("includes running tag and latest tag in evidence", () => {
    const workload = makeWorkload({ image: "myapp:1.0.0", imageUpdateStatus: "outdated", latestImageTag: "2.0.0" });
    const findings = createWorkloadFindings([workload], [], new Set());
    const f = findings.find((f) => f.type === "image_outdated");
    expect(f?.evidence).toContain("myapp:1.0.0");
    expect(f?.evidence).toContain("2.0.0");
  });

  it("does not fire when imageUpdateStatus is up_to_date", () => {
    const workload = makeWorkload({ image: "myapp:2.0.0", imageUpdateStatus: "up_to_date" });
    const findings = createWorkloadFindings([workload], [], new Set());
    expect(findings.some((f) => f.type === "image_outdated")).toBe(false);
  });

  it("is suppressed", () => {
    const workload = makeWorkload({ name: "my-app", image: "myapp:1.0.0", imageUpdateStatus: "outdated", latestImageTag: "2.0.0" });
    const findings = createWorkloadFindings([workload], [], new Set(["image_outdated:my-app"]));
    expect(findings.some((f) => f.type === "image_outdated")).toBe(false);
  });
});

describe("createWorkloadFindings — image_latest (unpinned)", () => {
  it("fires for :latest tag", () => {
    const workload = makeWorkload({ image: "myapp:latest" });
    const findings = createWorkloadFindings([workload], [], new Set());
    expect(findings.some((f) => f.type === "image_latest")).toBe(true);
  });

  it("fires for untagged image with registry prefix", () => {
    const workload = makeWorkload({ image: "ghcr.io/user/myapp" });
    const findings = createWorkloadFindings([workload], [], new Set());
    expect(findings.some((f) => f.type === "image_latest")).toBe(true);
  });

  it("does not fire for pinned semver tag", () => {
    const workload = makeWorkload({ image: "myapp:1.2.3", imageUpdateStatus: "up_to_date" });
    const findings = createWorkloadFindings([workload], [], new Set());
    expect(findings.some((f) => f.type === "image_latest")).toBe(false);
  });

  it("includes latest tag nudge in evidence when available", () => {
    const workload = makeWorkload({ image: "myapp:latest", imageUpdateStatus: "unknown", latestImageTag: "2.1.0" });
    const findings = createWorkloadFindings([workload], [], new Set());
    const f = findings.find((f) => f.type === "image_latest");
    expect(f?.evidence).toContain("2.1.0");
  });
});

describe("createWorkloadFindings — image_no_data", () => {
  it("fires for private registry image with no_data status", () => {
    const workload = makeWorkload({ image: "registry.internal/myapp:1.0.0", imageUpdateStatus: "no_data" });
    const findings = createWorkloadFindings([workload], [], new Set());
    expect(findings.some((f) => f.type === "image_no_data")).toBe(true);
  });

  it("does not fire for :latest tag even with no_data (image_latest fires instead)", () => {
    const workload = makeWorkload({ image: "registry.internal/myapp:latest", imageUpdateStatus: "no_data" });
    const findings = createWorkloadFindings([workload], [], new Set());
    expect(findings.some((f) => f.type === "image_no_data")).toBe(false);
    expect(findings.some((f) => f.type === "image_latest")).toBe(true);
  });
});

describe("createWorkloadFindings — image_check", () => {
  it("fires when pinned non-semver and latestImageTag available", () => {
    const workload = makeWorkload({ image: "myapp:stable", imageUpdateStatus: "unknown", latestImageTag: "2.0.0" });
    const findings = createWorkloadFindings([workload], [], new Set());
    expect(findings.some((f) => f.type === "image_check")).toBe(true);
  });

  it("does not fire when no latestImageTag", () => {
    const workload = makeWorkload({ image: "myapp:stable", imageUpdateStatus: "unknown", latestImageTag: null });
    const findings = createWorkloadFindings([workload], [], new Set());
    expect(findings.some((f) => f.type === "image_check")).toBe(false);
  });
});

// ── image_stale ───────────────────────────────────────────────────────────────

describe("createWorkloadFindings — image_stale", () => {
  it("fires for workload older than 180 days", () => {
    const old = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
    const workload = makeWorkload({ createdAt: old, image: "myapp:1.0.0" });
    const findings = createWorkloadFindings([workload], [], new Set());
    expect(findings.some((f) => f.type === "image_stale")).toBe(true);
  });

  it("does not fire for workload younger than 180 days", () => {
    const recent = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const workload = makeWorkload({ createdAt: recent, image: "myapp:1.0.0" });
    const findings = createWorkloadFindings([workload], [], new Set());
    expect(findings.some((f) => f.type === "image_stale")).toBe(false);
  });

  it("does not fire when createdAt is null", () => {
    const workload = makeWorkload({ createdAt: null });
    const findings = createWorkloadFindings([workload], [], new Set());
    expect(findings.some((f) => f.type === "image_stale")).toBe(false);
  });

  it("includes age in days in the evidence", () => {
    const old = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
    const workload = makeWorkload({ createdAt: old, image: "myapp:1.0.0" });
    const findings = createWorkloadFindings([workload], [], new Set());
    const f = findings.find((f) => f.type === "image_stale");
    expect(f?.evidence).toContain("200 days");
  });
});

// ── no_backup ─────────────────────────────────────────────────────────────────

describe("createWorkloadFindings — no_backup", () => {
  it("fires for workload with persistent mount and no backup tool in project", () => {
    const workload = makeWorkload({ mounts: ["/data/myapp"], composeProject: "myproject" });
    const findings = createWorkloadFindings([workload], [], new Set());
    expect(findings.some((f) => f.type === "no_backup")).toBe(true);
  });

  it("does not fire when backup tool is in same compose project", () => {
    const app = makeWorkload({ name: "app", mounts: ["/data/myapp"], composeProject: "myproject" });
    const backup = makeWorkload({ name: "backup", image: "restic:latest", composeProject: "myproject", serviceName: "restic" });
    const findings = createWorkloadFindings([app, backup], [], new Set());
    expect(findings.some((f) => f.type === "no_backup" && f.workloadName === "app")).toBe(false);
  });

  it("does not fire when mount path is not persistent", () => {
    const workload = makeWorkload({ mounts: ["/tmp/cache", "/run/sockets"] });
    const findings = createWorkloadFindings([workload], [], new Set());
    expect(findings.some((f) => f.type === "no_backup")).toBe(false);
  });

  it("fires for /config mount", () => {
    const workload = makeWorkload({ mounts: ["/config/app"] });
    const findings = createWorkloadFindings([workload], [], new Set());
    expect(findings.some((f) => f.type === "no_backup")).toBe(true);
  });

  it("is suppressed", () => {
    const workload = makeWorkload({ name: "my-app", mounts: ["/data/myapp"] });
    const findings = createWorkloadFindings([workload], [], new Set(["no_backup:my-app"]));
    expect(findings.some((f) => f.type === "no_backup")).toBe(false);
  });

  it("truncates mount list after 3 in evidence", () => {
    const workload = makeWorkload({ mounts: ["/data/a", "/data/b", "/data/c", "/data/d", "/data/e"] });
    const findings = createWorkloadFindings([workload], [], new Set());
    const f = findings.find((f) => f.type === "no_backup");
    expect(f?.evidence).toContain("+2 more");
  });
});
