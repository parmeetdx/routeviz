-- Migration 002: users table for auth

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  email text unique,
  password_hash text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_username_idx on users (username);
create index if not exists users_email_idx on users (email) where email is not null;

-- Session tokens (HttpOnly cookie value → server-side session)
create table if not exists sessions (
  token text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists sessions_user_id_idx on sessions (user_id);
create index if not exists sessions_expires_at_idx on sessions (expires_at);
