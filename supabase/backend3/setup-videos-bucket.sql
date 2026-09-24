-- Run ONCE on Backend #3 (the video-fallback storage project) — NEVER on Backend #1.
--
-- Backend #3 is a dedicated object-storage Supabase project with the exact same video contract
-- as Backend #2: one public `videos` bucket (mp4 only, 100 MB per object) plus the `video-upload`
-- broker Edge Function (see supabase/functions/video-upload — deploy it there with the
-- HALLYU_SUPABASE_URL / HALLYU_SERVICE_ROLE_KEY secrets). The app redirects uploads here
-- automatically when Backend #2 is exhausted or unavailable.
--
-- How to run: Supabase Dashboard (Backend #3) → SQL editor → paste → Run. Or
-- `supabase db execute --project-ref <backend3-ref> -f supabase/backend3/setup-videos-bucket.sql`.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', true, 104857600, array['video/mp4'])
on conflict (id) do update
  set public = true,
      file_size_limit = 104857600,
      allowed_mime_types = array['video/mp4'];

-- Public playback (reads) for everyone. No INSERT/UPDATE policies for anon/authenticated on
-- purpose: the broker mints signed upload URLs with the service role, so bytes can only land
-- through it.
drop policy if exists "videos public read" on storage.objects;
create policy "videos public read"
  on storage.objects for select
  using (bucket_id = 'videos');
