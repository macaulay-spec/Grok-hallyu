-- =============================================================================
-- HALLYU — LOVABLE CLOUD BACKEND
-- 001_schema_and_types.sql
-- Clean-slate PostgreSQL schema for the 4-world Hallyu application
-- (K-Drama, C-Drama, Anime, Hollywood)
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- -----------------------------------------------------------------------------
-- 1. Domain Enums
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.fandom_id as enum ('kdrama', 'cdrama', 'anime', 'hollywood');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.media_type as enum ('tv', 'movie');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.drama_format as enum (
    'kdrama',
    'cdrama',
    'anime',
    'hollywood-series',
    'hollywood-movie'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.drama_status as enum ('airing', 'completed', 'upcoming');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.watch_status as enum ('want', 'watching', 'completed', 'dropped');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.post_type as enum (
    'post',
    'discussion',
    'review',
    'reaction',
    'short',
    'recommendation',
    'clip'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.spoiler_level as enum ('none', 'episode', 'season', 'ending');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.spoiler_protection as enum ('strict', 'balanced', 'off');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.reaction_kind as enum (
    'loved',
    'cried',
    'screamed',
    'swooned',
    'laughed',
    'furious'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.content_state as enum ('active', 'pending', 'failed', 'deleted', 'hidden');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_kind as enum (
    'reaction',
    'comment',
    'reply',
    'mention',
    'follow',
    'episode_live',
    'episode_aired',
    'drama_trending',
    'collection_saved',
    'system'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_group as enum ('social', 'drama', 'mentions', 'system');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_kind as enum ('post', 'comment', 'user', 'drama', 'collection');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- 2. Users & Synced Preferences
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text not null,
  display_name text not null,
  avatar_url text,
  banner_url text,
  bio text not null default '' check (char_length(bio) <= 160),
  verified boolean not null default false,
  is_private boolean not null default false,
  fandoms public.fandom_id[] not null default '{}',
  favorite_genres text[] not null default '{}',
  favorite_drama_ids text[] not null default '{}',
  followers integer not null default 0 check (followers >= 0),
  following integer not null default 0 check (following >= 0),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_handle_length check (char_length(handle) between 2 and 24),
  constraint profiles_handle_format check (handle ~ '^[a-z0-9_.]+$')
);

create unique index if not exists profiles_handle_lower_idx on public.profiles (lower(handle));
create index if not exists profiles_fandoms_gin_idx on public.profiles using gin (fandoms);
create index if not exists profiles_favorite_genres_gin_idx on public.profiles using gin (favorite_genres);
create index if not exists profiles_search_trgm_idx on public.profiles using gin ((handle || ' ' || display_name) gin_trgm_ops);

create table if not exists public.user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  -- Onboarding state
  onboarding_done boolean not null default false,
  onboarding_step integer not null default 0,
  onboarding_intent text,
  onboarding_genres text[] not null default '{}',
  onboarding_fandoms public.fandom_id[] not null default '{}',
  -- Content & Spoiler settings
  protection public.spoiler_protection not null default 'balanced',
  autoplay text not null default 'wifi' check (autoplay in ('always', 'wifi', 'never')),
  one_tap_reactions boolean not null default true,
  muted_words text[] not null default '{}',
  true_black boolean not null default false,
  personalization boolean not null default true,
  reduce_motion boolean not null default false,
  language text not null default 'en' check (language in ('en', 'ko')),
  guidelines_accepted boolean not null default false,
  data_saver boolean not null default false,
  terms_version integer not null default 0,
  -- Notification toggles
  notify_episodes boolean not null default true,
  notify_social boolean not null default true,
  notify_highlights boolean not null default true,
  notify_system boolean not null default true,
  notify_quiet_hours boolean not null default false,
  -- Push notification token
  expo_push_token text,
  last_seen_activity timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 3. 4-World Catalog Mirror (Dramas, Films, Multi-Season Episodes, Actors)
-- -----------------------------------------------------------------------------
create table if not exists public.dramas (
  id text primary key, -- e.g. 'demo-cloy', 'world-aot', 'tmdb-12345', 'tmdb-m-67890'
  tmdb_id integer,
  media_type public.media_type not null default 'tv',
  format public.drama_format not null default 'kdrama',
  world public.fandom_id not null default 'kdrama',
  title text not null,
  original_title text,
  original_language text,
  region text,
  year integer not null default 2024,
  end_year integer,
  status public.drama_status not null default 'completed',
  network text,
  streaming_on text[] not null default '{}',
  genres text[] not null default '{}',
  tags text[] not null default '{}',
  synopsis text not null default '',
  poster_url text,
  backdrop_url text,
  trailer_url text,
  tone text not null default '#2F3A46',
  rating numeric(3,1),
  runtime integer,
  episode_count integer not null default 0,
  seasons jsonb not null default '[]'::jsonb, -- [{ number, episodeCount, year, name }]
  airs_on text,
  next_episode_at timestamptz,
  creators text[] not null default '{}',
  follower_count integer not null default 0 check (follower_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dramas_world_idx on public.dramas (world, status, follower_count desc);
create index if not exists dramas_tmdb_idx on public.dramas (tmdb_id, media_type);
create index if not exists dramas_genres_gin_idx on public.dramas using gin (genres);
create index if not exists dramas_search_trgm_idx on public.dramas using gin ((title || ' ' || coalesce(original_title, '')) gin_trgm_ops);

create table if not exists public.episodes (
  id text primary key, -- e.g. 'world-aot-s2e4'
  drama_id text not null references public.dramas(id) on delete cascade,
  season integer not null default 1 check (season >= 1),
  number integer not null check (number >= 1),
  title text,
  synopsis text,
  air_date timestamptz,
  runtime integer,
  still_url text,
  created_at timestamptz not null default now(),
  unique (drama_id, season, number)
);

create index if not exists episodes_drama_season_idx on public.episodes (drama_id, season, number);
create index if not exists episodes_air_date_idx on public.episodes (air_date) where air_date is not null;

create table if not exists public.actors (
  id text primary key, -- e.g. 'a-hyunbin', 'tmdb-a-109803'
  tmdb_id integer,
  name text not null,
  korean_name text,
  photo_url text,
  bio text,
  birth_date text,
  known_for text[] not null default '{}',
  follower_count integer not null default 0 check (follower_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists actors_tmdb_idx on public.actors (tmdb_id);
create index if not exists actors_search_trgm_idx on public.actors using gin ((name || ' ' || coalesce(korean_name, '')) gin_trgm_ops);

create table if not exists public.drama_cast (
  drama_id text not null references public.dramas(id) on delete cascade,
  actor_id text not null references public.actors(id) on delete cascade,
  role text not null default '',
  cast_order integer not null default 0,
  primary key (drama_id, actor_id)
);

create index if not exists drama_cast_actor_idx on public.drama_cast (actor_id, cast_order);

-- -----------------------------------------------------------------------------
-- 4. Social Graph (Follows, Episode Alerts, Blocks, Mutes)
-- -----------------------------------------------------------------------------
create table if not exists public.user_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, target_user_id),
  constraint user_follows_no_self check (follower_id <> target_user_id)
);

create index if not exists user_follows_target_idx on public.user_follows (target_user_id, created_at desc);

create table if not exists public.drama_follows (
  user_id uuid not null references public.profiles(id) on delete cascade,
  drama_id text not null references public.dramas(id) on delete cascade,
  notify_episodes boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, drama_id)
);

create index if not exists drama_follows_drama_idx on public.drama_follows (drama_id) where notify_episodes = true;

create table if not exists public.actor_follows (
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id text not null references public.actors(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, actor_id)
);

create table if not exists public.user_blocks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  blocked_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_user_id),
  constraint user_blocks_no_self check (user_id <> blocked_user_id)
);

create table if not exists public.user_mutes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  muted_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, muted_user_id)
);

create table if not exists public.drama_mutes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  drama_id text not null references public.dramas(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, drama_id)
);

-- -----------------------------------------------------------------------------
-- 5. Watchlist & Episode Progress
-- -----------------------------------------------------------------------------
create table if not exists public.watchlist_items (
  user_id uuid not null references public.profiles(id) on delete cascade,
  drama_id text not null references public.dramas(id) on delete cascade,
  status public.watch_status not null default 'watching',
  season integer not null default 1 check (season >= 1),
  current_episode integer not null default 0 check (current_episode >= 0),
  rating numeric(2,1) check (rating is null or (rating >= 0.5 and rating <= 5.0)),
  note text check (note is null or char_length(note) <= 280),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, drama_id)
);

create index if not exists watchlist_user_status_idx on public.watchlist_items (user_id, status, updated_at desc);

-- -----------------------------------------------------------------------------
-- 6. Posts, Shorts, Reviews, Reactions, Comments & Saved Bookmarks
-- -----------------------------------------------------------------------------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  type public.post_type not null default 'post',
  title text check (title is null or char_length(title) <= 100),
  body text not null default '' check (char_length(body) <= 4000),
  verdict text check (verdict is null or char_length(verdict) <= 120),
  rating numeric(2,1) check (rating is null or (rating >= 0.5 and rating <= 5.0)),
  pros text[] not null default '{}',
  cons text[] not null default '{}',
  -- Context strip links
  drama_id text references public.dramas(id) on delete set null,
  secondary_drama_id text references public.dramas(id) on delete set null,
  season integer check (season is null or season >= 1),
  episode integer check (episode is null or episode >= 1),
  actor_ids text[] not null default '{}',
  -- Spoiler protection level
  spoiler public.spoiler_level not null default 'none',
  -- Media attachments
  images text[] not null default '{}',
  aspect_ratio numeric(4,2),
  video jsonb, -- { key, url, poster, duration, width, height }
  -- Extracted tokens
  hashtags text[] not null default '{}',
  mentions uuid[] not null default '{}',
  -- Aggregated counters
  reactions jsonb not null default '{"loved":0,"cried":0,"screamed":0,"swooned":0,"laughed":0,"furious":0}'::jsonb,
  comment_count integer not null default 0 check (comment_count >= 0),
  save_count integer not null default 0 check (save_count >= 0),
  state public.content_state not null default 'active',
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index if not exists posts_author_created_idx on public.posts (author_id, created_at desc) where state = 'active';
create index if not exists posts_drama_created_idx on public.posts (drama_id, season, episode, created_at desc) where state = 'active';
create index if not exists posts_type_created_idx on public.posts (type, created_at desc) where state = 'active';
create index if not exists posts_hashtags_gin_idx on public.posts using gin (hashtags) where state = 'active';
create index if not exists posts_actor_ids_gin_idx on public.posts using gin (actor_ids) where state = 'active';
create index if not exists posts_search_trgm_idx on public.posts using gin ((coalesce(title, '') || ' ' || body) gin_trgm_ops) where state = 'active';

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  reply_to_user_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(body) between 1 and 800),
  spoiler public.spoiler_level not null default 'none',
  reactions jsonb not null default '{"loved":0,"cried":0,"screamed":0,"swooned":0,"laughed":0,"furious":0}'::jsonb,
  state public.content_state not null default 'active',
  created_at timestamptz not null default now()
);

create index if not exists comments_post_created_idx on public.comments (post_id, created_at asc);

create table if not exists public.post_reactions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  kind public.reaction_kind not null,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index if not exists post_reactions_post_idx on public.post_reactions (post_id, kind);

create table if not exists public.comment_reactions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  comment_id uuid not null references public.comments(id) on delete cascade,
  kind public.reaction_kind not null,
  created_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);

create table if not exists public.saved_posts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index if not exists saved_posts_user_created_idx on public.saved_posts (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 7. Curated Collections (Community Shelves)
-- -----------------------------------------------------------------------------
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  description text check (description is null or char_length(description) <= 240),
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  follower_count integer not null default 0 check (follower_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists collections_owner_idx on public.collections (owner_id, updated_at desc);
create index if not exists collections_public_idx on public.collections (follower_count desc, updated_at desc) where visibility = 'public';

create table if not exists public.collection_items (
  collection_id uuid not null references public.collections(id) on delete cascade,
  drama_id text not null references public.dramas(id) on delete cascade,
  note text check (note is null or char_length(note) <= 280),
  position integer not null default 0,
  added_at timestamptz not null default now(),
  primary key (collection_id, drama_id)
);

create table if not exists public.collection_follows (
  user_id uuid not null references public.profiles(id) on delete cascade,
  collection_id uuid not null references public.collections(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, collection_id)
);

-- -----------------------------------------------------------------------------
-- 8. Activity Notifications, Reports & Media Ledger
-- -----------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  kind public.notification_kind not null,
  "group" public.notification_group not null default 'social',
  actor_ids uuid[] not null default '{}',
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  drama_id text references public.dramas(id) on delete cascade,
  episode integer,
  collection_id uuid references public.collections(id) on delete cascade,
  title text,
  body text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_created_idx on public.notifications (recipient_id, created_at desc);
create index if not exists notifications_recipient_unread_idx on public.notifications (recipient_id, "group") where read = false;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_id text not null,
  kind public.report_kind not null,
  reason text not null default 'other',
  detail text check (detail is null or char_length(detail) <= 500),
  status text not null default 'open' check (status in ('open', 'reviewed', 'actioned')),
  created_at timestamptz not null default now()
);

create table if not exists public.media_assets (
  key text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  bucket text not null check (bucket in ('avatars', 'banners', 'post-images', 'shorts-videos')),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  post_id uuid references public.posts(id) on delete set null,
  downloads integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists media_assets_owner_idx on public.media_assets (owner_id, created_at desc);
