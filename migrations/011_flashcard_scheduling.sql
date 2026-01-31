alter table users
  add column if not exists scheduler_base_interval_s double precision not null default 1800;

alter table users
  add column if not exists scheduler_reward_multiplier double precision not null default 1.618033988749895;

alter table users
  add column if not exists scheduler_penalty_multiplier double precision not null default 0.6180339887498949;

alter table users
  add column if not exists scheduler_accuracy_ema double precision not null default 0.9;

alter table users
  add column if not exists scheduler_time_history_limit integer not null default 10;

alter table users
  add constraint users_scheduler_time_history_limit_check
  check (scheduler_time_history_limit between 1 and 1000);

create table if not exists flashcard_schedules (
  user_id uuid not null references users (id) on delete cascade,
  flashcard_id uuid not null references flashcards (id) on delete cascade,
  interval_s double precision not null,
  due_at timestamptz not null,
  times_ms integer[] not null default '{}',
  prev_interval_s double precision not null,
  last_multiplier double precision not null,
  last_answered_correct boolean not null,
  last_answered_at timestamptz not null,
  primary key (user_id, flashcard_id),
  constraint flashcard_schedules_interval_positive check (interval_s > 0),
  constraint flashcard_schedules_prev_interval_positive check (prev_interval_s > 0),
  constraint flashcard_schedules_last_multiplier_positive check (last_multiplier > 0)
);

create index if not exists flashcard_schedules_user_due_idx
  on flashcard_schedules (user_id, due_at);

create index if not exists flashcard_schedules_user_flashcard_idx
  on flashcard_schedules (user_id, flashcard_id);
