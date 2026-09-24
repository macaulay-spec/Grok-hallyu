-- Migration 20260922001100 (backend3_video): accept video keys that live on Backend #3.
--
-- Backend #2 (video storage) remains the primary project. When it is exhausted or unavailable,
-- the app redirects the upload to Backend #3 and ledgers the key with a `b3/` prefix
-- (`b3/video/{uid}/{ulid}.mp4`). This migration teaches register_media that key shape so the
-- ledger accepts it; playback, downloads and purge sweeps already route on the prefix.
-- No data changes — idempotent re-issue of the function with a widened key pattern.

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
  -- `b3/`-prefixed keys live on the Backend #3 storage project (video fallback) — the same shape
  -- underneath the prefix.
  if p_key !~ ('^(b3/)?video/' || v_uid::text || '/[0-9A-Z]{26}\.mp4$') then
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
