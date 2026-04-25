import http from "node:http";
import https from "node:https";

import type { EdgeRouteInput } from "@/lib/routeviz-types";

// ── Traefik API types ─────────────────────────────────────────────────────────

export type TraefikRouter = {
  name: string;
  rule: string;
  service: string;
  entryPoints?: string[];
  tls?: {
    certResolver?: string | null;
    domains?: Array<{ main?: string; sans?: string[] }>;
  } | null;
  status?: string;
  provider?: string;
  priority?: number;
};

export type TraefikService = {
  name: string;
  status?: string;
  type?: string;
  loadBalancer?: {
    servers?: Array<{ url?: string }>;
  };
  serverStatus?: Record<string, string>;
};

// ── HTTP fetch helper ─────────────────────────────────────────────────────────

function fetchJson<T>(apiUrl: string, path: string, token?: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const base = apiUrl.replace(/\/$/, "");
    const url = new URL(`${base}${path}`);
    const mod = url.protocol === "https:" ? https : http;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const req = mod.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        method: "GET",
        headers,
        rejectUnauthorized: false,
      },
      (res) => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          res.resume();
          reject(new Error(`Traefik API returned ${res.statusCode} — check your token.`));
          return;
        }
        if (res.statusCode && res.statusCode >= 400) {
          res.resume();
          reject(new Error(`Traefik API returned ${res.statusCode}.`));
          return;
        }
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data) as T);
          } catch {
            reject(new Error("Traefik API returned non-JSON."));
          }
        });
      },
    );
    req.setTimeout(10_000, () => { req.destroy(); reject(new Error("Traefik API request timed out.")); });
    req.on("error", reject);
    req.end();
  });
}

// ── Rule parsing ──────────────────────────────────────────────────────────────

export function parseHostsFromRule(rule: string): string[] {
  const hosts: string[] = [];
  // Match Host(`a.com`) or Host(`a.com`, `b.com`)
  const hostMatches = rule.matchAll(/Host\s*\(\s*`([^`]+)`(?:\s*,\s*`([^`]+)`)*\s*\)/gi);
  for (const match of hostMatches) {
    // Extract all backtick-quoted values from the full match
    const all = match[0].matchAll(/`([^`]+)`/g);
    for (const m of all) hosts.push(m[1]);
  }
  return [...new Set(hosts)];
}

export function parseAuthSignalsFromRule(rule: string): string[] {
  const signals: string[] = [];
  if (/HeadersRegexp\s*\(\s*`Authorization`/i.test(rule)) signals.push("traefik_header_auth");
  if (/forwardauth/i.test(rule)) signals.push("traefik_forward_auth");
  return signals;
}

// ── Service URL parsing ───────────────────────────────────────────────────────

export function parseTargetFromService(svc: TraefikService | undefined): { host: string; port: number; scheme: "http" | "https" | "tcp" } | null {
  const server = svc?.loadBalancer?.servers?.[0];
  if (!server?.url) return null;
  try {
    const u = new URL(server.url);
    const scheme = u.protocol === "https:" ? "https" : "http";
    const port = u.port ? parseInt(u.port, 10) : (scheme === "https" ? 443 : 80);
    return { host: u.hostname, port, scheme };
  } catch {
    return null;
  }
}

// ── Core mapping logic (also used by tests) ───────────────────────────────────

export function mapRoutersToEdgeInputs(
  routers: TraefikRouter[],
  services: TraefikService[],
  connectorId = "traefik",
): EdgeRouteInput[] {
  const serviceMap = new Map(services.map((s) => [s.name, s]));

  const activeRouters = routers.filter(
    (r) => r.status === "enabled" && r.service !== "api@internal" && r.service !== "dashboard@internal",
  );

  const results: EdgeRouteInput[] = [];

  for (const router of activeRouters) {
    const hosts = parseHostsFromRule(router.rule);
    if (hosts.length === 0) continue;

    const svc = serviceMap.get(router.service) ?? serviceMap.get(`${router.service}@${router.provider ?? "docker"}`);
    const target = parseTargetFromService(svc);
    const hasTls = !!router.tls;
    const authSignals = parseAuthSignalsFromRule(router.rule);

    results.push({
      sourceType: "traefik",
      sourceName: "Traefik",
      sourceId: router.name,
      connectorId,
      domains: hosts,
      targetHost: target?.host ?? "",
      targetPort: target?.port ?? 80,
      targetScheme: target?.scheme ?? "http",
      tls: hasTls ? { enabled: true, certName: null, expiresAt: null, provider: router.tls?.certResolver ?? null } : undefined,
      authSignals,
      rawHints: [router.rule],
      duplicateDomainCount: 1,
    });
  }

  return results;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function fetchTraefikRoutes(apiUrl: string, token?: string, connectorId = "traefik"): Promise<EdgeRouteInput[]> {
  const [routers, services] = await Promise.all([
    fetchJson<TraefikRouter[]>(apiUrl, "/api/http/routers", token),
    fetchJson<TraefikService[]>(apiUrl, "/api/http/services", token),
  ]);
  return mapRoutersToEdgeInputs(routers, services, connectorId);
}
