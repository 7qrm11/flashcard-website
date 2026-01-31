alter table users
  alter column logging_retention_ms type bigint using logging_retention_ms::bigint,
  alter column ai_deck_job_logs_retention_ms type bigint using ai_deck_job_logs_retention_ms::bigint,
  alter column scheduler_base_interval_ms type bigint using scheduler_base_interval_ms::bigint;

alter table flashcard_schedules
  alter column interval_ms type bigint using interval_ms::bigint,
  alter column prev_interval_ms type bigint using prev_interval_ms::bigint;

