alter table users
  add column if not exists scheduler_base_interval_ms integer not null default 1800000,
  add column if not exists scheduler_reward_multiplier double precision not null default 1.618033988749895,
  add column if not exists scheduler_penalty_multiplier double precision not null default 0.6180339887498949,
  add column if not exists scheduler_required_time_ms integer not null default 6000,
  add column if not exists scheduler_time_history_limit integer not null default 10;

do $$
begin
  alter table users
    add constraint users_scheduler_base_interval_ms_check
    check (scheduler_base_interval_ms between 1000 and 315360000000);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table users
    add constraint users_scheduler_reward_multiplier_check
    check (scheduler_reward_multiplier > 0 and scheduler_reward_multiplier <= 1000);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table users
    add constraint users_scheduler_penalty_multiplier_check
    check (scheduler_penalty_multiplier > 0 and scheduler_penalty_multiplier <= 1000);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table users
    add constraint users_scheduler_required_time_ms_check
    check (scheduler_required_time_ms between 0 and 3600000);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table users
    add constraint users_scheduler_time_history_limit_check
    check (scheduler_time_history_limit between 1 and 1000);
exception
  when duplicate_object then null;
end $$;

alter table flashcard_schedules
  add column if not exists interval_ms integer not null default 1800000,
  add column if not exists prev_interval_ms integer not null default 1800000,
  add column if not exists last_multiplier double precision not null default 1,
  add column if not exists review_history jsonb not null default '[]'::jsonb;

do $$
begin
  alter table flashcard_schedules
    add constraint flashcard_schedules_interval_ms_positive
    check (interval_ms > 0);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table flashcard_schedules
    add constraint flashcard_schedules_prev_interval_ms_positive
    check (prev_interval_ms > 0);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table flashcard_schedules
    add constraint flashcard_schedules_last_multiplier_positive
    check (last_multiplier > 0);
exception
  when duplicate_object then null;
end $$;

update flashcard_schedules
set
  interval_ms = greatest(1000, floor(extract(epoch from (due_at - last_seen_at)) * 1000)::int),
  prev_interval_ms = greatest(1000, floor(extract(epoch from (due_at - last_seen_at)) * 1000)::int)
where true;
