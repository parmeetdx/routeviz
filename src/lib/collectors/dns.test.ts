import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDnsStatus, getTlsDaysRemaining } from "./dns";

// ── getDnsStatus ──────────────────────────────────────────────────────────────

describe("getDnsStatus", () => {
  it("returns unresolved when answers is empty", () => {
    expect(getDnsStatus([], "disabled", [])).toBe("unresolved");
  });

  it("returns observed when baseline mode is disabled", () => {
    expect(getDnsStatus(["1.2.3.4"], "disabled", [])).toBe("observed");
  });

  it("returns unknown when baseline answers is empty", () => {
    expect(getDnsStatus(["1.2.3.4"], "reference_hostname", [])).toBe("unknown");
  });

  it("returns ok when answer matches baseline", () => {
    expect(getDnsStatus(["1.2.3.4", "5.6.7.8"], "reference_hostname", ["1.2.3.4"])).toBe("ok");
  });

  it("returns mismatch when no answer matches baseline", () => {
    expect(getDnsStatus(["9.9.9.9"], "reference_hostname", ["1.2.3.4"])).toBe("mismatch");
  });

  it("returns ok with manual_endpoint mode", () => {
    expect(getDnsStatus(["10.0.0.1"], "manual_endpoint", ["10.0.0.1"])).toBe("ok");
  });

  it("returns mismatch with manual_endpoint mode when answer differs", () => {
    expect(getDnsStatus(["10.0.0.2"], "manual_endpoint", ["10.0.0.1"])).toBe("mismatch");
  });
});

// ── getTlsDaysRemaining ───────────────────────────────────────────────────────

describe("getTlsDaysRemaining", () => {
  it("returns null for null input", () => {
    expect(getTlsDaysRemaining(null)).toBeNull();
  });

  it("returns null for invalid date string", () => {
    expect(getTlsDaysRemaining("not-a-date")).toBeNull();
  });

  it("returns positive days for future date", () => {
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const result = getTlsDaysRemaining(future);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(31);
  });

  it("returns negative days for past date", () => {
    const past = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const result = getTlsDaysRemaining(past);
    expect(result).toBeLessThan(0);
  });

  it("returns roughly 30 for a date 30 days from now", () => {
    const date = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const result = getTlsDaysRemaining(date);
    expect(result).toBeGreaterThanOrEqual(29);
    expect(result).toBeLessThanOrEqual(31);
  });
});

// ── lookupAnswersForDomain ────────────────────────────────────────────────────

describe("lookupAnswersForDomain", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns empty array for null domain", async () => {
    const { lookupAnswersForDomain } = await import("./dns");
    expect(await lookupAnswersForDomain(null)).toEqual([]);
  });

  it("deduplicates repeated IP addresses", async () => {
    vi.doMock("node:dns/promises", () => ({
      lookup: vi.fn().mockResolvedValue([
        { address: "1.2.3.4", family: 4 },
        { address: "1.2.3.4", family: 4 },
        { address: "5.6.7.8", family: 4 },
      ]),
    }));
    const { lookupAnswersForDomain } = await import("./dns");
    const result = await lookupAnswersForDomain("example.com");
    expect(result).toEqual(["1.2.3.4", "5.6.7.8"]);
  });

  it("returns empty array on DNS resolution error", async () => {
    vi.doMock("node:dns/promises", () => ({
      lookup: vi.fn().mockRejectedValue(new Error("ENOTFOUND")),
    }));
    const { lookupAnswersForDomain } = await import("./dns");
    const result = await lookupAnswersForDomain("nonexistent.invalid");
    expect(result).toEqual([]);
  });
});

// ── getDnsBaselineAnswers ─────────────────────────────────────────────────────

describe("getDnsBaselineAnswers", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns empty for disabled mode", async () => {
    const { getDnsBaselineAnswers } = await import("./dns");
    const settings = {
      dockerSocketPath: "/var/run/docker.sock",
      hostAddress: "192.168.1.5",
      hostLabel: "miniserver",
      npmConnectorMode: "sqlite" as const,
      npmSqlitePath: "",
      npmApiUrl: "",
      npmApiToken: "",
      dnsBaseline: { mode: "disabled" as const, value: "" },
      scanConfig: { intervalEnabled: true, intervalMinutes: 5, retentionLimit: 576, driftIntervalDays: 7 },
      webhookConfig: { enabled: false, url: "", severityThreshold: "high" as const, lastDeliveryAt: null, lastDeliveryStatus: null },
      authOverrides: [],
      suppressedFindings: [],
    };
    expect(await getDnsBaselineAnswers(settings)).toEqual([]);
  });

  it("returns empty for empty value", async () => {
    const { getDnsBaselineAnswers } = await import("./dns");
    const settings = {
      dockerSocketPath: "/var/run/docker.sock",
      hostAddress: "192.168.1.5",
      hostLabel: "miniserver",
      npmConnectorMode: "sqlite" as const,
      npmSqlitePath: "",
      npmApiUrl: "",
      npmApiToken: "",
      dnsBaseline: { mode: "reference_hostname" as const, value: "" },
      scanConfig: { intervalEnabled: true, intervalMinutes: 5, retentionLimit: 576, driftIntervalDays: 7 },
      webhookConfig: { enabled: false, url: "", severityThreshold: "high" as const, lastDeliveryAt: null, lastDeliveryStatus: null },
      authOverrides: [],
      suppressedFindings: [],
    };
    expect(await getDnsBaselineAnswers(settings)).toEqual([]);
  });

  it("returns IP directly on DNS failure when value is an IPv4 address", async () => {
    vi.doMock("node:dns/promises", () => ({
      lookup: vi.fn().mockRejectedValue(new Error("ENOTFOUND")),
    }));
    const { getDnsBaselineAnswers } = await import("./dns");
    const settings = {
      dockerSocketPath: "/var/run/docker.sock",
      hostAddress: "192.168.1.5",
      hostLabel: "miniserver",
      npmConnectorMode: "sqlite" as const,
      npmSqlitePath: "",
      npmApiUrl: "",
      npmApiToken: "",
      dnsBaseline: { mode: "manual_endpoint" as const, value: "1.2.3.4" },
      scanConfig: { intervalEnabled: true, intervalMinutes: 5, retentionLimit: 576, driftIntervalDays: 7 },
      webhookConfig: { enabled: false, url: "", severityThreshold: "high" as const, lastDeliveryAt: null, lastDeliveryStatus: null },
      authOverrides: [],
      suppressedFindings: [],
    };
    const result = await getDnsBaselineAnswers(settings);
    expect(result).toEqual(["1.2.3.4"]);
  });
});
