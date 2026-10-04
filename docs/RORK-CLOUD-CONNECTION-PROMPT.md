# Rork Cloud implementation prompt — Hallyu

> This file is the deliverable: a single, complete implementation prompt to hand to Rork verbatim.
> Everything below was read out of this repository at commit `6f4167a`. Nothing here is aspirational —
> if the prompt says a table, function, file or workflow exists, it exists.

---

# PROMPT FOR RORK

## 0. Who you are working for and what this task is

You are the implementation agent for **Hallyu**, an existing, shipping entertainment-social app
(K-Drama / C-Drama / Anime / Hollywood — the four "worlds"), and you are about to move it onto
**Rork Cloud**.

This is an **implementation task, not an audit and not a documentation task.** You will provision a
database, configure the backend, modify app code, modify CI, and prove the result works end to end.

Two rules outrank everything else:

1. **Do not rebuild the backend.** It is already written, complete, and verified. It lives in
   `supabase/migrations/` (37 ordered SQL migrations), `supabase/functions/` (6 Edge Functions) and
   `supabase/types/database.ts`. Your job is to *provision the environment that runs it* and *connect
   the app to it*. Every table, function, trigger, policy, job and index already has an
   implementation. Do not redesign them. Do not rewrite them "to fit Rork". If something does not
   exist, that is a bug to report, not a gap for you to fill with your own business logic.
2. **Do not destroy working behaviour.** There is a large body of deliberate engineering here
   (RLS, counter guards, keyset pagination, referentially-stable React hooks, a render-loop
   regression guard). Preserve it. When something must change, change the smallest possible part.

---

## 1. WHAT ALREADY EXISTS (verified in this repository)

### 1.1 Repository and stack

- Repo root is the Expo app root (`app/`, `lib/`, `components/`, `constants/`, `assets/`).
- **Expo SDK 51** / React Native 0.74.5 / React 18.2 / Hermes (old architecture, `newArchEnabled=false`)
  / `expo-router` ~3.5.23 / TypeScript ~5.3 / **Zustand 4** / **bun** (`bun.lock`, CI uses
  `bun install --frozen-lockfile`).
- 65 screens in `app/` (expo-router file routing, 4 `_layout.tsx` files), 54 components in
  `components/`, 20 modules in `lib/`.
- `scripts/` holds 7 verification programs. `npm run check` runs typecheck + lint + 6 of them.
- CI workflows: `.github/workflows/build-apk.yml`, `eas-build.yml`, `backend-verification.yml`.
- `@supabase/supabase-js` **is already a dependency in the tree but is declared under
  `devDependencies` and is imported nowhere yet.** You will import it from app code — see §9.1.

### 1.2 Frontend architecture (what exists today, device-local)

- **State**: one Zustand store, `lib/store.tsx` (644 lines). Persisted to AsyncStorage under
  `hallyu.state.v4`. Holds profile, prefs, onboarding, follows, watchlist, reactions, saves,
  **posts, comments, collections, notifications, drafts, users, importedDramas, importedActors** —
  i.e. all member content is currently device-local.
- **Selectors**: `lib/selectors.ts` (545 lines) — pure derivations over that store: `forYou()`,
  `following()`, `visiblePosts()`, `postsForDrama/Episode/Actor`, `commentsFor()`, `airingEpisodes()`,
  `scheduleByDay()`, `trendingDramas()`, `recommendedDramas()`, `relatedDramas()`, `relatedActors()`,
  `watchlistByStatus()`, `upNext()`, `unreadCount()`, `myCollections()`, `searchLocal()`, `worldCounts()`,
  `crossWorldLocal()`, etc.
- **Access hooks**: `lib/hooks.ts` — `useApp()` (returns a memoised object of 12 stable accessors),
  `useSlice()`, `useRequireMember()`, `useNetwork()`, `useLoad()` (abort-aware async loader),
  `useCatalogHealth()`, `useInteractionGate` (in `lib/interactive.ts`).
  **These accessors are referentially stable on purpose** (Phase-2 fix for a Home render loop). Do
  not "simplify" them into fresh object literals or inline arrows — that reintroduces the infinite
  render loop guarded by `npm run test:home-render`.
- **Auth**: `lib/auth.tsx` (223 lines). Currently **device-local only**: an "account" is a JSON blob in
  AsyncStorage (`hallyu.auth.account.v1`), `sendReset`/`updatePassword`/`resendVerification` throw an
  honest `NO_MAIL` error. The exported `AuthValue` contract is the integration seam — keep it intact.
- **Catalog**: `lib/catalog.ts` (1031 lines) — a `CatalogProvider` interface with 18 methods
  (`searchDramas`, `searchActors`, `getDrama`, `getSeasonEpisodes`, `getActor`, `resolveDrama`,
  `resolveActor`, `trending`, `popular`, `airingSoon`, `topRated`, `upcoming`, `byGenre`, `onProvider`,
  `byFandom`, `crossFandom`, `trendingPeople`, `recommendations`) implemented by `tmdbProvider`
  against `https://api.themoviedb.org/3`, with a TTL memo and a `CatalogHealth` store.
  `lib/catalogSync.ts` adopts remote results into the store (`adoptDramas`, `adoptActors`).
- **Other local modules**: `lib/analytics.ts` (`track()` — in-memory buffer, 17 event names, has an
  `AnalyticsSink` seam), `lib/reminders.ts` (local `expo-notifications` episode reminders),
  `lib/media.ts` (device downloads, gallery saves, video posters), `lib/data/connections.ts`
  (followers/following answered from local state — "the model has no follower edges to query"),
  `lib/fandoms.ts` (the four worlds), `lib/model.ts` (domain types: `User`, `Drama`, `Actor`,
  `Episode`, `Post`, `Comment`, `Collection`, `Notification`, `WatchlistItem`, `Community`, …),
  `lib/boot.ts` (boot breadcrumb trail), `lib/crash.ts`, `lib/spoiler.ts`, `lib/format.ts`,
  `lib/motion.ts`, `lib/textEncoding.ts`, `lib/video.ts`.
- **Design/UX**: `constants/theme.ts` (dark-only design tokens), `constants/keys.ts` (client
  credentials). The visual language is finished — do not restyle.

### 1.3 Backend architecture (complete, unconnected)

```
supabase/
├── config.toml                 6 Edge Functions registered, auth/storage settings, [db.seed]
├── migrations/                 39 ordered migrations — the entire schema
├── seed.sql                    reference rows only: 4 worlds, provider `tmdb`, 4 official rooms
├── env.example                 every credential NAME with PLACEHOLDER values (no real value)
├── functions/
│   ├── _shared/{cors,supabase,tmdb}.ts
│   ├── catalog-sync/           TMDB ingest: trending | refresh | detail | seasons | discover
│   ├── catalog-jobs/           → calls run_scheduled_jobs(); the SQL dispatcher owns scheduling
│   ├── push-dispatch/          claims deliveries, sends, reports outcomes, kills dead tokens
│   ├── media-cleanup/          reconciles media rows against storage objects
│   ├── purge-deleted-accounts/ retention: hard-deletes tombstoned accounts + their objects
│   └── moderation-digest/      groups open reports per target
└── types/database.ts           the typed contract (Tables/Rows/Inserts/Updates/Functions/Enums)
```

Measured facts, for your report:

- **37 migrations**, all parsing as valid PostgreSQL.
- **37 tables** in the typed contract (38 `create table` statements; the extra is the
  `analytics_events_default` RANGE partition).
- **152 SQL functions** parsed; every `SECURITY DEFINER` function pins `search_path`.
- **24 enums**.
- **12 scheduled jobs** dispatched by `run_scheduled_jobs()`.
- **6 Edge Functions**, all service-role-gated via `requireServiceRole()`.

### 1.4 Database schema (37 tables, in dependency order)

Identity & reference: `worlds`, `providers`, `profiles`, `user_preferences`, `title_alerts`.
Catalog: `people`, `titles`, `title_people`, `title_episodes`, `catalog_sync_runs`,
`catalog_provider_state`, `catalog_rank_snapshots`.
Social graph (four real follow tables, not one polymorphic one): `follows`, `title_follows`,
`person_follows`, `collection_follows`, `blocks`, `mutes`.
Content: `posts`, `post_media`, `comments`, `reactions`, `saves`, `post_shares`.
Organisation: `collections`, `collection_items`, `watchlist_items`.
Rooms: `communities`, `community_members` (with `status` for requests, `communities.owner_id`).
Inbox & device: `notifications`, `notification_deliveries`, `push_tokens`, `media_uploads`.
Moderation: `reports`, `moderation_actions`.
Operations: `job_runs`, `analytics_events` (monthly RANGE partitions + `ensure_event_partition()`).

Freshness columns added to `titles` by migration 23: `catalog_synced_at`, `content_hash`,
`catalog_missing_count`, `catalog_unavailable_at`.
Lifecycle columns added to `notifications` by migration 28: `dedupe_key`, `coalesce_count`,
`expires_at`, `scheduled_for`, `deep_link`.
`moderation_actions` (migration 36): nullable `actor_id` with `on delete set null` **plus**
`actor_handle` copied at write time, so the audit log outlives the profile it names.

24 enums, exactly: `account_status`, `autoplay_mode`, `catalog_lifecycle`, `content_state`,
`delivery_status`, `discussion_kind`, `media_state`, `media_type`, `membership_status`,
`moderation_action_kind`, `moderation_target`, `notification_group`, `notification_kind`,
`post_type`, `profile_role`, `protection_level`, `push_platform`, `reaction_kind`, `report_status`,
`share_channel`, `spoiler_level`, `title_status`, `visibility`, `watch_status`.

### 1.5 The RPC surface the app will call (exact signatures)

Identity and account:
- `get_bootstrap() -> json` — one cold-start call: profile, prefs, follows, saves, watchlist, unread.
- `merge_preferences(p_patch json) -> user_preferences`
- `complete_onboarding(p_genres text[], p_step int, p_worlds text[]) -> profiles`
- `upsert_watchlist_item(p_title_id uuid, p_status watch_status, p_season int, p_episode int, p_total int, p_note text) -> watchlist_items`
- `handle_is_available(p_handle text) -> boolean`
- `delete_account() -> json` (`{ deleted, media_objects_queued, deleted_at }` — the objects are queued; only the Storage API may delete them, see migration 37)
- `set_follow(p_kind text, p_target_id uuid, p_on bool)`, `set_block(p_user_id uuid, p_on bool)`,
  `set_mute(p_kind text, p_target_id uuid, p_on bool)`

Engagement (counters are **not** client-writable — migration 31 adds `BEFORE UPDATE` guards and
`verify-backend-surface.mjs` fails the build if they are removed):
- `toggle_reaction(p_target_type text, p_target_id uuid, p_kind reaction_kind) -> json`
- `toggle_save(p_post_id uuid) -> boolean`
- `record_share(p_post_id uuid, p_channel share_channel) -> json` (idempotent per day)

Discovery (this replaces the app's client-side TMDB ranking entirely):
- `get_home_discovery(p_worlds text[], p_limit int) -> json` → five rails `continue`, `tonight`,
  `trending`, `upcoming`, `recent`, plus `stats` (member-specific only) and `catalog_health`.
  **It deliberately contains no global catalog counter.**
- `get_world_discoveries(p_limit int) -> json` — one ranked rail per world.
- `get_title_discovery(p_title_id uuid) -> json` → title + episodes + cast + similar + posts.
- `trending_titles(p_world text, p_genre text, p_lifecycle catalog_lifecycle[], p_limit int, p_offset int) -> json[]`
- `airing_titles(p_world text, p_limit, p_offset) -> json[]`
- `upcoming_titles(p_world text, p_days int, p_limit, p_offset) -> json[]`
- `recently_released_titles(p_world text, p_limit, p_offset) -> json[]`
- `recommended_titles(p_limit, p_offset) -> json[]`
- `catalog_provider_health() -> json`, `catalog_lifecycle_of(p_title titles) -> catalog_lifecycle`,
  `catalog_relevance_score(p_title titles, p_world text, p_lifecycle catalog_lifecycle) -> number`

Search (deterministic, unique `id asc` tiebreaker on every one):
- `search_all(p_query text, p_world text, p_per_type int) -> json` (grouped + real counts)
- `search_titles(p_query, p_world, p_limit, p_offset)`, `search_people(...)`,
  `search_communities(...)`, `search_collections(...)`, `search_members(...)`,
  `search_suggestions(p_query, p_limit) -> {id,kind,label,subtitle}[]`,
  `title_search_rank(...)` (ts_rank_cd + websearch_to_tsquery over a generated tsvector).

Feed (keyset, **no OFFSET**):
- `feed_page(p_scope text, p_world text, p_title_id uuid, p_community_id uuid, p_limit int, p_cursor text) -> {items, has_more, next_cursor}`
  scopes: `for_you`, `following`, `latest`, `title`, `world`. Cursor is an opaque base64
  `(rank, created_at, id)` triple — pass `next_cursor` straight back.
- `feed_posts(p_scope, p_world, p_title_id, p_limit, p_offset)` — legacy signature kept, implemented
  on cursors.
- `comment_page(p_post_id uuid, p_limit int, p_cursor text) -> {items, has_more, next_cursor}`

Comments / notifications / push:
- `mark_notifications_read(p_ids uuid[], p_group notification_group) -> int`
- `notification_summary() -> json` (`unread_count`, `unread_by_group`)
- `register_push_token(p_token text, p_platform push_platform, p_device_name, p_locale, p_app_version) -> uuid`
- `disable_push_token(p_token_id uuid) -> boolean`, `disable_all_push_tokens() -> int`
- `report_content(p_target_type text, p_target_id uuid, p_reason text, p_detail text) -> uuid`

Media lifecycle:
- `begin_media_upload(p_storage_path text, p_kind text, p_content_type text, p_byte_size int) -> uuid`
- `complete_media_upload(p_upload_id uuid, p_post_id uuid, p_position int, p_width, p_height,
  p_duration_ms, p_poster_path) -> uuid`
- `fail_media_upload(p_upload_id uuid, p_error text) -> boolean`

Communities (every one re-checks authority in SQL):
- `join_community(p_community_id uuid, p_on bool) -> json` (honours `join_policy` and bans)
- `review_membership_request(p_community_id, p_user_id, p_approve bool, p_note text) -> membership_status`
- `set_community_role(p_community_id, p_user_id, p_role text) -> text`
- `remove_community_member(p_community_id, p_user_id, p_reason) -> boolean`
- `ban_community_member(p_community_id, p_user_id, p_reason) -> membership_status`
- `update_community_settings(p_community_id, p_name, p_description, p_cover_url, p_cover_tone, p_join_policy, p_locked) -> communities`
- `community_roster(p_community_id, p_limit) -> json` (includes `pending_requests`, `can_administer_community`)
- `transfer_community_ownership(p_community_id, p_new_owner_id) -> boolean`
- `moderate_community_post(p_community_id, p_post_id, p_action, p_reason) -> content_state`
- `claim_community_ownership(...)`, `can_administer_community(p_community_id) -> boolean`

Moderation (append-only audit trail in the same transaction as the change):
- `suspend_user(p_user_id, p_reason text, p_days int) -> json`, `unsuspend_user(p_user_id, p_reason) -> boolean`
- `moderate_content(p_target_type text, p_target_id uuid, p_action text, p_reason, p_report_id) -> content_state`
- `resolve_report(p_report_id, p_outcome text, p_resolution text, p_content_action) -> json`
- `escalate_report(p_report_id, p_note text, p_to_role text) -> boolean`
- `moderation_queue(p_status report_status, p_limit, p_offset) -> json` (moderators only)
- `moderation_history(p_target_type, p_target_id, p_limit) -> moderation_actions[]`

Analytics: `record_event(p_name text, p_properties json, p_session_id text, p_anonymous_id text, p_platform text, p_app_version text) -> uuid`
(validated names, properties capped at 2 kB, requires a session or install-scoped anonymous id).

Operations (service role only, never called by the app): `run_scheduled_jobs(p_jobs text[])`,
`job_claim`, `job_complete`, `job_release_stale`, `purge_deleted_accounts(retention interval)`,
`catalog_upsert_title/episodes/person/title_people`, `catalog_mark_missing`, `catalog_begin_run`,
`catalog_finish_run`, `titles_needing_refresh(p_world, p_limit)`, `enqueue_notification`,
`fanout_notification`, `fanout_due_notifications`, `claim_notification_deliveries(p_limit, p_max_attempts)`,
`report_delivery(p_delivery_id, p_sent, p_invalid, p_error, p_provider_message_id)`,
`record_moderation_action(...)`, `job_reconcile_media(p_user_retention)`, `media_remove_orphans(...)`,
`media_drop_missing_objects()`, plus the 12 job bodies.

**Storage deletion is not an RPC.** Supabase's `storage.protect_delete()` refuses a direct `DELETE` on
`storage.objects` for every role, so nothing in this schema deletes bytes. SQL records the path in
`media_removal_queue` (reason: `failed_upload | orphaned | stale_catalog | account_deleted |
retention_purge`) and the Edge Functions drain it through the Storage API:
`claim_media_removals(p_limit)` → `storage.from('media').remove(paths)` → `complete_media_removals(paths)`.

Direct table writes remain legal (RLS restricts them to the owner) for: `posts`, `comments`,
`collections`, `collection_items`, `title_alerts`, `community_members`. Everything else goes through
RPCs or is read-only.

### 1.6 Authentication (already designed, not implemented)

`docs/BACKEND-CONNECTION-CONTRACT.md` §2 is the agreed design and you must implement it:

1. The member signs in with Google or Apple through **Rork Auth**:
   `POST {RORK_AUTH_URL}/oauth/refresh` with `{ app_key, refresh_token }` returns an access token
   whose `sub` is the database user id. (The repo already anticipates exactly this call in
   `scripts/verify-backend.mjs:374`.)
2. The client presents that token to PostgREST as `Authorization: Bearer …` — either
   `createClient(url, anonKey, { accessToken: async () => token })` or by feeding the session hooks
   in `lib/auth.tsx`.
3. Email + password stays available through the platform's own auth endpoints.
4. **The client never inserts a profile.** A trigger on `auth.users` creates `profiles` +
   `user_preferences` (migration 03).
5. `supabase/config.toml` declares `site_url = "hallyu://"` and
   `additional_redirect_urls = ["hallyu://auth/callback", "exp://127.0.0.1:8081"]`. The hosted
   project must have the same redirect registered — the app already has the route `app/auth/callback.tsx`.

### 1.7 Storage

- Bucket **`media`**, **private** (`public = false`), 100 MiB ceiling, images + MP4/MOV.
- Key layout: `u/<user-id>/…` (member uploads, writable only by that member), `avatars/…`,
  `catalog/…` (world-readable, including anonymously).
- The client uploads under `u/<auth.uid()>/…`, calls `begin_media_upload`, then
  `complete_media_upload` after the object lands. Because the bucket is private, **the app needs
  signed URLs (or authenticated reads) to render post media** — build that into the media read path.

### 1.8 Catalog, trending and freshness (server-side, already done)

- `catalog-sync` fetches TMDB and hands normalised payloads to idempotent RPCs. No business logic in
  the function; whether a row is written, skipped (unchanged `content_hash`) or flagged missing is
  decided in SQL. This is what makes retries safe.
- `catalog_lifecycle_of()` → `airing | upcoming | recent | classic | unavailable`.
- `catalog_refresh_interval()`: airing 12 h, upcoming 2 d, finished 14 d. `titles_needing_refresh()`
  is the queue.
- `catalog_relevance_score()` combines lifecycle (dominant term), log-compressed provider popularity,
  vote-weighted rating, episode activity and real Hallyu engagement (`title_follows`, posts, room
  membership), decaying with age. **Every discovery surface sorts on this one function**, so Trending,
  the world rails and For You cannot disagree.
- Records the provider stops returning are flagged (`catalog_missing_count`) and eventually marked
  `unavailable`, never deleted — posts and watchlist rows still reference them.

### 1.9 Scheduled jobs (12, defined in SQL, idempotent)

`catalog.status`, `catalog.episode_schedule`, `catalog.prune`, `catalog.aggregates`,
`catalog.trending`, `alerts.upcoming_episodes`, `alerts.new_episodes`, `alerts.title_updates`,
`notifications.fanout`, `notifications.retention`, `media.reconcile`, `moderation.audit`.

`job_claim(job, run_key)` returns the existing run to a second caller with `did_claim = false`, and
`job_runs` has `unique (job, run_key)`. A cron tick, a manual run and a retry therefore cannot
collide. The `cron.schedule(...)` blocks are **written but commented out** at the bottom of
`supabase/migrations/20260101122700_27_scheduled_jobs.sql` — they reference `pg_cron` + `pg_net` +
`vault` secrets that do not exist. See §6.4 for how you wire scheduling in Rork Cloud.

### 1.10 Security model (preserve exactly)

- RLS enabled on all 37 tables, each with at least one policy; verified statically.
- Every `SECURITY DEFINER` function pins `set search_path = public, pg_temp`; the only dynamic SQL
  in the schema quotes with `%I`/`%L`. There is no SQL-execution endpoint.
- Denormalised counters are maintained by `AFTER` triggers **and** protected by `BEFORE UPDATE`
  guards (`guard_engagement_counters`) that reject any client write — RLS cannot express "you may
  update this row but not this column".
- Community and moderation RPCs re-derive authority server-side (`require_community_admin`,
  `require_moderator`) and write `moderation_actions` in the same transaction.
- `moderation_actions` is append-only (no update/delete policy for any role).
- Deletion is two-step: `delete_account()` scrubs immediately, `purge_deleted_accounts()` hard-deletes
  the tombstone after the retention window and removes its storage objects.

### 1.11 What is deliberately absent

- **No trailer or video-hosting backend.** `titles.trailer_url` exists as a column and nothing
  ingests it. `scripts/verify-backend-surface.mjs` fails the build if transcoding/ffmpeg/mediaconvert
  appears anywhere.
- **No credential of any kind in the repository.** `scripts/verify-no-secrets.mjs` scans both
  directions (committed files and history).
- **No API client, no session layer, no health gate on the app side yet.** That is your work.

---

## 2. WHERE EVERYTHING IS (file map)

Read these before changing anything.

| Concern | Path |
| --- | --- |
| The entire schema | `supabase/migrations/20260101120000_00_foundation.sql` … `20260101123600_36_audit_and_deletion.sql` (37 files, apply in filename order) |
| Migrations 23–36 (the completion phase) | `…_23_catalog_provenance.sql` → `…_36_audit_and_deletion.sql` |
| Server functions | `supabase/functions/{catalog-sync,catalog-jobs,push-dispatch,media-cleanup,moderation-digest,purge-deleted-accounts}/index.ts` |
| Shared server helpers | `supabase/functions/_shared/{cors,supabase,tmdb}.ts` |
| Typed contract | `supabase/types/database.ts` (do **not** hand-edit `_generated`; this file is hand-maintained and checked by `scripts/verify-db-types.mjs`) |
| Project config | `supabase/config.toml`, `supabase/seed.sql`, `supabase/env.example` |
| Client credentials / env reads | `constants/keys.ts` |
| Auth (integration seam) | `lib/auth.tsx` |
| State + selectors | `lib/store.tsx`, `lib/selectors.ts`, `lib/hooks.ts`, `lib/model.ts` |
| Direct TMDB catalog (to be replaced) | `lib/catalog.ts`, `lib/catalogSync.ts`, `constants/keys.ts` |
| Analytics seam | `lib/analytics.ts` |
| Local notifications | `lib/reminders.ts` |
| Device media | `lib/media.ts` |
| Follow/follower lookups (fake today) | `lib/data/connections.ts` |
| Offline guards worth preserving | `scripts/verify-*.mjs`, `scripts/lib/secret-scan.mjs`, `scripts/ci/boot-check.sh` |
| CI | `.github/workflows/build-apk.yml`, `eas-build.yml`, `backend-verification.yml` |
| Docs to read first | `docs/BACKEND.md`, `docs/BACKEND-CONNECTION-CONTRACT.md`, `docs/BACKEND-CREDENTIALS.md` |

There is **no `.env.example` at the repo root** (`.gitignore` whitelists the name, but the file does
not exist). The single placeholder template is `supabase/env.example`. `.env`, `.env.local` and
every `.env.*` are git-ignored — create `.env.local` locally, never commit it.

---

## 3. RORK CLOUD IS THE TARGET

Rork Cloud becomes the cloud environment for this existing system. The target architecture:

```
Hallyu mobile app (Expo/RN)
   → Rork Cloud
      → Hallyu backend (the 37 migrations + 6 Edge Functions, running on Rork-managed infra)
         → Rork-managed database, storage, auth, server runtime
            → TMDB (external, server-side only) and Expo push (external)
```

Rules:

- **Use Rork's own native Cloud capabilities** for database, storage, auth, server functions,
  secrets and scheduling. Do not bolt on an unrelated external service.
- **We are not reconnecting an old Supabase project.** Rork provisions and manages the resources
  and the credentials of *its own* environment.
- **We are not handing you credentials.** Rork creates and manages them.
- The Hallyu *logic* stays exactly where it is: SQL in `supabase/migrations`, TypeScript in
  `supabase/functions`. If Rork's platform cannot execute one of these Edge Functions as-is, adapt
  only the runtime wrapper — do not move their business logic into the client or into new endpoints.

---

## 4. DATABASE PROVISIONING

### 4.1 What you must do

1. Read `supabase/migrations/*` and `supabase/seed.sql` before touching anything.
2. Create the database inside the Rork Cloud project and **apply all 37 migrations in filename
   order**. No migration may be skipped, reordered, summarised or "reimplemented".
3. After the migrations, apply `supabase/seed.sql` — reference data only (4 worlds, the `tmdb`
   provider row, 4 official rooms). No member content is ever seeded.
4. Deploy the 6 server functions (`supabase/functions/*/index.ts`) to Rork's server runtime.
5. Register the storage bucket and its policies by applying migration
   `20260101121700_17_storage.sql` (bucket `media`, private, 100 MiB) — it is part of the migration
   chain, so it comes with step 2.
6. Wire scheduling (§6.4).

### 4.2 The database must be visible in Rork

**The resulting Hallyu tables must be inspectable in the Rork Cloud interface — the same schema,
the same rows, the same functions.** Not a scratch database, not a hidden temporary schema, not a
second copy. If Rork's UI only exposes a default schema or a proxy layer, register the `public`
schema explicitly, and confirm the tables appear with their real names, columns, indexes, policies
and functions. Report how a human verifies this in the Rork interface.

Also confirm: extensions `pgcrypto`, `citext`, `pg_trgm` are enabled (migration 00), and the
`analytics_events` partition helper `ensure_event_partition()` exists.

### 4.3 Prove the schema landed — run these and report the output

```sql
-- 1. object inventory (expect 37 tables + 1 default partition, 152 functions, 24 enums)
select count(*) filter (where table_type = 'BASE TABLE') as tables from information_schema.tables where table_schema = 'public';
select count(*) as functions from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public';
select count(*) as enums from pg_type t join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public' and t.typtype = 'e';

-- 2. RLS is on everywhere and nothing is policy-less
select count(*) as rls_disabled from pg_tables where schemaname = 'public' and rowsecurity = false;
select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and not exists (select 1 from pg_policies p where p.tablename = c.relname);

-- 3. the security invariants the repo enforces
select count(*) as unpinned_definer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) cfg where cfg like 'search\_path=%'));

-- 4. idempotency backbone
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conname in ('job_runs_job_key_unique', 'post_shares_once_per_day');

-- 5. reference data
select id, name from worlds order by id;
select external_id from providers;
```

### 4.4 Scheduled-job infrastructure

`run_scheduled_jobs()` and its 12 job bodies already exist. The `cron.schedule(...)` blocks at the
bottom of `20260101122700_27_scheduled_jobs.sql` are **commented out** because they reference
`pg_cron` + `pg_net` + Vault secret names that only existed in the old plan.

- If Rork Cloud offers native scheduled invocations, point them at the **service-role endpoint of
  `catalog-jobs`** (which calls `run_scheduled_jobs()`), plus `push-dispatch`, `media-cleanup`,
  `purge-deleted-accounts`, `moderation-digest` and the `catalog-sync` jobs. Recommended cadence:
  `catalog-jobs` every 15 minutes, `catalog-sync` hourly, `push-dispatch` hourly, `media-cleanup`
  daily, `purge-deleted-accounts` daily, `moderation-digest` daily.
- If Rork Cloud happens to expose `pg_cron`/`pg_net`, the commented block is the reference — adapt
  the URLs to Rork's own function endpoints.
- **Idempotency stays in SQL** (`job_claim` + `unique (job, run_key)`), so a second scheduler, a
  manual run and a retry cannot collide. Do not move scheduling logic out of the database.
- Prove it: run the dispatcher twice in the same hour and show that the second call returns
  `status = 'skipped'` and creates no duplicate `job_runs` row.

---

## 5. RORK CREDENTIALS AND CONFIGURATION

**You are not receiving credentials from us and you must not ask the user for any.** Provision them
through Rork Cloud's own secret/environment mechanisms, and record *where* each one went, using the
map below. Never invent a value; never commit one.

### 5.1 What already exists as placeholders

- `supabase/env.example` — every credential **name** with PLACEHOLDER values (verified by
  `scripts/verify-backend-surface.mjs`).
- `constants/keys.ts` — reads `EXPO_PUBLIC_*` variables through an `env()` helper that only
  overrides when the value is **non-empty** (CI often defines them empty).
- `.github/workflows/backend-verification.yml` — already declares the secret names
  `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RORK_APP_KEY`,
  `RORK_TEST_REFRESH_TOKEN`, masks them, and gates the live suite on them.
- `docs/BACKEND-CREDENTIALS.md` — the authoritative credential map (client-safe vs server-only).

### 5.2 Where each Rork-generated value belongs

| Value | Client-safe? | Goes into |
| --- | --- | --- |
| Rork database / API base URL | yes | `EXPO_PUBLIC_<RORK_DB_URL>` read in `constants/keys.ts`; GitHub Actions secret; `.env.local`; also the `SUPABASE_URL` slot the verification script already reads |
| Rork anon / publishable key | yes | same as above, `SUPABASE_ANON_KEY` slot |
| Rork app key (`RORK_APP_KEY`, used by the Rork OAuth token exchange) | yes | `constants/keys.ts` + `RORK_APP_KEY` secret; the verification script already looks for `rpk_*` |
| Rork auth base (`https://api.rork.com` by default) | yes | constant with env override |
| Media bucket name (`media`) | yes | `EXPO_PUBLIC_MEDIA_BUCKET`, constant default already assumed |
| **Service-role / admin key** | **NO — privileged** | Rork Cloud secrets only. CI (`SUPABASE_SERVICE_ROLE_KEY`). **Never in the app, never in a GitHub Actions variable used by the build, never in a log.** |
| TMDB v4 token / v3 key | **NO — server-side** | Rork Cloud environment for `catalog-sync`. Never shipped to the app. |
| Expo push access token | **NO — server-side** | Rork Cloud environment for `push-dispatch`; optional (the anonymous endpoint works). |

Client-safe values **are** embedded in the APK by design — they are read through `EXPO_PUBLIC_*` at
**build time**, which is exactly why the build workflow must receive them as secrets.

### 5.3 What must stay server-side

The service-role key, TMDB credentials, the push token and any Rork admin token. The app may only
hold the base URL, the anon key, the Rork app key and the bucket name.

### 5.4 Concrete file changes

1. `constants/keys.ts` — add the backend connection values as `EXPO_PUBLIC_*` reads with the same
   non-empty `env()` semantics. Keep `TMDB_ACCESS_TOKEN`/`TMDB_API_KEY` while the app still has any
   direct TMDB path; remove them **only** when §6 says the app no longer calls TMDB (§9.5).
2. `.env.local` (git-ignored) for local runs — never commit.
3. GitHub Actions secrets for `build-apk.yml`, `backend-verification.yml`, `eas-build.yml` (§8).
4. Rork Cloud environment variables for the server functions (§5.2, server rows).
5. Update `supabase/env.example` and `docs/BACKEND-CREDENTIALS.md` so the placeholder names still
   describe reality after Rork's values land — `verify-backend-surface.mjs` fails if those names
   disappear.

---

## 6. FRONTEND CONNECTION

Every row below is a real, current, device-local path and the real backend call that replaces it.
Work screen by screen; do not delete local caching, the Zustand store, or `lib/selectors.ts`.

### 6.1 The service layer (new code)

Create a small client layer (suggested: `lib/api/client.ts` + `lib/api/*.ts`) that:

- builds one client from the connection values with `@supabase/supabase-js`;
- resolves the caller's token from `lib/auth.tsx` (Rork access token or the auth session);
- exposes typed RPC calls generated from `supabase/types/database.ts` (do not hand-write row types —
  import from the contract so `verify-db-types.mjs` keeps meaning something);
- reports every failure through one classifier (`connecting | connected | unavailable | offline | misconfigured`).

Keep `lib/hooks.ts` `useLoad()` as the loading primitive: it is abort-aware and already used by
screens, so remote loaders should reuse it rather than inventing another spinner pattern.

### 6.2 Mapping (current local source → backend)

| Screen / module | Today | Connect to |
| --- | --- | --- |
| `app/index.tsx` (splash gate) | `auth.status` + `state.hydrated` | add the connection gate (§7) before redirecting |
| `lib/auth.tsx` + `app/(auth)/*` (`sign-in`, `sign-up`, `verify`, `forgot`, `reset-password`, `gate`, `welcome`), `app/auth/callback.tsx` | AsyncStorage "account", `sendReset` throws | Rork Auth token exchange + email/password; real reset and verification; keep the exported `AuthValue` contract |
| `app/_layout.tsx` | `freshMemberState` / `guestState` | `get_bootstrap()` for a signed-in member; keep the guest path |
| `lib/store.tsx` (`posts`, `comments`, `collections`, `notifications`, `users`) | device-local | read via feed/search/detail RPCs; write via table insert + RPCs; **keep the store as the read cache** |
| `app/(tabs)/index.tsx` (Home) | `sel.forYou/following`, `catalog.recommendations`, `catalog.crossFandom` | `get_home_discovery(p_worlds, p_limit)`, `feed_page(p_scope)`; the five rails replace the client-side rails; keep `adoptDramas` for image/episode enrichment |
| `app/(tabs)/explore.tsx` | `catalog.popular/topRated/byFandom/byGenre/onProvider`, world lists | `get_world_discoveries()` + `trending_titles/airing_titles/upcoming_titles/recently_released_titles` |
| `app/trending.tsx` | `catalog.trending`, `sel.trendingPosts` | `trending_titles()` + `feed_page(scope=latest/world)` |
| `app/schedule.tsx` | `sel.airingEpisodes`, `sel.scheduleByDay` | `airing_titles()` + `title_episodes` air dates from `get_title_discovery()` |
| `app/search.tsx` | `catalog.searchDramas/searchActors`, `sel.searchLocal` | `search_all()` / `search_suggestions()` (deterministic, per-type counts, private collections and blocked/suspended members excluded by SQL) |
| `app/drama/[id].tsx`, `app/episode/[dramaId]/[season]/[number].tsx`, `app/d/[id]/…` | `catalog.getDrama`, `getSeasonEpisodes`, `adoptDramas` | `get_title_discovery(p_title_id)` |
| `app/actor/[id].tsx` | `catalog.getActor`, `relatedActors` | `search_people` + title relations from `get_title_discovery` |
| `components/create/pickers.tsx` | `catalog.searchDramas/searchActors` | `search_all` (the only permitted remaining catalog entry point after §9.5) |
| `app/collection/add.tsx`, `app/collection/[id].tsx`, `app/collection/{new,add}.tsx`, `app/collections.tsx` | local collections | `collections` / `collection_items` tables (RLS-restricted to the owner) |
| `app/watchlist.tsx` | local watchlist | `upsert_watchlist_item()` |
| `app/saved.tsx` | `saves` array | `toggle_save(p_post_id)` |
| `app/(tabs)/activity.tsx` | local notifications | `notifications` reads + `mark_notifications_read()` + `notification_summary()` |
| `lib/reminders.ts` + `app/_layout.tsx` notification wiring | local `expo-notifications` schedule | **keep** local reminders, **and** call `register_push_token(p_token, p_platform, p_device_name, p_app_version, p_locale)` so server-side episode alerts can reach the device |
| `app/create/[type].tsx`, `components/create/CreateSheet.tsx` | local post creation | insert into `posts` (+ `post_media`); `begin_media_upload` → upload to `u/<uid>/…` → `complete_media_upload` |
| `app/p/[id].tsx`, `app/post/[id].tsx`, `components/feed/*` | local comments/reactions | `comment_page()`, `toggle_reaction()` (the app must never write a counter directly) |
| `app/report.tsx` | `reported` array | `report_content()` |
| `app/settings/index.tsx`, `settings/{content,notifications,privacy,language,account,blocked}.tsx` | `prefs` action on the local store | `merge_preferences(p_patch)` with the allow-listed patch |
| `app/settings/notifications.tsx` | local toggles | `merge_preferences` + confirm server-side suppression works |
| `app/settings/blocked.tsx` | `blockedUsers` | `set_block()` + `profiles` reads |
| `app/settings/delete-account.tsx` | `auth.deleteAccount()` (wipes the device) | `delete_account()` then local wipe; surface `media_objects_removed` |
| `app/edit-profile.tsx`, `app/u/[handle].tsx`, `app/user/[handle]/*`, `components/profile/ProfileView.tsx` | local profile/users | `profiles` (own row write, others read-only) |
| `lib/data/connections.ts` | synthetic follower lists, documented as "no server" | `profiles` + `follows` reads (followers/following both directions) |
| `app/(onboarding)/*` (`fandoms`, `genres`, `dramas`, `people`, `intent`, `notifications`) | local + `catalog` | `complete_onboarding(p_worlds, p_genres, p_step)`; pickers use `search_all` |
| `lib/analytics.ts` (`track()`) | in-memory buffer | `record_event(...)` behind the existing `AnalyticsSink` seam; keep local buffering for offline |
| `app/(tabs)/create.tsx`, `app/shorts.tsx` | local posts | same as post creation; `feed_page` with cursors |
| `lib/media.ts` (downloads/gallery) | device-only by design | **leave alone** — device downloads are not backend state |
| `app/settings/about.tsx` | "Live catalog" diagnostics | extend with the backend connection report (§7) |

### 6.3 What must NOT be removed

- `lib/store.tsx` and `lib/selectors.ts` — keep them as the client cache and view-model layer. Rork
  is not a reason to delete the app's state design.
- The TTL memo in `lib/catalog.ts` while it still exists.
- `adoptDramas`/`adoptActors` enrichment (images, episodes, cast) — backend rows are thinner than the
  shape the screens want; this is the adapter.
- The render-loop guard (`npm run test:home-render`) and the memoised `useApp()` accessors.

### 6.4 Device-only / local paths that legitimately stay local

`lib/media.ts` downloads & gallery saves, `lib/boot.ts` trail, `lib/crash.ts`, first-run coach marks
(`state.seen`), spoiler state (`revealed`), drafts, recents. Local `expo-notifications` reminders
stay *in addition to* server push.

---

## 7. CONNECTION GATE / HEALTH CHECK

Implement a real gate. The app must distinguish, and say so on screen:

| State | Meaning |
| --- | --- |
| `connecting` | first handshake in flight (bounded timeout, e.g. 6 s, then resolve to a real state) |
| `connected` | the remote path answered: session + at least one authenticated query succeeded |
| `unavailable` | reachable config, backend/server error (5xx, RPC error, missing function) |
| `offline` | device has no network (use the existing `@react-native-community/netinfo` path via `useConnectionType()`) |
| `misconfigured` | missing URL/key, auth rejects, PostgREST schema not served, RLS blocking anonymous reads |

Requirements:

- **Never silently pretend.** The app must not fall through to local/mock content and report success.
  If the backend is unreachable, say so (existing degraded-copy patterns in `lib/catalog.ts` and
  `components/ui/States.tsx` are the style precedent).
- Verify the **real Rork-hosted path**: an authenticated RPC round trip (`get_bootstrap()`), not just
  a TCP ping or a health endpoint that does not touch the database.
- Reuse the existing seams: `lib/catalog.ts` already exports a `CatalogHealth` store +
  `subscribeCatalogHealth`/`getCatalogHealth`, and `lib/hooks.ts` exposes `useCatalogHealth()`.
  Build the backend health on the same pattern (or replace it cleanly) instead of inventing a fourth
  mechanism. `app/settings/about.tsx` already has a diagnostics surface — extend it.
- Place the gate before the redirect in `app/index.tsx` so a cold start cannot land on a Home screen
  full of device data while claiming to be connected. Keep the existing 6 s auto-bailout and boot
  trail diagnostics — they are the release-stall safety net.
- Surface state in `app/settings/about.tsx` with the reason (status code, message), matching how
  `CatalogHealth` records `status` + `message`.

---

## 8. GITHUB ACTIONS

### 8.1 Where build configuration lives today

- `.github/workflows/build-apk.yml` — the APK pipeline: Node 20 + bun + Java 17 + Android SDK 34 +
  NDK 26.1.10909125, `bun install --frozen-lockfile`, `npm run typecheck`,
  **`npm run test:home-render`** (must stay), `SOURCE_COMMIT` traceability,
  `npx expo prebuild --platform android --clean --no-install`, `./gradlew assembleRelease`,
  zipalign + apksigner + `assets/index.android.bundle` presence checks, an emulator boot test via
  `scripts/ci/boot-check.sh`, artifact + GitHub release.
  It currently injects **only** `EXPO_PUBLIC_TMDB_ACCESS_TOKEN` / `EXPO_PUBLIC_TMDB_API_KEY`.
  Its release note says *"Frontend-only build — no backend connected"* — update that text.
- `.github/workflows/eas-build.yml` — EAS cloud builds (`preview` → APK, `production` → AAB) using
  `eas.json`. EAS runs on Expo's servers and does **not** inherit the job env; its header says so.
- `.github/workflows/backend-verification.yml` — offline gates always; live suite gated on
  `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`, exit code 0/1/2 handling via
  `${PIPESTATUS[0]}`, job summary.

### 8.2 What you must change

1. **Build-time client configuration must reach the bundle.** `EXPO_PUBLIC_*` values are inlined by
   Metro at build time, so an APK built without them will have no backend at runtime. Add the
   client-safe Rork values (base URL, anon key, Rork app key, bucket name) to the `env:` block of
   `build-apk.yml` from GitHub Secrets, using `${{ secrets.NAME }}`.
2. **Nothing secret in the build.** The service-role key, TMDB credentials and push token must never
   be passed to a build step or an `EXPO_PUBLIC_*` variable. If you need to *verify* connectivity in
   CI, use the live verification job with server-only secrets, not the app build.
3. **APK must connect to the Rork backend.** After building, the emulator boot test should assert the
   app reports `connected` — extend `scripts/ci/boot-check.sh` / the logcat assertions rather than
   accepting a white screen. The build must fail if the app cannot reach the backend.
4. **EAS builds** need the same client-safe values via EAS environment/secrets (they do not inherit
   the GitHub job env), and `app.json → expo.extra.eas.projectId` handling already exists there.
5. **Keep `server.hmr`/Metro/HMR configuration untouched.** Keep `npm run test:home-render` in the
   APK pipeline — it is a shipped regression guard, not a test you may drop to make CI green.
6. **Do not hardcode** any generated URL, key or project id in the repo. Secrets and `EXPO_PUBLIC_*`
   env at build time only. `.github/workflows/backend-verification.yml` already documents the required
   repository secrets; keep that list accurate (add Rork's names).

---

## 9. CODE CHANGES YOU ARE EXPECTED TO MAKE

This is an implementation task. Expect to edit:

1. `package.json` — **move `@supabase/supabase-js` from `devDependencies` to `dependencies`**: it is
   about to become a runtime import of the app bundle. Add any client SDK Rork's auth requires as a
   real dependency. Do not change `bun.lock` semantics — CI runs `bun install --frozen-lockfile`.
2. `constants/keys.ts` — add the connection values (§5.4).
3. `lib/auth.tsx` — real session handling (§6.2), keeping the exported contract.
4. New `lib/api/*` — the typed client, error classification, token injection.
5. `app/index.tsx` — the connection gate.
6. The screens in §6.2, one by one.
7. `lib/analytics.ts` — `record_event` behind the existing sink seam.
8. `lib/reminders.ts` — additionally register the push token.
9. `.github/workflows/build-apk.yml` (+ `eas-build.yml`, `scripts/ci/boot-check.sh`) — §8.
10. `scripts/verify-backend-surface.mjs` — **one surgical change**: it contains
    `const LEGACY_LOCAL_CATALOG = 'lib/catalog.ts'` and fails the build if any *other* file contains
    `api.themoviedb.org` or `image.tmdb.org`. When `lib/catalog.ts` stops calling TMDB, remove or
    update that allow-list entry and keep the invariant "no screen or component calls TMDB". **Do not
    delete or weaken the check.**
11. `docs/*` — record the connection: which values are configured, where, and the schedule.

Also keep `npm run check` green: typecheck, lint, `test:fandoms`, `test:sql`, `test:db-types`,
`test:backend-surface`, `test:secrets`, `test:home-render`.

---

## 10. DO NOT DESTROY EXISTING WORK

You must **not**:

- rebuild Hallyu from scratch, or create a second backend;
- create a parallel/duplicate database, or re-implement a table that already exists;
- throw away, rewrite or "modernise" the 37 migrations — they are applied in order and verified;
- replace working backend functionality with mocks, fixtures or seed data;
- remove working features because they were device-local;
- weaken RLS, drop a policy, or expose a table to make a client call succeed;
- let the client write counters directly (the `BEFORE UPDATE` guards exist for a reason);
- ship or log the service-role key, TMDB credentials or any Rork admin token;
- restyle the app, restructure expo-router routes, or change the design tokens;
- remove the local caching, the Zustand store or the render-loop guard;
- reconnect to any pre-existing external project.

If something must change, change the smallest appropriate part, and say in your report what you
changed and why.

---

## 11. NO TRAILER BACKEND

Trailer ingestion, video hosting, streaming and transcoding are **out of scope** for this
connection task. `titles.trailer_url` remains a column that nothing fills. Do not add a video
pipeline, a CDN, a transcoder or a player. `scripts/verify-backend-surface.mjs` fails the build if
`transcod|ffmpeg|video_encoding|mediaconvert` appears in the app or in any migration — keep it that
way.

---

## 12. FINAL VERIFICATION (required, and "it builds" is not enough)

Run both layers.

**A. Repository gates (must be exit 0):**

```sh
npm run check                                   # typecheck, lint, 6 offline gates
node scripts/verify-sql.mjs                     # 37 migrations parse; RLS; search_path; dynamic SQL; no secrets
node scripts/verify-db-types.mjs                # the TS contract matches the migrations
node scripts/verify-backend-surface.mjs         # every capability present and not a placeholder
node scripts/verify-no-secrets.mjs              # no credential committed
npx expo export -p android                      # the bundle still builds
```

**B. Live end-to-end, against the Rork-hosted backend** (`node scripts/verify-backend.mjs` — it
exits 0 PASS / 1 FAIL / 2 NOT CONFIGURED, and it is real: two throwaway members through the admin
API, every write path exercised, RLS isolation proven both directions, a real object uploaded and
read back in the `media` bucket, then everything it created deleted). It already covers catalog
ingest idempotency, stale-data correction, upcoming/airing date logic, Home rails vs counters,
notification dedupe/coalescing/preference suppression, invalid-token handling, retries, alert
targeting, share idempotency, counter-write rejection, community and moderation permissions, search
privacy, cursor stability, media reconciliation and job-claim idempotency. **Run it and report the
result.** Then prove the flows through the running app:

| Flow | Prove |
| --- | --- |
| Authentication | sign in via Rork Auth **and** email/password → session → `get_bootstrap()` returns *this member's* profile |
| Session restore | force-quit and relaunch → session restored, no re-login, no duplicate profile |
| Catalog | a title with poster, seasons, episodes, cast and air dates renders from the backend, not from TMDB on the device |
| Home | five rails + member `stats` from `get_home_discovery`; **no raw "16 titles"-style counter anywhere** |
| Search | title, person, community, collection, member results; private collection of another member hidden; blocked member absent |
| Feed | `feed_page` pages with `next_cursor`, no duplicates and no gaps when a new post arrives mid-scroll |
| Posts | create post + image → appears in the feed → comment → react → counts correct; direct counter write rejected |
| Communities | join, leave, request approval, moderator promotes/removes, all enforced server-side |
| Notifications | an event (comment/reaction/follow) creates one notification; same event again does not duplicate; a disabled preference suppresses it; push token registered |
| Settings | change a preference → reload → value persisted server-side |
| Media | upload an image into `u/<uid>/…` → renders via signed URL → appears on the post |
| Watchlist | update progress → `upsert_watchlist_item` → reflected after reload |
| Account deletion | delete → content scrubbed → tombstone retained → purge removes the profile and its objects |
| Failure state | point the app at a wrong URL / stop the backend → the connection gate reports `misconfigured` / `unavailable`, and the app **does not** claim to be connected |
| Offline | airplane mode → gate reports `offline`, cached content still renders |

Report failures honestly with the exact error. Do not mark a flow verified because "the app builds".

---

## 13. FINAL REPORT (required, in this shape)

1. **Rork Cloud project** — id, region, what Rork provisioned.
2. **Database** — where it lives in Rork Cloud and how a human sees the Hallyu tables in the Rork
   interface (a screenshot-free, click-by-click description).
3. **Migrations applied** — number applied (of 37), in order, plus the seed.
4. **Schema** — tables created (count + names), functions/RPCs created (count), triggers, indexes,
   enums, storage buckets + policies, RLS policy count.
5. **Security verification** — the §4.3 query output, and how an unauthorised operation was proven
   to fail while the authorised one succeeded.
6. **Server functions deployed** — the 6, their endpoints, their required secrets (names only) and
   their service-role guard.
7. **Scheduling** — how the 12 jobs are triggered, cadence, and the evidence that a duplicate run is
   a no-op.
8. **Credentials/configuration** — a table of every value: name, client-safe yes/no, and exactly
   where it now lives (Rork secret, GitHub secret, `.env.local`, `constants/keys.ts`). **No values.**
9. **Frontend connection** — per screen/module: what it called before, what it calls now.
10. **Connection gate** — the five states, where the gate lives, and what each failure mode showed.
11. **GitHub Actions** — the exact diff summary: secrets added, steps changed, what now fails the
    build, and how a built APK is proven to reach the Rork backend.
12. **Verification results** — §12 A and B, with real outputs and exit codes.
13. **Preserved** — a list of what you deliberately did not change, and every deviation from this
    prompt with its reason.
14. **Open items** — anything not completed, and precisely why.