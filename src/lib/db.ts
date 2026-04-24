import { readFile } from "node:fs/promises";
import path from "node:path";

import { Pool } from "pg";

import type { RoutevizSnapshot, PersistedSettings } from "./routeviz-types";

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
  npm_sqlite_path: string;
  dns_baseline_mode: string;
  dns_baseline_value: string;
  scan_interval_enabled: boolean;
  scan_interval_minutes: number;
  scan_retention_limit: number;
  webhook_enabled: boolean;
  webhook_url: string;
  webhook_severity_threshold: string;
  webhook_last_delivery_at: string | null;
  webhook_last_delivery_status: string | null;
  auth_overrides: string[];
};

export function rowToSettings(row: SettingsRow): PersistedSettings {
  return {
    dockerSocketPath: row.docker_socket_path,
    hostAddress: row.host_address,
    hostLabel: row.host_label,
    npmSqlitePath: row.npm_sqlite_path,
    dnsBaseline: {
      mode: row.dns_baseline_mode as PersistedSettings["dnsBaseline"]["mode"],
      value: row.dns_baseline_value,
    },
    scanConfig: {
      intervalEnabled: row.scan_interval_enabled,
      intervalMinutes: row.scan_interval_minutes,
      retentionLimit: row.scan_retention_limit,
    },
    webhookConfig: {
      enabled: row.webhook_enabled,
      url: row.webhook_url,
      severityThreshold: row.webhook_severity_threshold as "high" | "high_medium",
      lastDeliveryAt: row.webhook_last_delivery_at,
      lastDeliveryStatus: row.webhook_last_delivery_status as "success" | "failed" | null,
    },
    authOverrides: row.auth_overrides ?? [],
    suppressedFindings: [],
  };
}

export async function dbGetSettings(): Promise<PersistedSettings | null> {
  const pool = getPool();
  const { rows } = await pool.query<SettingsRow>("select * from settings where id = 1");
  return rows[0] ? rowToSettings(rows[0]) : null;
}

export async function dbUpsertSettings(settings: PersistedSettings): Promise<void> {
  const pool = getPool();
  await pool.query(
    `insert into settings (
      id, docker_socket_path, host_address, host_label, npm_sqlite_path,
      dns_baseline_mode, dns_baseline_value,
      scan_interval_enabled, scan_interval_minutes, scan_retention_limit,
      webhook_enabled, webhook_url, webhook_severity_threshold,
      webhook_last_delivery_at, webhook_last_delivery_status,
      auth_overrides, updated_at
    ) values (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now())
    on conflict (id) do update set
      docker_socket_path = excluded.docker_socket_path,
      host_address = excluded.host_address,
      host_label = excluded.host_label,
      npm_sqlite_path = excluded.npm_sqlite_path,
      dns_baseline_mode = excluded.dns_baseline_mode,
      dns_baseline_value = excluded.dns_baseline_value,
      scan_interval_enabled = excluded.scan_interval_enabled,
      scan_interval_minutes = excluded.scan_interval_minutes,
      scan_retention_limit = excluded.scan_retention_limit,
      webhook_enabled = excluded.webhook_enabled,
      webhook_url = excluded.webhook_url,
      webhook_severity_threshold = excluded.webhook_severity_threshold,
      webhook_last_delivery_at = excluded.webhook_last_delivery_at,
      webhook_last_delivery_status = excluded.webhook_last_delivery_status,
      auth_overrides = excluded.auth_overrides,
      updated_at = now()`,
    [
      settings.dockerSocketPath,
      settings.hostAddress,
      settings.hostLabel,
      settings.npmSqlitePath,
      settings.dnsBaseline.mode,
      settings.dnsBaseline.value,
      settings.scanConfig.intervalEnabled,
      settings.scanConfig.intervalMinutes,
      settings.scanConfig.retentionLimit,
      settings.webhookConfig.enabled,
      settings.webhookConfig.url,
      settings.webhookConfig.severityThreshold,
      settings.webhookConfig.lastDeliveryAt,
      settings.webhookConfig.lastDeliveryStatus,
      settings.authOverrides,
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

export async function dbGetSnapshotCount(): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query<{ count: string }>("select count(*) from snapshots");
  return parseInt(rows[0]?.count ?? "0", 10);
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
