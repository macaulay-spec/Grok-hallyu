-- Migration 20260922001000 (profile_update_rpc): one authorized write path for a user's OWN profile.
--
-- Problem: the client writes profile / settings / onboarding through PostgREST. `api.profiles` is a
-- security_invoker VIEW and its `prefs`, `onboarding`, `terms_version` and `language` columns are CASE
-- expressions (they are only exposed to the row owner). PostgreSQL therefore treats those columns as
-- read-only on the view, so `UPDATE api.profiles SET prefs = ...` fails outright; and a broad
-- `GRANT UPDATE ON api.profiles` is both insufficient (it cannot make the CASE columns writable) and
-- undesirable (it widens the attack surface). Live inspection of the production project also showed the
-- view-level UPDATE privilege was absent, so even `display_name`/`bio` edits were rejected.
--
-- Fix: expose a single SECURITY DEFINER RPC that is the only supported self-write path. It
--   * requires an authenticated user (public.require_user()),
--   * only ever touches the caller's own row (WHERE id = auth.uid()),
--   * whitelists the writable columns (server-owned counters / state / verified / handle stay untouchable),
--   * shallow-merges `prefs` so a partial settings patch can never clobber unrelated keys,
--   * validates lengths / cardinalities and returns the updated row.
-- The base-table RLS policy (profiles_update) and the column-level grants remain in place as defence in
-- depth for any other (future) access path. No privileged credential is ever placed in the mobile app.

create or replace function api.update_profile(p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_user();
  v_allowed text[] := array[
    'display_name', 'bio', 'avatar_key', 'favorite_genres', 'favorite_drama_ids',
    'is_private', 'prefs', 'onboarding', 'language', 'terms_version'
  ];
  v_key text;
  v_row jsonb;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    perform public.fail(422, 'Invalid profile update');
  end if;

  -- Reject anything outside the whitelist. Counters, state, verified and handle are never writable here
  -- (handle changes go through api.claim_handle, which enforces the 30-day cooldown and reserved list).
  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any (v_allowed)) then
      perform public.fail(422, 'Field not allowed: ' || v_key);
    end if;
  end loop;

  -- Friendly validation (the table CHECK constraints remain the hard backstop).
  if p_patch ? 'display_name' and char_length(coalesce(p_patch ->> 'display_name', '')) > 40 then
    perform public.fail(422, 'Display name must be 40 characters or fewer');
  end if;
  if p_patch ? 'bio' and char_length(coalesce(p_patch ->> 'bio', '')) > 160 then
    perform public.fail(422, 'Bio must be 160 characters or fewer');
  end if;
  if p_patch ? 'favorite_genres' and jsonb_typeof(p_patch -> 'favorite_genres') = 'array'
     and jsonb_array_length(p_patch -> 'favorite_genres') > 12 then
    perform public.fail(422, 'Pick at most 12 favourite genres');
  end if;
  if p_patch ? 'favorite_drama_ids' and jsonb_typeof(p_patch -> 'favorite_drama_ids') = 'array'
     and jsonb_array_length(p_patch -> 'favorite_drama_ids') > 12 then
    perform public.fail(422, 'Pick at most 12 favourite dramas');
  end if;
  if p_patch ? 'language' and (p_patch ->> 'language') not in ('en', 'ko') then
    perform public.fail(422, 'Unsupported language');
  end if;

  update public.profiles p set
    display_name       = case when p_patch ? 'display_name'       then p_patch ->> 'display_name' else p.display_name end,
    bio                = case when p_patch ? 'bio'                then coalesce(p_patch ->> 'bio', '') else p.bio end,
    avatar_key         = case when p_patch ? 'avatar_key'         then p_patch ->> 'avatar_key' else p.avatar_key end,
    favorite_genres    = case when p_patch ? 'favorite_genres'
                              then case when jsonb_typeof(p_patch -> 'favorite_genres') = 'array'
                                        then (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(p_patch -> 'favorite_genres') x)
                                        else '{}'::text[] end
                              else p.favorite_genres end,
    favorite_drama_ids = case when p_patch ? 'favorite_drama_ids'
                              then case when jsonb_typeof(p_patch -> 'favorite_drama_ids') = 'array'
                                        then (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(p_patch -> 'favorite_drama_ids') x)
                                        else '{}'::text[] end
                              else p.favorite_drama_ids end,
    is_private         = case when p_patch ? 'is_private' and jsonb_typeof(p_patch -> 'is_private') = 'boolean'
                              then (p_patch ->> 'is_private')::boolean else p.is_private end,
    -- shallow merge: a partial settings patch must not wipe the keys it did not mention
    prefs              = case when p_patch ? 'prefs' and jsonb_typeof(p_patch -> 'prefs') = 'object'
                              then p.prefs || (p_patch -> 'prefs') else p.prefs end,
    onboarding         = case when p_patch ? 'onboarding' and jsonb_typeof(p_patch -> 'onboarding') = 'object'
                              then p_patch -> 'onboarding' else p.onboarding end,
    language           = case when p_patch ? 'language' and (p_patch ->> 'language') in ('en', 'ko')
                              then p_patch ->> 'language' else p.language end,
    terms_version      = case when p_patch ? 'terms_version' and (p_patch ->> 'terms_version') ~ '^[0-9]+$'
                              then (p_patch ->> 'terms_version')::int else p.terms_version end
  where p.id = v_uid;

  if not found then perform public.fail(404, 'Profile not found'); end if;

  select to_jsonb(p) - 'fts' into v_row from public.profiles p where p.id = v_uid;
  return v_row;
end $$;

-- The view is read-only for clients from now on: all self-writes go through api.update_profile.
revoke update on api.profiles from anon, authenticated;

-- Only signed-in users (and the service role) may call the self-update RPC; anon has no identity to update.
revoke execute on function api.update_profile(jsonb) from public, anon;
grant execute on function api.update_profile(jsonb) to authenticated, service_role;
