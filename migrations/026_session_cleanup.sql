-- Clean up expired sessions
-- This should be run periodically via cron or triggered from application code

-- Create a function to clean expired sessions
create or replace function cleanup_expired_sessions()
returns integer as $$
declare
  deleted_count integer;
begin
  delete from sessions where expires_at < now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$ language plpgsql;

-- Run initial cleanup
select cleanup_expired_sessions();

