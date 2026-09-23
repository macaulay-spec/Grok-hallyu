-- Migration 20260922000800 (rpc_grants): make the `api` RPC surface actually callable.
--
-- On a real Supabase project the API roles do NOT inherit EXECUTE on functions created in a custom
-- schema, so every `api.*` RPC returned 42501 "permission denied" for anon/authenticated (the PGlite
-- validator granted these up front, which is why it never saw the problem). Each RPC still enforces
-- its own authorisation (require_user / is_service_role / RLS), so widening EXECUTE is safe.

grant usage on schema api to anon, authenticated, service_role;
grant execute on all functions in schema api to anon, authenticated, service_role;

-- Future functions get the same default; anything sensitive is revoked explicitly at creation time.
alter default privileges in schema api grant execute on functions to anon, authenticated, service_role;

-- Revoke the service-role / internal surface again (the blanket grant above must not open these).
-- Dynamic + existence-guarded so the statement is safe on a full Supabase project AND inside the
-- embedded validator, where the supabase-only functions are absent. These names are not overloaded,
-- so revoking by bare name is unambiguous.
do $$
declare f text; names text[] := array[
  'account_anonymise','catalog_upsert','internal_key','media_finalize','media_reserve',
  'orphan_media_sweep','push_disable_tokens','push_mark_sent','push_render',
  'queue_archive','queue_delete','queue_read'
];
begin
  foreach f in array names loop
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'api' and p.proname = f) then
      execute format('revoke execute on function api.%I from anon, authenticated', f);
    end if;
  end loop;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'call_edge') then
    execute 'revoke execute on function public.call_edge(text) from anon, authenticated, public';
  end if;
end $$;
