create table if not exists exposure_intents (
  route_slug text primary key,
  route_label text not null,
  mode text not null check (mode in ('public_ok', 'auth_required', 'private_only', 'temporary_public')),
  expected_target text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists exposure_intents_mode_idx on exposure_intents (mode);
