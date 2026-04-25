import os from "node:os";
import { createFallbackSnapshot, getDnsBaselineHelper } from "@/lib/routeviz.mjs";
import type {
  ConnectorConfig,
  ConnectorType,
  DnsBaselineMode,
  NpmConnectorOptions,
  PersistedSettings,
  RoutevizSnapshot,
  TraefikConnectorOptions,
} from "@/lib/routeviz-types";

export type SettingsUpdate = {
  dockerSocketPath?: string;
  hostAddress?: string | null;
  hostLabel?: string;
  connectors?: ConnectorConfig[];
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

export function makeDefaultNpmConnector(): ConnectorConfig {
  return {
    id: "npm",
    type: "npm",
    label: "Nginx Proxy Manager",
    enabled: true,
    options: {
      mode: "sqlite",
      sqlitePath: "",
      apiUrl: "",
      apiToken: "",
    } satisfies NpmConnectorOptions,
  };
}

export const defaultSettings: PersistedSettings = {
  dockerSocketPath: "/var/run/docker.sock",
  hostAddress: detectHostAddress(),
  hostLabel: os.hostname(),
  connectors: [makeDefaultNpmConnector()],
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

function normalizeNpmOptions(opts: Partial<NpmConnectorOptions>): NpmConnectorOptions {
  return {
    mode: opts.mode === "api" ? "api" : "sqlite",
    sqlitePath: opts.sqlitePath ?? "",
    apiUrl: opts.apiUrl ?? "",
    apiToken: opts.apiToken ?? "",
    apiEmail: opts.apiEmail ?? "",
    apiPassword: opts.apiPassword ?? "",
  };
}

function normalizeTraefikOptions(opts: Partial<TraefikConnectorOptions>): TraefikConnectorOptions {
  return {
    apiUrl: opts.apiUrl ?? "",
    apiToken: opts.apiToken ?? "",
  };
}

function normalizeConnector(raw: Partial<ConnectorConfig>): ConnectorConfig | null {
  const type = raw.type as ConnectorType | undefined;
  if (type === "npm") {
    return {
      id: raw.id ?? "npm",
      type: "npm",
      label: raw.label ?? "Nginx Proxy Manager",
      enabled: raw.enabled ?? true,
      options: normalizeNpmOptions((raw.options ?? {}) as Partial<NpmConnectorOptions>),
    };
  }
  if (type === "traefik") {
    return {
      id: raw.id ?? "traefik",
      type: "traefik",
      label: raw.label ?? "Traefik",
      enabled: raw.enabled ?? true,
      options: normalizeTraefikOptions((raw.options ?? {}) as Partial<TraefikConnectorOptions>),
    };
  }
  return null;
}

// Migrates old Postgres rows that stored flat NPM fields instead of connectors[].
function migrateConnectors(input: Record<string, unknown>): ConnectorConfig[] {
  if (!input.connectors) {
    const hasLegacy = input.npmConnectorMode || input.npmSqlitePath || input.npmApiUrl || input.npmApiToken;
    if (hasLegacy) {
      return [
        {
          id: "npm",
          type: "npm",
          label: "Nginx Proxy Manager",
          enabled: true,
          options: {
            mode: input.npmConnectorMode === "api" ? "api" : "sqlite",
            sqlitePath: typeof input.npmSqlitePath === "string" ? input.npmSqlitePath : "",
            apiUrl: typeof input.npmApiUrl === "string" ? input.npmApiUrl : "",
            apiToken: typeof input.npmApiToken === "string" ? input.npmApiToken : "",
          } satisfies NpmConnectorOptions,
        },
      ];
    }
    return [makeDefaultNpmConnector()];
  }
  if (Array.isArray(input.connectors)) {
    const normalized = (input.connectors as Partial<ConnectorConfig>[])
      .map(normalizeConnector)
      .filter((c): c is ConnectorConfig => c !== null);
    return normalized.length > 0 ? normalized : [makeDefaultNpmConnector()];
  }
  return [makeDefaultNpmConnector()];
}

export function normalizeSettings(input: Record<string, unknown> = {}): PersistedSettings {
  const scanConfig = (input.scanConfig ?? {}) as Partial<PersistedSettings["scanConfig"]>;
  const dnsBaseline = (input.dnsBaseline ?? {}) as Partial<PersistedSettings["dnsBaseline"]>;
  const webhookConfig = (input.webhookConfig ?? {}) as Partial<PersistedSettings["webhookConfig"]>;
  const intervalMinutes = scanConfig.intervalMinutes;
  const retentionLimit = scanConfig.retentionLimit;
  const driftIntervalDays = scanConfig.driftIntervalDays;

  return {
    dockerSocketPath: typeof input.dockerSocketPath === "string" ? input.dockerSocketPath : defaultSettings.dockerSocketPath,
    hostAddress: "hostAddress" in input ? (input.hostAddress as string | null) : defaultSettings.hostAddress,
    hostLabel: typeof input.hostLabel === "string" ? input.hostLabel : defaultSettings.hostLabel,
    connectors: migrateConnectors(input),
    dnsBaseline: {
      mode: normalizeDnsMode(dnsBaseline.mode ?? defaultSettings.dnsBaseline.mode),
      value: (dnsBaseline.value ?? defaultSettings.dnsBaseline.value).trim(),
    },
    scanConfig: {
      intervalEnabled: scanConfig.intervalEnabled ?? defaultSettings.scanConfig.intervalEnabled,
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
      enabled: webhookConfig.enabled ?? false,
      url: webhookConfig.url ?? "",
      severityThreshold: webhookConfig.severityThreshold === "high_medium" ? "high_medium" : "high",
      lastDeliveryAt: webhookConfig.lastDeliveryAt ?? null,
      lastDeliveryStatus: webhookConfig.lastDeliveryStatus ?? null,
    },
    authOverrides: Array.isArray(input.authOverrides) ? (input.authOverrides as unknown[]).map(String) : [],
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
