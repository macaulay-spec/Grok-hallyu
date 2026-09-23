-- Migration 20260922000600 (video_watermark_and_downloads):
--   1. Adds a `watermarked` flag to media_uploads so the client knows whether the video
--      already carries the Hallyu brand mark (burned into the file, not a UI overlay).
--   2. Adds a `download_count` column to post_media so we can gate / track downloads.
--   3. Adds an RPC `api.record_download` that increments the counter idempotently
--      (keyed by post_media key + caller) and returns the new count — the client calls
--      it right before it starts the actual byte transfer.
--   4. Adds an RPC `api.orphan_media_sweep` (service role only) that the nightly
--      retention job can call to delete media objects no post references.

-- ---------------------------------------------------------------------------------------------
-- 1. media_uploads: watermark flag
-- ---------------------------------------------------------------------------------------------
alter table public.media_uploads
  add column if not exists watermarked boolean not null default false;

-- ---------------------------------------------------------------------------------------------
-- 2. post_media: download counter
-- ---------------------------------------------------------------------------------------------
alter table public.post_media
  add column if not exists download_count int not null default 0;

-- ---------------------------------------------------------------------------------------------
-- 3. RPC: record_download (idempotent increment)
-- ---------------------------------------------------------------------------------------------
create or replace function api.record_download(p_key text, p_post_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := (select auth.uid());
  v_count int;
begin
  if v_uid is null then perform public.fail(401, 'Sign in first'); end if;

  -- Must be a key we know about and that belongs to the caller (or is public).
  if not exists (
    select 1 from public.media_uploads m
    where m.key = p_key and (m.owner_id = v_uid or m.kind in ('video', 'image'))
  ) then
    perform public.fail(404, 'Media not found');
  end if;

  -- Idempotent: only count the first download per user per key.
  update public.post_media pm
     set download_count = download_count + 1
  where pm.key = p_key
    and not exists (
      select 1 from public.downloads d
      where d.user_id = v_uid and d.media_key = p_key
    )
  returning pm.download_count into v_count;

  if v_count is null then
    -- Already downloaded by this user; return current count.
    select pm.download_count into v_count
    from public.post_media pm
    where pm.key = p_key;
  end if;

  insert into public.downloads (user_id, media_key, post_id)
  values (v_uid, p_key, p_post_id)
  on conflict (user_id, media_key) do nothing;

  return jsonb_build_object('ok', true, 'count', coalesce(v_count, 0));
end $$;

-- ---------------------------------------------------------------------------------------------
-- 4. RPC: orphan_media_sweep (service role only)
-- ---------------------------------------------------------------------------------------------
create or replace function api.orphan_media_sweep(p_dry_run boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_keys text[];
  v_deleted int := 0;
begin
  if not public.is_service_role() then perform public.fail(403, 'Forbidden'); end if;

  -- Keys that are still referenced by an active post's post_media row.
  with referenced as (
    select distinct pm.key from public.post_media pm
    join public.posts p on p.id = pm.post_id and p.state <> 'deleted'
  )
  select coalesce(array_agg(m.key), '{}') into v_keys
  from public.media_uploads m
  where m.status = 'ready'
    and m.key not in (select key from referenced)
    and m.created_at < now() - interval '24 hours';   -- grace period for in-flight posts

  if p_dry_run then
    return jsonb_build_object('dryRun', true, 'orphanCount', coalesce(array_length(v_keys, 0), 0), 'keys', v_keys);
  end if;

  -- Mark for deletion; the media_delete queue + worker handles the actual storage remove.
  update public.media_uploads set status = 'deleted' where key = any (v_keys) and status = 'ready';
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('ok', true, 'marked', v_deleted, 'keys', v_keys);
end $$;

-- ---------------------------------------------------------------------------------------------
-- 5. Downloads ledger table (idempotency for record_download)
-- ---------------------------------------------------------------------------------------------
create table if not exists public.downloads (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  media_key  text not null,
  post_id    uuid references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, media_key)
);

-- RLS: only the downloader can see their own rows; writes go through the SECURITY DEFINER RPC.
alter table public.downloads enable row level security;
create policy downloads_own on public.downloads for select using (user_id = (select auth.uid()));

-- Revoke direct writes; record_download is the only path.
revoke insert, update, delete on public.downloads from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------------------------------
grant execute on function api.record_download(text, uuid) to anon, authenticated;
revoke execute on function api.orphan_media_sweep(boolean) from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 7. Nightly orphan-media sweep (pg_cron)
-- ---------------------------------------------------------------------------------------------
-- >>> supabase-only
select cron.schedule('orphan-media-sweep', '17 4 * * *', $$select public.call_edge('orphan-media-sweep')$$);
-- <<< supabase-only