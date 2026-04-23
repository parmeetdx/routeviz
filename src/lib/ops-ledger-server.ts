import { execFile } from "node:child_process";
import { lookup } from "node:dns/promises";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import http from "node:http";
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

type StoreFile = {
  version: 1;
  activeSnapshotId: string | null;
  settings: PersistedSettings;
  snapshots: OpsLedgerSnapshot[];
};

type SettingsUpdate = {
  dockerSocketPath?: string;
  hostAddress?: string | null;
  hostLabel?: string;
  npmSqlitePath?: string;
  dnsBaseline?: Partial<PersistedSettings["dnsBaseline"]>;
  scanConfig?: Partial<PersistedSettings["scanConfig"]>;
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
  State: string;
  Ports?: DockerPort[];
  Labels?: Record<string, string>;
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
  state: string;
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
};

const globalOpsLedger = globalThis as typeof globalThis & {
  __opsLedgerScheduler?: NodeJS.Timeout;
  __opsLedgerScanPromise?: Promise<StoreFile>;
};

function getFallbackSnapshot(settings: PersistedSettings, message?: string) {
  return createFallbackSnapshot(settings, message) as OpsLedgerSnapshot;
}

function detectHostAddress() {
  const interfaces = os.networkInterfaces();

  for (const item of Object.values(interfaces)) {
    if (!item) {
      continue;
    }

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
  const dnsBaselineValue =
    input.dnsBaseline?.value ?? defaultSettings.dnsBaseline.value;
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
      intervalEnabled:
        input.scanConfig?.intervalEnabled ??
        defaultSettings.scanConfig.intervalEnabled,
      intervalMinutes:
        typeof intervalMinutes === "number" && intervalMinutes > 0
          ? intervalMinutes
          : defaultSettings.scanConfig.intervalMinutes,
      retentionLimit:
        typeof retentionLimit === "number" && retentionLimit > 0
          ? retentionLimit
          : defaultSettings.scanConfig.retentionLimit,
    },
  };
}

function normalizeDnsMode(mode: string): DnsBaselineMode {
  if (mode === "reference_hostname" || mode === "manual_endpoint") {
    return mode;
  }

  return "disabled";
}

async function ensureStore() {
  await mkdir(STORE_DIRECTORY, { recursive: true });

  if (!existsSync(STORE_PATH)) {
    const initialStore: StoreFile = {
      version: 1 as const,
      activeSnapshotId: null,
      settings: normalizeSettings(),
      snapshots: [],
    };

    await writeStore(initialStore);
    return initialStore;
  }

  const raw = await readFile(STORE_PATH, "utf8");
  const parsed = JSON.parse(raw) as Partial<StoreFile>;

  return {
    version: 1 as const,
    activeSnapshotId: parsed.activeSnapshotId ?? null,
    settings: normalizeSettings(parsed.settings),
    snapshots: Array.isArray(parsed.snapshots)
      ? parsed.snapshots.map(normalizeSnapshot)
      : [],
  };
}

async function writeStore(store: StoreFile) {
  const temporaryPath = path.join(
    STORE_DIRECTORY,
    `store.${process.pid}.${Date.now()}.tmp`,
  );

  await writeFile(temporaryPath, JSON.stringify(store, null, 2), "utf8");
  await rename(temporaryPath, STORE_PATH);
}

function attachCurrentSettings(
  snapshot: OpsLedgerSnapshot,
  settings: PersistedSettings,
) {
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

function normalizeSnapshot(snapshot: Partial<OpsLedgerSnapshot>): OpsLedgerSnapshot {
  return {
    ...(snapshot as OpsLedgerSnapshot),
    connectors: Array.isArray(snapshot.connectors) ? snapshot.connectors : [],
    workloads: Array.isArray(snapshot.workloads) ? snapshot.workloads : [],
    routes: Array.isArray(snapshot.routes) ? snapshot.routes : [],
    findings: Array.isArray(snapshot.findings) ? snapshot.findings : [],
  };
}

function getNextScheduledAt(
  generatedAt: string | null,
  enabled: boolean,
  intervalMinutes: number,
) {
  if (!generatedAt || !enabled) {
    return null;
  }

  const date = new Date(generatedAt);
  date.setMinutes(date.getMinutes() + intervalMinutes);
  return date.toISOString();
}

function getActiveSnapshot(store: StoreFile) {
  const active = store.snapshots.find(
    (snapshot) => snapshot.id === store.activeSnapshotId,
  );

  if (active) {
    return attachCurrentSettings(active, store.settings);
  }

  const latest = store.snapshots.at(-1);
  return latest ? attachCurrentSettings(latest, store.settings) : null;
}

function isDue(snapshot: OpsLedgerSnapshot | null, settings: PersistedSettings) {
  if (!snapshot) {
    return true;
  }

  if (!settings.scanConfig.intervalEnabled) {
    return false;
  }

  const dueAt = new Date(snapshot.generatedAt);
  dueAt.setMinutes(dueAt.getMinutes() + settings.scanConfig.intervalMinutes);

  return Date.now() >= dueAt.getTime();
}

function ensureScheduler() {
  if (globalOpsLedger.__opsLedgerScheduler) {
    return;
  }

  const timer = setInterval(() => {
    void runDueScan();
  }, 60_000);

  timer.unref?.();
  globalOpsLedger.__opsLedgerScheduler = timer;
}

async function runExclusiveScan(task: () => Promise<StoreFile>) {
  if (!globalOpsLedger.__opsLedgerScanPromise) {
    globalOpsLedger.__opsLedgerScanPromise = task().finally(() => {
      globalOpsLedger.__opsLedgerScanPromise = undefined;
    });
  }

  return globalOpsLedger.__opsLedgerScanPromise;
}

async function runDueScan() {
  return runExclusiveScan(async () => {
    const store = await ensureStore();
    const snapshot = getActiveSnapshot(store);

    if (!isDue(snapshot, store.settings)) {
      return store;
    }

    return runScanAndPersist(store);
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
  } satisfies DockerWorkload;
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

  return workloads.sort((left, right) => left.name.localeCompare(right.name));
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
    state: item.state,
    role: item.serviceName ?? "container",
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
    state: workload.state,
    role: workload.serviceName ?? "container",
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

function matchRouteToWorkload(
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

function createRouteRecord(
  route: CanonicalRoute,
  match: MatchResult,
  answers: string[],
  dnsStatus: string,
  hostAddress: string,
) {
  const primaryDomain = getPrimaryDomain(route);
  const tlsDaysRemaining = getTlsDaysRemaining(route.row.certificate_expires_on);
  const workloadLabel = match.workload
    ? match.workload.serviceName ?? match.workload.name
    : match.matchState === "off_host"
      ? `${route.row.forward_host}:${route.row.forward_port}`
      : "No confident workload";

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
) {
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

function isManagementSurface(route: RouteRecord) {
  const haystack = [
    route.entrypoint,
    route.target,
    route.workloadLabel,
    route.containerName ?? "",
    route.serviceName ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return [
    "portainer",
    "proxy-manager",
    "authelia",
    "filebrowser",
    "paperless",
    "open-webui",
  ].some((token) => haystack.includes(token));
}

function createFindings(routes: RouteRecord[]) {
  const findings: Finding[] = [];

  for (const route of routes) {
    if (route.matchState === "ambiguous") {
      pushFinding(
        findings,
        route,
        "ambiguous_target",
        "high",
        `${route.entrypoint} has multiple plausible workloads`,
        route.notes,
        "Tighten the NPM target or Docker network aliases so the route resolves to a single workload.",
      );
    }

    if (route.matchState === "unmatched") {
      pushFinding(
        findings,
        route,
        "unmatched_target",
        "high",
        `${route.entrypoint} does not map to a live local workload`,
        route.notes,
        "Confirm the target port is still published or update the proxy host to the current service endpoint.",
      );
    }

    if (route.matchState === "off_host") {
      pushFinding(
        findings,
        route,
        "off_host_target",
        "medium",
        `${route.entrypoint} forwards outside the scanned Docker host`,
        route.notes,
        "Keep it if the off-host dependency is intentional, otherwise bring the route back onto this host or document the dependency.",
      );
    }

    if (route.confidence === "medium") {
      pushFinding(
        findings,
        route,
        "host_mode_inference",
        "medium",
        `${route.entrypoint} relies on host-network inference`,
        route.notes,
        "Prefer explicit container alias or published-port targeting if you want this route to stay easy to verify.",
      );
    }

    if (route.duplicateDomainCount > 1) {
      pushFinding(
        findings,
        route,
        "duplicate_proxy_host",
        "high",
        `${route.entrypoint} exists in ${route.duplicateDomainCount} enabled proxy host records`,
        `Multiple active NPM rows resolve to ${route.target}. Ops Ledger kept the most recently modified record for the main route view.`,
        "Archive or delete the extra proxy host records before one of them drifts silently.",
      );
    }

    if (route.sharedTargetCount > 1) {
      pushFinding(
        findings,
        route,
        "shared_forward_target",
        route.sharedTargetCount >= 3 ? "medium" : "low",
        `${route.sharedTargetCount} routes share ${route.target}`,
        `This entrypoint shares the same forward target as ${route.sharedTargetCount - 1} other route${route.sharedTargetCount === 2 ? "" : "s"}.`,
        "Confirm every extra hostname is intentional. This is often where stale domains hide.",
      );
    }

    if (route.tlsDaysRemaining !== null && route.tlsDaysRemaining < 0) {
      pushFinding(
        findings,
        route,
        "certificate_expired",
        "high",
        `${route.entrypoint} has an expired certificate`,
        `${route.certificateLabel ?? "Certificate"} expired ${Math.abs(route.tlsDaysRemaining)} day${Math.abs(route.tlsDaysRemaining) === 1 ? "" : "s"} ago.`,
        "Renew or replace the certificate immediately.",
      );
    } else if (
      route.tlsDaysRemaining !== null &&
      route.tlsDaysRemaining <= 30
    ) {
      pushFinding(
        findings,
        route,
        "certificate_expiring",
        "medium",
        `${route.entrypoint} enters the renewal window soon`,
        `${route.certificateLabel ?? "Certificate"} expires in ${route.tlsDaysRemaining} day${route.tlsDaysRemaining === 1 ? "" : "s"}.`,
        "Verify the renewal flow before the expiry window closes.",
      );
    }

    if (route.dnsStatus === "unresolved") {
      pushFinding(
        findings,
        route,
        "dns_unresolved",
        "medium",
        `${route.entrypoint} does not resolve in DNS`,
        "The current DNS lookup returned no public answers for this hostname.",
        "Confirm the DNS record still exists and your DDNS provider is current.",
      );
    }

    if (route.dnsStatus === "mismatch") {
      pushFinding(
        findings,
        route,
        "dns_mismatch",
        "medium",
        `${route.entrypoint} does not match the configured DNS baseline`,
        `Observed answers: ${route.dnsAnswers.join(", ")}.`,
        "Check the baseline setting or the current public endpoint before trusting this route.",
      );
    }

    if (route.relatedWorkloads.some((workload) => workload.dockerSocketMount === "read_write")) {
      pushFinding(
        findings,
        route,
        "docker_socket_write_mount",
        "high",
        `${route.entrypoint} lands on a workload with read-write Docker socket access`,
        `${route.workloadLabel} has /var/run/docker.sock mounted read-write.`,
        "Treat this route as a high-sensitivity management surface and keep it behind stronger auth.",
      );
    }

    if (isManagementSurface(route)) {
      pushFinding(
        findings,
        route,
        "management_surface",
        "medium",
        `${route.entrypoint} exposes a management surface`,
        `${route.workloadLabel} looks like an operational console rather than a user-facing app.`,
        "Confirm you still want this surface publicly reachable and protected the way you expect.",
      );
    }
  }

  return findings;
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
          const match = matchRouteToWorkload(
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

          return createRouteRecord(route, match, answers, dnsStatus, hostAddress);
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

  const findings = createFindings(routes).sort((left, right) => {
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
  } satisfies OpsLedgerSnapshot;
}

async function runScanAndPersist(store: StoreFile) {
  const snapshot = await buildSnapshot(store.settings);
  const retentionLimit = store.settings.scanConfig.retentionLimit;
  const snapshots = [...store.snapshots, snapshot].slice(-retentionLimit);
  const nextStore: StoreFile = {
    ...store,
    activeSnapshotId: snapshot.id,
    snapshots,
  };

  await writeStore(nextStore);
  return nextStore;
}

export async function getOpsLedgerState(): Promise<OpsLedgerState> {
  ensureScheduler();

  const store = await runDueScan();
  const snapshot = getActiveSnapshot(store);

  if (!snapshot) {
    return {
      snapshot: getFallbackSnapshot(store.settings),
      history: [],
      settings: store.settings,
    };
  }

  return {
    snapshot,
    history: getHistoryPoints(store.snapshots),
    settings: store.settings,
  };
}

export async function triggerManualScan() {
  const store = await runExclusiveScan(async () => {
    const currentStore = await ensureStore();
    return runScanAndPersist(currentStore);
  });

  const snapshot = getActiveSnapshot(store) ?? getFallbackSnapshot(store.settings);

  return {
    snapshot,
    history: getHistoryPoints(store.snapshots),
    settings: store.settings,
  } satisfies OpsLedgerState;
}

export async function saveSettings(
  input: SettingsUpdate,
): Promise<OpsLedgerState> {
  const store = await ensureStore();
  const nextStore: StoreFile = {
    ...store,
    version: 1 as const,
    settings: normalizeSettings({
      ...store.settings,
      ...input,
      dnsBaseline: {
        ...store.settings.dnsBaseline,
        ...input.dnsBaseline,
      },
      scanConfig: {
        ...store.settings.scanConfig,
        ...input.scanConfig,
      },
    }),
  };

  await writeStore(nextStore);
  const snapshot = getActiveSnapshot(nextStore);

  return {
    snapshot: snapshot ?? getFallbackSnapshot(nextStore.settings),
    history: getHistoryPoints(nextStore.snapshots),
    settings: nextStore.settings,
  };
}
