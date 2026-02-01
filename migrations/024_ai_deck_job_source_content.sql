-- add source content columns to ai_deck_jobs for pdf and youtube support

alter table ai_deck_jobs
  add column if not exists source_type text null,
  add column if not exists source_name text null,
  add column if not exists source_content text null;

-- constraint for valid source types
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ai_deck_jobs_source_type_check'
  ) then
    alter table ai_deck_jobs
      add constraint ai_deck_jobs_source_type_check
      check (source_type is null or source_type in ('pdf', 'youtube'));
  end if;
end $$;
