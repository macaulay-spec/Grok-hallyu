-- Local reproduction of the failing checks from the live verification suite
-- (run 37188183939, scripts/verify-backend.mjs). Each block prints CHECK <name>: OK/ERROR.
-- Applied to the database built by scripts/localdb/apply.mjs.
--
-- Role + JWT emulation mirrors PostgREST: `set_config('role', …)` is SET ROLE, and the
-- auth.uid()/auth.role() stubs read request.jwt.claim.* the same way Supabase's do.

\set ON_ERROR_STOP off
\pset pager off

-- ── Setup (superuser): members, titles ───────────────────────────────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'alice@verification.test', '{"handle":"alicever","full_name":"Verification Alice"}'),
  ('22222222-2222-4222-8222-222222222222', 'bob@verification.test',   '{"handle":"bobver","full_name":"Verification Bob"}')
on conflict (id) do nothing;

insert into public.titles (id, provider_id, external_id, media_type, world, title, year, status, episode_count, season_count, genres, first_air_date, last_air_date)
values
  ('00000000-0000-4000-8000-000000000001', 'tmdb', 'verify-airing', 'tv', 'kdrama', 'Verification Airing', 2026, 'airing', 16, 1, array['Romance','Drama'], '2026-09-01', null),
  ('00000000-0000-4000-8000-000000000002', 'tmdb', 'verify-classic', 'tv', 'kdrama', 'Verification Classic', 2004, 'completed', 16, 1, array['Romance'], '2004-09-01', '2005-03-01'),
  ('00000000-0000-4000-8000-000000000003', 'tmdb', 'verify-test', 'tv', 'kdrama', 'Verification Title', 2026, 'airing', 16, 1, array['Drama'], null, null)
on conflict (id) do nothing;

-- ── 1. Member creates a post (live: infinite recursion detected in policy for relation posts) ─
do $$
declare v_id uuid;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  insert into public.posts (author_id, type, title, body, kind, spoiler, world, title_id, hashtags)
  values ('11111111-1111-4111-8111-111111111111', 'discussion', 'Verification post',
          'This post exists to prove the database works.', 'general', 'none', 'kdrama',
          '00000000-0000-4000-8000-000000000003', array['verification'])
  returning id into v_id;
  raise notice 'CHECK post-insert: OK (%)', v_id;
exception when others then
  raise notice 'CHECK post-insert: ERROR %', sqlerrm;
end $$;

-- ── 2. Direct reaction inserts (live: violates reactions_exactly_one_target — cascade) ────────
do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  insert into public.reactions (user_id, kind, post_id)
  select '22222222-2222-4222-8222-222222222222', 'loved', id from public.posts
  where author_id = '11111111-1111-4111-8111-111111111111' and state = 'active' limit 1;
  raise notice 'CHECK reaction-insert: OK';
exception when others then
  raise notice 'CHECK reaction-insert: ERROR %', sqlerrm;
end $$;

-- ── 3. Comment insert ────────────────────────────────────────────────────────────────────────
do $$
declare v_id uuid;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  insert into public.comments (post_id, author_id, body)
  select id, '11111111-1111-4111-8111-111111111111', 'Verification comment.'
  from public.posts where author_id = '11111111-1111-4111-8111-111111111111' and state = 'active' limit 1
  returning id into v_id;
  raise notice 'CHECK comment-insert: OK (%)', v_id;
exception when others then
  raise notice 'CHECK comment-insert: ERROR %', sqlerrm;
end $$;

-- ── 4. toggle_reaction set → swap → clear ────────────────────────────────────────────────────
do $$
declare v_post uuid; v_kind text;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  select id into v_post from public.posts where author_id = '11111111-1111-4111-8111-111111111111' and state = 'active' limit 1;
  if v_post is null then raise notice 'CHECK toggle-reaction: ERROR no post to react to'; return; end if;
  perform public.toggle_reaction('post', v_post, 'cried');
  perform public.toggle_reaction('post', v_post, 'laughed');
  perform public.toggle_reaction('post', v_post, 'laughed');
  raise notice 'CHECK toggle-reaction: OK';
exception when others then
  raise notice 'CHECK toggle-reaction: ERROR %', sqlerrm;
end $$;

-- ── 5. toggle_save ───────────────────────────────────────────────────────────────────────────
do $$
declare v_post uuid; v_on boolean;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  select id into v_post from public.posts where author_id = '11111111-1111-4111-8111-111111111111' and state = 'active' limit 1;
  if v_post is null then raise notice 'CHECK toggle-save: ERROR no post to save'; return; end if;
  v_on := public.toggle_save(v_post);
  v_on := public.toggle_save(v_post);
  raise notice 'CHECK toggle-save: OK (saved=%)', v_on;
exception when others then
  raise notice 'CHECK toggle-save: ERROR %', sqlerrm;
end $$;

-- ── 6. record_share ──────────────────────────────────────────────────────────────────────────
do $$
declare v_post uuid; v_json jsonb;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  select id into v_post from public.posts where author_id = '11111111-1111-4111-8111-111111111111' and state = 'active' limit 1;
  if v_post is null then raise notice 'CHECK record-share: ERROR no post to share'; return; end if;
  v_json := public.record_share(v_post, 'link');
  v_json := public.record_share(v_post, 'link');
  raise notice 'CHECK record-share: OK (%)', v_json;
exception when others then
  raise notice 'CHECK record-share: ERROR %', sqlerrm;
end $$;

-- ── 7. Onboarding then recommended_titles (live: operator does not exist: text[] & text[]) ────
do $$
declare r record; n integer := 0;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform public.complete_onboarding(array['kdrama','anime']::text[], array['Romance']::text[], 4);
  for r in select id from public.recommended_titles(50) loop
    n := n + 1;
  end loop;
  raise notice 'CHECK recommended-titles: OK (% rows)', n;
exception when others then
  raise notice 'CHECK recommended-titles: ERROR %', sqlerrm;
end $$;

-- ── 8. enqueue_notification twice + coalesce (live: invalid input syntax for type integer: t) ─
do $$
declare v1 uuid; v2 uuid; v_rows integer; v_coalesce integer;
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  v1 := public.enqueue_notification('11111111-1111-4111-8111-111111111111', 'episode_aired', 'drama',
          'verify-dedupe-local', '{}', null, null, '00000000-0000-4000-8000-000000000001', null, null,
          null, 'Verification show', 'Episode 1 is out.', null, null, null);
  v2 := public.enqueue_notification('11111111-1111-4111-8111-111111111111', 'episode_aired', 'drama',
          'verify-dedupe-local', '{}', null, null, '00000000-0000-4000-8000-000000000001', null, null,
          null, 'Verification show', 'Episode 1 is out.', null, null, null);
  select count(*) into v_rows from public.notifications where dedupe_key = 'verify-dedupe-local';
  select coalesce_count into v_coalesce from public.notifications where dedupe_key = 'verify-dedupe-local';
  raise notice 'CHECK enqueue: OK (same=%, rows=%, coalesce=%)', v1 = v2, v_rows, v_coalesce;
exception when others then
  raise notice 'CHECK enqueue: ERROR %', sqlerrm;
end $$;

-- ── 9. Push token + fanout (live: null notification id cascade) ──────────────────────────────
do $$
declare v_not uuid; v_count integer; v_again integer;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform public.register_push_token('ExponentPushToken[verification-local]', 'android', 'verification device');
  -- service-role calls carry no user claim at all (that is what auth.uid() being null means)
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  select id into v_not from public.notifications where dedupe_key = 'verify-dedupe-local';
  if v_not is null then
    raise notice 'CHECK fanout: ERROR no notification row to fan out';
    return;
  end if;
  v_count := public.fanout_notification(v_not);
  v_again := public.fanout_notification(v_not);
  raise notice 'CHECK fanout: OK (first=%, again=%)', v_count, v_again;
exception when others then
  raise notice 'CHECK fanout: ERROR %', sqlerrm;
end $$;

-- ── 10. Catalog people ingest (live: column reference "external_id" is ambiguous) ────────────
do $$
declare v_written integer;
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  v_written := public.catalog_upsert_title_people(
    '00000000-0000-4000-8000-000000000003',
    '[{"external_id":"12345","name":"Verification Actor","job":"actor","character":"Lead","order_index":0}]'::jsonb
  );
  raise notice 'CHECK title-people: OK (written=%)', v_written;
exception when others then
  raise notice 'CHECK title-people: ERROR %', sqlerrm;
end $$;

-- ── 11. join_community (live: column "status" is of type membership_status but expression text) ─
do $$
declare v_comm uuid; v_json jsonb;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  select id into v_comm from public.communities order by id limit 1;
  v_json := public.join_community(v_comm, true);
  v_json := public.join_community(v_comm, true);
  raise notice 'CHECK join-community: OK (%)', v_json;
exception when others then
  raise notice 'CHECK join-community: ERROR %', sqlerrm;
end $$;

-- ── 12. begin_media_upload in own folder (live: column "state" is of type media_state …) ─────
do $$
declare v_id uuid;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  v_id := public.begin_media_upload('u/11111111-1111-4111-8111-111111111111/posts/verification.png', 'image');
  raise notice 'CHECK begin-media-upload: OK (%)', v_id;
exception when others then
  raise notice 'CHECK begin-media-upload: ERROR %', sqlerrm;
end $$;

-- ── 13. feed_page (live: syntax error at or near "if") ───────────────────────────────────────
do $$
declare v jsonb;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  v := public.feed_page('latest', null, null, 20, null, null);
  raise notice 'CHECK feed-page: OK (items=%)', jsonb_array_length(coalesce(v -> 'items', '[]'::jsonb));
exception when others then
  raise notice 'CHECK feed-page: ERROR %', sqlerrm;
end $$;

-- ── 14. search_suggestions (live: syntax error at or near "union") ───────────────────────────
do $$
declare n integer := 0; r record;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  for r in select * from public.search_suggestions('ver', 10) loop
    n := n + 1;
  end loop;
  raise notice 'CHECK search-suggestions: OK (% rows)', n;
exception when others then
  raise notice 'CHECK search-suggestions: ERROR %', sqlerrm;
end $$;

-- ── 15. Trending excludes the long-finished classic ──────────────────────────────────────────
do $$
declare r record; v_ids text[] := '{}'; v_airing text[] := '{}';
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform public.refresh_trending('kdrama');
  for r in select id from public.trending_titles(p_world => 'kdrama', p_limit => 50) loop
    v_ids := v_ids || r.id::text;
  end loop;
  for r in select id from public.airing_titles('kdrama', 50) loop
    v_airing := v_airing || r.id::text;
  end loop;
  if '00000000-0000-4000-8000-000000000002' = any(v_ids) then
    raise notice 'CHECK trending-excludes-classic: FAIL classic in trending (% total)', array_length(v_ids, 1);
  elsif not ('00000000-0000-4000-8000-000000000001' = any(v_airing)) then
    raise notice 'CHECK trending-excludes-classic: FAIL airing title missing from airing_titles';
  else
    raise notice 'CHECK trending-excludes-classic: OK (trending=%, airing=%)', array_length(v_ids, 1), array_length(v_airing, 1);
  end if;
exception when others then
  raise notice 'CHECK trending-excludes-classic: ERROR %', sqlerrm;
end $$;

-- ── 16. job_claim: claimed once, second caller does not re-claim ─────────────────────────────
do $$
declare v_id uuid; v_claimed boolean; v_attempt integer; v_id2 uuid; v_claimed2 boolean;
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  select id, did_claim, attempt into v_id, v_claimed, v_attempt from public.job_claim('verification.probe', 'local-1');
  select id, did_claim into v_id2, v_claimed2 from public.job_claim('verification.probe', 'local-1');
  raise notice 'CHECK job-claim: OK (first id=%, claimed=%, attempt=%; second claimed=%)',
    v_id, v_claimed, v_attempt, v_claimed2;
exception when others then
  raise notice 'CHECK job-claim: ERROR %', sqlerrm;
end $$;

-- ── 17. get_bootstrap for the member (the connection gate RPC) ───────────────────────────────
do $$
declare v jsonb;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  v := public.get_bootstrap();
  raise notice 'CHECK get-bootstrap: OK (profile=%)', v -> 'profile' ->> 'handle';
exception when others then
  raise notice 'CHECK get-bootstrap: ERROR %', sqlerrm;
end $$;

-- ── 18. A second member reading the first member's post (RLS select path) ────────────────────
do $$
declare n integer := 0;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  select count(*) into n from public.posts where state = 'active';
  raise notice 'CHECK posts-select-as-other: OK (% visible)', n;
exception when others then
  raise notice 'CHECK posts-select-as-other: ERROR %', sqlerrm;
end $$;

-- ── 19. Profile read by another member (profiles_select_visible → posts path) ────────────────
do $$
declare n integer := 0;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  select count(*) into n from public.profiles;
  raise notice 'CHECK profiles-select: OK (% visible)', n;
exception when others then
  raise notice 'CHECK profiles-select: ERROR %', sqlerrm;
end $$;
