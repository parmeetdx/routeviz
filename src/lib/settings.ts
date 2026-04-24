import os from "node:os";

import { createFallbackSnapshot, getDnsBaselineHelper } from "@/lib/routeviz.mjs";
import type { DnsBaselineMode, PersistedSettings, RoutevizSnapshot } from "@/lib/routeviz-types";

export type SettingsUpdate = {
  dockerSocketPath?: string;
  hostAddress?: string | null;
  hostLabel?: string;
  npmConnectorMode?: "sqlite" | "api";
  npmSqlitePath?: string;
  npmApiUrl?: string;
  npmApiToken?: string;
  dnsBaseline?: Partial<PersistedSettings["dnsBaseline"]>;
  scanConfig?: Partial<PersistedSettings["scanConfig"]>;
  webhookConfig?: Partial<PersistedSettings["webhookConfig"]>;
  authOverrides?: string[];
  suppressedFindings?: string[];
};

export const DEFAULT_INTERVAL_MINUTES = 5;
export const DEFAULT_RETENTION_LIMIT = 576;
export const DEFAULT_DRIFT_INTERVAL_DAYS = 7;

export function detectHostAddress(): string | null {
  // Allow explicit override via environment — necessary when running inside a
  // container whose network interfaces don't include the host's LAN IP.
  if (process.env.HOST_ADDRESS) return process.env.HOST_ADDRESS;

  const interfaces = os.networkInterfaces();
  for (const item of Object.values(interfaces)) {
    if (!item) continue;
    for (const address of item) {
      if (address.family === "IPv4" && !address.internal) return address.address;
    }
  }
  return null;
}

export const defaultSettings: PersistedSettings = {
  dockerSocketPath: "/var/run/docker.sock",
  hostAddress: detectHostAddress(),
  hostLabel: os.hostname(),
  npmConnectorMode: "sqlite",
  npmSqlitePath: "",
  npmApiUrl: "",
  npmApiToken: "",
  dnsBaseline: { mode: "disabled", value: "" },
  scanConfig: {
    intervalEnabled: true,
    intervalMinutes: DEFAULT_INTERVAL_MINUTES,
    retentionLimit: DEFAULT_RETENTION_LIMIT,
    driftIntervalDays: DEFAULT_DRIFT_INTERVAL_DAYS,
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
};

export function normalizeDnsMode(mode: string): DnsBaselineMode {
  if (mode === "reference_hostname" || mode === "manual_endpoint") return mode;
  return "disabled";
}

export function normalizeSettings(input: Partial<PersistedSettings> = {}): PersistedSettings {
  const hostAddress = input.hostAddress ?? defaultSettings.hostAddress;
  const hostLabel = input.hostLabel ?? defaultSettings.hostLabel;
  const dnsBaselineMode = input.dnsBaseline?.mode ?? defaultSettings.dnsBaseline.mode;
  const dnsBaselineValue = input.dnsBaseline?.value ?? defaultSettings.dnsBaseline.value;
  const intervalMinutes = input.scanConfig?.intervalMinutes;
  const retentionLimit = input.scanConfig?.retentionLimit;
  const driftIntervalDays = input.scanConfig?.driftIntervalDays;

  return {
    dockerSocketPath: input.dockerSocketPath ?? defaultSettings.dockerSocketPath,
    hostAddress,
    hostLabel,
    npmConnectorMode: input.npmConnectorMode === "api" ? "api" : "sqlite",
    npmSqlitePath: input.npmSqlitePath ?? defaultSettings.npmSqlitePath,
    npmApiUrl: input.npmApiUrl ?? defaultSettings.npmApiUrl,
    npmApiToken: input.npmApiToken ?? defaultSettings.npmApiToken,
    dnsBaseline: {
      mode: normalizeDnsMode(dnsBaselineMode),
      value: dnsBaselineValue.trim(),
    },
    scanConfig: {
      intervalEnabled: input.scanConfig?.intervalEnabled ?? defaultSettings.scanConfig.intervalEnabled,
      intervalMinutes:
        typeof intervalMinutes === "number" && intervalMinutes > 0
          ? intervalMinutes
          : defaultSettings.scanConfig.intervalMinutes,
      retentionLimit:
        typeof retentionLimit === "number" && retentionLimit > 0
          ? retentionLimit
          : defaultSettings.scanConfig.retentionLimit,
      driftIntervalDays:
        typeof driftIntervalDays === "number" && driftIntervalDays > 0
          ? driftIntervalDays
          : defaultSettings.scanConfig.driftIntervalDays,
    },
    webhookConfig: {
      enabled: input.webhookConfig?.enabled ?? false,
      url: input.webhookConfig?.url ?? "",
      severityThreshold: input.webhookConfig?.severityThreshold === "high_medium" ? "high_medium" : "high",
      lastDeliveryAt: input.webhookConfig?.lastDeliveryAt ?? null,
      lastDeliveryStatus: input.webhookConfig?.lastDeliveryStatus ?? null,
    },
    authOverrides: Array.isArray(input.authOverrides) ? input.authOverrides.map(String) : [],
    suppressedFindings: [],
  };
}

export function getFallbackSnapshot(settings: PersistedSettings, message?: string): RoutevizSnapshot {
  return createFallbackSnapshot(settings, message) as RoutevizSnapshot;
}

export function getNextScheduledAt(
  generatedAt: string | null,
  enabled: boolean,
  intervalMinutes: number,
): string | null {
  if (!generatedAt || !enabled) return null;
  const date = new Date(generatedAt);
  date.setTime(date.getTime() + intervalMinutes * 60 * 1000);
  return date.toISOString();
}

export function attachCurrentSettings(snapshot: RoutevizSnapshot, settings: PersistedSettings) {
  return {
    ...snapshot,
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
      lastCompletedAt: snapshot.generatedAt,
      nextScheduledAt: getNextScheduledAt(
        snapshot.generatedAt,
        settings.scanConfig.intervalEnabled,
        settings.scanConfig.intervalMinutes,
      ),
    },
  };
}
