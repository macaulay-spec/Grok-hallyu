# Lovable Cloud Master Prompt for Hallyu

Copy everything inside the prompt block below and paste it directly into **Lovable** (with **Lovable Cloud** enabled) to provision the entire Hallyu backend: database schema, enums, indexes, Row-Level Security (RLS) policies, Storage Buckets, database triggers, RPC functions, initial 4-world catalog seed, and Edge Functions.

---

```markdown
Build and provision the complete Lovable Cloud backend for **Hallyu** — a cross-fandom social & tracking application where four fandom worlds meet: **K-Dramas (`kdrama`), C-Dramas (`cdrama`), Anime (`anime`), and Hollywood (`hollywood`)**.

Do NOT redesign the frontend contract. Create the exact PostgreSQL schema, enums, Row-Level Security (RLS) policies, Storage Buckets, Triggers, RPC functions, 4-world seed data, and Edge Functions specified below so our Expo/React Native & Web client (`lib/data/lovableBackend.ts`) connects with zero schema mismatches.

---

## PART 1: EXTENSIONS & DOMAIN ENUMS

Enable `pgcrypto` and `pg_trgm`, and create these exact PostgreSQL enum types in `public`:

1. `public.fandom_id`: `'kdrama'`, `'cdrama'`, `'anime'`, `'hollywood'`
2. `public.media_type`: `'tv'`, `'movie'`
3. `public.drama_format`: `'kdrama'`, `'cdrama'`, `'anime'`, `'hollywood-series'`, `'hollywood-movie'`
4. `public.drama_status`: `'airing'`, `'completed'`, `'upcoming'`
5. `public.watch_status`: `'want'`, `'watching'`, `'completed'`, `'dropped'`
6. `public.post_type`: `'post'`, `'discussion'`, `'review'`, `'reaction'`, `'short'`, `'recommendation'`, `'clip'`
7. `public.spoiler_level`: `'none'`, `'episode'`, `'season'`, `'ending'`
8. `public.spoiler_protection`: `'strict'`, `'balanced'`, `'off'`
9. `public.reaction_kind`: `'loved'`, `'cried'`, `'screamed'`, `'swooned'`, `'laughed'`, `'furious'`
10. `public.content_state`: `'active'`, `'pending'`, `'failed'`, `'deleted'`, `'hidden'`
11. `public.notification_kind`: `'reaction'`, `'comment'`, `'reply'`, `'mention'`, `'follow'`, `'episode_live'`, `'episode_aired'`, `'drama_trending'`, `'collection_saved'`, `'system'`
12. `public.notification_group`: `'social'`, `'drama'`, `'mentions'`, `'system'`
13. `public.report_kind`: `'post'`, `'comment'`, `'user'`, `'drama'`, `'collection'`

---

## PART 2: DATABASE TABLES & INDEXES

Create all 22 tables in `public`:

### 1. `public.profiles`
- `id` uuid PK references `auth.users(id)` on delete cascade
- `handle` text not null (2..24 chars, `^[a-z0-9_.]+$`, unique index on `lower(handle)`)
- `display_name` text not null
- `avatar_url` text
- `banner_url` text
- `bio` text not null default `''` (`char_length(bio) <= 160`)
- `verified` boolean not null default `false`
- `is_private` boolean not null default `false`
- `fandoms` `public.fandom_id[]` not null default `'{}'`
- `favorite_genres` `text[]` not null default `'{}'`
- `favorite_drama_ids` `text[]` not null default `'{}'`
- `followers` integer not null default `0`
- `following` integer not null default `0`
- `joined_at` timestamptz not null default `now()`
- `updated_at` timestamptz not null default `now()`

### 2. `public.user_preferences`
- `user_id` uuid PK references `public.profiles(id)` on delete cascade
- `onboarding_done` boolean not null default `false`
- `onboarding_step` integer not null default `0`
- `onboarding_intent` text
- `onboarding_genres` `text[]` not null default `'{}'`
- `onboarding_fandoms` `public.fandom_id[]` not null default `'{}'`
- `protection` `public.spoiler_protection` not null default `'balanced'`
- `autoplay` text not null default `'wifi'` (`'always' | 'wifi' | 'never'`)
- `one_tap_reactions` boolean not null default `true`
- `muted_words` `text[]` not null default `'{}'`
- `true_black` boolean not null default `false`
- `personalization` boolean not null default `true`
- `reduce_motion` boolean not null default `false`
- `language` text not null default `'en'` (`'en' | 'ko'`)
- `guidelines_accepted` boolean not null default `false`
- `data_saver` boolean not null default `false`
- `terms_version` integer not null default `0`
- `notify_episodes` boolean not null default `true`
- `notify_social` boolean not null default `true`
- `notify_highlights` boolean not null default `true`
- `notify_system` boolean not null default `true`
- `notify_quiet_hours` boolean not null default `false`
- `expo_push_token` text
- `last_seen_activity` timestamptz not null default `now()`
- `updated_at` timestamptz not null default `now()`

### 3. `public.dramas` (4-World Catalog: Series & Films)
- `id` text PK (e.g. `'demo-cloy'`, `'world-aot'`, `'tmdb-12345'`, `'tmdb-m-67890'`)
- `tmdb_id` integer
- `media_type` `public.media_type` not null default `'tv'`
- `format` `public.drama_format` not null default `'kdrama'`
- `world` `public.fandom_id` not null default `'kdrama'`
- `title` text not null
- `original_title` text
- `original_language` text
- `region` text
- `year` integer not null default `2024`
- `end_year` integer
- `status` `public.drama_status` not null default `'completed'`
- `network` text
- `streaming_on` `text[]` not null default `'{}'`
- `genres` `text[]` not null default `'{}'`
- `tags` `text[]` not null default `'{}'`
- `synopsis` text not null default `''`
- `poster_url` text
- `backdrop_url` text
- `trailer_url` text
- `tone` text not null default `'#2F3A46'`
- `rating` numeric(3,1)
- `runtime` integer
- `episode_count` integer not null default `0`
- `seasons` jsonb not null default `'[]'::jsonb`
- `airs_on` text
- `next_episode_at` timestamptz
- `creators` `text[]` not null default `'{}'`
- `follower_count` integer not null default `0`
- `created_at` timestamptz not null default `now()`
- `updated_at` timestamptz not null default `now()`

### 4. `public.episodes` (Multi-Season Episodes)
- `id` text PK (`${drama_id}-s${season}e${number}`)
- `drama_id` text not null references `public.dramas(id)` on delete cascade
- `season` integer not null default `1`
- `number` integer not null
- `title` text
- `synopsis` text
- `air_date` timestamptz
- `runtime` integer
- `still_url` text
- `created_at` timestamptz not null default `now()`
- Unique constraint on `(drama_id, season, number)`

### 5. `public.actors` & 6. `public.drama_cast`
- `public.actors`: `id` text PK, `tmdb_id` integer, `name` text not null, `korean_name` text, `photo_url` text, `bio` text, `birth_date` text, `known_for` `text[]` not null default `'{}'`, `follower_count` integer not null default `0`, `created_at` timestamptz, `updated_at` timestamptz
- `public.drama_cast`: `(drama_id, actor_id)` PK, `role` text not null default `''`, `cast_order` integer not null default `0`

### 7–13. Social Graph, Blocks & Mutes
- `public.user_follows`: `(follower_id, target_user_id)` PK, `created_at` timestamptz
- `public.drama_follows`: `(user_id, drama_id)` PK, `notify_episodes` boolean not null default `true`, `created_at` timestamptz
- `public.actor_follows`: `(user_id, actor_id)` PK, `created_at` timestamptz
- `public.collection_follows`: `(user_id, collection_id)` PK, `created_at` timestamptz
- `public.user_blocks`: `(user_id, blocked_user_id)` PK, `created_at` timestamptz
- `public.user_mutes`: `(user_id, muted_user_id)` PK, `created_at` timestamptz
- `public.drama_mutes`: `(user_id, drama_id)` PK, `created_at` timestamptz

### 14. `public.watchlist_items`
- `(user_id, drama_id)` PK
- `status` `public.watch_status` not null default `'watching'`
- `season` integer not null default `1`
- `current_episode` integer not null default `0`
- `rating` numeric(2,1)
- `note` text (`<= 280` chars)
- `started_at` timestamptz
- `completed_at` timestamptz
- `updated_at` timestamptz not null default `now()`

### 15. `public.posts`
- `id` uuid PK default `gen_random_uuid()`
- `author_id` uuid not null references `public.profiles(id)` on delete cascade
- `type` `public.post_type` not null default `'post'`
- `title` text (`<= 100` chars)
- `body` text not null default `''` (`<= 4000` chars)
- `verdict` text (`<= 120` chars)
- `rating` numeric(2,1)
- `pros` `text[]` not null default `'{}'`
- `cons` `text[]` not null default `'{}'`
- `drama_id` text references `public.dramas(id)` on delete set null
- `secondary_drama_id` text references `public.dramas(id)` on delete set null
- `season` integer
- `episode` integer
- `actor_ids` `text[]` not null default `'{}'`
- `spoiler` `public.spoiler_level` not null default `'none'`
- `images` `text[]` not null default `'{}'`
- `aspect_ratio` numeric(4,2)
- `video` jsonb (`{ key, url, poster, duration, width, height }`)
- `hashtags` `text[]` not null default `'{}'`
- `mentions` `text[]` not null default `'{}'`
- `reactions` jsonb not null default `'{"loved":0,"cried":0,"screamed":0,"swooned":0,"laughed":0,"furious":0}'::jsonb`
- `comment_count` integer not null default `0`
- `save_count` integer not null default `0`
- `state` `public.content_state` not null default `'active'`
- `created_at` timestamptz not null default `now()`
- `edited_at` timestamptz

### 16. `public.comments`
- `id` uuid PK default `gen_random_uuid()`
- `post_id` uuid not null references `public.posts(id)` on delete cascade
- `author_id` uuid not null references `public.profiles(id)` on delete cascade
- `parent_id` uuid references `public.comments(id)` on delete cascade
- `reply_to_user_id` uuid references `public.profiles(id)` on delete set null
- `body` text not null (`1..800` chars)
- `spoiler` `public.spoiler_level` not null default `'none'`
- `reactions` jsonb not null default `'{"loved":0,"cried":0,"screamed":0,"swooned":0,"laughed":0,"furious":0}'::jsonb`
- `state` `public.content_state` not null default `'active'`
- `created_at` timestamptz not null default `now()`

### 17–19. Reactions & Saved Bookmarks
- `public.post_reactions`: `(user_id, post_id)` PK, `kind` `public.reaction_kind` not null, `created_at` timestamptz
- `public.comment_reactions`: `(user_id, comment_id)` PK, `kind` `public.reaction_kind` not null, `created_at` timestamptz
- `public.saved_posts`: `(user_id, post_id)` PK, `created_at` timestamptz

### 20–21. Curated Collections
- `public.collections`: `id` uuid PK, `owner_id` uuid not null references `public.profiles(id)` on delete cascade, `title` text not null, `description` text, `visibility` text not null default `'public'` (`'public' | 'private'`), `follower_count` integer not null default `0`, `created_at` timestamptz, `updated_at` timestamptz
- `public.collection_items`: `(collection_id, drama_id)` PK, `note` text, `position` integer not null default `0`, `added_at` timestamptz

### 22–24. Notifications, Reports & Media Assets
- `public.notifications`: `id` uuid PK, `recipient_id` uuid not null references `public.profiles(id)` on delete cascade, `kind` `public.notification_kind` not null, `"group"` `public.notification_group` not null default `'social'`, `actor_ids` `uuid[]` not null default `'{}'`, `post_id` uuid, `comment_id` uuid, `drama_id` text, `episode` integer, `collection_id` uuid, `title` text, `body` text, `read` boolean not null default `false`, `created_at` timestamptz
- `public.reports`: `id` uuid PK, `reporter_id` uuid not null, `target_id` text not null, `kind` `public.report_kind` not null, `reason` text not null, `detail` text, `status` text not null default `'open'`, `created_at` timestamptz
- `public.media_assets`: `key` text PK, `owner_id` uuid not null, `bucket` text not null, `mime_type` text not null, `size_bytes` bigint not null, `post_id` uuid, `downloads` integer not null default `0`, `created_at` timestamptz

---

## PART 3: ROW-LEVEL SECURITY (RLS) & STORAGE BUCKETS

1. Enable RLS on all tables:
   - Public `SELECT` on `profiles`, `dramas`, `episodes`, `actors`, `drama_cast`, `user_follows`, `drama_follows`, `actor_follows`, `collection_follows`, `post_reactions`, `comment_reactions`, `media_assets`, active `posts`, active `comments`, and public `collections` / `collection_items` so Guest Mode works without authentication.
   - Owner-only write (`auth.uid()`) on `profiles`, `user_preferences`, `user_follows`, `drama_follows`, `actor_follows`, `collection_follows`, `user_blocks`, `user_mutes`, `drama_mutes`, `watchlist_items`, `posts`, `comments`, `post_reactions`, `comment_reactions`, `saved_posts`, `collections`, `collection_items`, `notifications`, `reports`, and `media_assets`.
   - Authenticated upsert on `dramas`, `episodes`, `actors`, and `drama_cast` so TMDB catalog items adopted on the client can be persisted when referenced by posts, watchlists, or collections.
2. Create 4 public Storage Buckets with owner-scoped folder upload/update/delete policies (`(storage.foldername(name))[1] = auth.uid()::text`):
   - `avatars` (5 MB limit, `image/jpeg`, `image/png`, `image/webp`)
   - `banners` (10 MB limit, `image/jpeg`, `image/png`, `image/webp`)
   - `post-images` (15 MB limit, `image/jpeg`, `image/png`, `image/webp`, `image/gif`)
   - `shorts-videos` (100 MB limit, `video/mp4`, `video/quicktime`, `video/webm`, `image/jpeg`, `image/png`, `image/webp`)

---

## PART 4: TRIGGERS & RPC FUNCTIONS

Create these PostgreSQL triggers & RPC functions (full SQL in `lovable-cloud/sql/003_triggers_and_rpcs.sql`):

1. **`public.handle_new_user()` trigger on `auth.users` after insert**:
   - Generates a unique lowercase `@handle` from user metadata or email local-part, inserts into `public.profiles` and `public.user_preferences`.
2. **Counter & Notification Triggers**:
   - `trg_user_follows`: increments/decrements `profiles.followers` and `profiles.following`, and inserts a `'follow'` notification.
   - `trg_drama_follows`: increments/decrements `dramas.follower_count`.
   - `trg_actor_follows`: increments/decrements `actors.follower_count`.
   - `trg_collection_follows`: increments/decrements `collections.follower_count` and inserts a `'collection_saved'` notification.
   - `trg_saved_posts`: increments/decrements `posts.save_count`.
   - `trg_post_reactions` & `trg_comment_reactions`: recomputes the 6-key JSONB `reactions` object (`loved`, `cried`, `screamed`, `swooned`, `laughed`, `furious`) and notifies the post author on new reactions.
   - `trg_comments`: increments/decrements `posts.comment_count` and inserts `'comment'` or `'reply'` notifications.
3. **RPC Functions**:
   - `public.pull_me_state()` → returns `{ authenticated, profile, prefs, follows, dramaNotify, watchlist, reactions, saves, blockedUsers, mutedUsers, mutedDramas }`.
   - `public.toggle_reaction(p_target_id uuid, p_kind public.reaction_kind, p_is_comment boolean)` → idempotently sets or clears a reaction on a post or comment.
   - `public.upsert_watchlist(p_drama_id text, p_status public.watch_status, p_season integer, p_episode integer, p_note text, p_clear_status boolean)` → upserts or removes a watchlist item and manages `started_at` / `completed_at`.
   - `public.mark_notifications_read(p_notification_id uuid, p_group text)` → marks one notification or a notification group (`'all' | 'social' | 'drama' | 'mentions' | 'system'`) as read.
   - `public.export_my_account_data()` → returns the authenticated user's complete profile, preferences, watchlist, posts, comments, and collections as JSON.

---

## PART 5: EDGE FUNCTIONS

Deploy these 4 Edge Functions (source in `lovable-cloud/functions/`):
1. **`catalog-sync`**: Upserts 4-world `dramas` (including `trailer_url`, `streaming_on`, `seasons`), multi-season `episodes`, `actors`, and `drama_cast`.
2. **`media-upload`**: Validates bucket & size quota, mints a signed upload URL for `avatars`, `banners`, `post-images`, or `shorts-videos`, and records the upload in `public.media_assets`.
3. **`episode-airing-cron`**: Checks episodes airing in the current window and inserts `episode_live` notifications for all users following that drama with `notify_episodes = true`.
4. **`delete-account`**: Removes the authenticated user's files from all 4 storage buckets and deletes their `auth.users` record (cascading all owned rows).
```
