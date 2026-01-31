alter table users
  add column if not exists openrouter_api_key text;

alter table users
  add column if not exists openrouter_model text;

alter table users
  add column if not exists openrouter_only_free_models boolean not null default true;

alter table users
  add column if not exists openrouter_system_prompt text not null default 'You are an expert tutor and flashcard creator. follow instructions and stay accurate.';

alter table users
  add column if not exists openrouter_flashcard_prompt text not null default 'return only a single json object with schema {\"name\": string, \"flashcards\": [{\"front\": string, \"back\": string}]}. no markdown. no code fences. no extra text. keep name 1-64 chars. keep front/back 1-4000 chars. create clear, specific flashcards.';

create table if not exists ai_deck_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  status text not null default 'queued',
  prompt text not null,
  model text not null,
  system_prompt text not null,
  flashcard_prompt text not null,
  attempt_count integer not null default 0,
  started_at timestamptz null,
  deck_id uuid null references decks (id) on delete set null,
  error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_deck_jobs_status_check check (status in ('queued', 'running', 'succeeded', 'failed')),
  constraint ai_deck_jobs_attempt_nonneg check (attempt_count >= 0)
);

create index if not exists ai_deck_jobs_user_status_created_at_idx
  on ai_deck_jobs (user_id, status, created_at desc);

create index if not exists ai_deck_jobs_status_created_at_idx
  on ai_deck_jobs (status, created_at asc);

