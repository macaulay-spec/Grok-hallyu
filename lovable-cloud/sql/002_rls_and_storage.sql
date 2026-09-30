-- =============================================================================
-- HALLYU — LOVABLE CLOUD BACKEND
-- 002_rls_and_storage.sql
-- Row-Level Security (RLS) policies & Storage Buckets
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enable RLS on all tables
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.dramas enable row level security;
alter table public.episodes enable row level security;
alter table public.actors enable row level security;
alter table public.drama_cast enable row level security;
alter table public.user_follows enable row level security;
alter table public.drama_follows enable row level security;
alter table public.actor_follows enable row level security;
alter table public.user_blocks enable row level security;
alter table public.user_mutes enable row level security;
alter table public.drama_mutes enable row level security;
alter table public.watchlist_items enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.post_reactions enable row level security;
alter table public.comment_reactions enable row level security;
alter table public.saved_posts enable row level security;
alter table public.collections enable row level security;
alter table public.collection_items enable row level security;
alter table public.collection_follows enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.media_assets enable row level security;

-- -----------------------------------------------------------------------------
-- 2. Profiles & Preferences
-- -----------------------------------------------------------------------------
create policy "profiles_select_public"
  on public.profiles for select
  using (true);

create policy "profiles_insert_self"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "user_preferences_all_self"
  on public.user_preferences for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 3. Catalog (Dramas, Episodes, Actors, Cast)
-- Publicly readable (including Guest Mode); authenticated users can upsert
-- catalog entries adopted from TMDB.
-- -----------------------------------------------------------------------------
create policy "dramas_select_public"
  on public.dramas for select
  using (true);

create policy "dramas_upsert_authenticated"
  on public.dramas for insert
  to authenticated
  with check (true);

create policy "dramas_update_authenticated"
  on public.dramas for update
  to authenticated
  using (true)
  with check (true);

create policy "episodes_select_public"
  on public.episodes for select
  using (true);

create policy "episodes_upsert_authenticated"
  on public.episodes for insert
  to authenticated
  with check (true);

create policy "episodes_update_authenticated"
  on public.episodes for update
  to authenticated
  using (true)
  with check (true);

create policy "actors_select_public"
  on public.actors for select
  using (true);

create policy "actors_upsert_authenticated"
  on public.actors for insert
  to authenticated
  with check (true);

create policy "actors_update_authenticated"
  on public.actors for update
  to authenticated
  using (true)
  with check (true);

create policy "drama_cast_select_public"
  on public.drama_cast for select
  using (true);

create policy "drama_cast_upsert_authenticated"
  on public.drama_cast for insert
  to authenticated
  with check (true);

-- -----------------------------------------------------------------------------
-- 4. Social Graph (Follows, Blocks, Mutes)
-- -----------------------------------------------------------------------------
create policy "user_follows_select_public"
  on public.user_follows for select
  using (true);

create policy "user_follows_write_self"
  on public.user_follows for all
  to authenticated
  using (auth.uid() = follower_id)
  with check (auth.uid() = follower_id);

create policy "drama_follows_select_public"
  on public.drama_follows for select
  using (true);

create policy "drama_follows_write_self"
  on public.drama_follows for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "actor_follows_select_public"
  on public.actor_follows for select
  using (true);

create policy "actor_follows_write_self"
  on public.actor_follows for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_blocks_all_self"
  on public.user_blocks for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_mutes_all_self"
  on public.user_mutes for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "drama_mutes_all_self"
  on public.drama_mutes for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 5. Watchlist
-- Owner has full read/write; public profiles allow reading currently-watching
-- items (without private notes).
-- -----------------------------------------------------------------------------
create policy "watchlist_select_owner_or_public"
  on public.watchlist_items for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.profiles p
      where p.id = watchlist_items.user_id and p.is_private = false
    )
  );

create policy "watchlist_write_self"
  on public.watchlist_items for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 6. Posts, Comments, Reactions & Saved Bookmarks
-- -----------------------------------------------------------------------------
create policy "posts_select_visible"
  on public.posts for select
  using (
    state = 'active'
    or auth.uid() = author_id
  );

create policy "posts_insert_self"
  on public.posts for insert
  to authenticated
  with check (auth.uid() = author_id);

create policy "posts_update_self"
  on public.posts for update
  to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

create policy "posts_delete_self"
  on public.posts for delete
  to authenticated
  using (auth.uid() = author_id);

create policy "comments_select_visible"
  on public.comments for select
  using (
    state = 'active'
    or auth.uid() = author_id
  );

create policy "comments_insert_self"
  on public.comments for insert
  to authenticated
  with check (auth.uid() = author_id);

create policy "comments_update_self"
  on public.comments for update
  to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

create policy "comments_delete_self"
  on public.comments for delete
  to authenticated
  using (auth.uid() = author_id);

create policy "post_reactions_select_public"
  on public.post_reactions for select
  using (true);

create policy "post_reactions_write_self"
  on public.post_reactions for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "comment_reactions_select_public"
  on public.comment_reactions for select
  using (true);

create policy "comment_reactions_write_self"
  on public.comment_reactions for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "saved_posts_all_self"
  on public.saved_posts for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 7. Collections & Collection Items
-- -----------------------------------------------------------------------------
create policy "collections_select_public_or_owner"
  on public.collections for select
  using (visibility = 'public' or auth.uid() = owner_id);

create policy "collections_insert_self"
  on public.collections for insert
  to authenticated
  with check (auth.uid() = owner_id);

create policy "collections_update_self"
  on public.collections for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "collections_delete_self"
  on public.collections for delete
  to authenticated
  using (auth.uid() = owner_id);

create policy "collection_items_select_visible"
  on public.collection_items for select
  using (
    exists (
      select 1 from public.collections c
      where c.id = collection_items.collection_id
        and (c.visibility = 'public' or c.owner_id = auth.uid())
    )
  );

create policy "collection_items_write_owner"
  on public.collection_items for all
  to authenticated
  using (
    exists (
      select 1 from public.collections c
      where c.id = collection_items.collection_id
        and c.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.collections c
      where c.id = collection_items.collection_id
        and c.owner_id = auth.uid()
    )
  );

create policy "collection_follows_select_public"
  on public.collection_follows for select
  using (true);

create policy "collection_follows_write_self"
  on public.collection_follows for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 8. Notifications, Reports & Media Ledger
-- -----------------------------------------------------------------------------
create policy "notifications_select_recipient"
  on public.notifications for select
  to authenticated
  using (auth.uid() = recipient_id);

create policy "notifications_update_recipient"
  on public.notifications for update
  to authenticated
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

create policy "reports_insert_self"
  on public.reports for insert
  to authenticated
  with check (auth.uid() = reporter_id);

create policy "reports_select_self"
  on public.reports for select
  to authenticated
  using (auth.uid() = reporter_id);

create policy "media_assets_select_public"
  on public.media_assets for select
  using (true);

create policy "media_assets_write_self"
  on public.media_assets for all
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- -----------------------------------------------------------------------------
-- 9. Storage Buckets & Policies (avatars, banners, post-images, shorts-videos)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('banners', 'banners', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('post-images', 'post-images', true, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('shorts-videos', 'shorts-videos', true, 104857600, array['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "storage_public_read"
  on storage.objects for select
  using (bucket_id in ('avatars', 'banners', 'post-images', 'shorts-videos'));

create policy "storage_authenticated_upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id in ('avatars', 'banners', 'post-images', 'shorts-videos')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "storage_owner_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id in ('avatars', 'banners', 'post-images', 'shorts-videos')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "storage_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id in ('avatars', 'banners', 'post-images', 'shorts-videos')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
