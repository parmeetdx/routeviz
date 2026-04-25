import { describe, it, expect } from "vitest";
import { parseHostsFromRule, parseAuthSignalsFromRule, parseTargetFromService, mapRoutersToEdgeInputs } from "./traefik";
import type { TraefikRouter, TraefikService } from "./traefik";

// ── parseHostsFromRule ────────────────────────────────────────────────────────

describe("parseHostsFromRule", () => {
  it("parses a single Host rule", () => {
    expect(parseHostsFromRule("Host(`example.com`)")).toEqual(["example.com"]);
  });

  it("parses multiple hosts in one Host() call", () => {
    expect(parseHostsFromRule("Host(`a.com`, `b.com`)")).toEqual(["a.com", "b.com"]);
  });

  it("parses Host combined with PathPrefix", () => {
    expect(parseHostsFromRule("Host(`api.example.com`) && PathPrefix(`/v1`)")).toEqual(["api.example.com"]);
  });

  it("returns empty array when no Host rule present", () => {
    expect(parseHostsFromRule("PathPrefix(`/api`)")).toEqual([]);
  });

  it("deduplicates repeated hosts", () => {
    expect(parseHostsFromRule("Host(`app.com`) || Host(`app.com`)")).toEqual(["app.com"]);
  });

  it("handles case-insensitive Host keyword", () => {
    expect(parseHostsFromRule("host(`lower.com`)")).toEqual(["lower.com"]);
  });
});

// ── parseAuthSignalsFromRule ──────────────────────────────────────────────────

describe("parseAuthSignalsFromRule", () => {
  it("returns empty array for plain Host rule", () => {
    expect(parseAuthSignalsFromRule("Host(`app.com`)")).toEqual([]);
  });

  it("detects Authorization header regex", () => {
    expect(parseAuthSignalsFromRule("HeadersRegexp(`Authorization`, `Bearer .+`)")).toContain("traefik_header_auth");
  });

  it("detects forwardAuth middleware reference", () => {
    expect(parseAuthSignalsFromRule("Host(`app.com`) && forwardauth")).toContain("traefik_forward_auth");
  });
});

// ── parseTargetFromService ────────────────────────────────────────────────────

describe("parseTargetFromService", () => {
  it("returns null for undefined service", () => {
    expect(parseTargetFromService(undefined)).toBeNull();
  });

  it("returns null when no servers present", () => {
    const svc: TraefikService = { name: "empty", loadBalancer: { servers: [] } };
    expect(parseTargetFromService(svc)).toBeNull();
  });

  it("returns null when server url is missing", () => {
    const svc: TraefikService = { name: "no-url", loadBalancer: { servers: [{}] } };
    expect(parseTargetFromService(svc)).toBeNull();
  });

  it("parses http server url", () => {
    const svc: TraefikService = { name: "svc", loadBalancer: { servers: [{ url: "http://10.0.0.1:3000" }] } };
    expect(parseTargetFromService(svc)).toEqual({ host: "10.0.0.1", port: 3000, scheme: "http" });
  });

  it("parses https server url", () => {
    const svc: TraefikService = { name: "svc", loadBalancer: { servers: [{ url: "https://10.0.0.2:8443" }] } };
    expect(parseTargetFromService(svc)).toEqual({ host: "10.0.0.2", port: 8443, scheme: "https" });
  });

  it("defaults to port 80 for http without explicit port", () => {
    const svc: TraefikService = { name: "svc", loadBalancer: { servers: [{ url: "http://backend.local" }] } };
    const result = parseTargetFromService(svc);
    expect(result?.port).toBe(80);
  });

  it("defaults to port 443 for https without explicit port", () => {
    const svc: TraefikService = { name: "svc", loadBalancer: { servers: [{ url: "https://backend.local" }] } };
    const result = parseTargetFromService(svc);
    expect(result?.port).toBe(443);
  });

  it("uses first server when multiple are present", () => {
    const svc: TraefikService = {
      name: "svc",
      loadBalancer: {
        servers: [{ url: "http://10.0.0.1:3000" }, { url: "http://10.0.0.2:3000" }],
      },
    };
    expect(parseTargetFromService(svc)?.host).toBe("10.0.0.1");
  });
});

// ── fetchTraefikRoutes ────────────────────────────────────────────────────────

const mockRouters: TraefikRouter[] = [
  {
    name: "app-router@docker",
    rule: "Host(`app.example.com`)",
    service: "app-service@docker",
    entryPoints: ["websecure"],
    tls: { certResolver: "letsencrypt" },
    status: "enabled",
    provider: "docker",
  },
  {
    name: "api-router@docker",
    rule: "Host(`api.example.com`) && PathPrefix(`/v1`)",
    service: "api-service@docker",
    entryPoints: ["websecure"],
    tls: { certResolver: "letsencrypt" },
    status: "enabled",
    provider: "docker",
  },
  {
    name: "disabled-router@docker",
    rule: "Host(`disabled.example.com`)",
    service: "disabled-service@docker",
    status: "disabled",
    provider: "docker",
  },
  {
    name: "dashboard-router@internal",
    rule: "Host(`traefik.local`) && (PathPrefix(`/api`) || PathPrefix(`/dashboard`))",
    service: "api@internal",
    status: "enabled",
    provider: "internal",
  },
];

const mockServices: TraefikService[] = [
  {
    name: "app-service@docker",
    status: "enabled",
    loadBalancer: { servers: [{ url: "http://10.0.0.10:3000" }] },
  },
  {
    name: "api-service@docker",
    status: "enabled",
    loadBalancer: { servers: [{ url: "http://10.0.0.11:8080" }] },
  },
];

describe("fetchTraefikRoutes", () => {
  it("returns EdgeRouteInput for each active non-internal router", async () => {
    const routes = mapRoutersToEdgeInputs(mockRouters, mockServices);
    expect(routes).toHaveLength(2);
  });

  it("skips disabled routers", async () => {
    const routes = mapRoutersToEdgeInputs(mockRouters, mockServices);
    expect(routes.every((r) => !r.domains.includes("disabled.example.com"))).toBe(true);
  });

  it("skips api@internal and dashboard@internal services", async () => {
    const routes = mapRoutersToEdgeInputs(mockRouters, mockServices);
    expect(routes.every((r) => !r.domains.includes("traefik.local"))).toBe(true);
  });

  it("maps domain from Host rule", async () => {
    const routes = mapRoutersToEdgeInputs(mockRouters, mockServices);
    const app = routes.find((r) => r.domains.includes("app.example.com"));
    expect(app).toBeDefined();
  });

  it("maps target host and port from service loadBalancer", async () => {
    const routes = mapRoutersToEdgeInputs(mockRouters, mockServices);
    const app = routes.find((r) => r.domains.includes("app.example.com"))!;
    expect(app.targetHost).toBe("10.0.0.10");
    expect(app.targetPort).toBe(3000);
  });

  it("sets sourceType to traefik", async () => {
    const routes = mapRoutersToEdgeInputs(mockRouters, mockServices);
    expect(routes.every((r) => r.sourceType === "traefik")).toBe(true);
  });

  it("sets tls.enabled when router has tls config", async () => {
    const routes = mapRoutersToEdgeInputs(mockRouters, mockServices);
    const app = routes.find((r) => r.domains.includes("app.example.com"))!;
    expect(app.tls?.enabled).toBe(true);
    expect(app.tls?.provider).toBe("letsencrypt");
  });

  it("sets tls undefined when router has no tls", async () => {
    const noTlsRouters: TraefikRouter[] = [
      { name: "plain@docker", rule: "Host(`plain.example.com`)", service: "app-service@docker", status: "enabled" },
    ];
    const routes = mapRoutersToEdgeInputs(noTlsRouters, mockServices);
    expect(routes[0].tls).toBeUndefined();
  });

  it("stores raw rule in rawHints", () => {
    const routes = mapRoutersToEdgeInputs(mockRouters, mockServices);
    const app = routes.find((r) => r.domains.includes("app.example.com"))!;
    expect(app.rawHints).toContain("Host(`app.example.com`)");
  });

  it("sets empty targetHost when service has no servers", () => {
    const noSvcRouters: TraefikRouter[] = [
      { name: "orphan@docker", rule: "Host(`orphan.example.com`)", service: "missing-service", status: "enabled" },
    ];
    const routes = mapRoutersToEdgeInputs(noSvcRouters, mockServices);
    expect(routes[0].targetHost).toBe("");
  });

  it("skips routers with no parseable Host", () => {
    const noHostRouters: TraefikRouter[] = [
      { name: "path-only@docker", rule: "PathPrefix(`/api`)", service: "app-service@docker", status: "enabled" },
    ];
    const routes = mapRoutersToEdgeInputs(noHostRouters, mockServices);
    expect(routes).toHaveLength(0);
  });
});
