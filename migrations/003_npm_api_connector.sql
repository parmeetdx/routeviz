alter table settings
  add column if not exists npm_connector_mode text not null default 'sqlite',
  add column if not exists npm_api_url text not null default '',
  add column if not exists npm_api_token text not null default '';

-- Clear the hardcoded path that was baked into the 001 migration default
-- so existing installs are prompted to configure rather than silently failing
update settings set npm_sqlite_path = '' where npm_sqlite_path = '/docker/apps/nginx-proxy-manager/data/database.sqlite';
