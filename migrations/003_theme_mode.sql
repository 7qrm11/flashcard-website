alter table users
  add column if not exists theme_mode text not null default 'light';

do $$
begin
  alter table users
    add constraint users_theme_mode_check check (theme_mode in ('light', 'dark'));
exception
  when duplicate_object then null;
end $$;

