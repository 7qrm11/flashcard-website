alter table flashcards
  add column kind text not null default 'basic',
  add column mcq_options jsonb,
  add column mcq_correct_index int,
  add column p5_code text,
  add column p5_width int,
  add column p5_height int;

alter table flashcards
  add constraint flashcards_kind_check check (kind in ('basic', 'mcq', 'learning'));

alter table flashcards
  add constraint flashcards_mcq_correct_index_check check (mcq_correct_index is null or mcq_correct_index >= 0);

alter table flashcards
  add constraint flashcards_p5_dimensions_check check (
    (p5_width is null and p5_height is null)
    or (p5_width is not null and p5_width between 100 and 1200 and p5_height is not null and p5_height between 100 and 900)
  );
