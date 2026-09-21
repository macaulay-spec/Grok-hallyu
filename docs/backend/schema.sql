-- =====================================================================================
-- Hallyu backend — reference schema (design artefact; becomes supabase/migrations/0001_init.sql)
-- Target: Supabase Postgres 15+. Base tables live in schema `public` (RLS on all of them);
-- the client talks only to schema `api` (security_invoker views + RPC functions).
-- Sections marked  -- >>> supabase-only  use pg_cron / pgmq / pg_net / vault and are skipped by the
-- local validator (docs/backend/validate-schema.mjs runs the rest in PGlite).
-- =====================================================================================

create extension if not exists citext;
create extension if not exists pg_trgm;
create extension if not exists pgcrypto;
-- >>> supabase-only
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists pgmq;
-- <<< supabase-only

create schema if not exists api;
grant usage on schema api to anon, authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 0. Helpers
-- -------------------------------------------------------------------------------------
create or replace function public.auth_role() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'role', 'user')
$$;

create or replace function public.is_moderator() returns boolean
language sql stable as $$ select public.auth_role() in ('moderator', 'admin') $$;

create or replace function public.is_service_role() returns boolean
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', current_user) = 'service_role'
$$;

create or replace function public.require_user() returns uuid
language plpgsql stable as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'Sign in required' using errcode = 'PT401'; end if;
  return v;
end $$;

-- array_to_string is only STABLE; generated columns need an IMMUTABLE wrapper
create or replace function public.imm_array_to_string(p text[], p_sep text) returns text
language sql immutable parallel safe as $$ select array_to_string(p, p_sep) $$;

-- PostgREST maps SQLSTATE PTxxx to HTTP status xxx (PT401, PT403, PT404, PT409, PT422, PT429).
create or replace function public.fail(p_status int, p_message text) returns void
language plpgsql as $$
begin
  raise exception '%', p_message using errcode = 'PT' || p_status::text;
end $$;

-- -------------------------------------------------------------------------------------
-- 1. Identity & profiles
-- -------------------------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  handle            citext not null unique check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name      text not null default '' check (char_length(display_name) <= 40),
  avatar_key        text,
  bio               text not null default '' check (char_length(bio) <= 160),
  favorite_genres   text[] not null default '{}' check (cardinality(favorite_genres) <= 12),
  favorite_drama_ids text[] not null default '{}' check (cardinality(favorite_drama_ids) <= 12),
  follower_count    int not null default 0,
  following_count   int not null default 0,
  post_count        int not null default 0,
  verified          boolean not null default false,
  is_private        boolean not null default false,          -- stored, not enforced in v1 (no follow-request UI)
  state             text not null default 'active' check (state in ('active', 'limited', 'suspended', 'deleted')),
  prefs             jsonb not null default '{}'::jsonb,       -- Prefs minus device-only keys
  onboarding        jsonb not null default '{}'::jsonb,
  terms_version     int not null default 0,
  language          text not null default 'en' check (language in ('en', 'ko')),
  handle_changed_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  last_seen_at      timestamptz,
  fts               tsvector generated always as (to_tsvector('simple', coalesce(handle::text, '') || ' ' || coalesce(display_name, ''))) stored
);
create index profiles_handle_trgm on public.profiles using gin (handle gin_trgm_ops);
create index profiles_display_name_trgm on public.profiles using gin (display_name gin_trgm_ops);
create index profiles_fts on public.profiles using gin (fts);

create table public.reserved_handles (handle citext primary key);
insert into public.reserved_handles values ('admin'), ('administrator'), ('hallyu'), ('hallyuapp'), ('support'), ('help'), ('mod'), ('moderator'),
  ('root'), ('api'), ('system'), ('official'), ('staff'), ('team'), ('security'), ('abuse'), ('null'), ('undefined'), ('me'), ('you'), ('user');

-- profile row on sign-up (auth.users insert)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare base text; candidate text; n int := 0;
begin
  base := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'handle', split_part(new.email, '@', 1), 'user'), '[^a-z0-9_]', '', 'g'));
  if char_length(base) < 3 then base := 'user'; end if;
  base := left(base, 14);
  candidate := base;
  while exists (select 1 from public.profiles where handle = candidate) or exists (select 1 from public.reserved_handles where handle = candidate) loop
    n := n + 1; candidate := base || '_' || substr(md5(new.id::text || n::text), 1, 4);
  end loop;
  insert into public.profiles (id, handle, display_name)
  values (new.id, candidate, left(coalesce(new.raw_user_meta_data ->> 'displayName', new.raw_user_meta_data ->> 'full_name', base), 40));
  return new;
end $$;
-- >>> supabase-only
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
-- <<< supabase-only

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

-- -------------------------------------------------------------------------------------
-- 2. Catalog mirror (TMDB-sourced; written only by the ensure-catalog Edge Function / service role)
-- -------------------------------------------------------------------------------------
create table public.catalog_dramas (
  id              text primary key,                          -- slug used by the client (e.g. 'queen-of-tears-2024')
  tmdb_id         int not null unique,
  title           text not null,
  original_title  text,
  poster_path     text,
  backdrop_path   text,
  genres          text[] not null default '{}',
  status          text,                                     -- airing | ended | upcoming
  first_air_date  date,
  network         text,
  overview        text,
  season_count    int not null default 1,
  episode_count   int not null default 0,
  follower_count  int not null default 0,
  watching_count  int not null default 0,
  post_count      int not null default 0,
  payload         jsonb not null default '{}'::jsonb,       -- raw TMDB subset for the client cache
  updated_at      timestamptz not null default now()
);
create index catalog_dramas_title_trgm on public.catalog_dramas using gin (title gin_trgm_ops);

create table public.catalog_actors (
  id              text primary key,
  tmdb_id         int not null unique,
  name            text not null,
  profile_path    text,
  follower_count  int not null default 0,
  updated_at      timestamptz not null default now()
);

create table public.catalog_cast (
  drama_id   text not null references public.catalog_dramas (id) on delete cascade,
  actor_id   text not null references public.catalog_actors (id) on delete cascade,
  character  text,
  ord        int not null default 0,
  primary key (drama_id, actor_id)
);

create table public.catalog_episodes (
  drama_id   text not null references public.catalog_dramas (id) on delete cascade,
  season     int not null,
  number     int not null,
  title      text,
  air_at     timestamptz,                                   -- broadcast time in UTC (Korean slot converted server-side)
  runtime    int,
  overview   text,
  primary key (drama_id, season, number)
);
create index catalog_episodes_air_at on public.catalog_episodes (air_at) where air_at is not null;

-- -------------------------------------------------------------------------------------
-- 3. Social graph
-- -------------------------------------------------------------------------------------
create table public.follows (
  follower_id  uuid not null references public.profiles (id) on delete cascade,
  target_type  text not null check (target_type in ('user', 'drama', 'actor', 'collection')),
  target_id    text not null,
  created_at   timestamptz not null default now(),
  primary key (follower_id, target_type, target_id)
);
create index follows_target on public.follows (target_type, target_id);

create table public.blocks (
  blocker_id  uuid not null references public.profiles (id) on delete cascade,
  blocked_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked on public.blocks (blocked_id);

create table public.mutes (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('user', 'drama')),
  target_id   text not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);

create table public.drama_notify (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  drama_id   text not null references public.catalog_dramas (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, drama_id)
);
create index drama_notify_drama on public.drama_notify (drama_id);

create or replace function public.is_blocked_pair(a uuid, b uuid) returns boolean
language sql stable as $$
  select a is not null and b is not null and exists (
    select 1 from public.blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a))
$$;

-- -------------------------------------------------------------------------------------
-- 4. Watchlist
-- -------------------------------------------------------------------------------------
create table public.watchlist_items (
  user_id          uuid not null references public.profiles (id) on delete cascade,
  drama_id         text not null references public.catalog_dramas (id) on delete cascade,
  status           text not null check (status in ('watching', 'planned', 'completed', 'dropped', 'paused')),
  season           int not null default 1,
  current_episode  int not null default 0,
  note             text check (char_length(note) <= 200),   -- private, never exposed to others
  rating           smallint check (rating between 1 and 10),
  added_at         timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  completed_at     timestamptz,
  primary key (user_id, drama_id)
);
create index watchlist_drama_status on public.watchlist_items (drama_id, status);

-- -------------------------------------------------------------------------------------
-- 5. Media (bytes live in R2; this is the ledger)
-- -------------------------------------------------------------------------------------
create table public.media_uploads (
  key             text primary key check (key ~ '^(avatars|posts|video)/[0-9a-f-]{36}/[0-9A-Z]{26}(_t|_p)?\.(jpg|webp|png|mp4)$'),
  owner_id        uuid not null references public.profiles (id) on delete cascade,
  kind            text not null check (kind in ('avatar', 'image', 'thumb', 'video', 'poster')),
  mime            text not null check (mime in ('image/jpeg', 'image/png', 'image/webp', 'video/mp4')),
  bytes_declared  bigint not null check (bytes_declared > 0),
  bytes           bigint,
  width           int,
  height          int,
  duration_ms     int,
  status          text not null default 'pending' check (status in ('pending', 'ready', 'failed', 'blocked', 'deleted')),
  upload_id       text,                                     -- S3 multipart upload id (null for single PUT)
  created_at      timestamptz not null default now(),
  ready_at        timestamptz
);
create index media_uploads_owner on public.media_uploads (owner_id, created_at desc);
create index media_uploads_status on public.media_uploads (status, created_at) where status in ('pending', 'deleted');

-- -------------------------------------------------------------------------------------
-- 6. Content
-- -------------------------------------------------------------------------------------
create table public.posts (
  id                 uuid primary key,                       -- client-generated uuid (idempotent create)
  author_id          uuid not null references public.profiles (id) on delete cascade,
  type               text not null check (type in ('post', 'reaction', 'discussion', 'review', 'recommendation', 'short')),
  body               text not null default '' check (char_length(body) <= 5000),
  title              text check (char_length(title) <= 90),
  kind               text,                                  -- reaction kind for type='reaction'
  rating             smallint check (rating between 1 and 10),
  verdict            text check (char_length(verdict) <= 120),
  spoiler            text not null default 'none' check (spoiler in ('none', 'episode', 'season', 'ending')),
  drama_id           text references public.catalog_dramas (id),
  secondary_drama_id text references public.catalog_dramas (id),
  season             int,
  episode            int,
  actor_ids          text[] not null default '{}' check (cardinality(actor_ids) <= 3),
  hashtags           text[] not null default '{}' check (cardinality(hashtags) <= 20),
  mention_ids        uuid[] not null default '{}' check (cardinality(mention_ids) <= 10),
  loved              int not null default 0,
  cried              int not null default 0,
  screamed           int not null default 0,
  swooned            int not null default 0,
  laughed            int not null default 0,
  furious            int not null default 0,
  comment_count      int not null default 0,
  save_count         int not null default 0,
  share_count        int not null default 0,
  state              text not null default 'active' check (state in ('active', 'hidden', 'removed', 'deleted')),
  created_at         timestamptz not null default now(),
  edited_at          timestamptz,
  deleted_at         timestamptz,
  fts                tsvector generated always as (to_tsvector('simple', coalesce(title, '') || ' ' || left(body, 2000) || ' ' || public.imm_array_to_string(hashtags, ' '))) stored,
  check (episode is null or season is not null),
  check (type <> 'discussion' or title is not null),
  check (type <> 'review' or (rating is not null and drama_id is not null)),
  check (type <> 'reaction' or kind in ('loved', 'cried', 'screamed', 'swooned', 'laughed', 'furious'))
);
create index posts_active_created on public.posts (created_at desc, id desc) where state = 'active';
create index posts_author_created on public.posts (author_id, created_at desc);
create index posts_drama_created on public.posts (drama_id, created_at desc) where state = 'active';
create index posts_episode on public.posts (drama_id, season, episode, created_at desc) where state = 'active' and episode is not null;
create index posts_shorts on public.posts (created_at desc) where state = 'active' and type = 'short';
create index posts_hashtags on public.posts using gin (hashtags);
create index posts_actor_ids on public.posts using gin (actor_ids);
create index posts_mentions on public.posts using gin (mention_ids);
create index posts_fts on public.posts using gin (fts);

create table public.post_media (
  post_id      uuid not null references public.posts (id) on delete cascade,
  ord          smallint not null check (ord between 0 and 5),
  key          text not null references public.media_uploads (key),
  kind         text not null check (kind in ('image', 'video')),
  thumb_key    text references public.media_uploads (key),  -- 640px variant for images
  poster_key   text references public.media_uploads (key),  -- for video
  width        int,
  height       int,
  duration_ms  int,
  primary key (post_id, ord)
);
create index post_media_key on public.post_media (key);

create table public.comments (
  id               uuid primary key,
  post_id          uuid not null references public.posts (id) on delete cascade,
  author_id        uuid not null references public.profiles (id) on delete cascade,
  parent_id        uuid references public.comments (id) on delete cascade,
  reply_to_user_id uuid references public.profiles (id) on delete set null,
  body             text not null check (char_length(body) between 1 and 1000),
  spoiler          text not null default 'none' check (spoiler in ('none', 'episode', 'season', 'ending')),
  loved int not null default 0, cried int not null default 0, screamed int not null default 0,
  swooned int not null default 0, laughed int not null default 0, furious int not null default 0,
  reply_count      int not null default 0,
  state            text not null default 'active' check (state in ('active', 'hidden', 'removed', 'deleted')),
  created_at       timestamptz not null default now(),
  edited_at        timestamptz
);
create index comments_post_created on public.comments (post_id, created_at) where state = 'active';
create index comments_parent on public.comments (parent_id) where parent_id is not null;
create index comments_author on public.comments (author_id, created_at desc);

-- one level of nesting only
create or replace function public.comments_depth_guard() returns trigger language plpgsql as $$
begin
  if new.parent_id is not null and exists (select 1 from public.comments c where c.id = new.parent_id and c.parent_id is not null) then
    perform public.fail(422, 'Replies can only be one level deep');
  end if;
  return new;
end $$;
create trigger comments_depth before insert on public.comments for each row execute function public.comments_depth_guard();

create table public.reactions (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment')),
  target_id   uuid not null,
  kind        text not null check (kind in ('loved', 'cried', 'screamed', 'swooned', 'laughed', 'furious')),
  created_at  timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);
create index reactions_target on public.reactions (target_type, target_id, kind);

create table public.saves (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  post_id    uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index saves_post on public.saves (post_id);

create table public.collections (
  id              uuid primary key,
  owner_id        uuid not null references public.profiles (id) on delete cascade,
  title           text not null check (char_length(title) between 1 and 60),
  description     text check (char_length(description) <= 240),
  visibility      text not null default 'public' check (visibility in ('public', 'private')),
  cover_drama_id  text references public.catalog_dramas (id),
  item_count      int not null default 0,
  follower_count  int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index collections_owner on public.collections (owner_id, updated_at desc);
create trigger collections_touch before update on public.collections for each row execute function public.touch_updated_at();

create table public.collection_items (
  collection_id uuid not null references public.collections (id) on delete cascade,
  drama_id      text not null references public.catalog_dramas (id),
  note          text check (char_length(note) <= 200),
  added_at      timestamptz not null default now(),
  primary key (collection_id, drama_id)
);

-- live-room meter per episode (maintained by triggers)
create table public.episode_reaction_counts (
  drama_id text not null, season int not null, episode int not null,
  kind text not null check (kind in ('loved', 'cried', 'screamed', 'swooned', 'laughed', 'furious')),
  count int not null default 0,
  primary key (drama_id, season, episode, kind)
);

-- -------------------------------------------------------------------------------------
-- 7. Notifications & push
-- -------------------------------------------------------------------------------------
create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  kind          text not null check (kind in ('reaction', 'comment', 'reply', 'follow', 'mention', 'episode_aired', 'episode_live', 'drama_trending', 'collection_saved', 'system')),
  "group"       text not null check ("group" in ('social', 'drama', 'mentions', 'system')),
  group_key     text,                                       -- collapse key, e.g. reaction:post:<id>:<hour>
  actor_ids     uuid[] not null default '{}',
  post_id       uuid references public.posts (id) on delete cascade,
  comment_id    uuid references public.comments (id) on delete cascade,
  drama_id      text references public.catalog_dramas (id) on delete cascade,
  season        int,
  episode       int,
  collection_id uuid references public.collections (id) on delete cascade,
  title         text,
  body          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  read_at       timestamptz,
  pushed_at     timestamptz
);
create unique index notifications_group_key on public.notifications (user_id, group_key) where group_key is not null;
create index notifications_user_created on public.notifications (user_id, updated_at desc);
create index notifications_unread on public.notifications (user_id) where read_at is null;

create table public.push_tokens (
  token        text primary key check (token like 'ExponentPushToken[%]' or token like 'ExpoPushToken[%]'),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  platform     text not null check (platform in ('ios', 'android', 'web')),
  device_id    text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disabled_at  timestamptz
);
create index push_tokens_user on public.push_tokens (user_id) where disabled_at is null;

-- -------------------------------------------------------------------------------------
-- 8. Safety, moderation, audit, config, rate limits
-- -------------------------------------------------------------------------------------
create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references public.profiles (id) on delete cascade,
  target_type  text not null check (target_type in ('post', 'comment', 'user', 'drama', 'collection')),
  target_id    text not null,
  reason       text not null check (reason in ('spam', 'harassment', 'hate', 'sexual', 'violence', 'self_harm', 'spoiler_abuse', 'impersonation', 'misinformation', 'other')),
  detail       text check (char_length(detail) <= 500),
  status       text not null default 'open' check (status in ('open', 'reviewed', 'dismissed', 'actioned')),
  created_at   timestamptz not null default now(),
  reviewed_by  uuid references public.profiles (id),
  reviewed_at  timestamptz,
  unique (reporter_id, target_type, target_id)
);
create index reports_open on public.reports (status, created_at) where status = 'open';
create index reports_target on public.reports (target_type, target_id);

create table public.moderation_actions (
  id          bigserial primary key,
  actor_id    uuid references public.profiles (id),        -- null = automated
  target_type text not null,
  target_id   text not null,
  action      text not null check (action in ('hide', 'unhide', 'remove', 'limit_user', 'unlimit_user', 'suspend_user', 'dismiss_reports', 'delete_media')),
  reason      text,
  created_at  timestamptz not null default now()
);

create table public.moderation_scans (
  id          bigserial primary key,
  target_type text not null,
  target_id   text not null,
  provider    text not null,
  scores      jsonb not null,
  flagged     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index moderation_scans_target on public.moderation_scans (target_type, target_id);

create table public.audit_log (
  id          bigserial primary key,
  actor_id    uuid,
  action      text not null,
  target_type text,
  target_id   text,
  meta        jsonb,
  created_at  timestamptz not null default now()
);

create table public.app_config (
  key   text primary key,
  value jsonb not null
);
insert into public.app_config values ('realtime_rooms', 'true'), ('min_app_version', '"1.0.0"'), ('media_base', '"https://media.hallyu.app/"');

create table public.rate_limits (
  user_id      uuid not null,
  bucket       text not null,
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (user_id, bucket, window_start)
);

create or replace function public.check_rate(p_bucket text, p_limit int, p_window interval) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public.require_user(); v_ws timestamptz := date_bin(p_window, now(), timestamptz '2000-01-01'); v_count int;
begin
  insert into public.rate_limits (user_id, bucket, window_start, count) values (v_uid, p_bucket, v_ws, 1)
  on conflict (user_id, bucket, window_start) do update set count = public.rate_limits.count + 1
  returning count into v_count;
  if v_count > p_limit then perform public.fail(429, 'Too many requests — try again later'); end if;
end $$;

create or replace function public.assert_can_write() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public.require_user(); v_state text;
begin
  select state into v_state from public.profiles where id = v_uid;
  if v_state is distinct from 'active' then perform public.fail(403, 'Your account cannot post right now'); end if;
  return v_uid;
end $$;

-- -------------------------------------------------------------------------------------
-- 9. Counters & notifications (triggers)
-- -------------------------------------------------------------------------------------
create or replace function public.notify(
  p_user uuid, p_kind text, p_group text, p_group_key text, p_actor uuid,
  p_post uuid default null, p_comment uuid default null, p_drama text default null, p_season int default null, p_episode int default null,
  p_collection uuid default null, p_title text default null, p_body text default null
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_user is null or p_user = p_actor or public.is_blocked_pair(p_user, p_actor) then return; end if;
  if p_group_key is null then
    insert into public.notifications (user_id, kind, "group", actor_ids, post_id, comment_id, drama_id, season, episode, collection_id, title, body)
    values (p_user, p_kind, p_group, case when p_actor is null then '{}' else array[p_actor] end, p_post, p_comment, p_drama, p_season, p_episode, p_collection, p_title, p_body);
  else
    insert into public.notifications (user_id, kind, "group", group_key, actor_ids, post_id, comment_id, drama_id, season, episode, collection_id, title, body)
    values (p_user, p_kind, p_group, p_group_key, case when p_actor is null then '{}' else array[p_actor] end, p_post, p_comment, p_drama, p_season, p_episode, p_collection, p_title, p_body)
    on conflict (user_id, group_key) where group_key is not null do update
      set actor_ids = (select array_agg(distinct a) from unnest(array_prepend(p_actor, public.notifications.actor_ids)) a where a is not null)[1:50],
          updated_at = now(), read_at = null;
  end if;
end $$;

create or replace function public.reactions_after() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; d int; k text; v_author uuid; v_drama text; v_season int; v_episode int;
begin
  for r in select * from (values ('old', case when tg_op in ('DELETE', 'UPDATE') then (old).kind end, -1), ('new', case when tg_op in ('INSERT', 'UPDATE') then (new).kind end, 1)) t(which, kind, delta) loop
    if r.kind is null then continue; end if;
    k := r.kind; d := r.delta;
    if coalesce(new.target_type, old.target_type) = 'post' then
      execute format('update public.posts set %I = greatest(0, %I + $1) where id = $2 returning author_id, drama_id, season, episode', k, k)
        into v_author, v_drama, v_season, v_episode using d, coalesce(new.target_id, old.target_id);
      if v_episode is not null then
        insert into public.episode_reaction_counts (drama_id, season, episode, kind, count) values (v_drama, v_season, v_episode, k, greatest(0, d))
        on conflict (drama_id, season, episode, kind) do update set count = greatest(0, public.episode_reaction_counts.count + d);
      end if;
    else
      execute format('update public.comments set %I = greatest(0, %I + $1) where id = $2 returning author_id', k, k)
        into v_author using d, coalesce(new.target_id, old.target_id);
    end if;
  end loop;
  if tg_op = 'INSERT' then
    perform public.notify(v_author, 'reaction', 'social', 'reaction:' || new.target_type || ':' || new.target_id || ':' || to_char(now(), 'YYYYMMDDHH24'), new.user_id,
      case when new.target_type = 'post' then new.target_id end, case when new.target_type = 'comment' then new.target_id end);
  end if;
  return null;
end $$;
create trigger reactions_after after insert or update or delete on public.reactions for each row execute function public.reactions_after();

create or replace function public.comments_after_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_post_author uuid; v_parent_author uuid; m uuid;
begin
  update public.posts set comment_count = comment_count + 1 where id = new.post_id returning author_id into v_post_author;
  if new.parent_id is not null then
    update public.comments set reply_count = reply_count + 1 where id = new.parent_id returning author_id into v_parent_author;
    perform public.notify(v_parent_author, 'reply', 'social', null, new.author_id, new.post_id, new.id, null, null, null, null, null, left(new.body, 140));
  end if;
  if v_post_author is distinct from v_parent_author then
    perform public.notify(v_post_author, 'comment', 'social', 'comment:post:' || new.post_id || ':' || to_char(now(), 'YYYYMMDDHH24'), new.author_id, new.post_id, new.id);
  end if;
  return null;
end $$;
create trigger comments_after_insert after insert on public.comments for each row execute function public.comments_after_insert();

create or replace function public.comments_after_state() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.state = 'active' and new.state <> 'active' then
    update public.posts set comment_count = greatest(0, comment_count - 1) where id = new.post_id;
    if new.parent_id is not null then update public.comments set reply_count = greatest(0, reply_count - 1) where id = new.parent_id; end if;
  elsif old.state <> 'active' and new.state = 'active' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
    if new.parent_id is not null then update public.comments set reply_count = reply_count + 1 where id = new.parent_id; end if;
  end if;
  return null;
end $$;
create trigger comments_after_state after update of state on public.comments for each row execute function public.comments_after_state();

create or replace function public.saves_after() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then update public.posts set save_count = save_count + 1 where id = new.post_id;
  else update public.posts set save_count = greatest(0, save_count - 1) where id = old.post_id; end if;
  return null;
end $$;
create trigger saves_after after insert or delete on public.saves for each row execute function public.saves_after();

create or replace function public.follows_after() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare d int := case when tg_op = 'INSERT' then 1 else -1 end; r record := coalesce(new, old); v_owner uuid;
begin
  update public.profiles set following_count = greatest(0, following_count + d) where id = r.follower_id and r.target_type = 'user';
  if r.target_type = 'user' then
    update public.profiles set follower_count = greatest(0, follower_count + d) where id = r.target_id::uuid;
    if tg_op = 'INSERT' then perform public.notify(r.target_id::uuid, 'follow', 'social', 'follow:' || to_char(now(), 'YYYYMMDD'), r.follower_id); end if;
  elsif r.target_type = 'drama' then
    update public.catalog_dramas set follower_count = greatest(0, follower_count + d) where id = r.target_id;
  elsif r.target_type = 'actor' then
    update public.catalog_actors set follower_count = greatest(0, follower_count + d) where id = r.target_id;
  elsif r.target_type = 'collection' then
    update public.collections set follower_count = greatest(0, follower_count + d) where id = r.target_id::uuid returning owner_id into v_owner;
    if tg_op = 'INSERT' then perform public.notify(v_owner, 'collection_saved', 'social', 'collection:' || r.target_id || ':' || to_char(now(), 'YYYYMMDD'), r.follower_id, null, null, null, null, null, r.target_id::uuid); end if;
  end if;
  return null;
end $$;
create trigger follows_after after insert or delete on public.follows for each row execute function public.follows_after();

create or replace function public.posts_after_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare m uuid;
begin
  update public.profiles set post_count = post_count + 1 where id = new.author_id;
  if new.drama_id is not null then update public.catalog_dramas set post_count = post_count + 1 where id = new.drama_id; end if;
  if new.type = 'reaction' and new.episode is not null then
    insert into public.episode_reaction_counts (drama_id, season, episode, kind, count) values (new.drama_id, new.season, new.episode, new.kind, 1)
    on conflict (drama_id, season, episode, kind) do update set count = public.episode_reaction_counts.count + 1;
  end if;
  foreach m in array new.mention_ids loop
    perform public.notify(m, 'mention', 'mentions', null, new.author_id, new.id, null, null, null, null, null, null, left(new.body, 140));
  end loop;
  return null;
end $$;
create trigger posts_after_insert after insert on public.posts for each row execute function public.posts_after_insert();

create or replace function public.posts_after_state() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare d int;
begin
  d := case when old.state = 'active' and new.state <> 'active' then -1 when old.state <> 'active' and new.state = 'active' then 1 else 0 end;
  if d <> 0 then
    update public.profiles set post_count = greatest(0, post_count + d) where id = new.author_id;
    if new.drama_id is not null then update public.catalog_dramas set post_count = greatest(0, post_count + d) where id = new.drama_id; end if;
  end if;
  return null;
end $$;
create trigger posts_after_state after update of state on public.posts for each row execute function public.posts_after_state();

create or replace function public.collection_items_after() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then update public.collections set item_count = item_count + 1, updated_at = now() where id = new.collection_id;
  else update public.collections set item_count = greatest(0, item_count - 1), updated_at = now() where id = old.collection_id; end if;
  return null;
end $$;
create trigger collection_items_after after insert or delete on public.collection_items for each row execute function public.collection_items_after();

create or replace function public.watchlist_after() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.status = 'watching' then update public.catalog_dramas set watching_count = greatest(0, watching_count - 1) where id = old.drama_id; end if;
  if tg_op in ('INSERT', 'UPDATE') and new.status = 'watching' then update public.catalog_dramas set watching_count = watching_count + 1 where id = new.drama_id; end if;
  return null;
end $$;
create trigger watchlist_after after insert or update of status or delete on public.watchlist_items for each row execute function public.watchlist_after();

-- blocking removes follows both ways
create or replace function public.blocks_after_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.follows where target_type = 'user' and ((follower_id = new.blocker_id and target_id = new.blocked_id::text) or (follower_id = new.blocked_id and target_id = new.blocker_id::text));
  return null;
end $$;
create trigger blocks_after_insert after insert on public.blocks for each row execute function public.blocks_after_insert();

-- -------------------------------------------------------------------------------------
-- 10. Row Level Security (default deny; policies below are the whole allow-list)
-- -------------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.reserved_handles enable row level security;
alter table public.catalog_dramas enable row level security;
alter table public.catalog_actors enable row level security;
alter table public.catalog_cast enable row level security;
alter table public.catalog_episodes enable row level security;
alter table public.follows enable row level security;
alter table public.blocks enable row level security;
alter table public.mutes enable row level security;
alter table public.drama_notify enable row level security;
alter table public.watchlist_items enable row level security;
alter table public.media_uploads enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.comments enable row level security;
alter table public.reactions enable row level security;
alter table public.saves enable row level security;
alter table public.collections enable row level security;
alter table public.collection_items enable row level security;
alter table public.episode_reaction_counts enable row level security;
alter table public.notifications enable row level security;
alter table public.push_tokens enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.moderation_scans enable row level security;
alter table public.audit_log enable row level security;
alter table public.app_config enable row level security;
alter table public.rate_limits enable row level security;

-- public reads
create policy profiles_read on public.profiles for select using (state <> 'deleted' or id = (select auth.uid()) or public.is_moderator());
create policy catalog_dramas_read on public.catalog_dramas for select using (true);
create policy catalog_actors_read on public.catalog_actors for select using (true);
create policy catalog_cast_read on public.catalog_cast for select using (true);
create policy catalog_episodes_read on public.catalog_episodes for select using (true);
create policy episode_counts_read on public.episode_reaction_counts for select using (true);
create policy app_config_read on public.app_config for select using (true);
create policy posts_read on public.posts for select using (state = 'active' or author_id = (select auth.uid()) or public.is_moderator());
create policy post_media_read on public.post_media for select using (exists (select 1 from public.posts p where p.id = post_id and (p.state = 'active' or p.author_id = (select auth.uid()) or public.is_moderator())));
create policy comments_read on public.comments for select using (state = 'active' or author_id = (select auth.uid()) or public.is_moderator());
create policy reactions_read on public.reactions for select using (true);           -- "who reacted"; counts are denormalised anyway
create policy collections_read on public.collections for select using (visibility = 'public' or owner_id = (select auth.uid()) or public.is_moderator());
create policy collection_items_read on public.collection_items for select using (exists (select 1 from public.collections c where c.id = collection_id and (c.visibility = 'public' or c.owner_id = (select auth.uid()))));
create policy follows_read on public.follows for select using (true);               -- connections lists are public (private accounts not enforced in v1)

-- owner-only rows
create policy profiles_update on public.profiles for update using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy blocks_own on public.blocks for all using (blocker_id = (select auth.uid())) with check (blocker_id = (select auth.uid()));
create policy mutes_own on public.mutes for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy drama_notify_own on public.drama_notify for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy watchlist_own on public.watchlist_items for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy media_uploads_own_read on public.media_uploads for select using (owner_id = (select auth.uid()) or public.is_moderator());
create policy saves_own on public.saves for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_own_read on public.notifications for select using (user_id = (select auth.uid()));
create policy push_tokens_own on public.push_tokens for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy reports_own_read on public.reports for select using (reporter_id = (select auth.uid()) or public.is_moderator());
create policy collections_write on public.collections for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy collection_items_write on public.collection_items for all
  using (exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = (select auth.uid())));
create policy moderation_read on public.moderation_actions for select using (public.is_moderator());
create policy scans_read on public.moderation_scans for select using (public.is_moderator());
create policy audit_read on public.audit_log for select using (public.auth_role() = 'admin');
-- Everything else (posts/comments/reactions/follows writes, media_uploads writes, reports insert, rate_limits, catalog writes)
-- happens only through security-definer RPCs or the service role. No insert/update policies exist for them on purpose.

-- column-level protection on profiles (counters, verified, state are server-owned)
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_key, bio, favorite_genres, favorite_drama_ids, is_private, prefs, onboarding, terms_version, language, last_seen_at) on public.profiles to authenticated;

-- -------------------------------------------------------------------------------------
-- 11. API schema: views (security_invoker ⇒ RLS of the caller applies)
-- -------------------------------------------------------------------------------------
create view api.profiles with (security_invoker = true) as
  select id, handle, display_name, avatar_key, bio, favorite_genres, favorite_drama_ids, follower_count, following_count, post_count,
         verified, is_private, state, created_at,
         case when id = auth.uid() then prefs end as prefs,
         case when id = auth.uid() then onboarding end as onboarding,
         case when id = auth.uid() then terms_version end as terms_version,
         case when id = auth.uid() then language end as language
  from public.profiles;

create view api.posts with (security_invoker = true) as
  select p.* from public.posts p where not public.is_blocked_pair(p.author_id, auth.uid());
create view api.post_media with (security_invoker = true) as select * from public.post_media;
create view api.comments with (security_invoker = true) as
  select c.* from public.comments c where not public.is_blocked_pair(c.author_id, auth.uid());
create view api.collections with (security_invoker = true) as select * from public.collections;
create view api.collection_items with (security_invoker = true) as select * from public.collection_items;
create view api.follows with (security_invoker = true) as select * from public.follows;
create view api.blocks with (security_invoker = true) as select * from public.blocks;
create view api.mutes with (security_invoker = true) as select * from public.mutes;
create view api.drama_notify with (security_invoker = true) as select * from public.drama_notify;
create view api.watchlist_items with (security_invoker = true) as select * from public.watchlist_items;
create view api.saves with (security_invoker = true) as select * from public.saves;
create view api.notifications with (security_invoker = true) as select * from public.notifications;
create view api.push_tokens with (security_invoker = true) as select * from public.push_tokens;
create view api.reports with (security_invoker = true) as select id, target_type, target_id, reason, status, created_at from public.reports;
create view api.catalog_dramas with (security_invoker = true) as select * from public.catalog_dramas;
create view api.catalog_actors with (security_invoker = true) as select * from public.catalog_actors;
create view api.catalog_cast with (security_invoker = true) as select * from public.catalog_cast;
create view api.catalog_episodes with (security_invoker = true) as select * from public.catalog_episodes;
create view api.episode_reaction_counts with (security_invoker = true) as select * from public.episode_reaction_counts;
create view api.app_config with (security_invoker = true) as select * from public.app_config;


-- -------------------------------------------------------------------------------------
-- 12. RPCs — identity & graph
-- -------------------------------------------------------------------------------------
create or replace function api.claim_handle(p_handle text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public.require_user(); v_last timestamptz;
begin
  if p_handle !~ '^[a-z0-9_]{3,20}$' then perform public.fail(422, 'Handle must be 3–20 lowercase letters, numbers or _'); end if;
  if exists (select 1 from public.reserved_handles where handle = p_handle) then perform public.fail(409, 'That handle is reserved'); end if;
  select handle_changed_at into v_last from public.profiles where id = v_uid;
  if v_last is not null and v_last > now() - interval '30 days' then perform public.fail(429, 'You can change your handle once every 30 days'); end if;
  begin
    update public.profiles set handle = p_handle, handle_changed_at = now() where id = v_uid;
  exception when unique_violation then perform public.fail(409, 'That handle is taken');
  end;
  insert into public.audit_log (actor_id, action, target_type, target_id) values (v_uid, 'claim_handle', 'profile', p_handle);
end $$;

create or replace function api.set_follow(p_type text, p_id text, p_on boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public.assert_can_write();
begin
  perform public.check_rate('follow', 100, interval '1 hour');
  if p_type = 'user' then
    if p_id = v_uid::text then perform public.fail(422, 'You cannot follow yourself'); end if;
    if public.is_blocked_pair(v_uid, p_id::uuid) then perform public.fail(403, 'Unavailable'); end if;
  elsif p_type = 'collection' then
    if not exists (select 1 from public.collections where id = p_id::uuid and visibility = 'public') then perform public.fail(404, 'Collection not found'); end if;
  elsif p_type not in ('drama', 'actor') then perform public.fail(422, 'Unknown follow target'); end if;
  if p_on then
    insert into public.follows (follower_id, target_type, target_id) values (v_uid, p_type, p_id) on conflict do nothing;
  else
    delete from public.follows where follower_id = v_uid and target_type = p_type and target_id = p_id;
  end if;
end $$;

create or replace function api.set_drama_notify(p_drama_id text, p_on boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public.require_user();
begin
  if p_on then insert into public.drama_notify (user_id, drama_id) values (v_uid, p_drama_id) on conflict do nothing;
  else delete from public.drama_notify where user_id = v_uid and drama_id = p_drama_id; end if;
end $$;

create or replace function api.set_block(p_user_id uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public.require_user();
begin
  if p_user_id = v_uid then perform public.fail(422, 'You cannot block yourself'); end if;
  if p_on then insert into public.blocks (blocker_id, blocked_id) values (v_uid, p_user_id) on conflict do nothing;
  else delete from public.blocks where blocker_id = v_uid and blocked_id = p_user_id; end if;
end $$;

create or replace function api.set_mute(p_type text, p_id text, p_on boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public.require_user();
begin
  if p_on then insert into public.mutes (user_id, target_type, target_id) values (v_uid, p_type, p_id) on conflict do nothing;
  else delete from public.mutes where user_id = v_uid and target_type = p_type and target_id = p_id; end if;
end $$;

create or replace function api.upsert_watchlist(p_drama_id text, p_status text, p_season int default null, p_episode int default null, p_note text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public.require_user();
begin
  perform public.check_rate('watchlist', 300, interval '1 hour');
  insert into public.watchlist_items as w (user_id, drama_id, status, season, current_episode, note, completed_at)
  values (v_uid, p_drama_id, p_status, coalesce(p_season, 1), coalesce(p_episode, 0), p_note, case when p_status = 'completed' then now() end)
  on conflict (user_id, drama_id) do update set
    status = excluded.status,
    season = coalesce(p_season, w.season),
    current_episode = coalesce(p_episode, w.current_episode),
    note = coalesce(p_note, w.note),
    completed_at = case when excluded.status = 'completed' then coalesce(w.completed_at, now()) else null end,
    updated_at = now();
end $$;

create or replace function api.remove_watchlist(p_drama_id text) returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from public.watchlist_items where user_id = public.require_user() and drama_id = p_drama_id;
$$;

-- -------------------------------------------------------------------------------------
-- 13. RPCs — content writes
-- -------------------------------------------------------------------------------------
create or replace function api.set_reaction(p_type text, p_id uuid, p_kind text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public.assert_can_write(); v_author uuid;
begin
  perform public.check_rate('react', 300, interval '1 hour');
  if p_type = 'post' then select author_id into v_author from public.posts where id = p_id and state = 'active';
  elsif p_type = 'comment' then select author_id into v_author from public.comments where id = p_id and state = 'active';
  else perform public.fail(422, 'Unknown target'); end if;
  if v_author is null then perform public.fail(404, 'Not found'); end if;
  if public.is_blocked_pair(v_uid, v_author) then perform public.fail(403, 'Unavailable'); end if;
  if p_kind is null then
    delete from public.reactions where user_id = v_uid and target_type = p_type and target_id = p_id;
  else
    insert into public.reactions (user_id, target_type, target_id, kind) values (v_uid, p_type, p_id, p_kind)
    on conflict (user_id, target_type, target_id) do update set kind = excluded.kind, created_at = now() where public.reactions.kind is distinct from excluded.kind;
  end if;
end $$;

create or replace function api.set_save(p_post_id uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public.require_user();
begin
  perform public.check_rate('save', 200, interval '1 hour');
  if p_on then
    if not exists (select 1 from public.posts where id = p_post_id and state = 'active') then perform public.fail(404, 'Post not found'); end if;
    insert into public.saves (user_id, post_id) values (v_uid, p_post_id) on conflict do nothing;
  else delete from public.saves where user_id = v_uid and post_id = p_post_id; end if;
end $$;

-- p: { id, type, body, title, kind, rating, verdict, spoiler, context:{dramaId, secondaryDramaId, season, episode, actorIds}, hashtags, mentionIds,
--      media:[{key, kind, thumbKey, posterKey, width, height, durationMs}] }
create or replace function api.create_post(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.assert_can_write(); v_id uuid := (p ->> 'id')::uuid; v_type text := p ->> 'type'; v_body text := coalesce(p ->> 'body', '');
  v_limit int; v_media jsonb := coalesce(p -> 'media', '[]'::jsonb); m jsonb; i int := 0; v_videos int := 0; v_max_ms int;
  v_drama text := p -> 'context' ->> 'dramaId';
begin
  perform public.check_rate('post', 20, interval '1 hour');
  if exists (select 1 from public.posts where id = v_id) then return jsonb_build_object('id', v_id, 'duplicate', true); end if;
  v_limit := case v_type when 'post' then 1000 when 'reaction' then 140 when 'discussion' then 5000 when 'review' then 5000 when 'recommendation' then 500 when 'short' then 300 else null end;
  if v_limit is null then perform public.fail(422, 'Unknown post type'); end if;
  if char_length(v_body) > v_limit then perform public.fail(422, format('Too long (max %s characters)', v_limit)); end if;
  if v_type in ('review', 'recommendation', 'reaction') and v_drama is null then perform public.fail(422, 'Pick a drama first'); end if;
  if v_drama is not null and not exists (select 1 from public.catalog_dramas where id = v_drama) then perform public.fail(422, 'Unknown drama — call ensure-catalog first'); end if;
  if jsonb_array_length(v_media) > 6 then perform public.fail(422, 'Up to 6 images'); end if;
  if v_type = 'short' and (jsonb_array_length(v_media) <> 1 or v_media -> 0 ->> 'kind' <> 'video') then perform public.fail(422, 'A short needs exactly one video'); end if;
  v_max_ms := case when v_type = 'short' then 60000 else 140000 end;

  insert into public.posts (id, author_id, type, body, title, kind, rating, verdict, spoiler, drama_id, secondary_drama_id, season, episode, actor_ids, hashtags, mention_ids)
  values (v_id, v_uid, v_type, v_body, p ->> 'title', p ->> 'kind', (p ->> 'rating')::smallint, p ->> 'verdict', coalesce(p ->> 'spoiler', 'none'),
          v_drama, p -> 'context' ->> 'secondaryDramaId', (p -> 'context' ->> 'season')::int, (p -> 'context' ->> 'episode')::int,
          coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p -> 'context' -> 'actorIds', '[]'::jsonb)) x), '{}'),
          coalesce((select array_agg(lower(x)) from jsonb_array_elements_text(coalesce(p -> 'hashtags', '[]'::jsonb)) x), '{}'),
          coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p -> 'mentionIds', '[]'::jsonb)) x), '{}'));

  for m in select * from jsonb_array_elements(v_media) loop
    if not exists (select 1 from public.media_uploads u where u.key = m ->> 'key' and u.owner_id = v_uid and u.status = 'ready') then
      perform public.fail(422, 'Media is not ready');
    end if;
    if m ->> 'kind' = 'video' then
      v_videos := v_videos + 1;
      if v_videos > 1 or jsonb_array_length(v_media) > 1 then perform public.fail(422, 'One video per post'); end if;
      if coalesce((m ->> 'durationMs')::int, 0) > v_max_ms + 1000 then perform public.fail(422, 'Video is too long'); end if;
      if not exists (select 1 from public.media_uploads u where u.key = m ->> 'posterKey' and u.owner_id = v_uid and u.status = 'ready') then perform public.fail(422, 'Video poster missing'); end if;
    end if;
    insert into public.post_media (post_id, ord, key, kind, thumb_key, poster_key, width, height, duration_ms)
    values (v_id, i, m ->> 'key', m ->> 'kind', m ->> 'thumbKey', m ->> 'posterKey', (m ->> 'width')::int, (m ->> 'height')::int, (m ->> 'durationMs')::int);
    i := i + 1;
  end loop;
  -- >>> supabase-only
  perform pgmq.send('moderation', jsonb_build_object('type', 'post', 'id', v_id));
  -- <<< supabase-only
  return jsonb_build_object('id', v_id, 'createdAt', now());
end $$;

create or replace function api.edit_post(p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public.assert_can_write(); v_created timestamptz; v_type text; v_limit int; v_body text;
begin
  select created_at, type into v_created, v_type from public.posts where id = p_id and author_id = v_uid and state = 'active';
  if v_created is null then perform public.fail(404, 'Post not found'); end if;
  if v_created < now() - interval '15 minutes' then perform public.fail(409, 'The 15-minute edit window has closed'); end if;
  v_body := coalesce(p ->> 'body', '');
  v_limit := case v_type when 'post' then 1000 when 'reaction' then 140 when 'discussion' then 5000 when 'review' then 5000 when 'recommendation' then 500 when 'short' then 300 end;
  if char_length(v_body) > v_limit then perform public.fail(422, 'Too long'); end if;
  update public.posts set body = v_body, title = coalesce(p ->> 'title', title), spoiler = coalesce(p ->> 'spoiler', spoiler),
    hashtags = coalesce((select array_agg(lower(x)) from jsonb_array_elements_text(coalesce(p -> 'hashtags', '[]'::jsonb)) x), hashtags), edited_at = now()
  where id = p_id;
end $$;

create or replace function api.delete_post(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public.require_user(); n int;
begin
  update public.posts set state = 'deleted', deleted_at = now() where id = p_id and author_id = v_uid and state <> 'deleted';
  get diagnostics n = row_count;
  if n = 0 then perform public.fail(404, 'Post not found'); end if;
  -- media purge is queued by the nightly job after the 24 h grace period (see cron section)
end $$;

create or replace function api.create_comment(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public.assert_can_write(); v_id uuid := (p ->> 'id')::uuid; v_post uuid := (p ->> 'postId')::uuid; v_author uuid;
begin
  perform public.check_rate('comment', 60, interval '1 hour');
  if exists (select 1 from public.comments where id = v_id) then return jsonb_build_object('id', v_id, 'duplicate', true); end if;
  select author_id into v_author from public.posts where id = v_post and state = 'active';
  if v_author is null then perform public.fail(404, 'Post not found'); end if;
  if public.is_blocked_pair(v_uid, v_author) then perform public.fail(403, 'Unavailable'); end if;
  insert into public.comments (id, post_id, author_id, parent_id, reply_to_user_id, body, spoiler)
  values (v_id, v_post, v_uid, (p ->> 'parentId')::uuid, (p ->> 'replyToUserId')::uuid, p ->> 'body', coalesce(p ->> 'spoiler', 'none'));
  -- >>> supabase-only
  perform pgmq.send('moderation', jsonb_build_object('type', 'comment', 'id', v_id));
  -- <<< supabase-only
  return jsonb_build_object('id', v_id, 'createdAt', now());
end $$;

create or replace function api.delete_comment(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public.require_user(); n int;
begin
  -- author, or the author of the post (owner moderation of their own thread)
  update public.comments c set state = 'deleted'
  where c.id = p_id and c.state <> 'deleted' and (c.author_id = v_uid or exists (select 1 from public.posts p where p.id = c.post_id and p.author_id = v_uid));
  get diagnostics n = row_count;
  if n = 0 then perform public.fail(404, 'Comment not found'); end if;
end $$;

create or replace function api.upsert_collection(p jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public.assert_can_write();
begin
  perform public.check_rate('collection', 60, interval '1 hour');
  insert into public.collections as c (id, owner_id, title, description, visibility, cover_drama_id)
  values ((p ->> 'id')::uuid, v_uid, p ->> 'title', p ->> 'description', coalesce(p ->> 'visibility', 'public'), p ->> 'coverDramaId')
  on conflict (id) do update set title = excluded.title, description = excluded.description, visibility = excluded.visibility, cover_drama_id = excluded.cover_drama_id
  where c.owner_id = v_uid;
end $$;

create or replace function api.delete_collection(p_id uuid) returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from public.collections where id = p_id and owner_id = public.require_user();
$$;

create or replace function api.set_collection_item(p_collection_id uuid, p_drama_id text, p_on boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public.require_user();
begin
  if not exists (select 1 from public.collections where id = p_collection_id and owner_id = v_uid) then perform public.fail(404, 'Collection not found'); end if;
  if p_on then
    insert into public.collection_items (collection_id, drama_id, note) values (p_collection_id, p_drama_id, p_note)
    on conflict (collection_id, drama_id) do update set note = coalesce(excluded.note, public.collection_items.note);
  else delete from public.collection_items where collection_id = p_collection_id and drama_id = p_drama_id; end if;
end $$;

create or replace function api.create_report(p_type text, p_id text, p_reason text, p_detail text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public.require_user(); v_recent int;
begin
  perform public.check_rate('report', 20, interval '1 day');
  insert into public.reports (reporter_id, target_type, target_id, reason, detail) values (v_uid, p_type, p_id, p_reason, p_detail)
  on conflict (reporter_id, target_type, target_id) do update set reason = excluded.reason, detail = excluded.detail, created_at = now(), status = 'open';
  -- brigading-resistant auto-hide: 3 distinct reporters (accounts older than 24 h) in 24 h
  if p_type in ('post', 'comment') then
    select count(distinct r.reporter_id) into v_recent from public.reports r join public.profiles pr on pr.id = r.reporter_id
    where r.target_type = p_type and r.target_id = p_id and r.created_at > now() - interval '24 hours' and pr.created_at < now() - interval '24 hours';
    if v_recent >= 3 then
      if p_type = 'post' then update public.posts set state = 'hidden' where id = p_id::uuid and state = 'active' and author_id not in (select id from public.profiles where verified);
      else update public.comments set state = 'hidden' where id = p_id::uuid and state = 'active'; end if;
      insert into public.moderation_actions (actor_id, target_type, target_id, action, reason) values (null, p_type, p_id, 'hide', 'auto: 3 reports in 24h');
    end if;
  end if;
end $$;

create or replace function api.mark_notifications_read(p_ids uuid[] default null) returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.notifications set read_at = now()
  where user_id = public.require_user() and read_at is null and (p_ids is null or id = any (p_ids));
$$;

create or replace function api.register_push_token(p_token text, p_platform text, p_device_id text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public.require_user();
begin
  insert into public.push_tokens (token, user_id, platform, device_id) values (p_token, v_uid, p_platform, p_device_id)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, device_id = excluded.device_id, last_seen_at = now(), disabled_at = null;
end $$;

create or replace function api.unregister_push_token(p_token text) returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from public.push_tokens where token = p_token and user_id = public.require_user();
$$;

-- Worker-only (service role): reserve an upload slot and enforce quotas.
create or replace function api.media_reserve(p_owner uuid, p_key text, p_kind text, p_mime text, p_bytes bigint, p_upload_id text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_age interval; v_day int; v_videos int; v_cap bigint;
begin
  if not public.is_service_role() then perform public.fail(403, 'Forbidden'); end if;
  select now() - created_at into v_age from public.profiles where id = p_owner and state = 'active';
  if v_age is null then perform public.fail(403, 'Account cannot upload'); end if;
  select count(*), count(*) filter (where kind = 'video') into v_day, v_videos from public.media_uploads where owner_id = p_owner and created_at > now() - interval '1 day' and status <> 'failed';
  if v_age < interval '24 hours' and (v_day >= 5 or (p_kind = 'video' and v_videos >= 2)) then perform public.fail(429, 'New accounts can upload a few items per day'); end if;
  if v_day >= 30 or (p_kind = 'video' and v_videos >= 12) then perform public.fail(429, 'Daily upload limit reached'); end if;
  v_cap := case when p_kind = 'video' then 100 * 1024 * 1024 else 8 * 1024 * 1024 end;
  if p_bytes > v_cap then perform public.fail(413, 'File is too large'); end if;
  insert into public.media_uploads (key, owner_id, kind, mime, bytes_declared, upload_id) values (p_key, p_owner, p_kind, p_mime, p_bytes, p_upload_id);
end $$;

create or replace function api.media_finalize(p_key text, p_bytes bigint, p_ok boolean, p_width int default null, p_height int default null, p_duration_ms int default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_service_role() then perform public.fail(403, 'Forbidden'); end if;
  update public.media_uploads set status = case when p_ok then 'ready' else 'failed' end, bytes = p_bytes, width = coalesce(p_width, width), height = coalesce(p_height, height),
    duration_ms = coalesce(p_duration_ms, duration_ms), ready_at = case when p_ok then now() end
  where key = p_key and status = 'pending';
end $$;

-- -------------------------------------------------------------------------------------
-- 14. RPCs — reads (feed cards are built once, reused everywhere)
-- -------------------------------------------------------------------------------------
create or replace function public.post_card(p public.posts, v uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', p.id, 'type', p.type, 'body', p.body, 'title', p.title, 'kind', p.kind, 'rating', p.rating, 'verdict', p.verdict, 'spoiler', p.spoiler,
    'context', jsonb_strip_nulls(jsonb_build_object('dramaId', p.drama_id, 'secondaryDramaId', p.secondary_drama_id, 'season', p.season, 'episode', p.episode, 'actorIds', to_jsonb(p.actor_ids))),
    'hashtags', to_jsonb(p.hashtags), 'mentions', to_jsonb(p.mention_ids),
    'reactions', jsonb_build_object('loved', p.loved, 'cried', p.cried, 'screamed', p.screamed, 'swooned', p.swooned, 'laughed', p.laughed, 'furious', p.furious),
    'commentCount', p.comment_count, 'saveCount', p.save_count, 'shareCount', p.share_count,
    'createdAt', p.created_at, 'editedAt', p.edited_at, 'state', p.state,
    'author', (select jsonb_build_object('id', a.id, 'handle', a.handle, 'displayName', a.display_name, 'avatarKey', a.avatar_key, 'verified', a.verified) from public.profiles a where a.id = p.author_id),
    'drama', (select jsonb_build_object('id', d.id, 'title', d.title, 'posterPath', d.poster_path, 'tmdbId', d.tmdb_id) from public.catalog_dramas d where d.id = p.drama_id),
    'media', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('key', m.key, 'kind', m.kind, 'thumbKey', m.thumb_key, 'posterKey', m.poster_key, 'width', m.width, 'height', m.height, 'durationMs', m.duration_ms)) order by m.ord) from public.post_media m where m.post_id = p.id), '[]'::jsonb),
    'viewer', jsonb_build_object(
      'reaction', (select r.kind from public.reactions r where r.user_id = v and r.target_type = 'post' and r.target_id = p.id),
      'saved', exists (select 1 from public.saves s where s.user_id = v and s.post_id = p.id))
  )
$$;

-- Candidate filter shared by feeds: active, not blocked either way, author/drama not muted.
create or replace function public.visible_to(p public.posts, v uuid) returns boolean
language sql stable as $$
  select p.state = 'active'
     and not public.is_blocked_pair(p.author_id, v)
     and (v is null or not exists (select 1 from public.mutes m where m.user_id = v and ((m.target_type = 'user' and m.target_id = p.author_id::text) or (m.target_type = 'drama' and m.target_id = p.drama_id))))
$$;

-- For You: scoring mirrors lib/selectors.ts forYou(); p_asof pins the recency term for a feed session so pages are stable.
create or replace function api.feed_for_you(p_asof timestamptz default now(), p_after_score double precision default null, p_after_id uuid default null, p_limit int default 20)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with v as (select auth.uid() as uid),
  cand as (
    select p.* from public.posts p, v
    where p.created_at > p_asof - interval '7 days' and p.created_at <= p_asof and public.visible_to(p, v.uid)
    order by p.created_at desc limit 600
  ),
  scored as (
    select c.*,
      log(1 + c.loved + c.cried + c.screamed + c.swooned + c.laughed + c.furious + 2 * c.comment_count + 3 * c.save_count)
      + case when v.uid is not null and (exists (select 1 from public.follows f where f.follower_id = v.uid and f.target_type = 'drama' and f.target_id = c.drama_id)
                                        or exists (select 1 from public.watchlist_items w where w.user_id = v.uid and w.drama_id = c.drama_id)) then 0.8 else 0 end
      + case when v.uid is not null and exists (select 1 from public.follows f where f.follower_id = v.uid and f.target_type = 'user' and f.target_id = c.author_id::text) then 0.5 else 0 end
      + case when v.uid is not null and exists (select 1 from public.follows f where f.follower_id = v.uid and f.target_type = 'actor' and f.target_id = any (c.actor_ids)) then 0.3 else 0 end
      + case when v.uid is not null and exists (select 1 from public.profiles pr, public.catalog_dramas d where pr.id = v.uid and d.id = c.drama_id and d.genres && pr.favorite_genres) then 0.2 else 0 end
      + case when c.type = 'discussion' and c.episode is not null and exists (select 1 from public.catalog_episodes e where e.drama_id = c.drama_id and e.season = c.season and e.number = c.episode and e.air_at > p_asof - interval '48 hours') then 0.15 else 0 end
      - extract(epoch from (p_asof - c.created_at)) / 3600.0 / 18.0 as score
    from cand c, v
  ),
  page as (
    select s.* from scored s
    where p_after_score is null or (s.score, s.id) < (p_after_score, p_after_id)
    order by s.score desc, s.id desc limit least(p_limit, 40)
  )
  select coalesce(jsonb_agg(public.post_card(p, v.uid) || jsonb_build_object('score', page.score) order by page.score desc, page.id desc), '[]'::jsonb)
  from page join public.posts p on p.id = page.id, v
$$;

create or replace function api.feed_following(p_before timestamptz default now(), p_before_id uuid default null, p_limit int default 20)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with v as (select public.require_user() as uid),
  page as (
    select p.* from public.posts p, v
    where public.visible_to(p, v.uid)
      and (p.created_at, p.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
      and (exists (select 1 from public.follows f where f.follower_id = v.uid and f.target_type = 'user' and f.target_id = p.author_id::text)
        or exists (select 1 from public.follows f where f.follower_id = v.uid and f.target_type = 'drama' and f.target_id = p.drama_id)
        or exists (select 1 from public.follows f where f.follower_id = v.uid and f.target_type = 'actor' and f.target_id = any (p.actor_ids)))
    order by p.created_at desc, p.id desc limit least(p_limit, 40)
  )
  select coalesce(jsonb_agg(public.post_card(p, v.uid) order by page.created_at desc, page.id desc), '[]'::jsonb)
  from page join public.posts p on p.id = page.id, v
$$;

create or replace function api.feed_shorts(p_before timestamptz default now(), p_before_id uuid default null, p_limit int default 10)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with v as (select auth.uid() as uid),
  page as (
    select p.* from public.posts p, v
    where p.type = 'short' and public.visible_to(p, v.uid)
      and (p.created_at, p.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
    order by p.created_at desc, p.id desc limit least(p_limit, 20)
  )
  select coalesce(jsonb_agg(public.post_card(p, v.uid) order by page.created_at desc, page.id desc), '[]'::jsonb)
  from page join public.posts p on p.id = page.id, v
$$;

-- p_tab: all | discussion | review | reaction | recommendation | short | episode (with p_season/p_episode)
create or replace function api.drama_posts(p_drama_id text, p_tab text default 'all', p_season int default null, p_episode int default null,
                                           p_before timestamptz default now(), p_before_id uuid default null, p_limit int default 20)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with v as (select auth.uid() as uid),
  page as (
    select p.* from public.posts p, v
    where (p.drama_id = p_drama_id or p.secondary_drama_id = p_drama_id) and public.visible_to(p, v.uid)
      and (p_tab = 'all' or (p_tab = 'episode' and p.season = p_season and p.episode = p_episode) or p.type = p_tab)
      and (p.created_at, p.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
    order by p.created_at desc, p.id desc limit least(p_limit, 40)
  )
  select coalesce(jsonb_agg(public.post_card(p, v.uid) order by page.created_at desc, page.id desc), '[]'::jsonb)
  from page join public.posts p on p.id = page.id, v
$$;

create or replace function api.user_posts(p_user_id uuid, p_before timestamptz default now(), p_before_id uuid default null, p_limit int default 20)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with v as (select auth.uid() as uid),
  page as (
    select p.* from public.posts p, v
    where p.author_id = p_user_id and (public.visible_to(p, v.uid) or (v.uid = p_user_id and p.state <> 'deleted'))
      and (p.created_at, p.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
    order by p.created_at desc, p.id desc limit least(p_limit, 40)
  )
  select coalesce(jsonb_agg(public.post_card(p, v.uid) order by page.created_at desc, page.id desc), '[]'::jsonb)
  from page join public.posts p on p.id = page.id, v
$$;

create or replace function api.post_page(p_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select public.post_card(p, auth.uid()) from public.posts p
  where p.id = p_id and (public.visible_to(p, auth.uid()) or p.author_id = auth.uid() or public.is_moderator())
$$;

create or replace function api.comments_page(p_post_id uuid, p_after timestamptz default '-infinity', p_limit int default 50) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with v as (select auth.uid() as uid)
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'postId', c.post_id, 'parentId', c.parent_id, 'replyToUserId', c.reply_to_user_id, 'body', c.body, 'spoiler', c.spoiler,
    'reactions', jsonb_build_object('loved', c.loved, 'cried', c.cried, 'screamed', c.screamed, 'swooned', c.swooned, 'laughed', c.laughed, 'furious', c.furious),
    'replyCount', c.reply_count, 'createdAt', c.created_at, 'state', c.state,
    'author', (select jsonb_build_object('id', a.id, 'handle', a.handle, 'displayName', a.display_name, 'avatarKey', a.avatar_key, 'verified', a.verified) from public.profiles a where a.id = c.author_id),
    'viewer', jsonb_build_object('reaction', (select r.kind from public.reactions r where r.user_id = v.uid and r.target_type = 'comment' and r.target_id = c.id))
  ) order by c.created_at), '[]'::jsonb)
  from (select * from public.comments c, v where c.post_id = p_post_id and c.state = 'active' and c.created_at > p_after and not public.is_blocked_pair(c.author_id, v.uid) order by c.created_at limit least(p_limit, 100)) c, v
$$;

create or replace function api.profile_page(p_handle text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with v as (select auth.uid() as uid)
  select jsonb_build_object(
    'id', p.id, 'handle', p.handle, 'displayName', p.display_name, 'avatarKey', p.avatar_key, 'bio', p.bio, 'favoriteGenres', to_jsonb(p.favorite_genres),
    'favoriteDramaIds', to_jsonb(p.favorite_drama_ids), 'followers', p.follower_count, 'following', p.following_count, 'posts', p.post_count,
    'joinedAt', p.created_at, 'verified', p.verified, 'isPrivate', p.is_private,
    'viewer', jsonb_build_object(
      'following', exists (select 1 from public.follows f where f.follower_id = v.uid and f.target_type = 'user' and f.target_id = p.id::text),
      'followsYou', exists (select 1 from public.follows f where f.follower_id = p.id and f.target_type = 'user' and f.target_id = v.uid::text),
      'blocked', exists (select 1 from public.blocks b where b.blocker_id = v.uid and b.blocked_id = p.id)),
    'collections', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'itemCount', c.item_count, 'followerCount', c.follower_count, 'coverDramaId', c.cover_drama_id, 'visibility', c.visibility) order by c.updated_at desc), '[]'::jsonb)
                    from public.collections c where c.owner_id = p.id and (c.visibility = 'public' or c.owner_id = v.uid)))
  from public.profiles p, v where p.handle = p_handle and p.state <> 'deleted' and not exists (select 1 from public.blocks b where b.blocker_id = p.id and b.blocked_id = v.uid)
$$;

create or replace function api.episode_room(p_drama_id text, p_season int, p_episode int) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'counts', coalesce((select jsonb_object_agg(kind, count) from public.episode_reaction_counts where drama_id = p_drama_id and season = p_season and episode = p_episode), '{}'::jsonb),
    'recentPosters', (select count(distinct author_id) from public.posts where drama_id = p_drama_id and season = p_season and episode = p_episode and state = 'active' and created_at > now() - interval '1 hour'),
    'episode', (select jsonb_build_object('title', e.title, 'airAt', e.air_at, 'runtime', e.runtime) from public.catalog_episodes e where e.drama_id = p_drama_id and e.season = p_season and e.number = p_episode),
    'posts', api.drama_posts(p_drama_id, 'episode', p_season, p_episode, now(), null, 20))
$$;

create or replace function api.search_posts(p_q text, p_before timestamptz default now(), p_before_id uuid default null, p_limit int default 20) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with v as (select auth.uid() as uid), q as (select websearch_to_tsquery('simple', p_q) as tsq, lower(ltrim(p_q, '#')) as tag),
  page as (
    select p.* from public.posts p, v, q
    where public.visible_to(p, v.uid) and (p.fts @@ q.tsq or p.hashtags @> array[q.tag])
      and (p.created_at, p.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
    order by p.created_at desc, p.id desc limit least(p_limit, 40)
  )
  select coalesce(jsonb_agg(public.post_card(p, v.uid) order by page.created_at desc, page.id desc), '[]'::jsonb)
  from page join public.posts p on p.id = page.id, v
$$;

create or replace function api.search_people(p_q text, p_limit int default 20) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'handle', p.handle, 'displayName', p.display_name, 'avatarKey', p.avatar_key, 'verified', p.verified, 'followers', p.follower_count) order by sim desc, p.follower_count desc), '[]'::jsonb)
  from (
    select p.*, greatest(similarity(p.handle::text, lower(p_q)), similarity(p.display_name, p_q)) as sim
    from public.profiles p
    where p.state = 'active' and not public.is_blocked_pair(p.id, auth.uid()) and (p.handle::text ilike '%' || lower(p_q) || '%' or p.display_name ilike '%' || p_q || '%')
    order by sim desc, p.follower_count desc limit least(p_limit, 50)
  ) p
$$;

-- Everything the store needs about *me* at start-up / pull('home'): profile, prefs, graph, watchlist, saves, reactions.
create or replace function api.me() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with v as (select public.require_user() as uid)
  select jsonb_build_object(
    'profile', (select to_jsonb(p) - 'fts' from public.profiles p, v where p.id = v.uid),
    'follows', jsonb_build_object(
      'users', (select coalesce(jsonb_agg(target_id), '[]') from public.follows f, v where f.follower_id = v.uid and f.target_type = 'user'),
      'dramas', (select coalesce(jsonb_agg(target_id), '[]') from public.follows f, v where f.follower_id = v.uid and f.target_type = 'drama'),
      'actors', (select coalesce(jsonb_agg(target_id), '[]') from public.follows f, v where f.follower_id = v.uid and f.target_type = 'actor'),
      'collections', (select coalesce(jsonb_agg(target_id), '[]') from public.follows f, v where f.follower_id = v.uid and f.target_type = 'collection')),
    'dramaNotify', (select coalesce(jsonb_agg(drama_id), '[]') from public.drama_notify d, v where d.user_id = v.uid),
    'blocks', (select coalesce(jsonb_agg(blocked_id), '[]') from public.blocks b, v where b.blocker_id = v.uid),
    'mutes', (select coalesce(jsonb_agg(jsonb_build_object('type', target_type, 'id', target_id)), '[]') from public.mutes m, v where m.user_id = v.uid),
    'watchlist', (select coalesce(jsonb_agg(to_jsonb(w)), '[]') from public.watchlist_items w, v where w.user_id = v.uid),
    'saves', (select coalesce(jsonb_agg(post_id), '[]') from public.saves s, v where s.user_id = v.uid),
    'reactions', (select coalesce(jsonb_object_agg(target_type || ':' || target_id, kind), '{}') from public.reactions r, v where r.user_id = v.uid and r.created_at > now() - interval '90 days'),
    'collections', (select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object('items', (select coalesce(jsonb_agg(to_jsonb(i) order by i.added_at), '[]') from public.collection_items i where i.collection_id = c.id))), '[]') from public.collections c, v where c.owner_id = v.uid),
    'unread', (select count(*) from public.notifications n, v where n.user_id = v.uid and n.read_at is null),
    'pushTokens', (select count(*) from public.push_tokens t, v where t.user_id = v.uid and t.disabled_at is null))
$$;

create or replace function api.notifications_page(p_before timestamptz default now(), p_limit int default 50) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with v as (select public.require_user() as uid)
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', n.id, 'kind', n.kind, 'group', n."group", 'actorIds', to_jsonb(n.actor_ids), 'postId', n.post_id, 'commentId', n.comment_id, 'dramaId', n.drama_id,
    'season', n.season, 'episode', n.episode, 'collectionId', n.collection_id, 'title', n.title, 'body', n.body, 'createdAt', n.updated_at, 'read', n.read_at is not null,
    'actors', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'handle', a.handle, 'displayName', a.display_name, 'avatarKey', a.avatar_key)), '[]') from public.profiles a where a.id = any (n.actor_ids[1:3]))
  ) order by n.updated_at desc), '[]'::jsonb)
  from (select * from public.notifications n, v where n.user_id = v.uid and n.updated_at < p_before order by n.updated_at desc limit least(p_limit, 100)) n
$$;

-- -------------------------------------------------------------------------------------
-- 15. Trending (materialised, refreshed by cron) and home rails
-- -------------------------------------------------------------------------------------
create materialized view public.mv_trending_posts as
  select p.id, (p.loved + p.cried + p.screamed + p.swooned + p.laughed + p.furious + 2 * p.comment_count + 3 * p.save_count)::double precision
         / power(extract(epoch from (now() - p.created_at)) / 3600.0 + 2, 1.5) as velocity
  from public.posts p where p.state = 'active' and p.created_at > now() - interval '48 hours'
  order by velocity desc limit 200;
create unique index mv_trending_posts_id on public.mv_trending_posts (id);

create materialized view public.mv_trending_dramas as
  select d.id, count(p.id) as posts_24h, coalesce(sum(p.loved + p.cried + p.screamed + p.swooned + p.laughed + p.furious), 0) as reactions_24h,
         (count(p.id) * 3 + coalesce(sum(p.loved + p.cried + p.screamed + p.swooned + p.laughed + p.furious), 0) + d.watching_count * 0.1)::double precision as score
  from public.catalog_dramas d left join public.posts p on p.drama_id = d.id and p.state = 'active' and p.created_at > now() - interval '24 hours'
  group by d.id order by score desc limit 100;
create unique index mv_trending_dramas_id on public.mv_trending_dramas (id);

create or replace function api.home_rails() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with v as (select auth.uid() as uid)
  select jsonb_build_object(
    'airingToday', (select coalesce(jsonb_agg(jsonb_build_object('dramaId', e.drama_id, 'season', e.season, 'episode', e.number, 'airAt', e.air_at, 'title', d.title, 'posterPath', d.poster_path) order by e.air_at), '[]')
                    from public.catalog_episodes e join public.catalog_dramas d on d.id = e.drama_id where e.air_at between now() - interval '6 hours' and now() + interval '24 hours'),
    'liveRooms', (select coalesce(jsonb_agg(jsonb_build_object('dramaId', e.drama_id, 'season', e.season, 'episode', e.number, 'airAt', e.air_at, 'title', d.title,
                    'reacting', (select coalesce(sum(count), 0) from public.episode_reaction_counts c where c.drama_id = e.drama_id and c.season = e.season and c.episode = e.number))), '[]')
                  from public.catalog_episodes e join public.catalog_dramas d on d.id = e.drama_id where e.air_at between now() - interval '3 hours' and now() + interval '30 minutes'),
    'trendingDramas', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'posterPath', d.poster_path, 'posts24h', t.posts_24h, 'watching', d.watching_count) order by t.score desc), '[]')
                       from (select * from public.mv_trending_dramas order by score desc limit 20) t join public.catalog_dramas d on d.id = t.id),
    'trendingDiscussions', (select coalesce(jsonb_agg(public.post_card(p, v.uid) order by t.velocity desc), '[]')
                            from (select t.* from public.mv_trending_posts t join public.posts p on p.id = t.id, v where p.type = 'discussion' and public.visible_to(p, v.uid) order by t.velocity desc limit 10) t
                            join public.posts p on p.id = t.id, v),
    'trendingPosts', (select coalesce(jsonb_agg(public.post_card(p, v.uid) order by t.velocity desc), '[]')
                      from (select t.* from public.mv_trending_posts t join public.posts p on p.id = t.id, v where public.visible_to(p, v.uid) order by t.velocity desc limit 20) t
                      join public.posts p on p.id = t.id, v))
$$;

-- -------------------------------------------------------------------------------------
-- 16. Moderator RPCs
-- -------------------------------------------------------------------------------------
create or replace function api.mod_set_state(p_type text, p_id text, p_state text, p_reason text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public.require_user(); v_author uuid;
begin
  if not public.is_moderator() then perform public.fail(403, 'Moderators only'); end if;
  if p_type = 'post' then update public.posts set state = p_state where id = p_id::uuid returning author_id into v_author;
  elsif p_type = 'comment' then update public.comments set state = p_state where id = p_id::uuid returning author_id into v_author;
  elsif p_type = 'user' then update public.profiles set state = p_state where id = p_id::uuid returning id into v_author;
  else perform public.fail(422, 'Unknown target'); end if;
  update public.reports set status = 'actioned', reviewed_by = v_uid, reviewed_at = now() where target_type = p_type and target_id = p_id and status = 'open';
  insert into public.moderation_actions (actor_id, target_type, target_id, action, reason) values (v_uid, p_type, p_id, case when p_state in ('hidden', 'limited', 'suspended') then 'hide' when p_state = 'removed' then 'remove' else 'unhide' end, p_reason);
  if p_state in ('hidden', 'removed') then
    perform public.notify(v_author, 'system', 'system', null, null, case when p_type = 'post' then p_id::uuid end, case when p_type = 'comment' then p_id::uuid end, null, null, null, null,
      'Content removed', coalesce(p_reason, 'Your content was removed for violating the Community Guidelines.'));
  end if;
end $$;

create or replace function api.mod_dismiss_reports(p_type text, p_id text) returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.reports set status = 'dismissed', reviewed_by = public.require_user(), reviewed_at = now()
  where target_type = p_type and target_id = p_id and status = 'open' and public.is_moderator();
$$;

create view api.mod_queue with (security_invoker = true) as
  select r.target_type, r.target_id, count(*) as reports, array_agg(distinct r.reason) as reasons, min(r.created_at) as first_reported_at, max(r.created_at) as last_reported_at
  from public.reports r where r.status = 'open' group by r.target_type, r.target_id order by count(*) desc, min(r.created_at);

-- -------------------------------------------------------------------------------------
-- 17. Scheduled work (episode notifications, retention, media purge)
-- -------------------------------------------------------------------------------------
create or replace function public.schedule_episode_notifications() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int := 0;
begin
  -- episodes airing within the next 60 minutes → users who opted in (drama_notify) or are watching with prefs.notifications.episodes != false
  insert into public.notifications (user_id, kind, "group", group_key, drama_id, season, episode, title, body)
  select u.user_id, 'episode_live', 'drama', 'episode_live:' || e.drama_id || ':' || e.season || ':' || e.number, e.drama_id, e.season, e.number,
         d.title || ' — Episode ' || e.number, 'Airs at ' || to_char(e.air_at at time zone 'UTC', 'HH24:MI') || ' UTC. Join the live room.'
  from public.catalog_episodes e
  join public.catalog_dramas d on d.id = e.drama_id
  join lateral (
    select user_id from public.drama_notify dn where dn.drama_id = e.drama_id
    union
    select w.user_id from public.watchlist_items w join public.profiles p on p.id = w.user_id
    where w.drama_id = e.drama_id and w.status = 'watching' and coalesce((p.prefs -> 'notifications' ->> 'episodes')::boolean, true)
  ) u on true
  where e.air_at between now() and now() + interval '60 minutes'
  on conflict (user_id, group_key) where group_key is not null do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.retention_sweep() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.notifications where updated_at < now() - interval '90 days';
  delete from public.rate_limits where window_start < now() - interval '2 days';
  -- media of posts deleted > 24 h ago → mark for purge (Worker cron drains the queue)
  update public.media_uploads u set status = 'deleted'
  from public.post_media pm join public.posts p on p.id = pm.post_id
  where u.key in (pm.key, pm.thumb_key, pm.poster_key) and p.state = 'deleted' and p.deleted_at < now() - interval '24 hours' and u.status = 'ready';
  -- abandoned uploads
  update public.media_uploads set status = 'deleted' where status = 'pending' and created_at < now() - interval '24 hours';
  -- hard-delete removed content after 30 days
  delete from public.posts where state in ('deleted', 'removed') and coalesce(deleted_at, created_at) < now() - interval '30 days';
end $$;

-- >>> supabase-only
select pgmq.create('moderation');
select pgmq.create('push_outbox');
select pgmq.create('media_delete');

-- push outbox: every new/updated notification that should be pushed is queued; push-dispatch drains it
create or replace function public.notifications_enqueue_push() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prefs jsonb; v_quiet boolean; v_key text;
begin
  select prefs into v_prefs from public.profiles where id = new.user_id;
  v_key := case new."group" when 'social' then 'social' when 'drama' then 'episodes' when 'mentions' then 'social' else 'system' end;
  if coalesce((v_prefs -> 'notifications' ->> v_key)::boolean, true) is false then return null; end if;
  v_quiet := coalesce((v_prefs -> 'notifications' ->> 'quietHours')::boolean, false) and extract(hour from now() at time zone coalesce(v_prefs ->> 'tz', 'UTC')) not between 8 and 22;
  if v_quiet and new."group" <> 'system' then return null; end if;
  perform pgmq.send('push_outbox', jsonb_build_object('notificationId', new.id, 'userId', new.user_id));
  return null;
end $$;
create trigger notifications_enqueue_push after insert or update of updated_at on public.notifications for each row execute function public.notifications_enqueue_push();

-- media purge queue fed by retention_sweep
create or replace function public.media_enqueue_delete() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'deleted' and old.status <> 'deleted' then perform pgmq.send('media_delete', jsonb_build_object('key', new.key)); end if;
  return null;
end $$;
create trigger media_enqueue_delete after update of status on public.media_uploads for each row execute function public.media_enqueue_delete();

-- cron (URLs/keys come from vault.decrypted_secrets: edge_url, edge_key)
select cron.schedule('episode-notifications', '*/15 * * * *', $$select public.schedule_episode_notifications()$$);
select cron.schedule('retention-sweep', '17 3 * * *', $$select public.retention_sweep()$$);
select cron.schedule('refresh-trending', '*/5 * * * *', $$refresh materialized view concurrently public.mv_trending_posts; refresh materialized view concurrently public.mv_trending_dramas$$);
select cron.schedule('push-dispatch', '* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_url') || '/push-dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_key')),
    body := '{}'::jsonb)
$$);
select cron.schedule('moderate', '* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_url') || '/moderate',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_key')),
    body := '{}'::jsonb)
$$);
-- <<< supabase-only

-- -------------------------------------------------------------------------------------
-- 18. Grants (views + RPCs)
-- -------------------------------------------------------------------------------------
grant select on all tables in schema api to anon, authenticated;
grant update on api.profiles to authenticated;                       -- column grants on the base table still apply
grant all on all tables in schema api to service_role;
grant all on all tables in schema public to service_role;
grant usage on all sequences in schema public to service_role;
alter default privileges in schema api grant select on tables to anon, authenticated;
grant execute on all functions in schema api to anon, authenticated, service_role;
revoke execute on function api.media_reserve(uuid, text, text, text, bigint, text) from anon, authenticated;
revoke execute on function api.media_finalize(text, bigint, boolean, int, int, int) from anon, authenticated;
alter default privileges in schema api grant execute on functions to anon, authenticated, service_role;
