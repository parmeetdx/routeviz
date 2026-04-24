-- Migration 001: initial schema

create table if not exists migrations (
  id serial primary key,
  name text not null unique,
  applied_at timestamptz not null default now()
);

-- Single-row settings table (enforced via id = 1 check constraint)
create table if not exists settings (
  id integer primary key default 1 check (id = 1),
  docker_socket_path text not null default '/var/run/docker.sock',
  host_address text,
  host_label text not null default '',
  npm_sqlite_path text not null default '',
  dns_baseline_mode text not null default 'disabled',
  dns_baseline_value text not null default '',
  scan_interval_enabled boolean not null default true,
  scan_interval_minutes numeric(10,4) not null default 5,
  scan_retention_limit integer not null default 576,
  webhook_enabled boolean not null default false,
  webhook_url text not null default '',
  webhook_severity_threshold text not null default 'high',
  webhook_last_delivery_at timestamptz,
  webhook_last_delivery_status text,
  auth_overrides text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- One row per snapshot, payload stored as jsonb
create table if not exists snapshots (
  id text primary key,
  generated_at timestamptz not null,
  host_label text not null default '',
  host_address text not null default '',
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists snapshots_generated_at_idx on snapshots (generated_at desc);

-- Suppressed findings stored as individual rows for easy querying
create table if not exists suppressed_findings (
  key text primary key,
  suppressed_at timestamptz not null default now()
);

-- Active snapshot pointer (which snapshot id is currently "selected")
create table if not exists active_snapshot (
  id integer primary key default 1 check (id = 1),
  snapshot_id text references snapshots(id) on delete set null
);

insert into active_snapshot (id) values (1) on conflict do nothing;
