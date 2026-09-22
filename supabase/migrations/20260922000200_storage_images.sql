-- Migration 20260922000200 (storage_images): interim image storage on Supabase Storage (bucket `media`), until Cloudflare R2 takes over.
-- Layout is identical to the future R2 layout: posts/{uid}/{ulid}.jpg, posts/{uid}/{ulid}_t.jpg, avatars/{uid}/{ulid}.jpg
-- so the switch later is: copy objects to R2 + change app_config.media_base. Video is NOT enabled here (no free egress).

-- >>> supabase-only
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- anyone can read (public bucket, unguessable names)
drop policy if exists "media public read" on storage.objects;
create policy "media public read" on storage.objects for select using (bucket_id = 'media');

-- members upload only into their own folder, only images, at most 30 objects per rolling day (60 for accounts older than a week)
drop policy if exists "media upload own folder" on storage.objects;
create policy "media upload own folder" on storage.objects for insert to authenticated
with check (
  bucket_id = 'media'
  and (storage.foldername(name))[1] in ('posts', 'avatars')
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) = 2
  and name ~ '\.(jpg|jpeg|png|webp)$'
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.state = 'active')
  and (select count(*) from storage.objects o
        where o.bucket_id = 'media' and (storage.foldername(o.name))[2] = (select auth.uid())::text and o.created_at > now() - interval '1 day')
      < case when exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.created_at < now() - interval '7 days') then 60 else 30 end
);

-- members may delete their own objects (the app does this when a draft is discarded)
drop policy if exists "media delete own" on storage.objects;
create policy "media delete own" on storage.objects for delete to authenticated
using (bucket_id = 'media' and (storage.foldername(name))[2] = (select auth.uid())::text);

-- the client builds media URLs as media_base + key
update public.app_config set value = to_jsonb('https://psmxekrmoltwabefgqpd.supabase.co/storage/v1/object/public/media/'::text) where key = 'media_base';
-- <<< supabase-only

-- feature flags read by the client (both environments)
insert into public.app_config (key, value) values ('video_uploads', 'false'), ('image_uploads', 'true')
on conflict (key) do update set value = excluded.value;
