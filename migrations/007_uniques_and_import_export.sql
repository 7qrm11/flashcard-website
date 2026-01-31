create unique index if not exists decks_user_name_lower_uq
  on decks (user_id, lower(name));

create unique index if not exists flashcards_deck_front_back_sha_uq
  on flashcards (
    deck_id,
    digest(trim(front), 'sha256'),
    digest(trim(back), 'sha256')
  )
  where char_length(trim(front)) > 0
    and char_length(trim(back)) > 0;

