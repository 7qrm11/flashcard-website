alter table users
  drop constraint if exists users_scheduler_time_history_limit_check;

alter table users
  drop column if exists scheduler_base_interval_s;

alter table users
  drop column if exists scheduler_reward_multiplier;

alter table users
  drop column if exists scheduler_penalty_multiplier;

alter table users
  drop column if exists scheduler_accuracy_ema;

alter table users
  drop column if exists scheduler_time_history_limit;

alter table flashcard_schedules
  add column if not exists stability_s double precision not null default 17084.19884585383;

alter table flashcard_schedules
  add column if not exists rt_ref_ms integer not null default 6000;

alter table flashcard_schedules
  add column if not exists last_seen_at timestamptz not null default now();

alter table flashcard_schedules
  add column if not exists prev_stability_s double precision not null default 17084.19884585383;

alter table flashcard_schedules
  add column if not exists prev_rt_ref_ms integer not null default 6000;

alter table flashcard_schedules
  add column if not exists prev_last_seen_at timestamptz not null default now();

alter table flashcard_schedules
  add column if not exists last_review_time_ms integer not null default 0;

alter table flashcard_schedules
  add column if not exists last_review_correct boolean not null default true;

update flashcard_schedules
set
  stability_s = case
    when interval_s is not null then interval_s / 0.10536051565782628
    else stability_s
  end,
  prev_stability_s = case
    when prev_interval_s is not null then prev_interval_s / 0.10536051565782628
    else prev_stability_s
  end,
  last_seen_at = coalesce(last_answered_at, last_seen_at),
  prev_last_seen_at = coalesce(last_answered_at, prev_last_seen_at),
  last_review_correct = coalesce(last_answered_correct, last_review_correct),
  last_review_time_ms = coalesce(
    times_ms[array_length(times_ms, 1)],
    last_review_time_ms
  )
where true;

alter table flashcard_schedules
  drop constraint if exists flashcard_schedules_interval_positive;

alter table flashcard_schedules
  drop constraint if exists flashcard_schedules_prev_interval_positive;

alter table flashcard_schedules
  drop constraint if exists flashcard_schedules_last_multiplier_positive;

alter table flashcard_schedules
  drop column if exists interval_s;

alter table flashcard_schedules
  drop column if exists times_ms;

alter table flashcard_schedules
  drop column if exists prev_interval_s;

alter table flashcard_schedules
  drop column if exists last_multiplier;

alter table flashcard_schedules
  drop column if exists last_answered_correct;

alter table flashcard_schedules
  drop column if exists last_answered_at;

alter table flashcard_schedules
  add constraint flashcard_schedules_stability_positive check (stability_s > 0);

alter table flashcard_schedules
  add constraint flashcard_schedules_prev_stability_positive check (prev_stability_s > 0);

alter table flashcard_schedules
  add constraint flashcard_schedules_rt_ref_positive check (rt_ref_ms > 0);

alter table flashcard_schedules
  add constraint flashcard_schedules_prev_rt_ref_positive check (prev_rt_ref_ms > 0);

alter table flashcard_schedules
  add constraint flashcard_schedules_last_review_time_nonneg check (last_review_time_ms >= 0);
