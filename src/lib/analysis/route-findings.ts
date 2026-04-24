import type { ExposureIntent, Finding, FindingSeverity, RouteRecord } from "@/lib/routeviz-types";

export function suppressionKey(type: string, name: string): string {
  return `${type}:${name}`;
}

export const MANAGEMENT_SURFACE_IMAGES = new Set([
  "portainer", "portainer-ce", "portainer-be",
  "cockpit", "webmin",
  "nginx-proxy-manager", "proxy-manager", "traefik", "caddy", "haproxy-dataplaneapi",
  "authelia", "authentik", "keycloak", "dex",
  "filebrowser",
  "paperless-ngx", "paperless",
  "open-webui", "ollama-webui", "n8n", "nocodb", "appsmith", "tooljet", "budibase-apps",
  "phpmyadmin", "pgadmin4", "adminer", "mongo-express", "redis-commander", "redisinsight",
  "jenkins", "drone", "woodpecker-server",
  "grafana", "prometheus", "alertmanager", "netdata", "uptime-kuma",
]);

export const AUTH_TOKENS = ["authelia", "authentik", "oauth2-proxy", "forward-auth", "keycloak"];

export const SELF_AUTH_IMAGES = new Set([
  "jellyfin", "emby", "plex", "navidrome", "audiobookshelf", "kavita", "komga", "calibre-web", "stash",
  "immich-server", "photoprism", "lychee", "pigallery2",
  "paperless-ngx", "paperless", "joplin", "outline", "bookstack",
  "nextcloud", "seafile", "filebrowser", "owncloud",
  "gitea", "forgejo", "gogs", "gitlab-ce", "gitlab-ee",
  "drone", "woodpecker-server", "jenkins", "harbor-core", "registry",
  "dsm", "synology-dsm",
  "grafana", "uptime-kuma", "netdata", "prometheus",
  "portainer", "portainer-ce", "portainer-be", "cockpit",
  "vaultwarden", "bitwarden", "bitwarden_rs",
  "home-assistant", "homeassistant",
  "open-webui", "ollama-webui", "n8n", "nocodb", "appsmith", "tooljet", "budibase-apps",
  "freshrss", "miniflux", "wallabag", "linkding", "shiori",
  "reactive-resume", "hoppscotch-app",
  "mealie", "tandoor",
  "ntfy",
]);

export function stripImageToBaseName(image: string): string {
  const withoutTag = image.split(":")[0];
  const parts = withoutTag.split("/");
  return parts[parts.length - 1].toLowerCase();
}

export function isManagementSurface(route: RouteRecord): boolean {
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

export function matchesSelfAuthSeedList(route: RouteRecord): boolean {
  const workloadCandidates = route.relatedWorkloads
    .flatMap((w) => [stripImageToBaseName(w.image), w.name.toLowerCase(), w.serviceName?.toLowerCase() ?? ""]);
  if (workloadCandidates.some((c) => SELF_AUTH_IMAGES.has(c))) return true;
  const routeHaystack = [
    route.entrypoint, route.primaryDomain ?? "", route.workloadLabel,
    route.containerName ?? "", route.serviceName ?? "",
  ].join(" ").toLowerCase();
  return [...SELF_AUTH_IMAGES].some((token) => routeHaystack.includes(token));
}

export function matchesUserOverrides(route: RouteRecord, overrides: string[]): boolean {
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

export function hasAuthLayer(route: RouteRecord): boolean {
  if (route.npmAccessListId != null && route.npmAccessListId !== 0) return true;
  const advancedConfig = (route.npmAdvancedConfig ?? "").toLowerCase();
  if (advancedConfig.includes("auth_request") || advancedConfig.includes("authelia") || advancedConfig.includes("authentik")) return true;
  const haystack = route.relatedWorkloads.flatMap((w) => [w.name, w.image]).join(" ").toLowerCase();
  if (AUTH_TOKENS.some((token) => haystack.includes(token))) return true;
  return route.selfAuthDetected;
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
): void {
  if (suppressed?.has(suppressionKey(type, route.slug))) return;
  findings.push({ id: `${route.slug}-${type}`, routeSlug: route.slug, type, severity, title, evidence, nextCheck });
}

function isTemporaryIntentExpired(intent: ExposureIntent): boolean {
  if (intent.mode !== "temporary_public" || !intent.expiresAt) return false;
  const expiresAt = new Date(intent.expiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

function pushIntentFindings(
  findings: Finding[],
  route: RouteRecord,
  intent: ExposureIntent | undefined,
  suppressed: Set<string>,
  driftIntervalDays = 7,
): void {
  if (!intent) return;

  const intentAgeMs = Date.now() - new Date(intent.updatedAt).getTime();
  const driftIntervalMs = driftIntervalDays * 24 * 60 * 60 * 1000;
  const driftDue = intentAgeMs >= driftIntervalMs;

  const drift: Array<{ severity: FindingSeverity; title: string; evidence: string; nextCheck: string }> = [];

  if (intent.expectedTarget && intent.expectedTarget !== route.target) {
    drift.push({
      severity: "medium",
      title: `${route.entrypoint} target changed after approval`,
      evidence: `Expected ${intent.expectedTarget}, now forwards to ${route.target}.`,
      nextCheck: "Review the exposure baseline or restore the previous target.",
    });
  }

  if (driftDue && intent.mode === "private_only") {
    drift.push({
      severity: "high",
      title: `${route.entrypoint} is public but marked private-only`,
      evidence: "This route is still exposed through Nginx Proxy Manager after being marked private-only.",
      nextCheck: "Remove the public route or update the exposure intent.",
    });
  }

  if (driftDue && intent.mode === "auth_required" && !hasAuthLayer(route)) {
    drift.push({
      severity: "high",
      title: `${route.entrypoint} is missing required auth`,
      evidence: "This route was marked as requiring an auth layer, but no NPM access list, forward-auth, or self-auth signal is currently detected.",
      nextCheck: "Restore the auth layer or update the exposure intent.",
    });
  }

  if (isTemporaryIntentExpired(intent)) {
    drift.push({
      severity: "medium",
      title: `${route.entrypoint} temporary exposure expired`,
      evidence: `Temporary public approval expired on ${new Date(intent.expiresAt as string).toLocaleDateString("en-US")}.`,
      nextCheck: "Review whether this route should remain public.",
    });
  }

  if (drift.length === 0) return;

  const severity: FindingSeverity = drift.some((item) => item.severity === "high") ? "high" : "medium";
  const primary = drift.find((item) => item.severity === severity) ?? drift[0];
  const extraCount = drift.length - 1;
  pushFinding(
    findings,
    route,
    "intent_drift",
    severity,
    primary.title,
    extraCount > 0 ? `${primary.evidence} +${extraCount} more baseline drift check${extraCount === 1 ? "" : "s"}.` : primary.evidence,
    primary.nextCheck,
    suppressed,
  );
}

function intentHandlesAuthFinding(intent: ExposureIntent | undefined, isMgmt: boolean): boolean {
  if (!intent) return false;
  if (intent.mode === "public_ok") return !isMgmt;
  return intent.mode === "auth_required" || intent.mode === "private_only" || intent.mode === "temporary_public";
}

function intentHandlesExposureFinding(intent: ExposureIntent | undefined, type: string): boolean {
  if (!intent) return false;
  if (type === "docker_socket_write_mount") {
    return intent.mode === "auth_required" || intent.mode === "private_only";
  }
  return false;
}

export function createFindings(
  routes: RouteRecord[],
  suppressed: Set<string>,
  exposureIntents: Map<string, ExposureIntent> = new Map(),
  driftIntervalDays = 7,
): Finding[] {
  const findings: Finding[] = [];

  for (const route of routes) {
    const intent = exposureIntents.get(route.slug);
    pushIntentFindings(findings, route, intent, suppressed, driftIntervalDays);

    if (route.matchState === "ambiguous") {
      pushFinding(findings, route, "ambiguous_target", "high", `${route.entrypoint} has multiple plausible workloads`, route.notes, "Tighten the NPM target or Docker network aliases so the route resolves to a single workload.", suppressed);
    }
    if (route.matchState === "unmatched") {
      pushFinding(findings, route, "unmatched_target", "high", `${route.entrypoint} does not map to a live local workload`, route.notes, "Confirm the target port is still published or update the proxy host to the current service endpoint.", suppressed);
    }
    if (route.matchState === "off_host") {
      pushFinding(findings, route, "off_host_target", "medium", `${route.entrypoint} forwards outside the scanned Docker host`, route.notes, "Keep it if the off-host dependency is intentional, otherwise bring the route back onto this host or document the dependency.", suppressed);
    }
    if (route.confidence === "medium") {
      pushFinding(findings, route, "host_mode_inference", "medium", `${route.entrypoint} relies on host-network inference`, route.notes, "Prefer explicit container alias or published-port targeting if you want this route to stay easy to verify.", suppressed);
    }
    if (route.duplicateDomainCount > 1) {
      pushFinding(findings, route, "duplicate_proxy_host", "high", `${route.entrypoint} exists in ${route.duplicateDomainCount} enabled proxy host records`, `Multiple active NPM rows resolve to ${route.target}. Routeviz kept the most recently modified record for the main route view.`, "Archive or delete the extra proxy host records before one of them drifts silently.", suppressed);
    }
    if (route.sharedTargetCount > 1) {
      pushFinding(findings, route, "shared_forward_target", route.sharedTargetCount >= 3 ? "medium" : "low", `${route.sharedTargetCount} routes share ${route.target}`, `This entrypoint shares the same forward target as ${route.sharedTargetCount - 1} other route${route.sharedTargetCount === 2 ? "" : "s"}.`, "Confirm every extra hostname is intentional. This is often where stale domains hide.", suppressed);
    }
    if (route.tlsDaysRemaining !== null && route.tlsDaysRemaining < 0) {
      pushFinding(findings, route, "certificate_expired", "high", `${route.entrypoint} has an expired certificate`, `${route.certificateLabel ?? "Certificate"} expired ${Math.abs(route.tlsDaysRemaining)} day${Math.abs(route.tlsDaysRemaining) === 1 ? "" : "s"} ago.`, "Renew or replace the certificate immediately.", suppressed);
    } else if (route.tlsDaysRemaining !== null && route.tlsDaysRemaining <= 30) {
      pushFinding(findings, route, "certificate_expiring", "medium", `${route.entrypoint} enters the renewal window soon`, `${route.certificateLabel ?? "Certificate"} expires in ${route.tlsDaysRemaining} day${route.tlsDaysRemaining === 1 ? "" : "s"}.`, "Verify the renewal flow before the expiry window closes.", suppressed);
    }
    if (route.dnsStatus === "unresolved") {
      pushFinding(findings, route, "dns_unresolved", "medium", `${route.entrypoint} does not resolve in DNS`, "The current DNS lookup returned no public answers for this hostname.", "Confirm the DNS record still exists and your DDNS provider is current.", suppressed);
    }
    if (route.dnsStatus === "mismatch") {
      pushFinding(findings, route, "dns_mismatch", "medium", `${route.entrypoint} does not match the configured DNS baseline`, `Observed answers: ${route.dnsAnswers.join(", ")}.`, "Check the baseline setting or the current public endpoint before trusting this route.", suppressed);
    }
    if (
      !intentHandlesExposureFinding(intent, "docker_socket_write_mount") &&
      route.relatedWorkloads.some((w) => w.dockerSocketMount === "read_write")
    ) {
      pushFinding(findings, route, "docker_socket_write_mount", "high", `${route.entrypoint} lands on a workload with read-write Docker socket access`, `${route.workloadLabel} has /var/run/docker.sock mounted read-write.`, "Treat this route as a high-sensitivity management surface and keep it behind stronger auth.", suppressed);
    }
    if (!hasAuthLayer(route)) {
      const mgmt = isManagementSurface(route);
      if (!intentHandlesAuthFinding(intent, mgmt)) {
        pushFinding(findings, route, mgmt ? "management_surface" : "no_auth_layer", mgmt ? "high" : "medium",
          mgmt ? `${route.entrypoint} is a public management surface with no auth` : `${route.entrypoint} has no auth layer detected`,
          mgmt ? `${route.workloadLabel} looks like an operational console with no NPM access list or forward-auth found.` : "No NPM access list configured and no Authelia/Authentik/oauth2-proxy found in the compose stack.",
          "Add Authelia, Authentik, or an NPM access list, or confirm public access is intentional.",
          suppressed,
        );
      }
    }
  }

  return findings;
}
