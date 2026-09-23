-- Harden the video ledger RPCs added by the video pipeline migration.
-- The functions perform their own auth and ownership checks; anonymous callers must not
-- be able to probe quota or register objects.
grant execute on function api.upload_quota() to authenticated;
grant execute on function api.register_media(text, text, text, bigint, int, int, int) to authenticated;
revoke execute on function api.upload_quota() from anon;
revoke execute on function api.register_media(text, text, text, bigint, int, int, int) from anon;

-- Keep the storage ledger from retaining failed/reserved rows indefinitely. This is deliberately
-- service-role-only; the scheduled Edge Function can call it without exposing cleanup to clients.
create or replace function api.media_cleanup(p_before timestamptz default now() - interval '24 hours')
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare n int;
begin
  if not public.is_service_role() then perform public.fail(403, 'Forbidden'); end if;
  update public.media_uploads
     set status = 'deleted'
   where status in ('pending', 'failed')
     and created_at < p_before;
  get diagnostics n = row_count;
  return n;
end
$$;
revoke all on function api.media_cleanup(timestamptz) from public, anon, authenticated;
grant execute on function api.media_cleanup(timestamptz) to service_role;
