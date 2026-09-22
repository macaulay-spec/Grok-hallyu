-- Migration 20260922000000 (legacy_cleanup): remove the legacy demo schema (the old "paste into SQL Editor" setup with 8 demo users / 16 dramas)
-- if it was ever applied to this project. Detection: the legacy `profiles` table has a `username` column; the new
-- schema uses `handle`. Nothing happens on a clean project. Demo data is exactly what the owner asked to remove.
do $$
declare legacy boolean;
begin
  select exists (
    select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'username'
  ) into legacy;

  -- the legacy trigger name collides with the new one; drop it regardless (0001 recreates it)
  if to_regclass('auth.users') is not null then
    execute 'drop trigger if exists on_auth_user_created on auth.users';
  end if;

  if not legacy then
    raise notice 'No legacy demo schema found';
    return;
  end if;

  raise notice 'Legacy demo schema detected — dropping demo tables and helpers';
  drop table if exists public.reports cascade;
  drop table if exists public.notifications cascade;
  drop table if exists public.follows_dramas cascade;
  drop table if exists public.follows_users cascade;
  drop table if exists public.saves cascade;
  drop table if exists public.likes cascade;
  drop table if exists public.comments cascade;
  drop table if exists public.post_dramas cascade;
  drop table if exists public.posts cascade;
  drop table if exists public.episodes cascade;
  drop table if exists public.dramas cascade;
  drop table if exists public.profiles cascade;
  drop function if exists public.handle_new_user() cascade;
  drop function if exists public.notify_like() cascade;
  drop function if exists public.notify_comment() cascade;
  drop function if exists public.notify_follow() cascade;

  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists "post media public read" on storage.objects';
    execute 'drop policy if exists "post media own upload" on storage.objects';
    execute 'drop policy if exists "post media own delete" on storage.objects';
    execute 'drop policy if exists "avatars public read" on storage.objects';
    execute 'drop policy if exists "avatars own upload" on storage.objects';
    execute 'drop policy if exists "avatars own update" on storage.objects';
    -- legacy buckets are removed only when empty
    execute 'delete from storage.buckets b where b.id in (''post-media'', ''avatars'') and not exists (select 1 from storage.objects o where o.bucket_id = b.id)';
  end if;
end $$;
