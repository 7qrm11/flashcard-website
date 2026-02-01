-- Clean up old rate limit events
-- Events older than 1 hour are no longer needed for any rate limiting window

-- Create a function to clean old rate limit events
create or replace function cleanup_old_rate_limit_events()
returns integer as $$
declare
  deleted_count integer;
begin
  delete from rate_limit_events where created_at < now() - interval '1 hour';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$ language plpgsql;

-- Run initial cleanup
select cleanup_old_rate_limit_events();

