do $$
begin
  alter table ai_deck_jobs
    drop constraint ai_deck_jobs_job_type_check;
exception
  when undefined_object then null;
end $$;

alter table ai_deck_jobs
  add constraint ai_deck_jobs_job_type_check
  check (job_type in ('create_deck', 'add_flashcards', 'edit_flashcards'));

