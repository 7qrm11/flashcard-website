alter table flashcards
  drop constraint if exists flashcards_front_length_check;

alter table flashcards
  drop constraint if exists flashcards_back_length_check;

alter table flashcards
  add constraint flashcards_front_length_check check (char_length(front) between 0 and 4000);

alter table flashcards
  add constraint flashcards_back_length_check check (char_length(back) between 0 and 4000);

