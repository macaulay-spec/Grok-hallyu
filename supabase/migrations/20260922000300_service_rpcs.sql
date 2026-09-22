-- Migration 20260922000300 (service_rpcs): RPCs used only by Edge Functions (service role). Everything the functions need lives behind
-- schema `api`, so PostgREST never has to expose `public`.

-- ---------------------------------------------------------------------------------------------
-- Catalog upsert (ensure-catalog). Payload:
-- { drama: { id, tmdbId, title, originalTitle, posterPath, backdropPath, genres[], status, firstAirDate, network, overview,
--            seasonCount, episodeCount, payload{} },
--   actors: [{ id, tmdbId, name, profilePath }], cast: [{ actorId, character, ord }],
--   episodes: [{ season, number, title, airAt, runtime, overview }] }
-- or { actor: { id, tmdbId, name, profilePath } }
-- Counters (follower_count, post_count, …) are never touched.
-- ---------------------------------------------------------------------------------------------
create or replace function api.catalog_upsert(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare d jsonb := p -> 'drama'; a jsonb; v_id text; v_eps int := 0;
begin
  if not public.is_service_role() then perform public.fail(403, 'Forbidden'); end if;

  if p ? 'actor' then
    a := p -> 'actor';
    insert into public.catalog_actors (id, tmdb_id, name, profile_path, updated_at)
    values (a ->> 'id', (a ->> 'tmdbId')::int, a ->> 'name', a ->> 'profilePath', now())
    on conflict (id) do update set name = excluded.name, profile_path = excluded.profile_path, updated_at = now();
    return jsonb_build_object('id', a ->> 'id');
  end if;

  if d is null or d ->> 'id' is null or d ->> 'tmdbId' is null or d ->> 'title' is null then perform public.fail(422, 'drama.id, tmdbId and title are required'); end if;
  v_id := d ->> 'id';

  insert into public.catalog_dramas (id, tmdb_id, title, original_title, poster_path, backdrop_path, genres, status, first_air_date, network, overview,
                                     season_count, episode_count, payload, updated_at)
  values (v_id, (d ->> 'tmdbId')::int, d ->> 'title', d ->> 'originalTitle', d ->> 'posterPath', d ->> 'backdropPath',
          coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(d -> 'genres', '[]'::jsonb)) x), '{}'),
          d ->> 'status', (d ->> 'firstAirDate')::date, d ->> 'network', d ->> 'overview',
          coalesce((d ->> 'seasonCount')::int, 1), coalesce((d ->> 'episodeCount')::int, 0), coalesce(d -> 'payload', '{}'::jsonb), now())
  on conflict (id) do update set
    title = excluded.title, original_title = excluded.original_title, poster_path = excluded.poster_path, backdrop_path = excluded.backdrop_path,
    genres = excluded.genres, status = excluded.status, first_air_date = excluded.first_air_date, network = excluded.network, overview = excluded.overview,
    season_count = excluded.season_count, episode_count = excluded.episode_count, payload = excluded.payload, updated_at = now();

  if jsonb_typeof(p -> 'actors') = 'array' then
    insert into public.catalog_actors (id, tmdb_id, name, profile_path, updated_at)
    select x ->> 'id', (x ->> 'tmdbId')::int, x ->> 'name', x ->> 'profilePath', now()
    from jsonb_array_elements(p -> 'actors') x
    where x ->> 'id' is not null and x ->> 'tmdbId' is not null and x ->> 'name' is not null
    on conflict (id) do update set name = excluded.name, profile_path = coalesce(excluded.profile_path, public.catalog_actors.profile_path), updated_at = now();
  end if;

  if jsonb_typeof(p -> 'cast') = 'array' then
    delete from public.catalog_cast where drama_id = v_id;
    insert into public.catalog_cast (drama_id, actor_id, character, ord)
    select v_id, x ->> 'actorId', x ->> 'character', coalesce((x ->> 'ord')::int, 0)
    from jsonb_array_elements(p -> 'cast') x
    where exists (select 1 from public.catalog_actors ca where ca.id = x ->> 'actorId')
    on conflict (drama_id, actor_id) do update set character = excluded.character, ord = excluded.ord;
  end if;

  if jsonb_typeof(p -> 'episodes') = 'array' then
    insert into public.catalog_episodes (drama_id, season, number, title, air_at, runtime, overview)
    select v_id, (x ->> 'season')::int, (x ->> 'number')::int, x ->> 'title', (x ->> 'airAt')::timestamptz, (x ->> 'runtime')::int, x ->> 'overview'
    from jsonb_array_elements(p -> 'episodes') x
    where x ->> 'season' is not null and x ->> 'number' is not null
    on conflict (drama_id, season, number) do update set title = excluded.title, air_at = excluded.air_at, runtime = excluded.runtime, overview = excluded.overview;
    get diagnostics v_eps = row_count;
  end if;

  return jsonb_build_object('id', v_id, 'episodes', v_eps);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Account deletion (delete-account). Anonymises the profile, soft-deletes content, drops the social graph and
-- devices, writes the audit row. The profile row itself is swept 30 days later by retention_sweep.
-- Returns the media keys the function should delete from storage.
-- ---------------------------------------------------------------------------------------------
create or replace function api.account_anonymise(p_uid uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_keys text[];
begin
  if not public.is_service_role() then perform public.fail(403, 'Forbidden'); end if;
  if not exists (select 1 from public.profiles where id = p_uid) then return jsonb_build_object('ok', true, 'keys', '[]'::jsonb); end if;

  select coalesce(array_agg(k), '{}') into v_keys from (
    select avatar_key as k from public.profiles where id = p_uid and avatar_key is not null
    union select m.key from public.post_media m join public.posts po on po.id = m.post_id where po.author_id = p_uid
    union select m.thumb_key from public.post_media m join public.posts po on po.id = m.post_id where po.author_id = p_uid and m.thumb_key is not null
    union select m.poster_key from public.post_media m join public.posts po on po.id = m.post_id where po.author_id = p_uid and m.poster_key is not null
  ) s;

  update public.posts set state = 'deleted', deleted_at = coalesce(deleted_at, now()) where author_id = p_uid and state <> 'deleted';
  update public.comments set state = 'deleted' where author_id = p_uid and state <> 'deleted';
  delete from public.reactions where user_id = p_uid;
  delete from public.saves where user_id = p_uid;
  delete from public.follows where follower_id = p_uid or (target_type = 'user' and target_id = p_uid::text);
  delete from public.blocks where blocker_id = p_uid or blocked_id = p_uid;
  delete from public.mutes where user_id = p_uid;
  delete from public.drama_notify where user_id = p_uid;
  delete from public.watchlist_items where user_id = p_uid;
  delete from public.collection_items where collection_id in (select id from public.collections where owner_id = p_uid);
  delete from public.collections where owner_id = p_uid;
  delete from public.push_tokens where user_id = p_uid;
  delete from public.notifications where user_id = p_uid;
  update public.media_uploads set status = 'deleted' where owner_id = p_uid and status <> 'deleted';

  update public.profiles
     set handle = ('deleted_' || left(md5(id::text), 8))::citext, display_name = 'Deleted account', bio = '', avatar_key = null,
         favorite_genres = '{}', favorite_drama_ids = '{}', prefs = '{}'::jsonb, onboarding = '{}'::jsonb, state = 'deleted', updated_at = now()
   where id = p_uid;

  insert into public.audit_log (actor_id, action, target_type, target_id) values (p_uid, 'account.delete', 'profile', p_uid::text);
  return jsonb_build_object('ok', true, 'keys', to_jsonb(v_keys));
end $$;

revoke execute on function api.catalog_upsert(jsonb) from anon, authenticated;
revoke execute on function api.account_anonymise(uuid) from anon, authenticated;
