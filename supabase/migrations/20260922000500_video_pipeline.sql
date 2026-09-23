-- Migration 20260922000500 (video_pipeline): turn video posting on.
-- Video bytes live on a dedicated storage project (public `videos` bucket + `video-upload`
-- broker Edge Function); this database keeps identity, quotas and the media ledger.
-- See docs/backend/10-video-storage.md.

update public.app_config set value = 'true' where key = 'video_uploads';

-- Quota snapshot used by the composer UI and re-checked by the video-storage broker through
-- the caller's own session (RLS applies). Mirrors the caps in api.media_reserve():
-- 5 uploads/day for accounts younger than 24 h (2 videos), 30/day after (12 videos), 100 MB cap.
create or replace function api.upload_quota() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := (select auth.uid());
  v_age interval;
  v_day int;
  v_videos int;
  v_new boolean;
begin
  if v_uid is null then perform public.fail(401, 'Sign in first'); end if;
  select now() - created_at into v_age from public.profiles where id = v_uid and state = 'active';
  if v_age is null then perform public.fail(403, 'Account cannot upload'); end if;
  v_new := v_age < interval '24 hours';
  select count(*), count(*) filter (where kind = 'video') into v_day, v_videos
    from public.media_uploads
    where owner_id = v_uid and created_at > now() - interval '1 day' and status <> 'failed';
  return jsonb_build_object(
    'uploads', v_day,
    'cap', case when v_new then 5 else 30 end,
    'videos', v_videos,
    'video_cap', case when v_new then 2 else 12 end,
    'max_bytes', 100 * 1024 * 1024,
    'image_max_bytes', 8 * 1024 * 1024
  );
end $$;

-- Ledger a finished video upload. Called by the app (authenticated) once the bytes are stored;
-- create_post's media_ready() then accepts the key for post_media.
create or replace function api.register_media(
  p_key text,
  p_kind text,
  p_mime text,
  p_bytes bigint,
  p_width int default null,
  p_height int default null,
  p_duration_ms int default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := (select auth.uid());
  v_age interval;
  v_day int;
  v_videos int;
begin
  if v_uid is null then perform public.fail(401, 'Sign in first'); end if;
  if not exists (select 1 from public.profiles where id = v_uid and state = 'active') then
    perform public.fail(403, 'Account cannot upload');
  end if;
  if p_kind is distinct from 'video' or p_mime is distinct from 'video/mp4' then
    perform public.fail(422, 'Only mp4 video is accepted here');
  end if;
  -- Keys must sit in the caller's own folder; ids are Crockford-ish [0-9A-Z]{26} (B32 subset).
  if p_key !~ ('^video/' || v_uid::text || '/[0-9A-Z]{26}\.mp4$') then
    perform public.fail(422, 'Bad media key');
  end if;
  if p_bytes is null or p_bytes <= 0 or p_bytes > 100 * 1024 * 1024 then
    perform public.fail(413, 'Videos are up to 100 MB');
  end if;

  -- Idempotent: sync-engine retries re-register the same deterministic object key.
  if exists (select 1 from public.media_uploads where key = p_key and owner_id = v_uid and status = 'ready') then
    return;
  end if;

  select now() - created_at into v_age from public.profiles where id = v_uid;
  select count(*), count(*) filter (where kind = 'video') into v_day, v_videos
    from public.media_uploads
    where owner_id = v_uid and created_at > now() - interval '1 day' and status <> 'failed';
  if v_age < interval '24 hours' and (v_day >= 5 or v_videos >= 2) then
    perform public.fail(429, 'New accounts can upload a few items per day');
  end if;
  if v_day >= 30 or v_videos >= 12 then
    perform public.fail(429, 'Daily upload limit reached');
  end if;

  insert into public.media_uploads (key, owner_id, kind, mime, bytes_declared, bytes, width, height, duration_ms, status, ready_at)
  values (p_key, v_uid, 'video', 'video/mp4', p_bytes, p_bytes, p_width, p_height, p_duration_ms, 'ready', now())
  on conflict (key) do update set bytes = excluded.bytes, status = 'ready', ready_at = now();
end $$;
