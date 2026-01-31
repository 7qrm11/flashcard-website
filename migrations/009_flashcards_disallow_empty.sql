update practice_sessions
set status = 'ended',
    state = 'done',
    updated_at = now()
where status = 'active';

delete from flashcards
where char_length(btrim(front)) = 0
   or char_length(btrim(back)) = 0;

alter table flashcards
  drop constraint if exists flashcards_front_length_check;

alter table flashcards
  drop constraint if exists flashcards_back_length_check;

alter table flashcards
  add constraint flashcards_front_length_check check (char_length(btrim(front)) between 1 and 4000);

alter table flashcards
  add constraint flashcards_back_length_check check (char_length(btrim(back)) between 1 and 4000);
