alter table ai_deck_jobs
  add column if not exists job_type text not null default 'create_deck';

do $$
begin
  alter table ai_deck_jobs
    add constraint ai_deck_jobs_job_type_check
    check (job_type in ('create_deck', 'add_flashcards'));
exception
  when duplicate_object then null;
end $$;

create index if not exists ai_deck_jobs_user_created_at_idx
  on ai_deck_jobs (user_id, created_at desc);
