import { describe, it, expect } from "vitest";
import { parseDomainNames, dedupeRoutes } from "./npm";
import type { NpmRow } from "./npm";

function makeRow(overrides: Partial<NpmRow> = {}): NpmRow {
  return {
    id: 1,
    domain_names: '["example.com"]',
    forward_host: "192.168.1.10",
    forward_port: 8080,
    certificate_id: 0,
    ssl_forced: 0,
    caching_enabled: 0,
    allow_websocket_upgrade: 0,
    block_exploits: 0,
    access_list_id: 0,
    advanced_config: null,
    enabled: 1,
    created_on: "2026-01-01T00:00:00.000Z",
    modified_on: "2026-01-01T00:00:00.000Z",
    certificate_provider: null,
    certificate_name: null,
    certificate_expires_on: null,
    ...overrides,
  };
}

// ── parseDomainNames ──────────────────────────────────────────────────────────

describe("parseDomainNames", () => {
  it("parses a single domain", () => {
    expect(parseDomainNames('["app.example.com"]')).toEqual(["app.example.com"]);
  });

  it("parses multiple domains", () => {
    expect(parseDomainNames('["a.com","b.com","c.com"]')).toEqual(["a.com", "b.com", "c.com"]);
  });

  it("filters empty strings", () => {
    expect(parseDomainNames('["a.com","","b.com"]')).toEqual(["a.com", "b.com"]);
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseDomainNames("not-json")).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseDomainNames("")).toEqual([]);
  });

  it("handles plain comma-separated fallback gracefully", () => {
    expect(parseDomainNames("a.com,b.com")).toEqual([]);
  });
});

// ── dedupeRoutes ──────────────────────────────────────────────────────────────

describe("dedupeRoutes — basic shape", () => {
  it("maps a single row to EdgeRouteInput with correct fields", () => {
    const rows = [makeRow({ id: 5, forward_host: "10.0.0.1", forward_port: 9000 })];
    const [result] = dedupeRoutes(rows);
    expect(result.sourceType).toBe("npm");
    expect(result.sourceName).toBe("Nginx Proxy Manager");
    expect(result.sourceId).toBe("5");
    expect(result.targetHost).toBe("10.0.0.1");
    expect(result.targetPort).toBe(9000);
    expect(result.domains).toEqual(["example.com"]);
    expect(result.duplicateDomainCount).toBe(1);
  });

  it("sorts routes alphabetically by first domain", () => {
    const rows = [
      makeRow({ id: 1, domain_names: '["z.com"]' }),
      makeRow({ id: 2, domain_names: '["a.com"]' }),
      makeRow({ id: 3, domain_names: '["m.com"]' }),
    ];
    const results = dedupeRoutes(rows);
    expect(results.map((r) => r.domains[0])).toEqual(["a.com", "m.com", "z.com"]);
  });

  it("returns empty array for empty input", () => {
    expect(dedupeRoutes([])).toEqual([]);
  });
});

describe("dedupeRoutes — deduplication", () => {
  it("picks most recently modified row for same domain group", () => {
    const rows = [
      makeRow({ id: 1, domain_names: '["app.com"]', modified_on: "2026-01-01T00:00:00.000Z", forward_port: 8001 }),
      makeRow({ id: 2, domain_names: '["app.com"]', modified_on: "2026-03-01T00:00:00.000Z", forward_port: 8002 }),
    ];
    const [result] = dedupeRoutes(rows);
    expect(result.targetPort).toBe(8002);
    expect(result.duplicateDomainCount).toBe(2);
  });

  it("keeps distinct domains as separate routes", () => {
    const rows = [
      makeRow({ id: 1, domain_names: '["a.com"]' }),
      makeRow({ id: 2, domain_names: '["b.com"]' }),
    ];
    expect(dedupeRoutes(rows)).toHaveLength(2);
  });

  it("sets duplicateDomainCount to 1 for unique domain", () => {
    const [result] = dedupeRoutes([makeRow()]);
    expect(result.duplicateDomainCount).toBe(1);
  });
});

describe("dedupeRoutes — TLS fields", () => {
  it("sets tls undefined when certificate_id is 0", () => {
    const [result] = dedupeRoutes([makeRow({ certificate_id: 0 })]);
    expect(result.tls).toBeUndefined();
  });

  it("populates tls when certificate_id is set", () => {
    const [result] = dedupeRoutes([makeRow({
      certificate_id: 7,
      ssl_forced: 1,
      certificate_name: "*.example.com",
      certificate_expires_on: "2026-12-31T00:00:00.000Z",
      certificate_provider: "letsencrypt",
    })]);
    expect(result.tls).toBeDefined();
    expect(result.tls?.enabled).toBe(true);
    expect(result.tls?.certName).toBe("*.example.com");
    expect(result.tls?.expiresAt).toBe("2026-12-31T00:00:00.000Z");
  });

  it("sets tls.enabled false when ssl_forced is 0", () => {
    const [result] = dedupeRoutes([makeRow({ certificate_id: 3, ssl_forced: 0 })]);
    expect(result.tls?.enabled).toBe(false);
  });
});

describe("dedupeRoutes — authSignals", () => {
  it("emits no auth signals when access_list_id is 0 and no advanced config", () => {
    const [result] = dedupeRoutes([makeRow({ access_list_id: 0, advanced_config: null })]);
    expect(result.authSignals).toEqual([]);
  });

  it("emits npm_access_list when access_list_id is non-zero", () => {
    const [result] = dedupeRoutes([makeRow({ access_list_id: 3 })]);
    expect(result.authSignals).toContain("npm_access_list");
  });

  it("emits nginx_auth_request from advanced_config", () => {
    const [result] = dedupeRoutes([makeRow({ advanced_config: "auth_request /validate;" })]);
    expect(result.authSignals).toContain("nginx_auth_request");
  });

  it("emits authelia from advanced_config", () => {
    const [result] = dedupeRoutes([makeRow({ advanced_config: "# authelia forward auth" })]);
    expect(result.authSignals).toContain("authelia");
  });

  it("emits authentik from advanced_config", () => {
    const [result] = dedupeRoutes([makeRow({ advanced_config: "proxy_pass http://authentik:9000;" })]);
    expect(result.authSignals).toContain("authentik");
  });

  it("emits multiple signals when multiple match", () => {
    const [result] = dedupeRoutes([makeRow({
      access_list_id: 1,
      advanced_config: "auth_request /validate; # authelia",
    })]);
    expect(result.authSignals).toContain("npm_access_list");
    expect(result.authSignals).toContain("nginx_auth_request");
    expect(result.authSignals).toContain("authelia");
  });

  it("stores non-null advanced_config in rawHints", () => {
    const [result] = dedupeRoutes([makeRow({ advanced_config: "add_header X-Custom foo;" })]);
    expect(result.rawHints).toEqual(["add_header X-Custom foo;"]);
  });

  it("stores empty rawHints when advanced_config is null", () => {
    const [result] = dedupeRoutes([makeRow({ advanced_config: null })]);
    expect(result.rawHints).toEqual([]);
  });
});
