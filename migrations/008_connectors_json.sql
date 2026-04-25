-- Migration 008: persist full connector list as JSONB
-- The legacy flat NPM columns are kept for backwards compatibility but
-- connectors_json is now the source of truth when present.
alter table settings add column if not exists connectors_json jsonb;
