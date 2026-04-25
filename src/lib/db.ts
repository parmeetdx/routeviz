import { readFile } from "node:fs/promises";
import path from "node:path";

import { Pool } from "pg";

import type { ExposureIntent, ExposureIntentMode, RoutevizSnapshot, PersistedSettings } from "./routeviz-types";
import { normalizeSettings } from "./settings";

// ── Connection pool ────────────────────────────────────────────────────────────

const globalDb = globalThis as typeof globalThis & { __routevizPool?: Pool };

export function getPool(): Pool {
  if (!globalDb.__routevizPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL environment variable is not set. " +
        "Add it to your .env file: DATABASE_URL=postgresql://user:password@localhost:5432/routeviz",
      );
    }
    globalDb.__routevizPool = new Pool({ connectionString });
  }
  return globalDb.__routevizPool;
}

// ── Migration runner ───────────────────────────────────────────────────────────

const MIGRATIONS_DIR = path.join(process.cwd(), "migrations");

const MIGRATION_FILES = [
  "001_initial.sql",
  "002_users.sql",
  "003_npm_api_connector.sql",
  "004_interval_minutes_numeric.sql",
  "005_scan_request.sql",
  "006_exposure_intents.sql",
  "007_drift_interval.sql",
  "008_connectors_json.sql",
];

export async function runMigrations(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    // Ensure the migrations tracking table exists before anything else
    await client.query(`
      create table if not exists migrations (
        id serial primary key,
        name text not null unique,
        applied_at timestamptz not null default now()
      )
    `);

    for (const file of MIGRATION_FILES) {
      const { rows } = await client.query<{ name: string }>(
        "select name from migrations where name = $1",
        [file],
      );

      if (rows.length > 0) continue;

      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into migrations (name) values ($1)", [file]);
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        throw new Error(`Migration ${file} failed: ${String(err)}`);
      }
    }
  } finally {
    client.release();
  }
}

// ── Settings ───────────────────────────────────────────────────────────────────

type SettingsRow = {
  docker_socket_path: string;
  host_address: string | null;
  host_label: string;
  npm_connector_mode: string;
  npm_sqlite_path: string;
  npm_api_url: string;
  npm_api_token: string;
  dns_baseline_mode: string;
  dns_baseline_value: string;
  scan_interval_enabled: boolean;
  scan_interval_minutes: number | string;
  scan_retention_limit: number;
  drift_interval_days: number | null;
  webhook_enabled: boolean;
  webhook_url: string;
  webhook_severity_threshold: string;
  webhook_last_delivery_at: string | null;
  webhook_last_delivery_status: string | null;
  auth_overrides: string[];
  connectors_json: unknown | null;
};

export function rowToSettings(row: SettingsRow): PersistedSettings {
  return normalizeSettings({
    dockerSocketPath: row.docker_socket_path,
    hostAddress: row.host_address,
    hostLabel: row.host_label,
    // Prefer connectors_json (source of truth) over legacy flat NPM columns.
    // migrateConnectors() in normalizeSettings handles the fallback when it's null.
    connectors: row.connectors_json ?? undefined,
    npmConnectorMode: row.npm_connector_mode,
    npmSqlitePath: row.npm_sqlite_path,
    npmApiUrl: row.npm_api_url ?? "",
    npmApiToken: row.npm_api_token ?? "",
    dnsBaseline: {
      mode: row.dns_baseline_mode,
      value: row.dns_baseline_value,
    },
    scanConfig: {
      intervalEnabled: row.scan_interval_enabled,
      intervalMinutes: Number(row.scan_interval_minutes),
      retentionLimit: row.scan_retention_limit,
      driftIntervalDays: Number(row.drift_interval_days ?? 7),
    },
    webhookConfig: {
      enabled: row.webhook_enabled,
      url: row.webhook_url,
      severityThreshold: row.webhook_severity_threshold,
      lastDeliveryAt: row.webhook_last_delivery_at,
      lastDeliveryStatus: row.webhook_last_delivery_status,
    },
    authOverrides: row.auth_overrides ?? [],
  });
}

export async function dbGetSettings(): Promise<PersistedSettings | null> {
  const pool = getPool();
  const { rows } = await pool.query<SettingsRow>("select * from settings where id = 1");
  return rows[0] ? rowToSettings(rows[0]) : null;
}

export async function dbUpsertSettings(settings: PersistedSettings): Promise<void> {
  const pool = getPool();
  // Persist the first NPM connector's options into the legacy flat columns so
  // older DB rows remain readable by migrateConnectors() on next read.
  const npmCfg = settings.connectors.find((c) => c.type === "npm");
  const npmOpts = npmCfg?.options as { mode?: string; sqlitePath?: string; apiUrl?: string; apiToken?: string } | undefined;
  const npmMode = npmOpts?.mode ?? "sqlite";
  const npmSqlitePath = npmOpts?.sqlitePath ?? "";
  const npmApiUrl = npmOpts?.apiUrl ?? "";
  const npmApiToken = npmOpts?.apiToken ?? "";

  await pool.query(
    `insert into settings (
      id, docker_socket_path, host_address, host_label,
      npm_connector_mode, npm_sqlite_path, npm_api_url, npm_api_token,
      dns_baseline_mode, dns_baseline_value,
      scan_interval_enabled, scan_interval_minutes, scan_retention_limit, drift_interval_days,
      webhook_enabled, webhook_url, webhook_severity_threshold,
      webhook_last_delivery_at, webhook_last_delivery_status,
      auth_overrides, connectors_json, updated_at
    ) values (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, now())
    on conflict (id) do update set
      docker_socket_path = excluded.docker_socket_path,
      host_address = excluded.host_address,
      host_label = excluded.host_label,
      npm_connector_mode = excluded.npm_connector_mode,
      npm_sqlite_path = excluded.npm_sqlite_path,
      npm_api_url = excluded.npm_api_url,
      npm_api_token = excluded.npm_api_token,
      dns_baseline_mode = excluded.dns_baseline_mode,
      dns_baseline_value = excluded.dns_baseline_value,
      scan_interval_enabled = excluded.scan_interval_enabled,
      scan_interval_minutes = excluded.scan_interval_minutes,
      scan_retention_limit = excluded.scan_retention_limit,
      drift_interval_days = excluded.drift_interval_days,
      webhook_enabled = excluded.webhook_enabled,
      webhook_url = excluded.webhook_url,
      webhook_severity_threshold = excluded.webhook_severity_threshold,
      webhook_last_delivery_at = excluded.webhook_last_delivery_at,
      webhook_last_delivery_status = excluded.webhook_last_delivery_status,
      auth_overrides = excluded.auth_overrides,
      connectors_json = excluded.connectors_json,
      updated_at = now()`,
    [
      settings.dockerSocketPath,
      settings.hostAddress,
      settings.hostLabel,
      npmMode,
      npmSqlitePath,
      npmApiUrl,
      npmApiToken,
      settings.dnsBaseline.mode,
      settings.dnsBaseline.value,
      settings.scanConfig.intervalEnabled,
      settings.scanConfig.intervalMinutes,
      settings.scanConfig.retentionLimit,
      settings.scanConfig.driftIntervalDays,
      settings.webhookConfig.enabled,
      settings.webhookConfig.url,
      settings.webhookConfig.severityThreshold,
      settings.webhookConfig.lastDeliveryAt,
      settings.webhookConfig.lastDeliveryStatus,
      settings.authOverrides,
      JSON.stringify(settings.connectors),
    ],
  );
}

// ── Snapshots ──────────────────────────────────────────────────────────────────

export async function dbInsertSnapshot(snapshot: RoutevizSnapshot): Promise<void> {
  const pool = getPool();
  await pool.query(
    `insert into snapshots (id, generated_at, host_label, host_address, payload)
     values ($1, $2, $3, $4, $5)
     on conflict (id) do nothing`,
    [
      snapshot.id,
      snapshot.generatedAt,
      snapshot.hostLabel,
      snapshot.hostAddress,
      JSON.stringify(snapshot),
    ],
  );
}

export async function dbGetSnapshots(limit: number): Promise<RoutevizSnapshot[]> {
  const pool = getPool();
  const { rows } = await pool.query<{ payload: RoutevizSnapshot }>(
    "select payload from snapshots order by generated_at asc limit $1",
    [limit],
  );
  return rows.map((r) => r.payload);
}

export async function dbGetLatestSnapshot(): Promise<RoutevizSnapshot | null> {
  const pool = getPool();
  const { rows } = await pool.query<{ payload: RoutevizSnapshot }>(
    "select payload from snapshots order by generated_at desc limit 1",
  );
  return rows[0]?.payload ?? null;
}

export async function dbGetActiveSnapshot(): Promise<RoutevizSnapshot | null> {
  const pool = getPool();
  const { rows } = await pool.query<{ payload: RoutevizSnapshot }>(
    `select s.payload from active_snapshot a
     join snapshots s on s.id = a.snapshot_id
     where a.id = 1`,
  );
  if (rows[0]) return rows[0].payload;
  return dbGetLatestSnapshot();
}

export async function dbSetActiveSnapshot(snapshotId: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    "update active_snapshot set snapshot_id = $1 where id = 1",
    [snapshotId],
  );
}

export async function dbPruneSnapshots(retentionLimit: number): Promise<void> {
  const pool = getPool();
  // Keep the newest `retentionLimit` rows, delete the rest
  await pool.query(
    `delete from snapshots
     where id not in (
       select id from snapshots order by generated_at desc limit $1
     )`,
    [retentionLimit],
  );
}


// ── Suppressed findings ────────────────────────────────────────────────────────

export async function dbGetSuppressedFindings(): Promise<string[]> {
  const pool = getPool();
  const { rows } = await pool.query<{ key: string }>(
    "select key from suppressed_findings order by suppressed_at asc",
  );
  return rows.map((r) => r.key);
}

export async function dbSuppressFinding(key: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    "insert into suppressed_findings (key) values ($1) on conflict do nothing",
    [key],
  );
}

export async function dbUnsuppressFinding(key: string): Promise<void> {
  const pool = getPool();
  await pool.query("delete from suppressed_findings where key = $1", [key]);
}

// ── Exposure intents ──────────────────────────────────────────────────────────

type ExposureIntentRow = {
  route_slug: string;
  route_label: string;
  mode: ExposureIntentMode;
  expected_target: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

function rowToExposureIntent(row: ExposureIntentRow): ExposureIntent {
  return {
    routeSlug: row.route_slug,
    routeLabel: row.route_label,
    mode: row.mode,
    expectedTarget: row.expected_target,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function dbGetExposureIntents(): Promise<ExposureIntent[]> {
  const pool = getPool();
  const { rows } = await pool.query<ExposureIntentRow>(
    `select route_slug, route_label, mode, expected_target, expires_at, created_at, updated_at
     from exposure_intents
     order by updated_at desc`,
  );
  return rows.map(rowToExposureIntent);
}

export async function dbUpsertExposureIntent(intent: {
  routeSlug: string;
  routeLabel: string;
  mode: ExposureIntentMode;
  expectedTarget: string | null;
  expiresAt: string | null;
}): Promise<void> {
  const pool = getPool();
  await pool.query(
    `insert into exposure_intents (
      route_slug, route_label, mode, expected_target, expires_at, updated_at
    ) values ($1, $2, $3, $4, $5, now())
    on conflict (route_slug) do update set
      route_label = excluded.route_label,
      mode = excluded.mode,
      expected_target = excluded.expected_target,
      expires_at = excluded.expires_at,
      updated_at = now()`,
    [
      intent.routeSlug,
      intent.routeLabel,
      intent.mode,
      intent.expectedTarget,
      intent.expiresAt,
    ],
  );
}

export async function dbDeleteExposureIntent(routeSlug: string): Promise<void> {
  const pool = getPool();
  await pool.query("delete from exposure_intents where route_slug = $1", [routeSlug]);
}

// ── Users ──────────────────────────────────────────────────────────────────────

export type UserRow = {
  id: string;
  username: string;
  email: string | null;
  password_hash: string;
  is_admin: boolean;
  created_at: string;
};

export async function dbGetUserCount(): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query<{ count: string }>("select count(*) from users");
  return parseInt(rows[0]?.count ?? "0", 10);
}

export async function dbCreateUser(
  username: string,
  email: string | null,
  passwordHash: string,
  isAdmin: boolean,
): Promise<UserRow> {
  const pool = getPool();
  const { rows } = await pool.query<UserRow>(
    `insert into users (username, email, password_hash, is_admin)
     values ($1, $2, $3, $4)
     returning *`,
    [username, email ?? null, passwordHash, isAdmin],
  );
  return rows[0];
}

export async function dbGetUserByIdentifier(identifier: string): Promise<UserRow | null> {
  const pool = getPool();
  const { rows } = await pool.query<UserRow>(
    "select * from users where username = $1 or email = $1 limit 1",
    [identifier],
  );
  return rows[0] ?? null;
}

export async function dbGetUserByUsername(username: string): Promise<UserRow | null> {
  const pool = getPool();
  const { rows } = await pool.query<UserRow>(
    "select * from users where username = $1",
    [username],
  );
  return rows[0] ?? null;
}

export async function dbGetUserByEmail(email: string): Promise<UserRow | null> {
  const pool = getPool();
  const { rows } = await pool.query<UserRow>(
    "select * from users where email = $1",
    [email],
  );
  return rows[0] ?? null;
}

// ── Sessions ───────────────────────────────────────────────────────────────────

export async function dbCreateSession(token: string, userId: string, expiresAt: Date): Promise<void> {
  const pool = getPool();
  await pool.query(
    "insert into sessions (token, user_id, expires_at) values ($1, $2, $3)",
    [token, userId, expiresAt],
  );
}

export async function dbGetSession(token: string): Promise<{ userId: string; expiresAt: Date } | null> {
  const pool = getPool();
  const { rows } = await pool.query<{ user_id: string; expires_at: Date }>(
    "select user_id, expires_at from sessions where token = $1",
    [token],
  );
  if (!rows[0]) return null;
  return { userId: rows[0].user_id, expiresAt: rows[0].expires_at };
}

export async function dbDeleteSession(token: string): Promise<void> {
  const pool = getPool();
  await pool.query("delete from sessions where token = $1", [token]);
}

export async function dbDeleteExpiredSessions(): Promise<void> {
  const pool = getPool();
  await pool.query("delete from sessions where expires_at < now()");
}

// ── Scan request (web → worker signal) ────────────────────────────────────────

export async function dbRequestScan(): Promise<void> {
  const pool = getPool();
  await pool.query("update settings set scan_requested = true");
}

export async function dbCheckAndClearScanRequest(): Promise<boolean> {
  const pool = getPool();
  const { rows } = await pool.query<{ scan_requested: boolean }>(
    "update settings set scan_requested = false where scan_requested = true returning scan_requested",
  );
  return rows.length > 0;
}
