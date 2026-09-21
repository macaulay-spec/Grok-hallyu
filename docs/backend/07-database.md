# 07 — Database architecture and schema (sections 12, 25)

The full DDL — tables, indexes, triggers, RLS policies, RPCs, materialised views, cron/queue wiring — is in **`schema.sql`** (≈1,470 lines). It was executed end‑to‑end in embedded Postgres 17 (PGlite) with Supabase stubs by `validate-schema.mjs`, and the functional smoke test (sign‑up trigger → handle claim → follows → watchlist → post with validation → reactions/comments/saves with counters → notifications grouping → feeds/search/profile/live‑room RPCs → rate limit 429 → blocks → RLS column protection → media ledger → retention sweep) passes. This file explains the decisions; the SQL is the source of truth.

## 12.1 Principles

1. **One Postgres, two schemas.** Base tables in `public` with RLS on every table. The client only sees schema `api` (security‑invoker views + RPC functions). Renaming a column or splitting a table never breaks the app; the API contract is the `api` schema.
2. **Writes go through RPCs, reads through views/RPCs.** There are *no* INSERT/UPDATE policies on `posts`, `comments`, `reactions`, `follows`, `media_uploads`, `reports`, `catalog_*` — the only doors are `security definer` functions that validate exactly what the client validates (`LIMITS` in `lib/model.ts`), rate‑limit, and enforce block/mute rules. Owner‑only tables (`watchlist_items`, `saves`, `blocks`, `mutes`, `push_tokens`, `collections`) keep simple `auth.uid()` policies so supabase‑js can read them directly.
3. **Client‑generated UUIDs for posts/comments/collections** → idempotent creates (the outbox may retry; `create_post` returns `duplicate: true` instead of a second row). The app's `uid()` helper switches to `expo-crypto` `randomUUID()` for these three entities (implementation step 3).
4. **Denormalised counters maintained by triggers** (6 reaction kinds, comment/save/share counts, follower/following/post counts, collection item/follower counts, drama follower/watching/post counts). Feeds never aggregate at read time.
5. **Catalog is a mirror, not a source.** `catalog_dramas/actors/episodes/cast` hold only what Hallyu content references, written by the `ensure-catalog` Edge Function (server TMDB key). Posters stay on TMDB's CDN.
6. **Soft delete + grace.** `state` columns (`active | hidden | removed | deleted`) on posts/comments/profiles; media purge after 24 h; hard delete after 30 days (`retention_sweep`).
7. **Everything the phone needs at start‑up is one call** (`api.me()`), and every feed page is one call returning complete cards (author, drama, media, viewer state) — no N+1 from the client.

## 12.2 Tables (27) — purpose, keys, growth class

| Table | PK / uniqueness | Key indexes | Growth class | Retention |
|---|---|---|---|---|
| `profiles` | `id` = `auth.users.id`; `handle` unique (citext, `^[a-z0-9_]{3,20}$`) | trigram on handle/display_name, FTS | 1 row / registered (~1 KB) | until deletion |
| `reserved_handles` | handle | — | static | — |
| `catalog_dramas` / `catalog_actors` | slug id; `tmdb_id` unique | trigram on title | ~thousands | forever (refreshed) |
| `catalog_cast` | (drama, actor) | — | ×15 per drama | — |
| `catalog_episodes` | (drama, season, number) | `air_at` partial | ×16 per drama | — |
| `follows` | (follower, target_type, target_id) | (target_type, target_id) | 1.5 / MAU / month | until unfollow |
| `blocks` / `mutes` | pairs | blocked_id | small | — |
| `drama_notify` | (user, drama) | drama_id | small | — |
| `watchlist_items` | (user, drama) | (drama, status) | 6 updates / MAU / month, 1 row per pair | — |
| `media_uploads` | `key` (ULID path, regex‑checked) | (owner, created_at), (status, created_at) partial | 0.9 / MAU / month | purged with content |
| `posts` | `id` uuid (client) | active‑by‑time, author, drama, episode, shorts, GIN hashtags/actors/mentions/FTS | 0.4 / MAU / month (~1.5 KB with indexes) | soft delete → 30 d |
| `post_media` | (post, ord) | key | ≤6 per post | with post |
| `comments` | `id` uuid (client); depth ≤1 by trigger | (post, created_at) partial, parent, author | 1.2 / MAU / month | with post |
| `reactions` | (user, target_type, target_id) | (target_type, target_id, kind) | 8 / MAU / month (~150 B) — **largest table**; partition by month at stage 4 | forever (compaction candidate) |
| `saves` | (user, post) | post | 1 / MAU / month | — |
| `collections` / `collection_items` | uuid / (collection, drama) | owner | small | — |
| `episode_reaction_counts` | (drama, season, episode, kind) | — | tiny | — |
| `notifications` | uuid; unique (user, group_key) partial | (user, updated_at), unread partial | 12 / MAU / month (~250 B) | **90 days** |
| `push_tokens` | token | user partial | ~1.3 / user | pruned on receipts |
| `reports` | uuid; unique (reporter, target) | open partial, target | 0.02 / MAU / month | forever |
| `moderation_actions` / `moderation_scans` / `audit_log` | bigserial | target | small / 0.75 per post / small | forever |
| `app_config` | key | — | static | — |
| `rate_limits` | (user, bucket, window_start) | — | churn | 2 days |

## 12.3 Row Level Security summary

| Role | Can read | Can write directly | Via RPC only |
|---|---|---|---|
| `anon` (guest) | profiles (non‑deleted, public columns via `api.profiles`), active posts/comments/media of non‑blocked authors, public collections, catalog, episode counters, app_config, follows (public lists) | nothing | public read RPCs (`feed_for_you` non‑personalised, `drama_posts`, `post_page`, `search_*`, `home_rails`, `episode_room`, `profile_page`) |
| `authenticated` | everything anon can + own rows in watchlist/saves/blocks/mutes/drama_notify/notifications/push_tokens/media_uploads/reports + own hidden/deleted posts | own `profiles` row **only the whitelisted columns** (column grants; counters/verified/state are server‑owned); own watchlist/saves/blocks/mutes/notify/push_tokens/collections rows | every content write (`create_post`, `set_reaction`, …), `claim_handle`, `create_report`, `mark_notifications_read`, `register_push_token` |
| `moderator`/`admin` (JWT `app_metadata.role`) | + hidden/removed content, reports, scans, actions, `mod_queue` | — | `mod_set_state`, `mod_dismiss_reports` |
| `service_role` (Worker/Edge Functions only) | all | all | `media_reserve`, `media_finalize`, catalog upserts, `schedule_episode_notifications`, `retention_sweep` |

Performance notes: policies use `(select auth.uid())` (initPlan, evaluated once per query); the hot‑path views (`api.posts`, `api.comments`) add only `is_blocked_pair()` — an indexed lookup; the feeds filter via `visible_to()` over a bounded candidate window.

## 12.4 Growth, capacity and partitioning plan

| MAU | Rows added / month (approx.) | DB growth / month | Action |
|---|---|---|---|
| 2.5K | 75K | ~50 MB | none |
| 10K | 300K | ~190 MB | Supabase Pro (500 MB wall) |
| 50K | 1.5M | ~1 GB | notifications retention already 90 d; `reactions` partition by month (`created_at`), archive partitions > 12 months to R2 as parquet/CSV; `VACUUM` tuning |
| 200K | 6M | ~4 GB | Large/XL compute; read replica for feeds (Supabase add‑on) or self‑host with a streaming replica; move `moderation_scans`/`audit_log` to cold storage yearly |

Indexes are all partial where the query is (`state = 'active'`), keeping GIN indexes off deleted rows. The FTS column indexes only the first 2,000 characters of a body.

## 12.5 Deletion and audit

* **Post delete:** `state='deleted'` → immediately invisible; media marked `deleted` after 24 h (undo/appeal window) → `media_delete` queue → R2 object + CDN purge; row hard‑deleted after 30 days (cascades `post_media`, `comments`, `saves`, `notifications`).
* **Account delete** (`delete-account` Edge Function): anonymise profile (`handle → deleted_<8 chars>`, display name "Deleted account", avatar removed, bio empty, `state='deleted'`), soft‑delete posts/comments, delete `auth.users` row (FK cascades remove follows, blocks, watchlist, saves, tokens, reports‑as‑reporter, collections). Media purge runs through the same queue. Audit row `account_deleted` with a hash of the email for abuse recidivism, no PII.
* **Audit log** captures: handle changes, moderator actions (also in `moderation_actions`), role changes, account deletion, config changes. Readable by `admin` only.
* **Legal holds:** setting `state='removed'` keeps the row 30 days; a moderator can extend by clearing `deleted_at`.

## 12.6 Migrations discipline

* `supabase/migrations/NNNN_name.sql`, forward‑only, applied by CI (`supabase db push`) on merge to `main`; every migration is run against a fresh PGlite instance in CI via `validate-schema.mjs` first.
* Never `drop column` in the same release that stops using it (two‑step), because the store may hold old shapes offline.
* Seeds: `supabase/seed.sql` = reserved handles + app_config + 20 currently airing dramas (fetched by `ensure-catalog`).
