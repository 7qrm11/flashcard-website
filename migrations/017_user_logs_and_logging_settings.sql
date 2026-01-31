create table if not exists user_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references users (id) on delete cascade,
  source text not null,
  level text not null,
  message text not null,
  ts timestamptz not null,
  meta jsonb null,
  data jsonb null,
  created_at timestamptz not null default now(),
  constraint user_logs_source_check check (source in ('client', 'server')),
  constraint user_logs_level_check check (level in ('debug', 'info', 'warn', 'error')),
  constraint user_logs_message_length_check check (length(message) <= 10000)
);

create index if not exists user_logs_user_created_at_idx
  on user_logs (user_id, created_at desc);

create index if not exists user_logs_user_level_created_at_idx
  on user_logs (user_id, level, created_at desc);

alter table users
  add column if not exists logging_enabled boolean not null default true,
  add column if not exists logging_retention_ms integer not null default 604800000,
  add column if not exists ai_deck_job_logs_enabled boolean not null default true,
  add column if not exists ai_deck_job_logs_retention_ms integer not null default 604800000;

do $$
begin
  alter table users
    add constraint users_logging_retention_ms_check
    check (logging_retention_ms between 0 and 315360000000);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table users
    add constraint users_ai_deck_job_logs_retention_ms_check
    check (ai_deck_job_logs_retention_ms between 0 and 315360000000);
exception
  when duplicate_object then null;
end $$;

