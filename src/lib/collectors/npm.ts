import { execFile } from "node:child_process";
import http from "node:http";
import https from "node:https";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type NpmRow = {
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

export type CanonicalRoute = {
  row: NpmRow;
  domains: string[];
  duplicateDomainCount: number;
};

type NpmApiProxyHost = {
  id: number;
  domain_names: string[];
  forward_scheme: string;
  forward_host: string;
  forward_port: number;
  certificate_id: number | "new" | null;
  ssl_forced: boolean | number;
  caching_enabled: boolean | number;
  allow_websocket_upgrade: boolean | number;
  block_exploits: boolean | number;
  access_list_id: number;
  advanced_config: string | null;
  enabled: boolean | number;
  created_on: string;
  modified_on: string;
  certificate?: {
    provider: string | null;
    nice_name: string | null;
    expires_on: string | null;
  } | null;
};

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

async function readSqliteJson<T>(databasePath: string, query: string): Promise<T> {
  const { stdout } = await execFileAsync("sqlite3", ["-json", databasePath, query]);
  return JSON.parse(stdout || "[]") as T;
}

export async function readNpmSqlite(databasePath: string): Promise<NpmRow[]> {
  return readSqliteJson<NpmRow[]>(databasePath, SQLITE_QUERY);
}

export async function fetchNpmApiRoutes(apiUrl: string, token: string): Promise<NpmRow[]> {
  const base = apiUrl.replace(/\/$/, "");

  const data = await new Promise<NpmApiProxyHost[]>((resolve, reject) => {
    const url = new URL(`${base}/api/nginx/proxy-hosts?expand=certificate`);
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "routeviz-probe/1.0" },
        rejectUnauthorized: false,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        res.on("end", () => {
          if ((res.statusCode ?? 0) >= 400) {
            reject(new Error(`NPM API returned ${res.statusCode ?? "unknown"}`));
            return;
          }
          try {
            resolve(JSON.parse(body) as NpmApiProxyHost[]);
          } catch {
            reject(new Error("NPM API returned non-JSON response"));
          }
        });
      },
    );
    req.setTimeout(10_000, () => { req.destroy(); reject(new Error("NPM API request timed out")); });
    req.on("error", reject);
    req.end();
  });

  return data
    .filter((host) => host.enabled)
    .map((host) => ({
      id: host.id,
      domain_names: JSON.stringify(host.domain_names),
      forward_host: host.forward_host,
      forward_port: host.forward_port,
      certificate_id: typeof host.certificate_id === "number" ? host.certificate_id : 0,
      ssl_forced: host.ssl_forced ? 1 : 0,
      caching_enabled: host.caching_enabled ? 1 : 0,
      allow_websocket_upgrade: host.allow_websocket_upgrade ? 1 : 0,
      block_exploits: host.block_exploits ? 1 : 0,
      access_list_id: host.access_list_id ?? 0,
      advanced_config: host.advanced_config ?? null,
      enabled: 1,
      created_on: host.created_on,
      modified_on: host.modified_on,
      certificate_provider: host.certificate?.provider ?? null,
      certificate_name: host.certificate?.nice_name ?? null,
      certificate_expires_on: host.certificate?.expires_on ?? null,
    })) satisfies NpmRow[];
}

export function parseDomainNames(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as string[];
    return parsed.filter(Boolean);
  } catch {
    return [];
  }
}

export function dedupeRoutes(rows: NpmRow[]): CanonicalRoute[] {
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
      if (!canonical) throw new Error("Encountered an empty proxy host route group.");
      const domains = parseDomainNames(canonical.domain_names);
      return { row: canonical, domains, duplicateDomainCount: rowsForDomain.length } satisfies CanonicalRoute;
    })
    .sort((left, right) => {
      const leftDomain = left.domains[0] ?? "";
      const rightDomain = right.domains[0] ?? "";
      return leftDomain.localeCompare(rightDomain);
    });
}
