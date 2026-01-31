alter table users
  add column if not exists ui_language text not null default 'en';

do $$
begin
  alter table users
    add constraint users_ui_language_check
    check (ui_language in ('en', 'cs'));
exception
  when duplicate_object then null;
end $$;

