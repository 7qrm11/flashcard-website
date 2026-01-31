create table if not exists rate_limit_events (
  id bigserial primary key,
  bucket text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_events_bucket_created_at_idx
  on rate_limit_events (bucket, created_at desc);
