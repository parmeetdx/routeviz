import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  normalizeDnsMode,
  normalizeSettings,
  getNextScheduledAt,
  attachCurrentSettings,
  DEFAULT_INTERVAL_MINUTES,
  DEFAULT_RETENTION_LIMIT,
  DEFAULT_DRIFT_INTERVAL_DAYS,
} from "./settings";
import type { PersistedSettings, RoutevizSnapshot } from "./routeviz-types";

function makeSettings(overrides: Partial<PersistedSettings> = {}): PersistedSettings {
  return {
    dockerSocketPath: "/var/run/docker.sock",
    hostAddress: "192.168.1.5",
    hostLabel: "miniserver",
    connectors: [{ id: "npm", type: "npm", label: "Nginx Proxy Manager", enabled: true, options: { mode: "sqlite", sqlitePath: "/data/npm.sqlite", apiUrl: "", apiToken: "" } }],
    dnsBaseline: { mode: "disabled", value: "" },
    scanConfig: {
      intervalEnabled: true,
      intervalMinutes: 5,
      retentionLimit: 576,
      driftIntervalDays: 7,
    },
    webhookConfig: {
      enabled: false,
      url: "",
      severityThreshold: "high",
      lastDeliveryAt: null,
      lastDeliveryStatus: null,
    },
    authOverrides: [],
    suppressedFindings: [],
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<RoutevizSnapshot> = {}): RoutevizSnapshot {
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
    routes: [],
    findings: [],
    workloadFindings: [],
    changes: [],
    ...overrides,
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("DEFAULT_INTERVAL_MINUTES is 5", () => {
    expect(DEFAULT_INTERVAL_MINUTES).toBe(5);
  });

  it("DEFAULT_RETENTION_LIMIT is 576", () => {
    expect(DEFAULT_RETENTION_LIMIT).toBe(576);
  });

  it("DEFAULT_DRIFT_INTERVAL_DAYS is 7", () => {
    expect(DEFAULT_DRIFT_INTERVAL_DAYS).toBe(7);
  });
});

// ── normalizeDnsMode ──────────────────────────────────────────────────────────

describe("normalizeDnsMode", () => {
  it("accepts reference_hostname", () => {
    expect(normalizeDnsMode("reference_hostname")).toBe("reference_hostname");
  });

  it("accepts manual_endpoint", () => {
    expect(normalizeDnsMode("manual_endpoint")).toBe("manual_endpoint");
  });

  it("falls back to disabled for unknown value", () => {
    expect(normalizeDnsMode("invalid")).toBe("disabled");
  });

  it("falls back to disabled for empty string", () => {
    expect(normalizeDnsMode("")).toBe("disabled");
  });

  it("falls back to disabled for disabled itself", () => {
    expect(normalizeDnsMode("disabled")).toBe("disabled");
  });
});

// ── normalizeSettings ─────────────────────────────────────────────────────────

describe("normalizeSettings", () => {
  it("returns defaults for empty input", () => {
    const result = normalizeSettings({});
    expect(result.dockerSocketPath).toBe("/var/run/docker.sock");
    expect(result.connectors).toHaveLength(1);
    expect(result.connectors[0].type).toBe("npm");
    expect(result.dnsBaseline.mode).toBe("disabled");
    expect(result.scanConfig.intervalMinutes).toBe(DEFAULT_INTERVAL_MINUTES);
    expect(result.scanConfig.retentionLimit).toBe(DEFAULT_RETENTION_LIMIT);
    expect(result.scanConfig.driftIntervalDays).toBe(DEFAULT_DRIFT_INTERVAL_DAYS);
    expect(result.authOverrides).toEqual([]);
    expect(result.suppressedFindings).toEqual([]);
  });

  it("preserves provided connector values", () => {
    const result = normalizeSettings({
      dockerSocketPath: "/custom/docker.sock",
      hostLabel: "myhost",
      connectors: [{ id: "npm", type: "npm", label: "Nginx Proxy Manager", enabled: true, options: { mode: "api", sqlitePath: "", apiUrl: "http://npm.local:81", apiToken: "secret-token" } }],
    });
    expect(result.dockerSocketPath).toBe("/custom/docker.sock");
    expect(result.hostLabel).toBe("myhost");
    const opts = result.connectors[0].options as { mode: string; apiUrl: string; apiToken: string };
    expect(opts.mode).toBe("api");
    expect(opts.apiUrl).toBe("http://npm.local:81");
    expect(opts.apiToken).toBe("secret-token");
  });

  it("migrates legacy flat npm fields to ConnectorConfig", () => {
    const result = normalizeSettings({ npmConnectorMode: "api", npmApiUrl: "http://npm.local:81", npmApiToken: "tok" });
    expect(result.connectors).toHaveLength(1);
    const opts = result.connectors[0].options as { mode: string; apiUrl: string; apiToken: string };
    expect(opts.mode).toBe("api");
    expect(opts.apiUrl).toBe("http://npm.local:81");
    expect(opts.apiToken).toBe("tok");
  });

  it("normalizes dns baseline mode", () => {
    const result = normalizeSettings({ dnsBaseline: { mode: "reference_hostname", value: "home.example.com" } });
    expect(result.dnsBaseline.mode).toBe("reference_hostname");
    expect(result.dnsBaseline.value).toBe("home.example.com");
  });

  it("trims dns baseline value whitespace", () => {
    const result = normalizeSettings({ dnsBaseline: { mode: "manual_endpoint", value: "  1.2.3.4  " } });
    expect(result.dnsBaseline.value).toBe("1.2.3.4");
  });

  it("rejects non-positive intervalMinutes and uses default", () => {
    const result = normalizeSettings({ scanConfig: { intervalMinutes: -5, intervalEnabled: true, retentionLimit: 100, driftIntervalDays: 7 } });
    expect(result.scanConfig.intervalMinutes).toBe(DEFAULT_INTERVAL_MINUTES);
  });

  it("rejects non-positive retentionLimit and uses default", () => {
    const result = normalizeSettings({ scanConfig: { intervalMinutes: 10, intervalEnabled: true, retentionLimit: 0, driftIntervalDays: 7 } });
    expect(result.scanConfig.retentionLimit).toBe(DEFAULT_RETENTION_LIMIT);
  });

  it("accepts custom driftIntervalDays", () => {
    const result = normalizeSettings({ scanConfig: { intervalMinutes: 5, intervalEnabled: true, retentionLimit: 100, driftIntervalDays: 14 } });
    expect(result.scanConfig.driftIntervalDays).toBe(14);
  });

  it("rejects non-positive driftIntervalDays and uses default", () => {
    const result = normalizeSettings({ scanConfig: { intervalMinutes: 5, intervalEnabled: true, retentionLimit: 100, driftIntervalDays: -1 } });
    expect(result.scanConfig.driftIntervalDays).toBe(DEFAULT_DRIFT_INTERVAL_DAYS);
  });

  it("normalizes severityThreshold to high_medium when provided", () => {
    const result = normalizeSettings({ webhookConfig: { enabled: true, url: "http://hook.com", severityThreshold: "high_medium", lastDeliveryAt: null, lastDeliveryStatus: null } });
    expect(result.webhookConfig.severityThreshold).toBe("high_medium");
  });

  it("falls back to high for unknown severityThreshold", () => {
    const result = normalizeSettings({ webhookConfig: { enabled: true, url: "http://hook.com", severityThreshold: "all" as "high" | "high_medium", lastDeliveryAt: null, lastDeliveryStatus: null } });
    expect(result.webhookConfig.severityThreshold).toBe("high");
  });

  it("always clears suppressedFindings (not persisted from input)", () => {
    const result = normalizeSettings({ suppressedFindings: ["some_key"] });
    expect(result.suppressedFindings).toEqual([]);
  });

  it("coerces authOverrides to strings", () => {
    const result = normalizeSettings({ authOverrides: ["my-service", "another"] });
    expect(result.authOverrides).toEqual(["my-service", "another"]);
  });

  it("uses empty array when authOverrides is not an array", () => {
    const result = normalizeSettings({ authOverrides: "not-array" as unknown as string[] });
    expect(result.authOverrides).toEqual([]);
  });
});

// ── getNextScheduledAt ────────────────────────────────────────────────────────

describe("getNextScheduledAt", () => {
  it("returns null when enabled is false", () => {
    expect(getNextScheduledAt("2026-04-20T10:00:00.000Z", false, 5)).toBeNull();
  });

  it("returns null when generatedAt is null", () => {
    expect(getNextScheduledAt(null, true, 5)).toBeNull();
  });

  it("adds intervalMinutes to generatedAt", () => {
    const result = getNextScheduledAt("2026-04-20T10:00:00.000Z", true, 5);
    expect(result).toBe("2026-04-20T10:05:00.000Z");
  });

  it("handles 60-minute interval", () => {
    const result = getNextScheduledAt("2026-04-20T10:00:00.000Z", true, 60);
    expect(result).toBe("2026-04-20T11:00:00.000Z");
  });

  it("handles 1-minute interval", () => {
    const result = getNextScheduledAt("2026-04-20T10:00:00.000Z", true, 1);
    expect(result).toBe("2026-04-20T10:01:00.000Z");
  });
});

// ── attachCurrentSettings ─────────────────────────────────────────────────────

describe("attachCurrentSettings", () => {
  it("overwrites dnsBaseline from settings", () => {
    const snap = makeSnapshot({ dnsBaseline: { mode: "disabled", value: "", helper: "old" } });
    const settings = makeSettings({ dnsBaseline: { mode: "reference_hostname", value: "home.example.com" } });
    const result = attachCurrentSettings(snap, settings);
    expect(result.dnsBaseline.mode).toBe("reference_hostname");
    expect(result.dnsBaseline.value).toBe("home.example.com");
    expect(result.dnsBaseline.helper).toContain("home.example.com");
  });

  it("overwrites scanConfig from settings", () => {
    const snap = makeSnapshot();
    const settings = makeSettings({ scanConfig: { intervalEnabled: false, intervalMinutes: 30, retentionLimit: 100, driftIntervalDays: 14 } });
    const result = attachCurrentSettings(snap, settings);
    expect(result.scanConfig.intervalEnabled).toBe(false);
    expect(result.scanConfig.intervalMinutes).toBe(30);
    expect(result.scanConfig.driftIntervalDays).toBe(14);
  });

  it("sets nextScheduledAt to null when intervalEnabled is false", () => {
    const snap = makeSnapshot();
    const settings = makeSettings({ scanConfig: { intervalEnabled: false, intervalMinutes: 5, retentionLimit: 576, driftIntervalDays: 7 } });
    const result = attachCurrentSettings(snap, settings);
    expect(result.scanConfig.nextScheduledAt).toBeNull();
  });

  it("calculates nextScheduledAt when interval enabled", () => {
    const snap = makeSnapshot({ generatedAt: "2026-04-20T10:00:00.000Z" });
    const settings = makeSettings({ scanConfig: { intervalEnabled: true, intervalMinutes: 5, retentionLimit: 576, driftIntervalDays: 7 } });
    const result = attachCurrentSettings(snap, settings);
    expect(result.scanConfig.nextScheduledAt).toBe("2026-04-20T10:05:00.000Z");
  });

  it("preserves all other snapshot fields", () => {
    const snap = makeSnapshot({ routes: [], findings: [], hostLabel: "myhost" });
    const result = attachCurrentSettings(snap, makeSettings());
    expect(result.hostLabel).toBe("myhost");
    expect(result.routes).toEqual([]);
  });
});
