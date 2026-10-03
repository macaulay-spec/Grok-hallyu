# Hallyu backend — client connection contract

This is the contract the app will code against in the next phase. Nothing here is connected yet: the
keys are placeholders and the repository contains no credential. The point is that the client can be
written against this document without changing the backend.

## 1. Connection values

| Value | Placeholder source | Client-safe | Where the client will read it |
| --- | --- | --- | --- |
| Supabase URL | `EXPO_PUBLIC_SUPABASE_URL` (GitHub Secret `SUPABASE_URL`) | yes | `constants/keys.ts` |
| Supabase anon key | `EXPO_PUBLIC_SUPABASE_ANON_KEY` (Secret `SUPABASE_ANON_KEY`) | yes | `constants/keys.ts` |
| Rork app key | `EXPO_PUBLIC_RORK_APP_KEY` (Secret `RORK_APP_KEY`) | yes | `constants/keys.ts` |
| Rork auth base | `EXPO_PUBLIC_RORK_AUTH_URL` = `https://api.rork.com` | yes | `constants/keys.ts` |
| Media bucket | `EXPO_PUBLIC_MEDIA_BUCKET` = `media` | yes | `constants/keys.ts` |
| Service-role key | `SUPABASE_SERVICE_ROLE_KEY` (Secret only) | **no** | never in the app |

`.gitignore` blocks `.env` and `.env.local`; the placeholder template is `supabase/env.example`.

## 2. Authentication expectations

1. The member signs in with Google or Apple through **Rork Auth** (`POST {RORK_AUTH_URL}/oauth/…`
   with `app_key`). Rork returns an access token whose `sub` is the Supabase user id.
2. The client passes that token to PostgREST as `Authorization: Bearer …`, either with
   `createClient(url, anonKey, { accessToken: async () => token })` or by refreshing it on
   `lib/auth.tsx`'s session hooks.
3. Email + password remains available through Supabase's own auth endpoints for local sign-up.
4. Every `auth.users` insert creates a `profiles` row and a `user_preferences` row in the database —
   the client never inserts a profile itself.
5. Session renewal belongs in `lib/auth.tsx` (the file that exists today for the device-local build);
   the backend exposes no session endpoint of its own.

## 3. Tables the client reads and writes

| Area | Tables | Client access |
| --- | --- | --- |
| Identity | `profiles`, `user_preferences`, `title_alerts` | own row read/write; other profiles read-only |
| Catalog | `worlds`, `providers`, `titles`, `title_people`, `title_episodes`, `people`, `catalog_rank_snapshots` | read-only (ingest is a server job) |
| Social graph | `follows`, `title_follows`, `person_follows`, `collection_follows`, `blocks`, `mutes` | write via RPCs; read public |
| Content | `posts`, `post_media`, `comments`, `reactions`, `saves`, `post_shares` | insert as yourself; edit/delete your own |
| Organization | `collections`, `collection_items`, `watchlist_items` | owner-only writes |
| Rooms | `communities`, `community_members` | read all; join/leave and staff actions via RPCs |
| Inbox | `notifications`, `notification_deliveries` | read own rows; **no client insert** |
| Device | `push_tokens` | own rows only |
| Media | `media_uploads` | own rows; lifecycle via RPCs |
| Moderation | `reports`, `moderation_actions` | file your own; moderators read all, nobody writes directly |
| Operations | `job_runs`, `catalog_sync_runs`, `catalog_provider_state` | no client access at all |
| Analytics | `analytics_events` | no direct access; write via `record_event` |

## 4. RPCs the client will call

| RPC | Arguments | Returns | Replaces (in `lib/`) |
| --- | --- | --- | --- |
| `get_bootstrap` | – | profile, prefs, follows, saves, watchlist, unread count | cold-start hydration in `app/index.tsx` |
| `toggle_reaction` | `p_target_type`, `p_target_id`, `p_kind` | `{ active, kind, counts }` | `react` action + `SyncStrip` |
| `toggle_save` | `p_post_id` | `boolean` | `save` action |
| `set_follow` | `p_kind` (`user`/`title`/`person`/`collection`), `p_target_id`, `p_on` | `boolean` | `follow` action |
| `set_block` / `set_mute` | id / kind + `p_on` | `boolean` | `block`, `muteUser`, `muteDrama` |
| `upsert_watchlist_item` | title, status, season, episode, total, note | the row | `watch`, `progress`, `note` |
| `merge_preferences` | allow-listed patch | the row | `prefs` action |
| `complete_onboarding` | worlds, genres, step | the profile | `onboarding` action |
| `mark_notifications_read` | ids / group | count | `readNotifications` action |
| `register_push_token` | token, platform, device | row id | push registration (not present yet) |
| `report_content` | target type/id, reason, detail | report id | `report` action |
| `feed_posts` | scope, world, title, limit, offset | post rows | feed selectors (`lib/selectors.ts`) |
| `search_titles` | query, world, limit, offset | title rows | TMDB search fallback (`lib/catalog.ts`) |
| `record_event` | name, properties, anonymous id | event id | `track()` in `lib/analytics.ts` |
| `handle_is_available` | handle | `boolean` | sign-up handle check |
| `delete_account` | – | `{ deleted, media_objects_removed, deleted_at }` | `settings/delete-account.tsx` |

### Discovery (replaces the client-side TMDB ranking)

| RPC | Arguments | Returns | Replaces (in `lib/`) |
| --- | --- | --- | --- |
| `get_home_discovery` | worlds, limit | `{ worlds, sections[], stats, catalog_health }` | Home rails |
| `get_world_discoveries` | limit | one ranked rail per world | world tabs |
| `get_title_discovery` | title id | title + episodes + cast + similar + posts | the Drama Hub |
| `trending_titles` / `airing_titles` / `upcoming_titles` / `recently_released_titles` | world, limit, offset | ranked title rows | `trending.tsx`, `schedule.tsx` |
| `recommended_titles` | limit, offset | ranked rows with a reason | For You |

No raw catalog counters are exposed for the Home screen. The `stats` block contains member-specific
numbers only (watching, want to watch, completed, alerts, episodes ahead, unread).

### Engagement, community and moderation

| RPC | Arguments | Returns |
| --- | --- | --- |
| `record_share` | post id, channel | `{ share_count, counted }` — idempotent per day |
| `join_community` / `review_membership_request` | community, user, approve | membership state |
| `set_community_role` / `remove_community_member` / `ban_community_member` | community, user, role/reason | new role or status |
| `update_community_settings` / `community_roster` / `transfer_community_ownership` | community, fields | room state |
| `suspend_user` / `unsuspend_user` | user, reason, days | suspension state |
| `moderate_content` / `resolve_report` / `escalate_report` | target, action, report | new state, audit id |
| `moderation_queue` / `moderation_history` | status/target, limit | moderators only |

### Feed, search, media and push

| RPC | Arguments | Returns |
| --- | --- | --- |
| `feed_page` | scope, world, title, community, limit, cursor | `{ items, has_more, next_cursor }` |
| `comment_page` | post id, limit, cursor | `{ items, has_more, next_cursor }` |
| `search_all` / `search_suggestions` | query, world, per type | grouped results with real counts |
| `begin_media_upload` / `complete_media_upload` / `fail_media_upload` | path, post, metadata | upload/media row id |
| `register_push_token` / `disable_push_token` / `disable_all_push_tokens` | token, platform | token id or count |
| `notification_summary` | – | unread count and per-group counts |

Feed pagination is a cursor, not an offset: pass `next_cursor` back for the next page. Direct table
writes stay available for `posts`, `comments`, `collections`, `collection_items`, `title_alerts` and
`community_members`, because RLS already restricts them to the owner. Engagement counters are not
writable by any client — migration 31 adds guards that reject a direct counter write.

## 5. Storage rules

- Bucket `media`, **private** (`public = false`), 100 MB hard ceiling, images and MP4/MOV only.
- Key layout: `u/<user-id>/…` (uploads, writable only by that member), `avatars/…` and `catalog/…`
  (readable by anyone, including anonymous visitors).
- The client uploads with the anon key under `u/<auth.uid()>/…`, then inserts a `post_media` row with
  that `storage_path`. Reads are authenticated (or a signed URL); nothing is world-readable by
  accident.

## 6. Required GitHub secrets

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (required) and `RORK_APP_KEY`,
`RORK_TEST_REFRESH_TOKEN` (optional; enables the Rork path in the verification script).

## 7. Verification command

```sh
node scripts/verify-backend.mjs
```

Exit `0` = PASS, `1` = FAIL, `2` = credentials not configured. The same command runs in
`.github/workflows/backend-verification.yml`, which fails the build on a non-zero exit.

The offline gates run without any project and cover the same surface statically:

```sh
node scripts/verify-sql.mjs             # parse, RLS, search_path, dynamic SQL, credentials
node scripts/verify-db-types.mjs        # the TypeScript contract matches the migrations
node scripts/verify-backend-surface.mjs # every required capability exists and is not a placeholder
```