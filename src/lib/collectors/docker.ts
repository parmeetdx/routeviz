import http from "node:http";
import https from "node:https";

export type DockerPort = {
  IP?: string;
  PrivatePort: number;
  PublicPort?: number;
  Type?: string;
};

export type DockerContainerSummary = {
  Id: string;
  Names: string[];
  Image: string;
  ImageID?: string;
  State: string;
  Ports?: DockerPort[];
  Labels?: Record<string, string>;
  Created?: number;
};

export type DockerMount = {
  Source?: string;
  Destination?: string;
  RW?: boolean;
};

export type DockerNetwork = {
  Aliases?: string[] | null;
  IPAddress?: string;
};

export type DockerContainerInspect = {
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

export type ImageUpdateStatus =
  | "outdated"       // running semver < latest semver — confirmed behind
  | "unknown"        // can't compare (latest tag, untagged, non-semver) — nudge to check
  | "up_to_date"     // running semver === latest semver
  | "no_data";       // couldn't fetch latest tag at all

export type DockerWorkload = {
  id: string;
  name: string;
  image: string;
  latestImageTag: string | null;
  imageUpdateStatus: ImageUpdateStatus;
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

export async function dockerRequest<T>(socketPath: string, requestPath: string) {
  return new Promise<T>((resolve, reject) => {
    const request = http.request(
      { socketPath, path: requestPath, method: "GET" },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => { body += chunk; });
        response.on("end", () => {
          if (typeof response.statusCode === "number" && response.statusCode >= 400) {
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
  if (!ports) return [];
  return ports
    .filter((port) => typeof port.PublicPort === "number")
    .map((port) => ({
      publicPort: port.PublicPort as number,
      privatePort: port.PrivatePort,
      hostIp: port.IP ?? null,
    }));
}

function parseExposedPorts(ports: DockerPort[] | undefined, inspect: DockerContainerInspect) {
  const fromSummary = ports?.map((port) => port.PrivatePort) ?? [];
  const fromInspect = Object.keys(inspect.Config?.ExposedPorts ?? {}).map((item) =>
    Number(item.split("/")[0]),
  );
  return [...new Set([...fromSummary, ...fromInspect].filter(Number.isFinite))].sort(
    (left, right) => left - right,
  );
}

function summarizeDockerSocketMount(mounts: DockerMount[] | undefined): "read_only" | "read_write" | "none" {
  const socketMount = mounts?.find((mount) => mount.Destination === "/var/run/docker.sock");
  if (!socketMount) return "none";
  return socketMount.RW ? "read_write" : "read_only";
}

function buildWorkload(summary: DockerContainerSummary, inspect: DockerContainerInspect): DockerWorkload {
  const labels = summary.Labels ?? {};
  const networks = inspect.NetworkSettings?.Networks ?? {};
  const aliases = new Set<string>();
  const internalIps = new Set<string>();

  for (const [networkName, network] of Object.entries(networks)) {
    aliases.add(networkName);
    if (network.IPAddress) internalIps.add(network.IPAddress);
    for (const alias of network.Aliases ?? []) aliases.add(alias);
  }

  const name = summary.Names[0]?.replace(/^\//, "") ?? summary.Id.slice(0, 12);
  aliases.add(name);

  const composeService = labels["com.docker.compose.service"] ?? null;
  const composeProject = labels["com.docker.compose.project"] ?? null;
  const composePath = labels["com.docker.compose.project.config_files"] ?? null;
  if (composeService) aliases.add(composeService);

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
    imageUpdateStatus: "no_data",
  };
}

function parseSemver(tag: string): [number, number, number] | null {
  const clean = tag.replace(/^v/, "").split("-")[0]; // strip v prefix and build suffix
  const parts = clean.split(".").map(Number);
  if (parts.length < 2 || parts.some(isNaN)) return null;
  const [major = 0, minor = 0, patch = 0] = parts;
  return [major, minor, patch];
}

function compareImageUpdateStatus(runningTag: string, latestTag: string): ImageUpdateStatus {
  // Untagged or :latest — can't compare, nudge to check
  if (!runningTag || runningTag === "latest") return "unknown";

  const running = parseSemver(runningTag);
  const latest = parseSemver(latestTag);

  // Either tag isn't parseable as semver — nudge to check
  if (!running || !latest) return "unknown";

  const [rMaj, rMin, rPat] = running;
  const [lMaj, lMin, lPat] = latest;

  if (lMaj > rMaj || (lMaj === rMaj && lMin > rMin) || (lMaj === rMaj && lMin === rMin && lPat > rPat)) {
    return "outdated";
  }
  return "up_to_date";
}

function parseImageRef(image: string): { namespace: string; name: string } | null {
  const withoutTag = image.split(":")[0];
  const parts = withoutTag.split("/");
  if (parts.length >= 2 && (parts[0].includes(".") || parts[0].includes(":"))) return null;
  if (parts.length === 1) return { namespace: "library", name: parts[0] };
  if (parts.length === 2) return { namespace: parts[0], name: parts[1] };
  return { namespace: parts[parts.length - 2], name: parts[parts.length - 1] };
}

// Returns true for tags that look like real release versions:
// 1.2.3, v1.2.3, 1.2, 1.2.3-alpine, 1.2.3-debian — but NOT:
// sha-abc123, renovate-*, windowsservercore-*, latest, edge, stable, nightly
function isVersionTag(tag: string): boolean {
  // Must start with a digit or "v" followed by a digit
  if (!/^v?\d/.test(tag)) return false;
  // Must contain at least one dot (e.g. 1.2 or 1.2.3)
  if (!tag.includes(".")) return false;
  // Reject platform/OS suffix tags
  if (/windows|ltsc|nanoserver|servercore/i.test(tag)) return false;
  // Reject SHA-based tags
  if (/^(sha-|[0-9a-f]{7,40}$)/i.test(tag)) return false;
  return true;
}

async function fetchLatestImageTag(image: string): Promise<string | null> {
  const ref = parseImageRef(image);
  if (!ref) return null;

  return new Promise((resolve) => {
    const path = `/v2/repositories/${ref.namespace}/${ref.name}/tags?page_size=50&ordering=last_updated`;
    const req = https.request(
      { hostname: "hub.docker.com", path, method: "GET", headers: { "User-Agent": "routeviz-probe/1.0" } },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        res.on("end", () => {
          try {
            const data = JSON.parse(body) as { results?: Array<{ name: string }> };
            const candidates = (data.results ?? []).map((t) => t.name).filter(isVersionTag);
            if (candidates.length === 0) { resolve(null); return; }

            candidates.sort((a, b) => {
              const n = (s: string) => s.replace(/^v/, "").split(/[.\-]/).slice(0, 3).map((x) => parseInt(x) || 0);
              const [a1 = 0, a2 = 0, a3 = 0] = n(a);
              const [b1 = 0, b2 = 0, b3 = 0] = n(b);
              return b1 - a1 || b2 - a2 || b3 - a3;
            });

            resolve(candidates[0] ?? null);
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

export async function scanDocker(socketPath: string): Promise<DockerWorkload[]> {
  const summaries = await dockerRequest<DockerContainerSummary[]>(socketPath, "/containers/json?all=0");

  const workloads = await Promise.all(
    summaries.map(async (summary) => {
      const inspect = await dockerRequest<DockerContainerInspect>(socketPath, `/containers/${summary.Id}/json`);
      return buildWorkload(summary, inspect);
    }),
  );

  const uniqueImages = [...new Set(workloads.map((w) => w.image))];
  const tagMap = new Map<string, string | null>();
  await Promise.all(uniqueImages.map(async (img) => { tagMap.set(img, await fetchLatestImageTag(img)); }));

  return workloads
    .map((w) => {
      const latestImageTag = tagMap.get(w.image) ?? null;
      const runningTag = w.image.includes(":") ? w.image.split(":")[1] : "latest";
      const imageUpdateStatus: ImageUpdateStatus = latestImageTag
        ? compareImageUpdateStatus(runningTag ?? "latest", latestImageTag)
        : "no_data";
      return { ...w, latestImageTag, imageUpdateStatus };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}
