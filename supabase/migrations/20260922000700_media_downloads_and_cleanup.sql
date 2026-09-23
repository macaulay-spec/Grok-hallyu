-- Migration 20260922000700 (media_downloads_and_cleanup): make the download ledger correct and
-- private, and make orphan-media cleanup cover every media column.
--
-- Why a follow-up to 0006 rather than an edit: 0006 may already be applied to the project, and a
-- migration that has run is never rewritten. Everything here is idempotent.

-- ---------------------------------------------------------------------------------------------
-- 1. Downloads ledger. 0006 declared it after the function that reads it; declare it first so the
--    ordering no longer matters, and give the (post, user) pair an index for the feed-page lookup.
-- ---------------------------------------------------------------------------------------------
create table if not exists public.downloads (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  media_key  text not null,
  post_id    uuid references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, media_key)
);
create index if not exists downloads_user on public.downloads (user_id, created_at desc);
create index if not exists downloads_post on public.downloads (post_id) where post_id is not null;

alter table public.downloads enable row level security;
drop policy if exists downloads_own on public.downloads;
create policy downloads_own on public.downloads for select using (user_id = (select auth.uid()));
-- Writes go through api.record_download (SECURITY DEFINER) only.
revoke insert, update, delete on public.downloads from anon, authenticated;

-- Deleting an account must not leave a list of which clips that person saved. account_anonymise
-- (0003) flips profiles.state to 'deleted'; follow it here so 0003 stays untouched.
create or replace function public.downloads_purge_on_delete() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.state = 'deleted' and old.state is distinct from 'deleted' then
    delete from public.downloads where user_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists profiles_downloads_purge on public.profiles;
create trigger profiles_downloads_purge after update of state on public.profiles
  for each row execute function public.downloads_purge_on_delete();

-- ---------------------------------------------------------------------------------------------
-- 2. record_download — rewritten. The 0006 version read the ledger before writing it, so two
--    concurrent calls both counted, and it bumped every post_media row sharing the key.
-- ---------------------------------------------------------------------------------------------
create or replace function api.record_download(p_key text, p_post_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := (select auth.uid());
  v_new boolean := false;
  v_count int;
begin
  if v_uid is null then perform public.fail(401, 'Sign in first'); end if;
  if p_key is null or char_length(p_key) > 512 then perform public.fail(422, 'Bad media key'); end if;
  if not exists (select 1 from public.profiles where id = v_uid and state = 'active') then
    perform public.fail(403, 'Account cannot download');
  end if;

  -- The key must be media this member is allowed to see: their own, or attached to a post that is
  -- visible to them. `visible_to` is the same predicate the feeds use.
  if not exists (
    select 1 from public.post_media pm
    join public.posts p on p.id = pm.post_id
    where (pm.key = p_key or pm.poster_key = p_key or pm.thumb_key = p_key)
      and p.state = 'active'
      and public.visible_to(p, v_uid)
    union all
    select 1 from public.media_uploads m where m.key = p_key and m.owner_id = v_uid and m.status = 'ready'
    limit 1
  ) then
    perform public.fail(404, 'Media not found');
  end if;

  -- Insert first: the primary key is the idempotency gate, so a retry or a double tap can only
  -- ever count once.
  insert into public.downloads (user_id, media_key, post_id) values (v_uid, p_key, p_post_id)
  on conflict (user_id, media_key) do nothing;
  get diagnostics v_count = row_count;
  v_new := v_count > 0;

  if v_new then
    if p_post_id is not null then
      update public.post_media set download_count = download_count + 1
      where post_id = p_post_id and (key = p_key or poster_key = p_key or thumb_key = p_key);
    else
      update public.post_media set download_count = download_count + 1
      where (key = p_key or poster_key = p_key or thumb_key = p_key)
        and post_id in (select id from public.posts where state = 'active');
    end if;
  end if;

  select coalesce(sum(download_count), 0)::int into v_count
  from public.post_media
  where (key = p_key or poster_key = p_key or thumb_key = p_key);

  return jsonb_build_object('ok', true, 'counted', v_new, 'count', coalesce(v_count, 0));
end $$;

grant execute on function api.record_download(text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. download_state — one round trip tells a feed page which of its media keys this member has
--    already saved, so the client can show the right saved state and skip duplicate downloads.
-- ---------------------------------------------------------------------------------------------
create or replace function api.download_state(p_keys text[]) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    jsonb_object_agg(d.media_key, true) filter (where d.media_key is not null),
    '{}'::jsonb
  )
  from public.downloads d
  where d.user_id = (select auth.uid())
    and d.media_key = any (coalesce(p_keys, '{}'))
$$;

grant execute on function api.download_state(text[]) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. orphan_media_sweep — rewritten. The 0006 version compared only media_uploads.key against
--    post_media.key, so posters and thumbnails were swept out from under live posts. It now keeps
--    anything referenced by any of the three key columns, and returns a stable shape.
-- ---------------------------------------------------------------------------------------------
create or replace function api.orphan_media_sweep(p_dry_run boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_keys text[];
  v_marked int := 0;
begin
  if not public.is_service_role() then perform public.fail(403, 'Forbidden'); end if;

  with referenced as (
    select distinct k
    from public.post_media pm
    join public.posts p on p.id = pm.post_id and p.state <> 'deleted'
    cross join lateral (values (pm.key), (pm.poster_key), (pm.thumb_key)) as t(k)
    where t.k is not null
    union
    select avatar_key from public.profiles where avatar_key is not null and state = 'active'
  )
  select coalesce(array_agg(m.key), '{}') into v_keys
  from public.media_uploads m
  where m.status = 'ready'
    and m.created_at < now() - interval '24 hours'   -- grace period for in-flight posts
    and not exists (select 1 from referenced r where r.k = m.key);

  if p_dry_run then
    return jsonb_build_object('dryRun', true, 'orphanCount', coalesce(array_length(v_keys, 1), 0), 'keys', to_jsonb(v_keys));
  end if;

  -- Marking fires media_enqueue_delete, which queues each key for the orphan-media-sweep worker.
  update public.media_uploads set status = 'deleted'
  where key = any (v_keys) and status = 'ready';
  get diagnostics v_marked = row_count;

  return jsonb_build_object('ok', true, 'marked', v_marked, 'keys', to_jsonb(v_keys));
end $$;

revoke execute on function api.orphan_media_sweep(boolean) from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. Branding truth. Every video post carries a poster, and the poster is where the Hallyu mark is
--    burned in (on-device, before upload — see lib/watermark.ts). The ledger records it so nothing
--    in the product claims a burn-in that did not happen.
-- ---------------------------------------------------------------------------------------------
comment on column public.media_uploads.watermarked is
  'True when the stored object itself carries the Hallyu brand mark. Burned into posters on-device before upload; video tracks are not re-encoded (the Edge Runtime has no transcoder).';
