alter table users
  add column if not exists last_active_at timestamptz not null default now();

alter table users
  add column if not exists avatar_content_type text;

alter table users
  add column if not exists avatar_bytes bytea;

alter table users
  add column if not exists avatar_updated_at timestamptz;

