create table if not exists decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  constraint decks_name_length_check check (char_length(name) between 1 and 64)
);

create unique index if not exists decks_user_default_uq on decks (user_id) where is_default;
create index if not exists decks_user_archived_idx on decks (user_id, is_archived);

create table if not exists flashcards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references decks (id) on delete cascade,
  front text not null,
  back text not null,
  created_at timestamptz not null default now(),
  constraint flashcards_front_length_check check (char_length(front) between 1 and 4000),
  constraint flashcards_back_length_check check (char_length(back) between 1 and 4000)
);

create index if not exists flashcards_deck_id_idx on flashcards (deck_id);

insert into decks (user_id, name, is_default, is_archived)
select u.id, 'default', true, false
from users u
where not exists (
  select 1
  from decks d
  where d.user_id = u.id
    and d.is_default = true
);

