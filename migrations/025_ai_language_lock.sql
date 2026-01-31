alter table users
  add column if not exists ai_language_lock_enabled boolean not null default true;

