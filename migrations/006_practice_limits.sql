alter table users
  add column if not exists daily_novel_limit integer not null default 50;

alter table users
  add column if not exists daily_review_limit integer not null default 200;

alter table users
  add constraint users_daily_novel_limit_check check (daily_novel_limit between 0 and 10000);

alter table users
  add constraint users_daily_review_limit_check check (daily_review_limit between 0 and 10000);

create table if not exists practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  deck_id uuid not null references decks (id) on delete cascade,
  status text not null default 'active',
  progress_index integer not null default 0,
  view_index integer not null default 0,
  state text not null default 'intro',
  front_started_at timestamptz null,
  front_elapsed_ms integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint practice_sessions_status_check check (status in ('active', 'ended')),
  constraint practice_sessions_state_check check (state in ('intro', 'front', 'back', 'past', 'done')),
  constraint practice_sessions_progress_nonneg check (progress_index >= 0),
  constraint practice_sessions_view_nonneg check (view_index >= 0)
);

create index if not exists practice_sessions_user_deck_status_idx
  on practice_sessions (user_id, deck_id, status, created_at desc);

create table if not exists practice_session_queue (
  session_id uuid not null references practice_sessions (id) on delete cascade,
  position integer not null,
  flashcard_id uuid not null references flashcards (id) on delete cascade,
  is_novel boolean not null,
  primary key (session_id, position),
  constraint practice_session_queue_position_nonneg check (position >= 0)
);

create unique index if not exists practice_session_queue_session_flashcard_uq
  on practice_session_queue (session_id, flashcard_id);

create index if not exists practice_session_queue_session_idx
  on practice_session_queue (session_id, position);

create table if not exists practice_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  session_id uuid not null references practice_sessions (id) on delete cascade,
  deck_id uuid not null references decks (id) on delete cascade,
  flashcard_id uuid not null references flashcards (id) on delete cascade,
  position integer not null,
  is_novel boolean not null,
  answered_correct boolean not null,
  time_ms integer not null,
  answered_at timestamptz not null default now(),
  constraint practice_attempts_time_nonneg check (time_ms >= 0)
);

create unique index if not exists practice_attempts_session_position_uq
  on practice_attempts (session_id, position);

create unique index if not exists practice_attempts_session_flashcard_uq
  on practice_attempts (session_id, flashcard_id);

create index if not exists practice_attempts_user_answered_at_idx
  on practice_attempts (user_id, answered_at desc);

create index if not exists practice_attempts_user_flashcard_idx
  on practice_attempts (user_id, flashcard_id);

create index if not exists practice_attempts_user_day_is_novel_idx
  on practice_attempts (user_id, answered_at, is_novel);

create index if not exists flashcards_deck_created_at_idx
  on flashcards (deck_id, created_at);

