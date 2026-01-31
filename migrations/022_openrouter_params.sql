alter table users
  add column if not exists openrouter_params jsonb not null default '{}'::jsonb;

