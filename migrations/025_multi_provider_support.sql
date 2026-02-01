-- add multi-provider support for ai flashcard generation

alter table users
  add column if not exists ai_provider text not null default 'openrouter',
  add column if not exists cerebras_api_key text null,
  add column if not exists groq_api_key text null;

-- constraint for valid provider values
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_ai_provider_check'
  ) then
    alter table users
      add constraint users_ai_provider_check
      check (ai_provider in ('openrouter', 'cerebras', 'groq'));
  end if;
end $$;
