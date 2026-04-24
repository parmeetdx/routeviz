import { slugify } from "@/lib/ops-ledger.mjs";
import type {
  Finding,
  OpsLedgerSnapshot,
  RelatedWorkload,
  RouteRecord,
  WorkloadRecord,
} from "@/lib/ops-ledger-types";

type ServiceKind = "public" | "internal";
type ServiceStatus = "online" | "warning" | "offline";
type BadgeTone = "info" | "success" | "warning" | "muted" | "danger";
type RiskState = "ok" | "warn" | "danger";

export interface ExplorerBadge {
  label: string;
  tone: BadgeTone;
}

export interface ExplorerRiskCheck {
  label: string;
  state: RiskState;
}

export interface ExplorerChainCard {
  id: string;
  title: string;
  lines: string[];
  mono?: boolean;
}

export interface SparklinePoint {
  state: string;
  generatedAt: string;
}

export interface ExplorerService {
  id: string;
  kind: ServiceKind;
  href: string;
  label: string;
  secondaryLabel: string;
  titleLinkLabel: string;
  titleLinkHref?: string;
  status: ServiceStatus;
  badges: ExplorerBadge[];
  summary: string;
  hostLabel: string;
  hostAddress: string;
  introLabel: string | null;
  chainCards: ExplorerChainCard[];
  riskChecks: ExplorerRiskCheck[];
  impactHeading: string;
  impactItems: string[];
  notes: string[];
  findings: Finding[];
  warningCount: number;
  containerCount: number;
  availabilitySparkline: SparklinePoint[];
}

export interface ServiceExplorerModel {
  lastSyncLabel: string;
  services: ExplorerService[];
  activeService: ExplorerService | null;
}

const GENERIC_SERVICE_NAMES = new Set([
  "app",
  "api",
  "backend",
  "cron",
  "db",
  "frontend",
  "machine-learning",
  "nginx",
  "nginx-preview",
  "postgres",
  "postgresql",
  "redis",
  "scheduler",
  "server",
  "web",
  "worker",
]);

const PREFERRED_LABELS = [
  "immich",
  "jellyfin",
  "vaultwarden",
  "bitwarden",
  "paperless",
  "n8n",
  "home assistant",
  "home",
  "portainer",
];

const SPECIAL_LABELS = new Map<string, string>([
  ["bitwarden", "Vaultwarden"],
  ["home", "Home Assistant"],
  ["homeassistant", "Home Assistant"],
  ["npm", "NPM"],
  ["n8n", "n8n"],
  ["paperless", "Paperless-ngx"],
  ["paperless-ngx", "Paperless-ngx"],
]);

export function buildServiceExplorerModel(
  snapshot: OpsLedgerSnapshot,
  selectedId: string | null,
  snapshots?: OpsLedgerSnapshot[],
): ServiceExplorerModel {
  const findingsByRoute = new Map<string, Finding[]>();

  for (const finding of snapshot.findings) {
    const bucket = findingsByRoute.get(finding.routeSlug) ?? [];
    bucket.push(finding);
    findingsByRoute.set(finding.routeSlug, bucket);
  }

  // Build per-route sparkline from last 48 snapshots (chronological order)
  const sparklineBySlug = new Map<string, SparklinePoint[]>();
  if (snapshots && snapshots.length > 0) {
    const recentSnapshots = snapshots.slice(-48);
    for (const snap of recentSnapshots) {
      for (const route of snap.routes) {
        const points = sparklineBySlug.get(route.slug) ?? [];
        points.push({ state: route.matchState, generatedAt: snap.generatedAt });
        sparklineBySlug.set(route.slug, points);
      }
    }
  }

  const publicServices = snapshot.routes.map((route) =>
    buildPublicService(snapshot, route, findingsByRoute.get(route.slug) ?? [], sparklineBySlug.get(route.slug) ?? []),
  );
  const internalServices = buildInternalServices(snapshot);
  const services = [...publicServices, ...internalServices].sort(sortServices);
  const activeService = resolveActiveService(services, selectedId);

  if (!activeService) {
    return {
      lastSyncLabel: formatLastSyncLabel(snapshot.generatedAt),
      services,
      activeService: null,
    };
  }

  const hostPeers = services.filter(
    (service) => service.hostAddress === activeService.hostAddress,
  );

  activeService.impactItems = hostPeers.map((service) => describeImpact(service));

  return {
    lastSyncLabel: formatLastSyncLabel(snapshot.generatedAt),
    services,
    activeService,
  };
}

function buildPublicService(
  snapshot: OpsLedgerSnapshot,
  route: RouteRecord,
  findings: Finding[],
  availabilitySparkline: SparklinePoint[] = [],
): ExplorerService {
  const workloads = route.relatedWorkloads;
  const allContainersRunning =
    workloads.length > 0 &&
    workloads.every((workload) => workload.state.toLowerCase() === "running");
  const dnsOkay = route.dnsAnswers.length > 0;
  const targetOkay = route.matchState === "matched" || route.matchState === "direct";
  const tlsOkay =
    route.tlsDaysRemaining !== null && typeof route.tlsDaysRemaining === "number"
      ? route.tlsDaysRemaining >= 0
      : false;
  const targetParts = splitTarget(route.target, route.privatePort);
  // true when matchState is "direct" AND the forward host is not this machine
  const isRemoteDirectTarget =
    route.matchState === "direct" &&
    !!targetParts.host &&
    targetParts.host !== "localhost" &&
    targetParts.host !== "127.0.0.1" &&
    targetParts.host !== "0.0.0.0" &&
    targetParts.host !== snapshot.hostAddress;
  const riskChecks: ExplorerRiskCheck[] = [
    {
      label: "Public DNS resolves",
      state: dnsOkay ? "ok" : "warn",
    },
    {
      label:
        route.matchState !== "direct"
          ? "NPM target reachable"
          : isRemoteDirectTarget
            ? "Port open (network service)"
            : "Port open (bare-metal service)",
      state: targetOkay ? "ok" : "warn",
    },
    {
      label:
        route.tlsDaysRemaining === null
          ? "SSL metadata missing"
          : route.tlsDaysRemaining >= 0
            ? `SSL valid${route.tlsDaysRemaining <= 30 ? ` (expires ${formatExpiry(route.tlsDaysRemaining)})` : ""}`
            : `SSL expired (${formatExpiry(route.tlsDaysRemaining)})`,
      state:
        route.tlsDaysRemaining === null
          ? "warn"
          : route.tlsDaysRemaining >= 0
            ? "ok"
            : "danger",
    },
    {
      label: "Container stack up",
      state: allContainersRunning ? "ok" : "warn",
    },
    {
      label: "Backup status unknown",
      state: "warn",
    },
    {
      label: findings.some((f) => f.type === "no_auth_layer")
        ? "No auth layer detected"
        : route.npmAccessListId !== 0
          ? "Auth layer: NPM access list"
          : (route.npmAdvancedConfig ?? "").toLowerCase().includes("auth_request")
            ? "Auth layer: forward-auth (advanced config)"
            : "Auth layer detected",
      state: findings.some((f) => f.type === "no_auth_layer") ? "warn" : "ok",
    },
  ];
  const warningCount = riskChecks.filter((check) => check.state !== "ok").length;
  const status = getServiceStatus({
    dnsOkay,
    targetOkay,
    tlsOkay,
    allContainersRunning,
    workloadCount: workloads.length,
  });
  const storagePaths = getStoragePaths(workloads);
  const certificateLabel = formatCertificateBadge(route);
  const composePath = workloads.find((workload) => workload.composePath)?.composePath;
  const containerCount = workloads.length;

  return {
    id: route.slug,
    kind: "public",
    href: `/routes?service=${route.slug}`,
    label: getPublicLabel(route),
    secondaryLabel: route.primaryDomain ?? route.entrypoint,
    titleLinkLabel: route.primaryDomain ?? route.entrypoint,
    titleLinkHref: route.primaryDomain
      ? `https://${route.primaryDomain}`
      : undefined,
    status,
    badges: [
      { label: "public", tone: "info" },
      {
        label: status,
        tone:
          status === "online"
            ? "success"
            : status === "warning"
              ? "warning"
              : "danger",
      },
      ...(certificateLabel
        ? [
            {
              label: certificateLabel,
              tone:
                route.tlsDaysRemaining !== null && route.tlsDaysRemaining >= 0
                  ? "success"
                  : "danger",
            } satisfies ExplorerBadge,
          ]
        : []),
    ],
    summary: route.matchState === "direct"
      ? `${1 + 5} hops · bare-metal service · ${warningCount} warning${warningCount === 1 ? "" : "s"}`
      : `${1 + 5} hops · ${containerCount} container${containerCount === 1 ? "" : "s"} · ${warningCount} warning${warningCount === 1 ? "" : "s"}`,
    hostLabel: snapshot.hostLabel,
    hostAddress: snapshot.hostAddress,
    introLabel: "Internet",
    chainCards: [
      {
        id: "dns",
        title: "DNS / DDNS",
        lines: [
          `${getDnsProvider(route.primaryDomain)} -> ${route.primaryDomain ?? route.entrypoint}`,
        ],
      },
      {
        id: "npm",
        title: "Nginx Proxy Manager",
        lines: [
          `Proxy Host: ${route.primaryDomain ?? route.entrypoint}`,
          `Forward Host: ${targetParts.host}`,
          `Forward Port: ${targetParts.port ?? "unknown"}`,
          `SSL: ${formatCertificateLine(route)}`,
        ],
      },
      {
        id: "host",
        title: "Docker Host",
        lines: [
          `${snapshot.hostLabel} / ${snapshot.hostAddress}`,
          route.matchState !== "direct"
            ? (composePath ? `Compose: ${composePath}` : "Compose: path not detected")
            : isRemoteDirectTarget
              ? `Proxies to ${targetParts.host} — service runs on a separate host`
              : "Not Dockerised — runs directly on the host OS",
        ],
      },
      ...(route.matchState === "direct"
        ? [
            {
              id: "bare-metal",
              title: isRemoteDirectTarget ? "Network Service" : "Bare-Metal Service",
              lines: isRemoteDirectTarget
                ? [
                    `Port ${targetParts.port ?? route.privatePort} is open on ${targetParts.host}`,
                    "Service is on a separate network host (not this Docker machine)",
                    "Container columns are not applicable for this service",
                  ]
                : [
                    `Port ${targetParts.port ?? route.privatePort} is open on the host`,
                    "No Docker workload matched — systemd, snap, or native OS process",
                    "Container columns are not applicable for this service",
                  ],
              mono: true,
            } satisfies ExplorerChainCard,
          ]
        : [
            {
              id: "containers",
              title: "Containers",
              lines: getContainerLines(workloads),
              mono: true,
            } satisfies ExplorerChainCard,
            {
              id: "storage",
              title: "Storage",
              lines:
                storagePaths.length > 0
                  ? storagePaths
                  : ["No persistent bind mounts detected on the matched stack."],
              mono: true,
            } satisfies ExplorerChainCard,
          ]),
    ],
    riskChecks,
    impactHeading: `If ${snapshot.hostLabel} / ${snapshot.hostAddress} goes down:`,
    impactItems: [],
    notes: compactNotes([
      route.notes,
      route.dnsAnswers.length > 0
        ? `Observed DNS answers: ${route.dnsAnswers.join(", ")}`
        : "Observed DNS answers: none",
      findings.length > 0
        ? `${findings.length} current finding${findings.length === 1 ? "" : "s"} on this exposure path.`
        : "No active findings are attached to this route.",
    ]),
    findings,
    warningCount,
    containerCount,
    availabilitySparkline,
  };
}

function buildInternalServices(snapshot: OpsLedgerSnapshot) {
  const publicKeys = new Set<string>();

  for (const route of snapshot.routes) {
    if (route.composeProject) {
      publicKeys.add(`compose:${route.composeProject}`);
    }

    if (route.containerName) {
      publicKeys.add(`container:${route.containerName}`);
    }

    for (const workload of route.relatedWorkloads) {
      publicKeys.add(getWorkloadGroupKey(workload));
    }
  }

  const groups = new Map<string, WorkloadRecord[]>();

  for (const workload of snapshot.workloads) {
    const groupKey = getWorkloadGroupKey(workload);
    const bucket = groups.get(groupKey) ?? [];
    bucket.push(workload);
    groups.set(groupKey, bucket);
  }

  return [...groups.entries()]
    .filter(([groupKey, workloads]) => {
      const hasPublishedPort = workloads.some(
        (workload) => workload.publishedPorts.length > 0,
      );
      return hasPublishedPort && !publicKeys.has(groupKey);
    })
    .map(([, workloads]) => buildInternalService(snapshot, workloads));
}

function buildInternalService(
  snapshot: OpsLedgerSnapshot,
  workloads: WorkloadRecord[],
): ExplorerService {
  const label = getInternalLabel(workloads);
  const endpoint = getInternalEndpoint(workloads, snapshot.hostAddress);
  const allContainersRunning =
    workloads.length > 0 &&
    workloads.every((workload) => workload.state.toLowerCase() === "running");
  const riskChecks: ExplorerRiskCheck[] = [
    {
      label: "Container stack up",
      state: allContainersRunning ? "ok" : "warn",
    },
    {
      label: "Backup status unknown",
      state: "warn",
    },
  ];
  const warningCount = riskChecks.filter((check) => check.state !== "ok").length;
  const status =
    allContainersRunning && workloads.length > 0
      ? "online"
      : "warning";
  const storagePaths = getStoragePaths(workloads);
  const composePath = workloads.find((workload) => workload.composePath)?.composePath;

  return {
    id: `internal-${slugify(label)}`,
    kind: "internal",
    href: `/routes?service=internal-${slugify(label)}`,
    label,
    secondaryLabel: endpoint,
    titleLinkLabel: endpoint,
    titleLinkHref: endpoint.startsWith("http") ? endpoint : `http://${endpoint}`,
    status,
    badges: [
      { label: "internal", tone: "muted" },
      {
        label: status,
        tone:
          status === "online"
            ? "success"
            : status === "warning"
              ? "warning"
              : "danger",
      },
    ],
    summary: `${3} hops · ${workloads.length} container${workloads.length === 1 ? "" : "s"} · ${warningCount} warning${warningCount === 1 ? "" : "s"}`,
    hostLabel: snapshot.hostLabel,
    hostAddress: snapshot.hostAddress,
    introLabel: null,
    chainCards: [
      {
        id: "host",
        title: "Docker Host",
        lines: [
          `${snapshot.hostLabel} / ${snapshot.hostAddress}`,
          composePath ? `Compose: ${composePath}` : "Compose: path not detected",
        ],
      },
      {
        id: "containers",
        title: "Containers",
        lines: getContainerLines(workloads),
        mono: true,
      },
      {
        id: "storage",
        title: "Storage",
        lines:
          storagePaths.length > 0
            ? storagePaths
            : ["No persistent bind mounts detected on this stack."],
        mono: true,
      },
    ],
    riskChecks,
    impactHeading: `If ${snapshot.hostLabel} / ${snapshot.hostAddress} goes down:`,
    impactItems: [],
    notes: compactNotes([
      `No public DNS or reverse-proxy hop is associated with ${label} in the current snapshot.`,
      `Ops Ledger is showing this service because it publishes ${endpoint}.`,
      composePath ? `Primary compose path: ${composePath}` : null,
    ]),
    findings: [],
    warningCount,
    containerCount: workloads.length,
    availabilitySparkline: [],
  };
}

function resolveActiveService(
  services: ExplorerService[],
  selectedId: string | null,
) {
  if (selectedId) {
    const selected = services.find((service) => service.id === selectedId);

    if (selected) {
      return selected;
    }
  }

  const preferred = services.find((service) =>
    PREFERRED_LABELS.some((label) =>
      service.label.toLowerCase().includes(label.toLowerCase()),
    ),
  );

  return preferred ?? services[0] ?? null;
}

function sortServices(left: ExplorerService, right: ExplorerService) {
  const leftRank = getPreferredRank(left.label);
  const rightRank = getPreferredRank(right.label);

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  if (left.kind !== right.kind) {
    return left.kind === "public" ? -1 : 1;
  }

  return left.label.localeCompare(right.label);
}

function getPreferredRank(label: string) {
  const lower = label.toLowerCase();
  const index = PREFERRED_LABELS.findIndex((item) => lower.includes(item));

  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

// Domain prefixes that don't describe the service — fall back to workload name instead.
const GENERIC_DOMAIN_PREFIXES = new Set([
  "app", "apps", "host", "hosts", "home", "server", "nas", "lan",
  "local", "internal", "private", "web", "www", "api", "cloud",
  "my", "self", "main", "admin",
]);

function getPublicLabel(route: RouteRecord) {
  const haystack = [
    route.entrypoint,
    route.primaryDomain ?? "",
    route.workloadLabel,
    route.serviceName ?? "",
    route.containerName ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if (haystack.includes("vaultwarden")) {
    return "Vaultwarden";
  }

  if (haystack.includes("homeassistant") || haystack.startsWith("home.")) {
    return "Home Assistant";
  }

  if (haystack.includes("paperless")) {
    return "Paperless-ngx";
  }

  const domainPrefix = route.entrypoint.split(".")[0] ?? route.entrypoint;

  // If the domain prefix is generic, use the workload/service name instead
  if (GENERIC_DOMAIN_PREFIXES.has(domainPrefix.toLowerCase())) {
    const workloadToken = route.serviceName ?? route.containerName ?? route.workloadLabel;
    if (workloadToken && workloadToken !== "No confident workload") {
      return humanizeToken(workloadToken);
    }
  }

  return humanizeToken(domainPrefix);
}

function getInternalLabel(workloads: WorkloadRecord[]) {
  const preferred = workloads.find(
    (workload) =>
      workload.composeProject &&
      !GENERIC_SERVICE_NAMES.has(workload.composeProject.toLowerCase()),
  );

  if (preferred?.composeProject) {
    return humanizeToken(preferred.composeProject);
  }

  const named = workloads.find(
    (workload) =>
      workload.serviceName &&
      !GENERIC_SERVICE_NAMES.has(workload.serviceName.toLowerCase()),
  );

  if (named?.serviceName) {
    return humanizeToken(named.serviceName);
  }

  return humanizeToken(workloads[0]?.name ?? "Internal service");
}

function humanizeToken(value: string) {
  const direct = SPECIAL_LABELS.get(value.toLowerCase());

  if (direct) {
    return direct;
  }

  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((token) => {
      const mapped = SPECIAL_LABELS.get(token.toLowerCase());

      if (mapped) {
        return mapped;
      }

      if (/^[a-z]{2,4}$/i.test(token)) {
        return token.length <= 3 ? token.toUpperCase() : capitalize(token);
      }

      return capitalize(token);
    })
    .join(" ");
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getWorkloadGroupKey(workload: Pick<RelatedWorkload, "composeProject" | "name">) {
  return workload.composeProject
    ? `compose:${workload.composeProject}`
    : `container:${workload.name}`;
}

function getInternalEndpoint(workloads: WorkloadRecord[], hostAddress: string) {
  for (const workload of workloads) {
    const published = workload.publishedPorts[0];

    if (published) {
      const [publicPort] = published.split(":");
      return `${hostAddress}:${publicPort}`;
    }
  }

  return `${hostAddress}:unknown`;
}

function getDnsProvider(domain: string | null) {
  if (!domain) {
    return "public DNS";
  }

  const labels = domain.split(".").filter(Boolean);

  if (labels.length >= 2) {
    return labels.slice(-2).join(".");
  }

  return domain;
}

function splitTarget(target: string, privatePort: number | null) {
  if (typeof privatePort === "number" && target.endsWith(`:${privatePort}`)) {
    return {
      host: target.slice(0, -1 * (`:${privatePort}`).length),
      port: String(privatePort),
    };
  }

  const separator = target.lastIndexOf(":");

  if (separator === -1) {
    return { host: target, port: null };
  }

  return {
    host: target.slice(0, separator),
    port: target.slice(separator + 1),
  };
}

function formatCertificateBadge(route: RouteRecord) {
  if (!route.certificateLabel && !route.certificateProvider) {
    return null;
  }

  if (route.certificateProvider) {
    return humanizeProvider(route.certificateProvider);
  }

  return route.certificateLabel;
}

function formatCertificateLine(route: RouteRecord) {
  const provider = formatCertificateBadge(route) ?? "No certificate metadata";

  if (route.tlsDaysRemaining === null) {
    return provider;
  }

  if (route.tlsDaysRemaining >= 0) {
    return `${provider} (${formatExpiry(route.tlsDaysRemaining)})`;
  }

  return `${provider} (${formatExpiry(route.tlsDaysRemaining)})`;
}

function humanizeProvider(value: string) {
  const normalized = value.replace(/[_-]+/g, " ").toLowerCase();

  if (normalized.includes("letsencrypt")) {
    return "Let's Encrypt";
  }

  return normalized
    .split(" ")
    .filter(Boolean)
    .map((token) => capitalize(token))
    .join(" ");
}

function formatExpiry(daysRemaining: number) {
  if (daysRemaining < 0) {
    const abs = Math.abs(daysRemaining);
    return `expired ${abs} day${abs === 1 ? "" : "s"} ago`;
  }

  return `expires in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`;
}

function getStoragePaths(workloads: Array<Pick<RelatedWorkload, "mounts">>) {
  return [...new Set(workloads.flatMap((workload) => workload.mounts))]
    .filter(Boolean)
    .filter((mount) => isUsefulStoragePath(mount))
    .sort();
}

function isUsefulStoragePath(value: string) {
  const ignored = [
    "/var/run/docker.sock",
    "/etc/localtime",
    "/etc/timezone",
    "/docker/docker/volumes",
    "/docker/docker/overlay2",
    "/tmp",
    "/proc",
    "/sys",
    "/dev",
    "/run",
  ];

  if (ignored.some((prefix) => value === prefix || value.startsWith(`${prefix}/`))) {
    return false;
  }

  return (
    value.startsWith("/docker/") ||
    value.startsWith("/data/") ||
    value.startsWith("/mnt/") ||
    value.startsWith("/srv/") ||
    value.startsWith("/volume") ||
    value.startsWith("/Volumes/")
  );
}

function getContainerLines(workloads: Array<Pick<RelatedWorkload, "name" | "state">>) {
  if (workloads.length === 0) {
    return ["No matched containers in the current snapshot."];
  }

  return workloads.map((workload) => {
    const running = workload.state.toLowerCase() === "running";
    return `${running ? "●" : "○"} ${workload.name.padEnd(28, " ")} ${running ? "running" : workload.state}`;
  });
}

function compactNotes(values: Array<string | null | undefined>) {
  return values.filter(Boolean) as string[];
}

function describeImpact(service: ExplorerService) {
  if (service.kind === "public") {
    return `${service.secondaryLabel} becomes unreachable`;
  }

  return `${service.label} (${service.secondaryLabel}) becomes unavailable`;
}

function getServiceStatus(input: {
  dnsOkay: boolean;
  targetOkay: boolean;
  tlsOkay: boolean;
  allContainersRunning: boolean;
  workloadCount: number;
}) {
  if (
    input.dnsOkay &&
    input.targetOkay &&
    input.tlsOkay &&
    (input.workloadCount === 0 || input.allContainersRunning)
  ) {
    return "online";
  }

  // "offline" would require a positive health-check failure, which the scanner
  // doesn't perform. Bare-metal / OS-level services (Cockpit, Home Assistant on
  // host, etc.) have no Docker workload but are perfectly reachable. The worst
  // we can honestly say without a probe is "warning".
  return "warning";
}

function formatLastSyncLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
