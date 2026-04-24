import { execFile } from "node:child_process";
import { lookup } from "node:dns/promises";
import { existsSync } from "node:fs";
import { readFile, rename } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  createFallbackSnapshot,
  formatTimestampLabel,
  getDnsBaselineHelper,
  getHistoryPoints,
  slugify,
} from "@/lib/ops-ledger.mjs";
import { diffSnapshots } from "@/lib/snapshot-differ";
import {
  dbGetActiveSnapshot,
  dbGetSettings,
  dbGetSnapshotCount,
  dbGetSnapshots,
  dbGetSuppressedFindings,
  dbInsertSnapshot,
  dbPruneSnapshots,
  dbSetActiveSnapshot,
  dbSuppressFinding,
  dbUnsuppressFinding,
  dbUpsertSettings,
  runMigrations,
} from "@/lib/db";
import type {
  ConfidenceLevel,
  Connector,
  DnsBaselineMode,
  Finding,
  FindingSeverity,
  OpsLedgerSnapshot,
  OpsLedgerState,
  PersistedSettings,
  RelatedWorkload,
  RouteMatchState,
  RouteRecord,
  WorkloadFinding,
  WorkloadRecord,
} from "@/lib/ops-ledger-types";

const execFileAsync = promisify(execFile);

const STORE_DIRECTORY = path.join(process.cwd(), ".ops-ledger");
const STORE_PATH = path.join(STORE_DIRECTORY, "store.json");
const DEFAULT_INTERVAL_MINUTES = 5;
const DEFAULT_RETENTION_LIMIT = 576;
const SQLITE_QUERY = `
select
  p.id,
  p.domain_names,
  p.forward_host,
  p.forward_port,
  p.certificate_id,
  p.ssl_forced,
  p.caching_enabled,
  p.allow_websocket_upgrade,
  p.block_exploits,
  p.access_list_id,
  p.advanced_config,
  p.enabled,
  p.created_on,
  p.modified_on,
  c.provider as certificate_provider,
  c.nice_name as certificate_name,
  c.expires_on as certificate_expires_on
from proxy_host p
left join certificate c
  on c.id = p.certificate_id
where p.enabled = 1
  and p.is_deleted = 0
order by p.modified_on desc
`;

type SettingsUpdate = {
  dockerSocketPath?: string;
  hostAddress?: string | null;
  hostLabel?: string;
  npmSqlitePath?: string;
  dnsBaseline?: Partial<PersistedSettings["dnsBaseline"]>;
  scanConfig?: Partial<PersistedSettings["scanConfig"]>;
  webhookConfig?: Partial<PersistedSettings["webhookConfig"]>;
  authOverrides?: string[];
  suppressedFindings?: string[];
};

type DockerPort = {
  IP?: string;
  PrivatePort: number;
  PublicPort?: number;
  Type?: string;
};

type DockerContainerSummary = {
  Id: string;
  Names: string[];
  Image: string;
  ImageID?: string;
  State: string;
  Ports?: DockerPort[];
  Labels?: Record<string, string>;
  Created?: number;
};

type DockerMount = {
  Source?: string;
  Destination?: string;
  RW?: boolean;
};

type DockerNetwork = {
  Aliases?: string[] | null;
  IPAddress?: string;
};

type DockerContainerInspect = {
  Config?: {
    ExposedPorts?: Record<string, Record<string, never>>;
    Image?: string;
  };
  HostConfig?: {
    NetworkMode?: string;
  };
  Mounts?: DockerMount[];
  NetworkSettings?: {
    Networks?: Record<string, DockerNetwork>;
  };
};

type DockerWorkload = {
  id: string;
  name: string;
  image: string;
  latestImageTag: string | null;
  state: string;
  createdAt: string | null;
  composeProject: string | null;
  serviceName: string | null;
  composePath: string | null;
  aliases: string[];
  internalIps: string[];
  networks: string[];
  networkMode: string;
  publishedPorts: Array<{
    publicPort: number;
    privatePort: number;
    hostIp: string | null;
  }>;
  exposedPorts: number[];
  mounts: string[];
  dockerSocketMount: "read_only" | "read_write" | "none";
};

type NpmRow = {
  id: number;
  domain_names: string;
  forward_host: string;
  forward_port: number;
  certificate_id: number;
  ssl_forced: number;
  caching_enabled: number;
  allow_websocket_upgrade: number;
  block_exploits: number;
  access_list_id: number;
  advanced_config: string | null;
  enabled: number;
  created_on: string;
  modified_on: string;
  certificate_provider: string | null;
  certificate_name: string | null;
  certificate_expires_on: string | null;
};

type CanonicalRoute = {
  row: NpmRow;
  domains: string[];
  duplicateDomainCount: number;
};

type MatchResult = {
  matchState: RouteMatchState;
  confidence: ConfidenceLevel;
  workload: DockerWorkload | null;
  relatedWorkloads: RelatedWorkload[];
  notes: string;
};

const defaultSettings: PersistedSettings = {
  dockerSocketPath: "/var/run/docker.sock",
  hostAddress: detectHostAddress(),
  hostLabel: os.hostname(),
  npmSqlitePath: "/docker/apps/nginx-proxy-manager/data/database.sqlite",
  dnsBaseline: {
    mode: "disabled",
    value: "",
  },
  scanConfig: {
    intervalEnabled: true,
    intervalMinutes: DEFAULT_INTERVAL_MINUTES,
    retentionLimit: DEFAULT_RETENTION_LIMIT,
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

const globalOpsLedger = globalThis as typeof globalThis & {
  __opsLedgerScheduler?: NodeJS.Timeout;
  __opsLedgerScanPromise?: Promise<void>;
  __opsLedgerDbReady?: Promise<void>;
};

function getFallbackSnapshot(settings: PersistedSettings, message?: string) {
  return createFallbackSnapshot(settings, message) as OpsLedgerSnapshot;
}

function detectHostAddress() {
  const interfaces = os.networkInterfaces();

  for (const item of Object.values(interfaces)) {
    if (!item) continue;
    for (const address of item) {
      if (address.family === "IPv4" && !address.internal) {
        return address.address;
      }
    }
  }

  return null;
}

function normalizeSettings(input: Partial<PersistedSettings> = {}): PersistedSettings {
  const hostAddress = input.hostAddress ?? defaultSettings.hostAddress;
  const hostLabel = input.hostLabel ?? defaultSettings.hostLabel;
  const dnsBaselineMode = input.dnsBaseline?.mode ?? defaultSettings.dnsBaseline.mode;
  const dnsBaselineValue = input.dnsBaseline?.value ?? defaultSettings.dnsBaseline.value;
  const intervalMinutes = input.scanConfig?.intervalMinutes;
  const retentionLimit = input.scanConfig?.retentionLimit;

  return {
    dockerSocketPath: input.dockerSocketPath ?? defaultSettings.dockerSocketPath,
    hostAddress,
    hostLabel,
    npmSqlitePath: input.npmSqlitePath ?? defaultSettings.npmSqlitePath,
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

function normalizeDnsMode(mode: string): DnsBaselineMode {
  if (mode === "reference_hostname" || mode === "manual_endpoint") return mode;
  return "disabled";
}

function normalizeSnapshot(snapshot: Partial<OpsLedgerSnapshot>): OpsLedgerSnapshot {
  return {
    ...(snapshot as OpsLedgerSnapshot),
    connectors: Array.isArray(snapshot.connectors) ? snapshot.connectors : [],
    workloads: Array.isArray(snapshot.workloads)
      ? snapshot.workloads.map((w) => ({ ...w, createdAt: w.createdAt ?? null, latestImageTag: w.latestImageTag ?? null }))
      : [],
    routes: Array.isArray(snapshot.routes)
      ? snapshot.routes.map((r) => ({ ...r, selfAuthDetected: r.selfAuthDetected ?? false }))
      : [],
    findings: Array.isArray(snapshot.findings) ? snapshot.findings : [],
    workloadFindings: Array.isArray(snapshot.workloadFindings) ? snapshot.workloadFindings : [],
    changes: Array.isArray(snapshot.changes) ? snapshot.changes : [],
  };
}

function attachCurrentSettings(snapshot: OpsLedgerSnapshot, settings: PersistedSettings) {
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
      lastCompletedAt: snapshot.generatedAt,
      nextScheduledAt: getNextScheduledAt(
        snapshot.generatedAt,
        settings.scanConfig.intervalEnabled,
        settings.scanConfig.intervalMinutes,
      ),
    },
  };
}

function getNextScheduledAt(generatedAt: string | null, enabled: boolean, intervalMinutes: number) {
  if (!generatedAt || !enabled) return null;
  const date = new Date(generatedAt);
  date.setMinutes(date.getMinutes() + intervalMinutes);
  return date.toISOString();
}

// ── DB bootstrap + store.json migration ───────────────────────────────────────

export async function ensureDb(): Promise<void> {
  if (!globalOpsLedger.__opsLedgerDbReady) {
    globalOpsLedger.__opsLedgerDbReady = (async () => {
      await runMigrations();
      await migrateStoreJsonIfPresent();
    })();
  }
  return globalOpsLedger.__opsLedgerDbReady;
}

type LegacyStoreFile = {
  version: 1;
  activeSnapshotId: string | null;
  settings: Partial<PersistedSettings>;
  snapshots: Partial<OpsLedgerSnapshot>[];
};

async function migrateStoreJsonIfPresent(): Promise<void> {
  if (!existsSync(STORE_PATH)) return;

  const count = await dbGetSnapshotCount();
  if (count > 0) {
    // Already migrated — rename to .migrated so we don't re-process
    await rename(STORE_PATH, STORE_PATH + ".migrated").catch(() => null);
    return;
  }

  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<LegacyStoreFile>;
    const settings = normalizeSettings(parsed.settings ?? {});
    await dbUpsertSettings(settings);

    const snapshots = Array.isArray(parsed.snapshots)
      ? parsed.snapshots.map(normalizeSnapshot)
      : [];

    for (const snap of snapshots) {
      await dbInsertSnapshot(snap);
    }

    if (parsed.activeSnapshotId) {
      await dbSetActiveSnapshot(parsed.activeSnapshotId).catch(() => null);
    }

    await rename(STORE_PATH, STORE_PATH + ".migrated");
  } catch (err) {
    console.error("[ops-ledger] store.json migration failed:", err);
  }
}

// ── Settings helpers ───────────────────────────────────────────────────────────

async function getSettings(): Promise<PersistedSettings> {
  const settings = await dbGetSettings();
  return settings ?? normalizeSettings();
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

function isDue(snapshot: OpsLedgerSnapshot | null, settings: PersistedSettings) {
  if (!snapshot) return true;
  if (!settings.scanConfig.intervalEnabled) return false;
  const dueAt = new Date(snapshot.generatedAt);
  dueAt.setMinutes(dueAt.getMinutes() + settings.scanConfig.intervalMinutes);
  return Date.now() >= dueAt.getTime();
}

function ensureScheduler() {
  if (globalOpsLedger.__opsLedgerScheduler) return;
  const timer = setInterval(() => { void runDueScan(); }, 10_000);
  timer.unref?.();
  globalOpsLedger.__opsLedgerScheduler = timer;
}

async function runExclusiveScan(task: () => Promise<void>): Promise<void> {
  if (!globalOpsLedger.__opsLedgerScanPromise) {
    globalOpsLedger.__opsLedgerScanPromise = task().finally(() => {
      globalOpsLedger.__opsLedgerScanPromise = undefined;
    });
  }
  return globalOpsLedger.__opsLedgerScanPromise;
}

async function runDueScan(): Promise<void> {
  return runExclusiveScan(async () => {
    await ensureDb();
    const [settings, snapshot] = await Promise.all([getSettings(), dbGetActiveSnapshot()]);
    if (!isDue(snapshot, settings)) return;
    await runScanAndPersist(settings);
  });
}

async function dockerRequest<T>(socketPath: string, requestPath: string) {
  return new Promise<T>((resolve, reject) => {
    const request = http.request(
      {
        socketPath,
        path: requestPath,
        method: "GET",
      },
      (response) => {
        let body = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          if (
            typeof response.statusCode === "number" &&
            response.statusCode >= 400
          ) {
            reject(new Error(`Docker API returned ${response.statusCode}`));
            return;
          }

          try {
            resolve(JSON.parse(body) as T);
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    request.on("error", reject);
    request.end();
  });
}

function parsePortList(ports: DockerPort[] | undefined) {
  if (!ports) {
    return [];
  }

  return ports
    .filter((port) => typeof port.PublicPort === "number")
    .map((port) => ({
      publicPort: port.PublicPort as number,
      privatePort: port.PrivatePort,
      hostIp: port.IP ?? null,
    }));
}

function parseExposedPorts(
  ports: DockerPort[] | undefined,
  inspect: DockerContainerInspect,
) {
  const fromSummary = ports?.map((port) => port.PrivatePort) ?? [];
  const fromInspect = Object.keys(inspect.Config?.ExposedPorts ?? {}).map((item) =>
    Number(item.split("/")[0]),
  );

  return [...new Set([...fromSummary, ...fromInspect].filter(Number.isFinite))].sort(
    (left, right) => left - right,
  );
}

function summarizeDockerSocketMount(
  mounts: DockerMount[] | undefined,
): "read_only" | "read_write" | "none" {
  const socketMount = mounts?.find(
    (mount) => mount.Destination === "/var/run/docker.sock",
  );

  if (!socketMount) {
    return "none";
  }

  return socketMount.RW ? "read_write" : "read_only";
}

function buildWorkload(
  summary: DockerContainerSummary,
  inspect: DockerContainerInspect,
) {
  const labels = summary.Labels ?? {};
  const networks = inspect.NetworkSettings?.Networks ?? {};
  const aliases = new Set<string>();
  const internalIps = new Set<string>();

  for (const [networkName, network] of Object.entries(networks)) {
    aliases.add(networkName);
    if (network.IPAddress) {
      internalIps.add(network.IPAddress);
    }
    for (const alias of network.Aliases ?? []) {
      aliases.add(alias);
    }
  }

  const name = summary.Names[0]?.replace(/^\//, "") ?? summary.Id.slice(0, 12);
  aliases.add(name);

  const composeService = labels["com.docker.compose.service"] ?? null;
  const composeProject = labels["com.docker.compose.project"] ?? null;
  const composePath = labels["com.docker.compose.project.config_files"] ?? null;

  if (composeService) {
    aliases.add(composeService);
  }

  return {
    id: summary.Id,
    name,
    image: summary.Image,
    state: summary.State,
    createdAt: typeof summary.Created === "number" ? new Date(summary.Created * 1000).toISOString() : null,
    composeProject,
    serviceName: composeService,
    composePath,
    aliases: [...aliases].sort(),
    internalIps: [...internalIps].sort(),
    networks: Object.keys(networks).sort(),
    networkMode: inspect.HostConfig?.NetworkMode ?? "bridge",
    publishedPorts: parsePortList(summary.Ports),
    exposedPorts: parseExposedPorts(summary.Ports, inspect),
    mounts: (inspect.Mounts ?? [])
      .map((mount) => mount.Source || mount.Destination || "")
      .filter(Boolean)
      .sort(),
    dockerSocketMount: summarizeDockerSocketMount(inspect.Mounts),
    latestImageTag: null,
  } satisfies DockerWorkload;
}

function parseImageRef(image: string): { namespace: string; name: string } | null {
  const withoutTag = image.split(":")[0];
  const parts = withoutTag.split("/");

  // Reject non-Docker Hub images (custom registry, e.g. ghcr.io/...)
  if (parts.length >= 2 && (parts[0].includes(".") || parts[0].includes(":"))) {
    return null;
  }

  if (parts.length === 1) {
    return { namespace: "library", name: parts[0] };
  }
  if (parts.length === 2) {
    return { namespace: parts[0], name: parts[1] };
  }
  // e.g. "jc21/nginx-proxy-manager" — already covered by length 2
  return { namespace: parts[parts.length - 2], name: parts[parts.length - 1] };
}

async function fetchLatestImageTag(image: string): Promise<string | null> {
  const ref = parseImageRef(image);
  if (!ref) return null;

  return new Promise((resolve) => {
    const path = `/v2/repositories/${ref.namespace}/${ref.name}/tags?page_size=10&ordering=last_updated`;
    const req = https.request(
      { hostname: "hub.docker.com", path, method: "GET", headers: { "User-Agent": "ops-ledger-probe/1.0" } },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        res.on("end", () => {
          try {
            const data = JSON.parse(body) as { results?: Array<{ name: string }> };
            const versioned = (data.results ?? []).find((t) => t.name !== "latest" && /\d/.test(t.name));
            resolve(versioned?.name ?? null);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.setTimeout(5000, () => { req.destroy(); resolve(null); });
    req.on("error", () => resolve(null));
    req.end();
  });
}

async function scanDocker(socketPath: string) {
  const summaries = await dockerRequest<DockerContainerSummary[]>(
    socketPath,
    "/containers/json?all=0",
  );

  const workloads = await Promise.all(
    summaries.map(async (summary) => {
      const inspect = await dockerRequest<DockerContainerInspect>(
        socketPath,
        `/containers/${summary.Id}/json`,
      );

      return buildWorkload(summary, inspect);
    }),
  );

  // Batch-fetch latest Docker Hub tags for unique images (one request per unique image base)
  const uniqueImages = [...new Set(workloads.map((w) => w.image))];
  const tagMap = new Map<string, string | null>();
  await Promise.all(
    uniqueImages.map(async (img) => {
      tagMap.set(img, await fetchLatestImageTag(img));
    }),
  );

  return workloads
    .map((w) => ({ ...w, latestImageTag: tagMap.get(w.image) ?? null }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function readSqliteJson<T>(databasePath: string, query: string) {
  const { stdout } = await execFileAsync("sqlite3", [
    "-json",
    databasePath,
    query,
  ]);

  return JSON.parse(stdout || "[]") as T;
}

function dedupeRoutes(rows: NpmRow[]) {
  const groups = new Map<string, NpmRow[]>();

  for (const row of rows) {
    const domains = parseDomainNames(row.domain_names);
    const key = domains.join("|");
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }

  return [...groups.values()]
    .map((rowsForDomain) => {
      const [canonical] = rowsForDomain.sort((left, right) =>
        right.modified_on.localeCompare(left.modified_on),
      );
      if (!canonical) {
        throw new Error("Encountered an empty proxy host route group.");
      }
      const domains = parseDomainNames(canonical.domain_names);

      return {
        row: canonical,
        domains,
        duplicateDomainCount: rowsForDomain.length,
      } satisfies CanonicalRoute;
    })
    .sort((left, right) => {
      const leftDomain = left.domains[0] ?? "";
      const rightDomain = right.domains[0] ?? "";
      return leftDomain.localeCompare(rightDomain);
    });
}

function parseDomainNames(value: string) {
  try {
    const parsed = JSON.parse(value) as string[];
    return parsed.filter(Boolean);
  } catch {
    return [];
  }
}

function buildRelatedWorkloads(
  workload: DockerWorkload | null,
  workloads: DockerWorkload[],
) {
  if (!workload) {
    return [];
  }

  const related = workload.composeProject
    ? workloads.filter(
        (candidate) => candidate.composeProject === workload.composeProject,
      )
    : [workload];

  return related.map((item) => ({
    name: item.name,
    image: item.image,
    latestImageTag: item.latestImageTag,
    state: item.state,
    role: item.serviceName ?? "container",
    createdAt: item.createdAt,
    composeProject: item.composeProject,
    serviceName: item.serviceName,
    composePath: item.composePath,
    publishedPorts: item.publishedPorts.map(
      (port) => `${port.publicPort}:${port.privatePort}`,
    ),
    exposedPorts: item.exposedPorts,
    networks: item.networks,
    mounts: item.mounts,
    networkMode: item.networkMode,
    dockerSocketMount: item.dockerSocketMount,
  }));
}

function serializeWorkload(workload: DockerWorkload) {
  return {
    id: workload.id,
    name: workload.name,
    image: workload.image,
    latestImageTag: workload.latestImageTag,
    state: workload.state,
    role: workload.serviceName ?? "container",
    createdAt: workload.createdAt,
    composeProject: workload.composeProject,
    serviceName: workload.serviceName,
    composePath: workload.composePath,
    aliases: workload.aliases,
    internalIps: workload.internalIps,
    publishedPorts: workload.publishedPorts.map(
      (port) => `${port.publicPort}:${port.privatePort}`,
    ),
    exposedPorts: workload.exposedPorts,
    networks: workload.networks,
    mounts: workload.mounts,
    networkMode: workload.networkMode,
    dockerSocketMount: workload.dockerSocketMount,
  } satisfies WorkloadRecord;
}

function isHostLikeTarget(
  target: string,
  settings: PersistedSettings,
  hostCandidates: Set<string>,
) {
  return (
    target === "localhost" ||
    target === "127.0.0.1" ||
    target === "::1" ||
    target === "0.0.0.0" ||
    target === settings.hostLabel ||
    hostCandidates.has(target)
  );
}

function probeTcpPort(host: string, port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const done = (result: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, host);
  });
}

async function matchRouteToWorkload(
  route: CanonicalRoute,
  workloads: DockerWorkload[],
  settings: PersistedSettings,
  hostCandidates: Set<string>,
) {
  const targetHost = route.row.forward_host;
  const targetPort = Number(route.row.forward_port);
  const hostLike = isHostLikeTarget(targetHost, settings, hostCandidates);

  if (hostLike) {
    const publishedPortMatches = workloads.filter((workload) =>
      workload.publishedPorts.some((port) => port.publicPort === targetPort),
    );

    if (publishedPortMatches.length === 1) {
      const workload = publishedPortMatches[0];
      return {
        matchState: "matched",
        confidence: "high",
        workload,
        relatedWorkloads: buildRelatedWorkloads(workload, workloads),
        notes: `Matched ${targetHost}:${targetPort} to the published host port on ${workload.name}.`,
      } satisfies MatchResult;
    }

    if (publishedPortMatches.length > 1) {
      return {
        matchState: "ambiguous",
        confidence: "low",
        workload: null,
        relatedWorkloads: [],
        notes: `Multiple workloads publish host port ${targetPort}. Ops Ledger will not guess between them.`,
      } satisfies MatchResult;
    }

    const hostModeMatches = workloads.filter((workload) => {
      return (
        workload.networkMode === "host" &&
        workload.exposedPorts.includes(targetPort)
      );
    });

    if (hostModeMatches.length === 1) {
      const workload = hostModeMatches[0];
      return {
        matchState: "matched",
        confidence: "medium",
        workload,
        relatedWorkloads: buildRelatedWorkloads(workload, workloads),
        notes: `Matched ${targetHost}:${targetPort} to ${workload.name} through host-network inference.`,
      } satisfies MatchResult;
    }
  }

  const aliasMatches = workloads.filter((workload) => {
    const aliasHit = workload.aliases.some(
      (alias) => alias.toLowerCase() === targetHost.toLowerCase(),
    );
    const portHit =
      workload.exposedPorts.includes(targetPort) ||
      workload.publishedPorts.some((port) => port.privatePort === targetPort);

    return aliasHit && portHit;
  });

  if (aliasMatches.length === 1) {
    const workload = aliasMatches[0];
    return {
      matchState: "matched",
      confidence: "high",
      workload,
      relatedWorkloads: buildRelatedWorkloads(workload, workloads),
      notes: `Matched ${targetHost}:${targetPort} using the container/service alias ${targetHost}.`,
    } satisfies MatchResult;
  }

  if (aliasMatches.length > 1) {
    return {
      matchState: "ambiguous",
      confidence: "low",
      workload: null,
      relatedWorkloads: [],
      notes: `Multiple workloads advertise the alias ${targetHost} on port ${targetPort}.`,
    } satisfies MatchResult;
  }

  const internalIpMatches = workloads.filter((workload) => {
    return (
      workload.internalIps.includes(targetHost) &&
      workload.exposedPorts.includes(targetPort)
    );
  });

  if (internalIpMatches.length === 1) {
    const workload = internalIpMatches[0];
    return {
      matchState: "matched",
      confidence: "high",
      workload,
      relatedWorkloads: buildRelatedWorkloads(workload, workloads),
      notes: `Matched ${targetHost}:${targetPort} to the workload IP for ${workload.name}.`,
    } satisfies MatchResult;
  }

  if (internalIpMatches.length > 1) {
    return {
      matchState: "ambiguous",
      confidence: "low",
      workload: null,
      relatedWorkloads: [],
      notes: `Multiple workloads appear to claim ${targetHost}:${targetPort}.`,
    } satisfies MatchResult;
  }

  // No Docker workload claimed this port. Probe the target directly — covers
  // both local host-like targets (127.0.0.1, 0.0.0.0) and LAN IPs like
  // 192.168.1.x that point to the same machine or another host on the network.
  const probeHost = targetHost === "0.0.0.0" ? "127.0.0.1" : targetHost;
  const portOpen = await probeTcpPort(probeHost, targetPort);

  if (portOpen) {
    return {
      matchState: "direct",
      confidence: "high",
      workload: null,
      relatedWorkloads: [],
      notes: `No Docker workload claims ${targetHost}:${targetPort}, but the port is open — bare-metal, OS-level, or network service.`,
    } satisfies MatchResult;
  }

  if (!hostLike) {
    return {
      matchState: "off_host",
      confidence: "unknown",
      workload: null,
      relatedWorkloads: [],
      notes: `Target ${targetHost}:${targetPort} points away from the scanned Docker host.`,
    } satisfies MatchResult;
  }

  return {
    matchState: "unmatched",
    confidence: "low",
    workload: null,
    relatedWorkloads: [],
    notes: `No running workload on this host claims ${targetHost}:${targetPort}.`,
  } satisfies MatchResult;
}

function getPrimaryDomain(route: CanonicalRoute) {
  return route.domains[0] ?? null;
}

async function lookupAnswersForDomain(domain: string | null) {
  if (!domain) {
    return [];
  }

  try {
    const answers = await lookup(domain, { all: true });
    return [...new Set(answers.map((answer) => answer.address))];
  } catch {
    return [];
  }
}

async function getDnsBaselineAnswers(settings: PersistedSettings) {
  if (settings.dnsBaseline.mode === "disabled" || settings.dnsBaseline.value === "") {
    return [];
  }

  try {
    const answers = await lookup(settings.dnsBaseline.value, { all: true });
    return [...new Set(answers.map((answer) => answer.address))];
  } catch {
    if (
      /^\d+\.\d+\.\d+\.\d+$/.test(settings.dnsBaseline.value) ||
      settings.dnsBaseline.value.includes(":")
    ) {
      return [settings.dnsBaseline.value];
    }

    return [];
  }
}

function getDnsStatus(
  answers: string[],
  baselineMode: DnsBaselineMode,
  baselineAnswers: string[],
) {
  if (answers.length === 0) {
    return "unresolved";
  }

  if (baselineMode === "disabled") {
    return "observed";
  }

  if (baselineAnswers.length === 0) {
    return "unknown";
  }

  return answers.some((answer) => baselineAnswers.includes(answer))
    ? "ok"
    : "mismatch";
}

function getTlsDaysRemaining(expiresOn: string | null) {
  if (!expiresOn) {
    return null;
  }

  const expiresAt = new Date(expiresOn).getTime();

  if (Number.isNaN(expiresAt)) {
    return null;
  }

  return Math.ceil((expiresAt - Date.now()) / 86_400_000);
}

async function createRouteRecord(
  route: CanonicalRoute,
  match: MatchResult,
  answers: string[],
  dnsStatus: string,
  hostAddress: string,
  authOverrides: string[],
) {
  const primaryDomain = getPrimaryDomain(route);
  const tlsDaysRemaining = getTlsDaysRemaining(route.row.certificate_expires_on);
  const workloadLabel = match.workload
    ? match.workload.serviceName ?? match.workload.name
    : match.matchState === "off_host"
      ? `${route.row.forward_host}:${route.row.forward_port}`
      : "No confident workload";

  // Build a partial record so we can pass it to the seed/override checks before the probe
  const partialRecord = {
    slug: slugify(primaryDomain ?? `route-${route.row.id}`),
    entrypoint: primaryDomain ?? `proxy-host-${route.row.id}`,
    primaryDomain,
    workloadLabel,
    containerName: match.workload?.name ?? null,
    serviceName: match.workload?.serviceName ?? null,
    relatedWorkloads: match.relatedWorkloads,
    npmAccessListId: route.row.access_list_id ?? 0,
    npmAdvancedConfig: route.row.advanced_config ?? null,
  };

  // Check seed list and user overrides first (no network call needed)
  const seedMatch = matchesSelfAuthSeedList(partialRecord as RouteRecord);
  const overrideMatch = matchesUserOverrides(partialRecord as RouteRecord, authOverrides);

  // HTTP probe only if neither seed nor override matched (avoid unnecessary probes)
  let httpAuthDetected = false;
  if (!seedMatch && !overrideMatch) {
    const targetHost = route.row.forward_host;
    const targetPort = Number(route.row.forward_port);
    const probeHost = targetHost === "0.0.0.0" ? "127.0.0.1" : targetHost;
    httpAuthDetected = await probeHttpAuth(probeHost, targetPort);
  }

  const selfAuthDetected = seedMatch || overrideMatch || httpAuthDetected;

  return {
    slug: slugify(primaryDomain ?? `route-${route.row.id}`),
    entrypoint: primaryDomain ?? `proxy-host-${route.row.id}`,
    primaryDomain,
    edgeSource: "Nginx Proxy Manager",
    target: `${route.row.forward_host}:${route.row.forward_port}`,
    workloadLabel,
    matchState: match.matchState,
    confidence: match.confidence,
    dnsStatus,
    dnsAnswers: answers,
    tlsDaysRemaining,
    certificateLabel: route.row.certificate_name,
    certificateProvider: route.row.certificate_provider,
    notes: match.notes,
    publicPort: null,
    privatePort: Number(route.row.forward_port),
    composeProject: match.workload?.composeProject ?? null,
    serviceName: match.workload?.serviceName ?? null,
    containerName: match.workload?.name ?? null,
    hostAddress,
    sourceRecordId: route.row.id,
    duplicateDomainCount: route.duplicateDomainCount,
    sharedTargetCount: 1,
    npmAccessListId: route.row.access_list_id ?? 0,
    npmAdvancedConfig: route.row.advanced_config ?? null,
    selfAuthDetected,
    chain: [
      primaryDomain ?? `proxy-host-${route.row.id}`,
      "Nginx Proxy Manager",
      `${route.row.forward_host}:${route.row.forward_port}`,
      workloadLabel,
    ],
    relatedWorkloads: match.relatedWorkloads,
  } satisfies RouteRecord;
}

function applySharedTargetCounts(routes: RouteRecord[]) {
  const counts = new Map<string, number>();

  for (const route of routes) {
    const key = route.target;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return routes.map((route) => ({
    ...route,
    sharedTargetCount: counts.get(route.target) ?? 1,
  }));
}

function pushFinding(
  findings: Finding[],
  route: RouteRecord,
  type: string,
  severity: FindingSeverity,
  title: string,
  evidence: string,
  nextCheck: string,
  suppressed?: Set<string>,
) {
  if (suppressed?.has(suppressionKey(type, route.slug))) return;
  findings.push({
    id: `${route.slug}-${type}`,
    routeSlug: route.slug,
    type,
    severity,
    title,
    evidence,
    nextCheck,
  });
}

// Images/keywords that indicate an operational console rather than a user-facing app.
// Used to escalate no-auth findings and flag publicly-reachable admin surfaces.
const MANAGEMENT_SURFACE_IMAGES = new Set([
  // Container / host management
  "portainer", "portainer-ce", "portainer-be",
  "cockpit", "webmin",
  // Reverse proxy / network management UIs
  "nginx-proxy-manager", "proxy-manager", "traefik", "caddy",
  "haproxy-dataplaneapi",
  // Auth / SSO consoles
  "authelia", "authentik", "keycloak", "dex",
  // Storage / file management
  "filebrowser",
  // Document management
  "paperless-ngx", "paperless",
  // AI / automation consoles
  "open-webui", "ollama-webui", "n8n", "nocodb",
  "appsmith", "tooljet", "budibase-apps",
  // Database GUIs
  "phpmyadmin", "pgadmin4", "adminer", "mongo-express",
  "redis-commander", "redisinsight",
  // CI/CD
  "jenkins", "drone", "woodpecker-server",
  // Monitoring / observability
  "grafana", "prometheus", "alertmanager",
  "netdata", "uptime-kuma",
]);

function isManagementSurface(route: RouteRecord) {
  const candidates = [
    route.workloadLabel,
    route.containerName ?? "",
    route.serviceName ?? "",
    ...route.relatedWorkloads.map((w) => stripImageToBaseName(w.image)),
    ...route.relatedWorkloads.map((w) => w.name.toLowerCase()),
    ...route.relatedWorkloads.flatMap((w) => (w.serviceName ? [w.serviceName.toLowerCase()] : [])),
  ];
  return candidates.some((c) => MANAGEMENT_SURFACE_IMAGES.has(c.toLowerCase()))
    || [...MANAGEMENT_SURFACE_IMAGES].some((token) => route.entrypoint.toLowerCase().includes(token));
}

const AUTH_TOKENS = ["authelia", "authentik", "oauth2-proxy", "forward-auth", "keycloak"];

// Apps known to ship with their own built-in login screen.
// Matched against the base image name (registry + tag stripped).
const SELF_AUTH_IMAGES = new Set([
  // Media
  "jellyfin", "emby", "plex", "navidrome", "audiobookshelf", "kavita",
  "komga", "calibre-web", "stash",
  // Photos
  "immich-server", "photoprism", "lychee", "pigallery2",
  // Documents / notes
  "paperless-ngx", "paperless", "joplin", "outline", "bookstack",
  // Storage / files
  "nextcloud", "seafile", "filebrowser", "owncloud",
  // Dev / infra
  "gitea", "forgejo", "gogs", "gitlab-ce", "gitlab-ee",
  "drone", "woodpecker-server", "jenkins", "harbor-core",
  "registry",
  // NAS / bare-metal management UIs
  "dsm", "synology-dsm",
  // Monitoring / dashboards
  "grafana", "uptime-kuma", "netdata", "prometheus",
  "portainer", "portainer-ce", "portainer-be",
  "cockpit",
  // Password managers
  "vaultwarden", "bitwarden", "bitwarden_rs",
  // Home automation
  "home-assistant", "homeassistant",
  // AI / productivity
  "open-webui", "ollama-webui", "n8n", "nocodb",
  "appsmith", "tooljet", "budibase-apps",
  // Misc popular self-hosted
  "freshrss", "miniflux", "wallabag", "linkding", "shiori",
  "reactive-resume", "hoppscotch-app",
  "mealie", "tandoor",
  "ntfy",
]);

function stripImageToBaseName(image: string): string {
  // lscr.io/linuxserver/jellyfin:latest → jellyfin
  const withoutTag = image.split(":")[0];
  const parts = withoutTag.split("/");
  return parts[parts.length - 1].toLowerCase();
}

function matchesSelfAuthSeedList(route: RouteRecord): boolean {
  // Exact match against workload image base names and service names (containerised services)
  const workloadCandidates = route.relatedWorkloads
    .flatMap((w) => [stripImageToBaseName(w.image), w.name.toLowerCase(), w.serviceName?.toLowerCase() ?? ""]);
  if (workloadCandidates.some((c) => SELF_AUTH_IMAGES.has(c))) return true;

  // For bare-metal / network services (no Docker workload), check route identifiers
  // against seed list tokens using substring match — e.g. "emby" in "emby.host.me"
  const routeHaystack = [
    route.entrypoint,
    route.primaryDomain ?? "",
    route.workloadLabel,
    route.containerName ?? "",
    route.serviceName ?? "",
  ].join(" ").toLowerCase();

  return [...SELF_AUTH_IMAGES].some((token) => routeHaystack.includes(token));
}

function matchesUserOverrides(route: RouteRecord, overrides: string[]): boolean {
  if (overrides.length === 0) return false;
  const normalized = overrides.map((o) => o.trim().toLowerCase()).filter(Boolean);
  const candidates = [
    route.entrypoint.toLowerCase(),
    route.primaryDomain?.toLowerCase() ?? "",
    route.workloadLabel.toLowerCase(),
    route.containerName?.toLowerCase() ?? "",
    route.serviceName?.toLowerCase() ?? "",
    ...route.relatedWorkloads.map((w) => stripImageToBaseName(w.image)),
    ...route.relatedWorkloads.map((w) => w.name.toLowerCase()),
  ];
  return candidates.some((c) => normalized.some((o) => c.includes(o) || o.includes(c)));
}

function probeHttpAuth(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const probeHost = host === "0.0.0.0" ? "127.0.0.1" : host;
    let settled = false;
    const done = (result: boolean) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const attempt = (mod: typeof http | typeof https) => {
      try {
        const req = mod.request(
          { hostname: probeHost, port, path: "/", method: "GET", headers: { "User-Agent": "ops-ledger-probe/1.0" }, rejectUnauthorized: false },
          (res) => {
            const status = res.statusCode ?? 0;
            if (status === 401) return done(true);
            const loc = (res.headers.location ?? "").toLowerCase();
            if ((status === 301 || status === 302) && (loc.includes("login") || loc.includes("auth") || loc.includes("signin") || loc.includes("sso"))) {
              return done(true);
            }
            let body = "";
            res.on("data", (chunk: Buffer) => {
              body += chunk.toString();
              if (body.length > 8192) res.destroy();
            });
            res.on("end", () => {
              const lower = body.toLowerCase();
              const hasPasswordInput = lower.includes('type="password"') || lower.includes("type='password'");
              const hasLoginForm = lower.includes("<form") && (lower.includes("login") || lower.includes("sign in") || lower.includes("password"));
              const hasAuthMeta = lower.includes('content="0;url=/login') || lower.includes('content="0;url=/auth') || lower.includes('href="/login') || lower.includes('href="/auth') || lower.includes('href="/signin');
              done(hasPasswordInput || hasLoginForm || hasAuthMeta);
            });
            res.on("close", () => done(false));
          },
        );
        req.setTimeout(timeoutMs, () => { req.destroy(); done(false); });
        req.on("error", () => done(false));
        req.end();
      } catch {
        done(false);
      }
    };

    // Try HTTP first; if it errors out immediately, fall back to HTTPS
    try {
      const req = http.request(
        { hostname: probeHost, port, path: "/", method: "GET", headers: { "User-Agent": "ops-ledger-probe/1.0" } },
        (res) => {
          const status = res.statusCode ?? 0;
          if (status === 401) return done(true);
          const loc = (res.headers.location ?? "").toLowerCase();
          if ((status === 301 || status === 302) && (loc.includes("login") || loc.includes("auth") || loc.includes("signin") || loc.includes("sso"))) {
            return done(true);
          }
          let body = "";
          res.on("data", (chunk: Buffer) => {
            body += chunk.toString();
            if (body.length > 8192) res.destroy();
          });
          res.on("end", () => {
            const lower = body.toLowerCase();
            const hasPasswordInput = lower.includes('type="password"') || lower.includes("type='password'");
            const hasLoginForm = lower.includes("<form") && (lower.includes("login") || lower.includes("sign in") || lower.includes("password"));
            const hasAuthMeta = lower.includes('content="0;url=/login') || lower.includes('content="0;url=/auth') || lower.includes('href="/login') || lower.includes('href="/auth') || lower.includes('href="/signin');
            done(hasPasswordInput || hasLoginForm || hasAuthMeta);
          });
          res.on("close", () => done(false));
        },
      );
      req.setTimeout(timeoutMs, () => { req.destroy(); });
      req.on("error", () => attempt(https));
      req.end();
    } catch {
      attempt(https);
    }
  });
}

function hasAuthLayer(route: RouteRecord): boolean {
  if (route.npmAccessListId != null && route.npmAccessListId !== 0) return true;
  const advancedConfig = (route.npmAdvancedConfig ?? "").toLowerCase();
  if (advancedConfig.includes("auth_request") || advancedConfig.includes("authelia") || advancedConfig.includes("authentik")) return true;
  const haystack = route.relatedWorkloads
    .flatMap((w) => [w.name, w.image])
    .join(" ")
    .toLowerCase();
  if (AUTH_TOKENS.some((token) => haystack.includes(token))) return true;
  // Built-in auth detected via HTTP probe or seed list
  return route.selfAuthDetected;
}

function createFindings(routes: RouteRecord[], suppressed: Set<string>) {
  const findings: Finding[] = [];

  for (const route of routes) {
    if (route.matchState === "ambiguous") {
      pushFinding(
        findings, route, "ambiguous_target", "high",
        `${route.entrypoint} has multiple plausible workloads`,
        route.notes,
        "Tighten the NPM target or Docker network aliases so the route resolves to a single workload.",
        suppressed,
      );
    }

    if (route.matchState === "unmatched") {
      pushFinding(
        findings, route, "unmatched_target", "high",
        `${route.entrypoint} does not map to a live local workload`,
        route.notes,
        "Confirm the target port is still published or update the proxy host to the current service endpoint.",
        suppressed,
      );
    }

    if (route.matchState === "off_host") {
      pushFinding(
        findings, route, "off_host_target", "medium",
        `${route.entrypoint} forwards outside the scanned Docker host`,
        route.notes,
        "Keep it if the off-host dependency is intentional, otherwise bring the route back onto this host or document the dependency.",
        suppressed,
      );
    }

    if (route.confidence === "medium") {
      pushFinding(
        findings, route, "host_mode_inference", "medium",
        `${route.entrypoint} relies on host-network inference`,
        route.notes,
        "Prefer explicit container alias or published-port targeting if you want this route to stay easy to verify.",
        suppressed,
      );
    }

    if (route.duplicateDomainCount > 1) {
      pushFinding(
        findings, route, "duplicate_proxy_host", "high",
        `${route.entrypoint} exists in ${route.duplicateDomainCount} enabled proxy host records`,
        `Multiple active NPM rows resolve to ${route.target}. Ops Ledger kept the most recently modified record for the main route view.`,
        "Archive or delete the extra proxy host records before one of them drifts silently.",
        suppressed,
      );
    }

    if (route.sharedTargetCount > 1) {
      pushFinding(
        findings, route, "shared_forward_target",
        route.sharedTargetCount >= 3 ? "medium" : "low",
        `${route.sharedTargetCount} routes share ${route.target}`,
        `This entrypoint shares the same forward target as ${route.sharedTargetCount - 1} other route${route.sharedTargetCount === 2 ? "" : "s"}.`,
        "Confirm every extra hostname is intentional. This is often where stale domains hide.",
        suppressed,
      );
    }

    if (route.tlsDaysRemaining !== null && route.tlsDaysRemaining < 0) {
      pushFinding(
        findings, route, "certificate_expired", "high",
        `${route.entrypoint} has an expired certificate`,
        `${route.certificateLabel ?? "Certificate"} expired ${Math.abs(route.tlsDaysRemaining)} day${Math.abs(route.tlsDaysRemaining) === 1 ? "" : "s"} ago.`,
        "Renew or replace the certificate immediately.",
        suppressed,
      );
    } else if (route.tlsDaysRemaining !== null && route.tlsDaysRemaining <= 30) {
      pushFinding(
        findings, route, "certificate_expiring", "medium",
        `${route.entrypoint} enters the renewal window soon`,
        `${route.certificateLabel ?? "Certificate"} expires in ${route.tlsDaysRemaining} day${route.tlsDaysRemaining === 1 ? "" : "s"}.`,
        "Verify the renewal flow before the expiry window closes.",
        suppressed,
      );
    }

    if (route.dnsStatus === "unresolved") {
      pushFinding(
        findings, route, "dns_unresolved", "medium",
        `${route.entrypoint} does not resolve in DNS`,
        "The current DNS lookup returned no public answers for this hostname.",
        "Confirm the DNS record still exists and your DDNS provider is current.",
        suppressed,
      );
    }

    if (route.dnsStatus === "mismatch") {
      pushFinding(
        findings, route, "dns_mismatch", "medium",
        `${route.entrypoint} does not match the configured DNS baseline`,
        `Observed answers: ${route.dnsAnswers.join(", ")}.`,
        "Check the baseline setting or the current public endpoint before trusting this route.",
        suppressed,
      );
    }

    if (route.relatedWorkloads.some((workload) => workload.dockerSocketMount === "read_write")) {
      pushFinding(
        findings, route, "docker_socket_write_mount", "high",
        `${route.entrypoint} lands on a workload with read-write Docker socket access`,
        `${route.workloadLabel} has /var/run/docker.sock mounted read-write.`,
        "Treat this route as a high-sensitivity management surface and keep it behind stronger auth.",
        suppressed,
      );
    }

    if (!hasAuthLayer(route)) {
      const mgmt = isManagementSurface(route);
      pushFinding(
        findings, route,
        mgmt ? "management_surface" : "no_auth_layer",
        mgmt ? "high" : "medium",
        mgmt
          ? `${route.entrypoint} is a public management surface with no auth`
          : `${route.entrypoint} has no auth layer detected`,
        mgmt
          ? `${route.workloadLabel} looks like an operational console with no NPM access list or forward-auth found.`
          : "No NPM access list configured and no Authelia/Authentik/oauth2-proxy found in the compose stack.",
        "Add Authelia, Authentik, or an NPM access list, or confirm public access is intentional.",
        suppressed,
      );
    }
  }

  return findings;
}

// Known backup tools — detected by image name or compose service name in the stack.
const BACKUP_TOOL_IMAGES = new Set([
  "duplicati", "duplicacy", "restic", "borgbackup", "borg",
  "rclone", "rsnapshot", "backrest", "kopia",
  "syncthing",
  "borgmatic", "volumerize", "offen-backup",
  "backup-tools", "docker-vackup",
]);

// Mount path prefixes that indicate persistent user data worth backing up.
// System paths like /proc, /sys, /dev, /run, /tmp are excluded.
const PERSISTENT_PATH_PREFIXES = [
  "/home", "/data", "/storage", "/media", "/var/lib",
  "/config", "/configs", "/opt", "/srv", "/mnt",
  "/backup", "/backups", "/volumes",
];

function isMountPersistent(mountPath: string): boolean {
  const lower = mountPath.toLowerCase();
  return PERSISTENT_PATH_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function createWorkloadFindings(workloads: DockerWorkload[], routes: RouteRecord[], suppressed: Set<string>): WorkloadFinding[] {
  const findings: WorkloadFinding[] = [];

  // Build a set of workload IDs that are reachable via at least one proxy route
  const routeLinkedWorkloadIds = new Set(
    routes.flatMap((r) => r.relatedWorkloads.map((w) => w.name)),
  );

  // Build a set of all compose projects that have a backup tool running
  const projectsWithBackup = new Set<string>();
  for (const workload of workloads) {
    const baseName = stripImageToBaseName(workload.image);
    const serviceNameLower = (workload.serviceName ?? "").toLowerCase();
    if (BACKUP_TOOL_IMAGES.has(baseName) || BACKUP_TOOL_IMAGES.has(serviceNameLower)) {
      if (workload.composeProject) {
        projectsWithBackup.add(workload.composeProject);
      }
    }
  }

  for (const workload of workloads) {
    const baseName = stripImageToBaseName(workload.image);
    const isLatestTag = workload.image.endsWith(":latest") || (!workload.image.includes(":") && workload.image.includes("/")) || (workload.image.split(":").length === 1);

    // ── PORT EXPOSURE AUDIT ────────────────────────────────────────────────
    // Flag containers publishing ports directly to all interfaces (0.0.0.0 or unspecified)
    // that are NOT linked to any proxy route — potential unintentional exposure.
    const unproxiedPorts = workload.publishedPorts.filter((port) => {
      const isAllInterfaces = port.hostIp === null || port.hostIp === "0.0.0.0" || port.hostIp === "::";
      const isLinkedViaProxy = routeLinkedWorkloadIds.has(workload.name);
      return isAllInterfaces && !isLinkedViaProxy;
    });
    // Deduplicate by publicPort (Docker reports TCP + UDP separately)
    const dedupedPorts = unproxiedPorts.filter(
      (port, idx, arr) => arr.findIndex((p) => p.publicPort === port.publicPort) === idx,
    );

    if (dedupedPorts.length > 0 && !suppressed.has(suppressionKey("port_bypass", workload.name))) {
      const portList = dedupedPorts.map((p) => `${p.publicPort}→${p.privatePort}`).join(", ");
      findings.push({
        id: `${workload.id}-port_bypass`,
        workloadId: workload.id,
        workloadName: workload.name,
        type: "port_bypass",
        severity: "medium",
        title: `${workload.name} is publishing ports directly without a proxy`,
        evidence: `Port${dedupedPorts.length > 1 ? "s" : ""} ${portList} bound to all interfaces with no matching proxy route.`,
        nextCheck: "Confirm this is intentional. If the service should only be reached through a reverse proxy, remove the host port binding.",
      });
    }

    // ── IMAGE STALENESS ────────────────────────────────────────────────────
    // Flag containers using :latest tag (unpinned version).
    if (isLatestTag && !suppressed.has(suppressionKey("image_latest", workload.name))) {
      const latestNote = workload.latestImageTag
        ? ` Latest available version on Docker Hub: ${workload.latestImageTag}.`
        : "";
      findings.push({
        id: `${workload.id}-image_latest`,
        workloadId: workload.id,
        workloadName: workload.name,
        type: "image_latest",
        severity: "low",
        title: `${workload.name} is running an unpinned image tag`,
        evidence: `Image: ${workload.image}. Using :latest or an untagged image means updates are unpredictable — the container may silently change behaviour after a pull.${latestNote}`,
        nextCheck: "Pin the image to a specific version tag in your compose file to get predictable, auditable deployments.",
      });
    }

    // Flag containers whose image hasn't been refreshed in over 90 days.
    if (workload.createdAt && !suppressed.has(suppressionKey("image_stale", workload.name))) {
      const ageMs = Date.now() - new Date(workload.createdAt).getTime();
      const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
      if (ageDays > 90) {
        const latestNote = workload.latestImageTag
          ? ` Latest available version on Docker Hub: ${workload.latestImageTag}.`
          : "";
        findings.push({
          id: `${workload.id}-image_stale`,
          workloadId: workload.id,
          workloadName: workload.name,
          type: "image_stale",
          severity: "low",
          title: `${workload.name} has not been recreated in ${ageDays} days`,
          evidence: `Container started ${ageDays} days ago (${workload.createdAt.slice(0, 10)}). Long-running containers may be missing security patches from newer image releases.${latestNote}`,
          nextCheck: "Pull the latest image and recreate the container to pick up any upstream security fixes.",
        });
      }
    }

    // ── BACKUP STATUS ──────────────────────────────────────────────────────
    // Flag containers with persistent mounts in a compose stack that has no backup tool.
    const persistentMounts = workload.mounts.filter(isMountPersistent);
    const hasBackupInStack = workload.composeProject
      ? projectsWithBackup.has(workload.composeProject)
      : false;

    if (persistentMounts.length > 0 && !hasBackupInStack && !suppressed.has(suppressionKey("no_backup", workload.name))) {
      findings.push({
        id: `${workload.id}-no_backup`,
        workloadId: workload.id,
        workloadName: workload.name,
        type: "no_backup",
        severity: "low",
        title: `${workload.name} has persistent storage with no backup tool detected`,
        evidence: `Mount${persistentMounts.length > 1 ? "s" : ""}: ${persistentMounts.slice(0, 3).join(", ")}${persistentMounts.length > 3 ? ` +${persistentMounts.length - 3} more` : ""}. No known backup tool found in the compose stack.`,
        nextCheck: "Add a backup tool (Duplicati, Restic, Kopia, etc.) to the stack, or confirm an external backup solution covers these paths.",
      });
    }
  }

  return findings;
}

export function suppressionKey(type: string, name: string) {
  return `${type}:${name}`;
}

async function buildSnapshot(settings: PersistedSettings) {
  const hostAddress = settings.hostAddress ?? detectHostAddress() ?? "unknown-host";
  const hostCandidates = new Set<string>(
    [hostAddress, settings.hostAddress, detectHostAddress(), "localhost", "127.0.0.1"]
      .filter(Boolean)
      .map((value) => String(value)),
  );

  const connectors: Connector[] = [];
  let workloads: DockerWorkload[] = [];
  let routes: RouteRecord[] = [];

  try {
    workloads = await scanDocker(settings.dockerSocketPath);
    connectors.push({
      id: "docker",
      label: "Docker socket",
      kind: "runtime",
      status: "connected",
      requiresAction: false,
      hint: `Read ${workloads.length} running container${workloads.length === 1 ? "" : "s"} from ${settings.dockerSocketPath}.`,
      details: "Container matching uses published ports, host-network inference, service names, and network aliases.",
      lastSyncAt: new Date().toISOString(),
    });
  } catch (error) {
    connectors.push({
      id: "docker",
      label: "Docker socket",
      kind: "runtime",
      status: "disconnected",
      requiresAction: true,
      hint:
        error instanceof Error
          ? error.message
          : "Could not read the Docker socket.",
      details: `Expected read access to ${settings.dockerSocketPath}.`,
      lastSyncAt: null,
    });
  }

  if (existsSync(settings.npmSqlitePath)) {
    try {
      const rows = await readSqliteJson<NpmRow[]>(settings.npmSqlitePath, SQLITE_QUERY);
      const canonicalRoutes = dedupeRoutes(rows);
      const baselineAnswers = await getDnsBaselineAnswers(settings);

      const routeResults = await Promise.all(
        canonicalRoutes.map(async (route) => {
          const match = await matchRouteToWorkload(
            route,
            workloads,
            settings,
            hostCandidates,
          );
          const answers = await lookupAnswersForDomain(getPrimaryDomain(route));
          const dnsStatus = getDnsStatus(
            answers,
            settings.dnsBaseline.mode,
            baselineAnswers,
          );

          return createRouteRecord(route, match, answers, dnsStatus, hostAddress, settings.authOverrides);
        }),
      );

      routes = applySharedTargetCounts(routeResults);
      connectors.push({
        id: "npm",
        label: "Nginx Proxy Manager",
        kind: "reverse_proxy",
        status: "connected",
        requiresAction: false,
        hint: `Loaded ${routes.length} active proxy host${routes.length === 1 ? "" : "s"} from the local SQLite store.`,
        details: `Using ${settings.npmSqlitePath} because this host has the NPM data bind-mounted locally.`,
        lastSyncAt: new Date().toISOString(),
      });
    } catch (error) {
      connectors.push({
        id: "npm",
        label: "Nginx Proxy Manager",
        kind: "reverse_proxy",
        status: "degraded",
        requiresAction: true,
        hint:
          error instanceof Error
            ? error.message
            : "Could not read the NPM SQLite store.",
        details: `Expected a readable SQLite file at ${settings.npmSqlitePath}.`,
        lastSyncAt: null,
      });
    }
  } else {
    connectors.push({
      id: "npm",
      label: "Nginx Proxy Manager",
      kind: "reverse_proxy",
      status: "degraded",
      requiresAction: true,
      hint: "NPM SQLite store not found on this host.",
      details: `Expected a readable SQLite file at ${settings.npmSqlitePath}.`,
      lastSyncAt: null,
    });
  }

  const dnsReady = routes.some((route) => route.dnsAnswers.length > 0);
  connectors.push({
    id: "dns",
    label: "DNS lookups",
    kind: "network",
    status: dnsReady ? "connected" : "degraded",
    requiresAction: !dnsReady && routes.length > 0,
    hint: dnsReady
      ? "Resolved public answers for the current NPM route set."
      : routes.length === 0
        ? "Waiting on route data before DNS checks can run."
        : "No public answers were observed for the current route set.",
    details: "Each snapshot records observed route answers and optionally compares them against a configured baseline.",
    lastSyncAt: new Date().toISOString(),
  });

  const suppressed = new Set(settings.suppressedFindings ?? []);

  const findings = createFindings(routes, suppressed).sort((left, right) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[left.severity] - order[right.severity];
  });

  const workloadFindings = createWorkloadFindings(workloads, routes, suppressed).sort((left, right) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[left.severity] - order[right.severity];
  });

  const generatedAt = new Date().toISOString();

  return {
    id: generatedAt,
    generatedAt,
    generatedLabel: formatTimestampLabel(generatedAt),
    hostLabel: settings.hostLabel,
    hostAddress,
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
      lastCompletedAt: generatedAt,
      nextScheduledAt: getNextScheduledAt(
        generatedAt,
        settings.scanConfig.intervalEnabled,
        settings.scanConfig.intervalMinutes,
      ),
    },
    connectors,
    workloads: workloads.map((workload) => serializeWorkload(workload)),
    routes,
    findings,
    workloadFindings,
    changes: [],
  } satisfies OpsLedgerSnapshot;
}

function fireWebhook(url: string, payload: object): Promise<{ success: boolean }> {
  const body = JSON.stringify(payload);
  return new Promise((resolve) => {
    try {
      https_request(
        url,
        body,
        () => resolve({ success: true }),
        () => resolve({ success: false }),
      );
    } catch {
      resolve({ success: false });
    }
  });
}

function https_request(
  url: string,
  body: string,
  resolve: () => void,
  reject: (err: unknown) => void,
) {
  const parsed = new URL(url);
  const mod = parsed.protocol === "https:" ? https : http;
  const req = mod.request(
    {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    },
    (res: { resume: () => void }) => { res.resume(); resolve(); },
  );
  req.setTimeout(5000, () => { req.destroy(); reject(new Error("timeout")); });
  req.on("error", reject);
  req.write(body);
  req.end();
  return req;
}

async function runScanAndPersist(settings: PersistedSettings): Promise<void> {
  const suppressedKeys = await dbGetSuppressedFindings();
  const settingsWithSuppressed = { ...settings, suppressedFindings: suppressedKeys };
  const snapshot = await buildSnapshot(settingsWithSuppressed);
  const previous = await dbGetActiveSnapshot();
  const changes = previous ? diffSnapshots(previous, snapshot) : [];
  const snapshotWithChanges = { ...snapshot, changes };

  await dbInsertSnapshot(snapshotWithChanges);
  await dbSetActiveSnapshot(snapshotWithChanges.id);
  await dbPruneSnapshots(settings.scanConfig.retentionLimit);

  // Fire webhook for new findings
  const wh = settings.webhookConfig;
  if (wh.enabled && wh.url) {
    const prevFindingIds = new Set((previous?.findings ?? []).map((f: Finding) => f.id));
    const threshold = wh.severityThreshold === "high_medium" ? ["high", "medium"] : ["high"];
    const newFindings = snapshotWithChanges.findings.filter(
      (f: Finding) => !prevFindingIds.has(f.id) && threshold.includes(f.severity),
    );
    if (newFindings.length > 0) {
      const result = await fireWebhook(wh.url, {
        timestamp: snapshotWithChanges.generatedAt,
        hostLabel: snapshotWithChanges.hostLabel,
        hostAddress: snapshotWithChanges.hostAddress,
        newFindingCount: newFindings.length,
        findings: newFindings.map((f: Finding) => ({
          id: f.id,
          routeSlug: f.routeSlug,
          type: f.type,
          severity: f.severity,
          title: f.title,
          evidence: f.evidence,
        })),
      });
      await dbUpsertSettings({
        ...settings,
        webhookConfig: {
          ...wh,
          lastDeliveryAt: snapshotWithChanges.generatedAt,
          lastDeliveryStatus: result.success ? "success" : "failed",
        },
      });
    }
  }
}

function getRecentChanges(snapshots: OpsLedgerSnapshot[]) {
  const seen = new Map<string, OpsLedgerSnapshot["changes"][0]>();
  for (const snap of snapshots.slice(-5)) {
    for (const change of snap.changes ?? []) {
      if (!seen.has(change.id)) seen.set(change.id, change);
    }
  }
  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return [...seen.values()].sort((a, b) => order[a.severity] - order[b.severity]);
}

async function loadState(): Promise<OpsLedgerState> {
  await ensureDb();
  const [settings, rawSnapshot, allSnapshots, suppressedKeys] = await Promise.all([
    getSettings(),
    dbGetActiveSnapshot(),
    dbGetSnapshots(576),
    dbGetSuppressedFindings(),
  ]);

  const suppressedSet = new Set(suppressedKeys);
  const settingsWithSuppressed = { ...settings, suppressedFindings: suppressedKeys };

  if (!rawSnapshot) {
    return {
      snapshot: getFallbackSnapshot(settingsWithSuppressed),
      snapshots: [],
      history: [],
      settings: settingsWithSuppressed,
      recentChanges: [],
    };
  }

  const snapshot = attachCurrentSettings(rawSnapshot, settingsWithSuppressed);

  // Apply display-time suppression filter to the loaded snapshot
  const filtered = {
    ...snapshot,
    findings: snapshot.findings.filter(
      (f) => !suppressedSet.has(suppressionKey(f.type, f.routeSlug)),
    ),
    workloadFindings: (snapshot.workloadFindings ?? []).filter(
      (f) => !suppressedSet.has(suppressionKey(f.type, f.workloadName)),
    ),
  };

  return {
    snapshot: filtered,
    snapshots: allSnapshots,
    history: getHistoryPoints(allSnapshots),
    settings: settingsWithSuppressed,
    recentChanges: getRecentChanges(allSnapshots),
  };
}

export async function getOpsLedgerState(): Promise<OpsLedgerState> {
  ensureScheduler();
  await ensureDb();

  // If we already have a snapshot, return it immediately and let the scheduler
  // handle background refresh. This keeps page loads fast after first boot.
  const existing = await dbGetActiveSnapshot();
  if (existing) {
    void runDueScan();
    return loadState();
  }

  // First boot: no snapshot yet — must block until the first scan completes.
  await runDueScan();
  return loadState();
}

export async function triggerManualScan(): Promise<OpsLedgerState> {
  await runExclusiveScan(async () => {
    await ensureDb();
    const settings = await getSettings();
    await runScanAndPersist(settings);
  });
  return loadState();
}

export async function saveSettings(input: SettingsUpdate): Promise<OpsLedgerState> {
  await ensureDb();
  const current = await getSettings();
  const next = normalizeSettings({
    ...current,
    ...input,
    dnsBaseline: { ...current.dnsBaseline, ...input.dnsBaseline },
    scanConfig: { ...current.scanConfig, ...input.scanConfig },
    webhookConfig: { ...current.webhookConfig, ...input.webhookConfig },
    authOverrides: input.authOverrides ?? current.authOverrides,
  });
  await dbUpsertSettings(next);
  return loadState();
}

export async function suppressFinding(key: string): Promise<void> {
  await ensureDb();
  await dbSuppressFinding(key);
}

export async function unsuppressFinding(key: string): Promise<void> {
  await ensureDb();
  await dbUnsuppressFinding(key);
}

export async function getSuppressedFindings(): Promise<string[]> {
  await ensureDb();
  return dbGetSuppressedFindings();
}
