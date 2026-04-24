import net from "node:net";
import http from "node:http";
import https from "node:https";

import type { ConfidenceLevel, PersistedSettings, RelatedWorkload, RouteMatchState, RouteRecord, WorkloadRecord } from "@/lib/routeviz-types";
import type { DockerWorkload } from "@/lib/collectors/docker";
import type { CanonicalRoute } from "@/lib/collectors/npm";

export type MatchResult = {
  matchState: RouteMatchState;
  confidence: ConfidenceLevel;
  workload: DockerWorkload | null;
  relatedWorkloads: RelatedWorkload[];
  notes: string;
};

export function getPrimaryDomain(route: CanonicalRoute): string | null {
  return route.domains[0] ?? null;
}

export function buildRelatedWorkloads(workload: DockerWorkload | null, workloads: DockerWorkload[]): RelatedWorkload[] {
  if (!workload) return [];
  const related = workload.composeProject
    ? workloads.filter((candidate) => candidate.composeProject === workload.composeProject)
    : [workload];
  return related.map((item) => ({
    name: item.name,
    image: item.image,
    latestImageTag: item.latestImageTag,
    imageUpdateStatus: item.imageUpdateStatus,
    state: item.state,
    role: item.serviceName ?? "container",
    createdAt: item.createdAt,
    composeProject: item.composeProject,
    serviceName: item.serviceName,
    composePath: item.composePath,
    publishedPorts: item.publishedPorts.map((port) => `${port.publicPort}:${port.privatePort}`),
    exposedPorts: item.exposedPorts,
    networks: item.networks,
    mounts: item.mounts,
    networkMode: item.networkMode,
    dockerSocketMount: item.dockerSocketMount,
  }));
}

export function serializeWorkload(workload: DockerWorkload): WorkloadRecord {
  return {
    id: workload.id,
    name: workload.name,
    image: workload.image,
    latestImageTag: workload.latestImageTag,
    imageUpdateStatus: workload.imageUpdateStatus,
    state: workload.state,
    role: workload.serviceName ?? "container",
    createdAt: workload.createdAt,
    composeProject: workload.composeProject,
    serviceName: workload.serviceName,
    composePath: workload.composePath,
    aliases: workload.aliases,
    internalIps: workload.internalIps,
    publishedPorts: workload.publishedPorts.map((port) => `${port.publicPort}:${port.privatePort}`),
    exposedPorts: workload.exposedPorts,
    networks: workload.networks,
    mounts: workload.mounts,
    networkMode: workload.networkMode,
    dockerSocketMount: workload.dockerSocketMount,
  };
}

export function isHostLikeTarget(target: string, settings: PersistedSettings, hostCandidates: Set<string>): boolean {
  return (
    target === "localhost" ||
    target === "127.0.0.1" ||
    target === "::1" ||
    target === "0.0.0.0" ||
    target === settings.hostLabel ||
    hostCandidates.has(target)
  );
}

export function probeTcpPort(host: string, port: number, timeoutMs = 1500): Promise<boolean> {
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

export function probeHttpAuth(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const probeHost = host === "0.0.0.0" ? "127.0.0.1" : host;
    let settled = false;
    const done = (result: boolean) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const checkResponse = (mod: typeof http | typeof https) => {
      try {
        const req = mod.request(
          { hostname: probeHost, port, path: "/", method: "GET", headers: { "User-Agent": "routeviz-probe/1.0" }, rejectUnauthorized: false },
          (res) => {
            const status = res.statusCode ?? 0;
            if (status === 401) return done(true);
            const loc = (res.headers.location ?? "").toLowerCase();
            if ((status === 301 || status === 302) && (loc.includes("login") || loc.includes("auth") || loc.includes("signin") || loc.includes("sso"))) {
              return done(true);
            }
            let body = "";
            res.on("data", (chunk: Buffer) => { body += chunk.toString(); if (body.length > 8192) res.destroy(); });
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

    try {
      const req = http.request(
        { hostname: probeHost, port, path: "/", method: "GET", headers: { "User-Agent": "routeviz-probe/1.0" } },
        (res) => {
          const status = res.statusCode ?? 0;
          if (status === 401) return done(true);
          const loc = (res.headers.location ?? "").toLowerCase();
          if ((status === 301 || status === 302) && (loc.includes("login") || loc.includes("auth") || loc.includes("signin") || loc.includes("sso"))) {
            return done(true);
          }
          let body = "";
          res.on("data", (chunk: Buffer) => { body += chunk.toString(); if (body.length > 8192) res.destroy(); });
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
      req.on("error", () => checkResponse(https));
      req.end();
    } catch {
      checkResponse(https);
    }
  });
}

export async function matchRouteToWorkload(
  route: CanonicalRoute,
  workloads: DockerWorkload[],
  settings: PersistedSettings,
  hostCandidates: Set<string>,
): Promise<MatchResult> {
  const targetHost = route.row.forward_host;
  const targetPort = Number(route.row.forward_port);
  const hostLike = isHostLikeTarget(targetHost, settings, hostCandidates);

  if (hostLike) {
    const publishedPortMatches = workloads.filter((w) => w.publishedPorts.some((p) => p.publicPort === targetPort));
    if (publishedPortMatches.length === 1) {
      const workload = publishedPortMatches[0];
      return { matchState: "matched", confidence: "high", workload, relatedWorkloads: buildRelatedWorkloads(workload, workloads), notes: `Matched ${targetHost}:${targetPort} to the published host port on ${workload.name}.` };
    }
    if (publishedPortMatches.length > 1) {
      return { matchState: "ambiguous", confidence: "low", workload: null, relatedWorkloads: [], notes: `Multiple workloads publish host port ${targetPort}. Routeviz will not guess between them.` };
    }
    const hostModeMatches = workloads.filter((w) => w.networkMode === "host" && w.exposedPorts.includes(targetPort));
    if (hostModeMatches.length === 1) {
      const workload = hostModeMatches[0];
      return { matchState: "matched", confidence: "medium", workload, relatedWorkloads: buildRelatedWorkloads(workload, workloads), notes: `Matched ${targetHost}:${targetPort} to ${workload.name} through host-network inference.` };
    }
  }

  const aliasMatches = workloads.filter((w) => {
    const aliasHit = w.aliases.some((alias) => alias.toLowerCase() === targetHost.toLowerCase());
    const portHit = w.exposedPorts.includes(targetPort) || w.publishedPorts.some((p) => p.privatePort === targetPort);
    return aliasHit && portHit;
  });
  if (aliasMatches.length === 1) {
    const workload = aliasMatches[0];
    return { matchState: "matched", confidence: "high", workload, relatedWorkloads: buildRelatedWorkloads(workload, workloads), notes: `Matched ${targetHost}:${targetPort} using the container/service alias ${targetHost}.` };
  }
  if (aliasMatches.length > 1) {
    return { matchState: "ambiguous", confidence: "low", workload: null, relatedWorkloads: [], notes: `Multiple workloads advertise the alias ${targetHost} on port ${targetPort}.` };
  }

  const internalIpMatches = workloads.filter((w) => w.internalIps.includes(targetHost) && w.exposedPorts.includes(targetPort));
  if (internalIpMatches.length === 1) {
    const workload = internalIpMatches[0];
    return { matchState: "matched", confidence: "high", workload, relatedWorkloads: buildRelatedWorkloads(workload, workloads), notes: `Matched ${targetHost}:${targetPort} to the workload IP for ${workload.name}.` };
  }
  if (internalIpMatches.length > 1) {
    return { matchState: "ambiguous", confidence: "low", workload: null, relatedWorkloads: [], notes: `Multiple workloads appear to claim ${targetHost}:${targetPort}.` };
  }

  const probeHost = targetHost === "0.0.0.0" ? "127.0.0.1" : targetHost;
  const portOpen = await probeTcpPort(probeHost, targetPort);
  if (portOpen) {
    return { matchState: "direct", confidence: "high", workload: null, relatedWorkloads: [], notes: `No Docker workload claims ${targetHost}:${targetPort}, but the port is open — bare-metal, OS-level, or network service.` };
  }

  if (!hostLike) {
    return { matchState: "off_host", confidence: "unknown", workload: null, relatedWorkloads: [], notes: `Target ${targetHost}:${targetPort} points away from the scanned Docker host.` };
  }

  return { matchState: "unmatched", confidence: "low", workload: null, relatedWorkloads: [], notes: `No running workload on this host claims ${targetHost}:${targetPort}.` };
}

export async function createRouteRecord(
  route: CanonicalRoute,
  match: MatchResult,
  answers: string[],
  dnsStatus: string,
  hostAddress: string,
  authOverrides: string[],
  matchesSeedList: (route: RouteRecord) => boolean,
  matchesOverrides: (route: RouteRecord, overrides: string[]) => boolean,
): Promise<RouteRecord> {
  const primaryDomain = getPrimaryDomain(route);
  const tlsDaysRemaining = route.row.certificate_expires_on
    ? (() => {
        const expiresAt = new Date(route.row.certificate_expires_on).getTime();
        return Number.isNaN(expiresAt) ? null : Math.ceil((expiresAt - Date.now()) / 86_400_000);
      })()
    : null;
  const workloadLabel = match.workload
    ? match.workload.serviceName ?? match.workload.name
    : match.matchState === "off_host"
      ? `${route.row.forward_host}:${route.row.forward_port}`
      : "No confident workload";

  const partialRecord = {
    slug: "",
    entrypoint: primaryDomain ?? `proxy-host-${route.row.id}`,
    primaryDomain,
    workloadLabel,
    containerName: match.workload?.name ?? null,
    serviceName: match.workload?.serviceName ?? null,
    relatedWorkloads: match.relatedWorkloads,
    npmAccessListId: route.row.access_list_id ?? 0,
    npmAdvancedConfig: route.row.advanced_config ?? null,
  } as RouteRecord;

  const seedMatch = matchesSeedList(partialRecord);
  const overrideMatch = matchesOverrides(partialRecord, authOverrides);

  let httpAuthDetected = false;
  if (!seedMatch && !overrideMatch) {
    const targetHost = route.row.forward_host;
    const targetPort = Number(route.row.forward_port);
    const probeHost = targetHost === "0.0.0.0" ? "127.0.0.1" : targetHost;
    httpAuthDetected = await probeHttpAuth(probeHost, targetPort);
  }

  const selfAuthDetected = seedMatch || overrideMatch || httpAuthDetected;
  const { slugify } = await import("@/lib/routeviz.mjs");

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
  };
}

export function applySharedTargetCounts(routes: RouteRecord[]): RouteRecord[] {
  const counts = new Map<string, number>();
  for (const route of routes) counts.set(route.target, (counts.get(route.target) ?? 0) + 1);
  return routes.map((route) => ({ ...route, sharedTargetCount: counts.get(route.target) ?? 1 }));
}
