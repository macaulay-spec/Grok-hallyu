# 08 — API architecture and specification (sections 15, 26)

## 15. API architecture

| Surface | Base URL | Auth | Used for |
|---|---|---|---|
| **PostgREST (schema `api`)** | `https://<project>.supabase.co/rest/v1/` with header `Accept-Profile: api` / `Content-Profile: api` (supabase‑js: `createClient(url, key, { db: { schema: 'api' } })`) | `apikey` = publishable key + `Authorization: Bearer <user JWT>` (omitted for guests) | all reads (views) and all writes (RPC `POST /rest/v1/rpc/<fn>`) |
| **Supabase Auth** | `/auth/v1/*` | — | already integrated |
| **Edge Functions** | `/functions/v1/<name>` | user JWT (delete‑account, ensure‑catalog) or internal bearer (push‑dispatch, moderate) | privileged flows |
| **Media Worker** | `https://media-api.hallyu.app/` (Workers Free) | user JWT (verified via JWKS) | presign / complete; cron for purge |
| **Media CDN** | `https://media.hallyu.app/<key>` (R2 custom domain) | none (unguessable keys) | images, posters, MP4 |
| **Realtime** | `wss://<project>.supabase.co/realtime/v1` | user JWT (guests may join room channels read‑only) | live room broadcast/presence |

Conventions: JSON camelCase in RPC payloads/results (SQL builds the JSON); timestamps ISO‑8601 UTC; pagination = keyset (`before`/`beforeId` or `afterScore`/`afterId`), page ≤ 40; errors from RPCs arrive as PostgREST error objects `{ code, message, details, hint }` with **HTTP status from SQLSTATE `PTxxx`** (401 sign‑in required, 403 forbidden/blocked, 404, 409 conflict, 413 too large, 422 validation, 429 rate limited). Client mapping in `SupabaseBackend`: 401 → force re‑auth; 403/404/409/413/422 → `BackendError(retryable=false)` (undo applied, toast with message); 429/5xx/network → `BackendError(retryable=true)` (backoff).

Rate limits are enforced in SQL (`check_rate`) per user per bucket; the Worker enforces per‑user upload limits; Supabase Auth has its own limits. Values are listed per endpoint below.

## 26. Endpoint specification

Legend — AUTHZ: `anon` guests allowed · `user` JWT required, `state='active'` for writes · `mod` moderator/admin role · `svc` service role only.

### 26.1 Identity & profile

| METHOD / ROUTE | AUTHZ | REQUEST | RESPONSE | VALIDATION | DB | ERRORS | RATE LIMIT |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/signup`, `/token?grant_type=password`, `/otp`, `/recover`, `/user` (PUT), `/logout` | — | Supabase Auth standard | session | Supabase | `auth.users` → trigger `handle_new_user` creates `profiles` | Supabase codes | Auth defaults (custom SMTP: 30 emails/h default) |
| `POST /rpc/me` | user | `{}` | `{ profile, follows:{users,dramas,actors,collections}, dramaNotify[], blocks[], mutes[], watchlist[], saves[], reactions{ "post:<id>": kind }, collections[], unread, pushTokens }` | — | one query per slice, all indexed by `user_id` | 401 | — |
| `GET /profiles?handle=eq.<h>&select=…` (view `api.profiles`) | anon | — | public columns; `prefs/onboarding/termsVersion/language` only for self | — | `profiles` | — | PostgREST |
| `PATCH /profiles?id=eq.<me>` | user | any of `display_name(≤40), avatar_key, bio(≤160), favorite_genres(≤12), favorite_drama_ids(≤12), is_private, prefs, onboarding, terms_version, language` | row | CHECK constraints; `avatar_key` must be an own `ready` upload (trigger, step 5) | `profiles` (column grants) | 403 other columns/rows | — |
| `POST /rpc/claim_handle` | user | `{ p_handle }` | `null` | `^[a-z0-9_]{3,20}$`, not reserved, unique, ≤1 change / 30 days | `profiles`, `audit_log` | 409 taken/reserved, 422 format, 429 | 1 / 30 days |
| `POST /rpc/profile_page` | anon | `{ p_handle }` | `{ id, handle, displayName, avatarKey, bio, favoriteGenres, favoriteDramaIds, followers, following, posts, joinedAt, verified, isPrivate, viewer:{following, followsYou, blocked}, collections[] }` or `null` | hidden if the profile blocked the viewer | `profiles`, `follows`, `blocks`, `collections` | — | — |
| `POST /rpc/user_posts` | anon | `{ p_user_id, p_before?, p_before_id?, p_limit≤40 }` | `PostCard[]` | — | `posts` (author index) | — | — |
| `POST /functions/v1/delete-account` | user | `{}` | `{ ok: true }` | JWT required | anonymise profile, soft‑delete content, enqueue media purge, `auth.admin.deleteUser` | 401 | 1 / hour / user (function) |

### 26.2 Graph, watchlist, settings

| METHOD / ROUTE | AUTHZ | REQUEST | RESPONSE | VALIDATION | DB | ERRORS | RATE LIMIT |
|---|---|---|---|---|---|---|---|
| `POST /rpc/set_follow` | user | `{ p_type: user|drama|actor|collection, p_id, p_on }` | `null` | no self‑follow; not blocked pair; collection must be public | `follows` (+ counters, `follow`/`collection_saved` notification) | 403 blocked, 404 collection, 422 | 100 / hour |
| `GET /follows?follower_id=eq.<id>&target_type=eq.user` … | anon | — | rows | — | `follows` | — | — |
| `POST /rpc/set_block` / `set_mute` | user | `{ p_user_id, p_on }` / `{ p_type: user|drama, p_id, p_on }` | `null` | not self | `blocks` (removes follows both ways), `mutes` | 422 | — |
| `POST /rpc/set_drama_notify` | user | `{ p_drama_id, p_on }` | `null` | drama exists (FK) | `drama_notify` | 404 | — |
| `POST /rpc/upsert_watchlist` | user | `{ p_drama_id, p_status, p_season?, p_episode?, p_note?(≤200) }` | `null` | status enum; drama FK | `watchlist_items` (+ `watching_count`) | 422 | 300 / hour |
| `POST /rpc/remove_watchlist` | user | `{ p_drama_id }` | `null` | — | `watchlist_items` | — | — |
| `GET /watchlist_items?user_id=eq.<me>` | user | — | own rows incl. note | RLS | — | — | — |

### 26.3 Content

`PostCard` = `{ id, type, body, title, kind, rating, verdict, spoiler, context:{dramaId, secondaryDramaId, season, episode, actorIds}, hashtags[], mentions[], reactions:{loved,cried,screamed,swooned,laughed,furious}, commentCount, saveCount, shareCount, createdAt, editedAt, state, author:{id, handle, displayName, avatarKey, verified}, drama:{id, title, posterPath, tmdbId}|null, media:[{key, kind, thumbKey?, posterKey?, width, height, durationMs?}], viewer:{reaction|null, saved} }`.

| METHOD / ROUTE | AUTHZ | REQUEST | RESPONSE | VALIDATION | DB | ERRORS | RATE LIMIT |
|---|---|---|---|---|---|---|---|
| `POST /rpc/create_post` | user | `{ p: { id(uuid), type, body, title?, kind?, rating?, verdict?, spoiler?, context?, hashtags?, mentionIds?, media?[] } }` | `{ id, createdAt }` or `{ id, duplicate: true }` | body ≤ type limit (1000/140/5000/5000/500/300), title ≤90 (discussion required), rating 1–10 + drama for review, drama required for reaction/recommendation/review, drama exists in catalog, ≤6 media, ≤1 video (alone), short = exactly one video ≤60 s, clip ≤140 s, media `ready` and owned, poster required for video, ≤3 actors, ≤20 hashtags, ≤10 mentions | `posts`, `post_media`; triggers: counters, mention notifications; queue `moderation` | 403 limited account, 422 (message is user‑facing), 429 | 20 / hour |
| `POST /rpc/edit_post` | user (author) | `{ p_id, p: { body?, title?, spoiler?, hashtags? } }` | `null` | within 15 min of `created_at`; same length rules | `posts.edited_at` | 404, 409 window closed, 422 | — |
| `POST /rpc/delete_post` | user (author) | `{ p_id }` | `null` | — | `state='deleted'`, `deleted_at`; media purge after 24 h | 404 | — |
| `POST /rpc/post_page` | anon | `{ p_id }` | `PostCard` or `null` | hidden posts only to author/mod | `posts` | — | — |
| `POST /rpc/feed_for_you` | anon (personalised when JWT) | `{ p_asof?, p_after_score?, p_after_id?, p_limit≤40 }` | `PostCard[]` each with `score` | — | 7‑day window ≤600 candidates, scoring in SQL | — | — |
| `POST /rpc/feed_following` | user | `{ p_before?, p_before_id?, p_limit }` | `PostCard[]` | — | `follows` join | 401 | — |
| `POST /rpc/feed_shorts` | anon | `{ p_before?, p_before_id?, p_limit≤20 }` | `PostCard[]` | — | shorts partial index | — | — |
| `POST /rpc/drama_posts` | anon | `{ p_drama_id, p_tab: all|discussion|review|reaction|recommendation|short|episode, p_season?, p_episode?, p_before?, p_before_id?, p_limit }` | `PostCard[]` | — | drama/episode indexes | — | — |
| `POST /rpc/episode_room` | anon | `{ p_drama_id, p_season, p_episode }` | `{ counts:{kind:n}, recentPosters, episode:{title, airAt, runtime}, posts: PostCard[] }` | — | `episode_reaction_counts`, `catalog_episodes`, `posts` | — | — |
| `POST /rpc/home_rails` | anon | `{}` | `{ airingToday[], liveRooms[], trendingDramas[], trendingDiscussions: PostCard[], trendingPosts: PostCard[] }` | — | materialised views (5‑min refresh) | — | — |
| `POST /rpc/create_comment` | user | `{ p: { id, postId, parentId?, replyToUserId?, body(1–1000), spoiler? } }` | `{ id, createdAt }` | post active; not blocked; depth ≤1 | `comments` (+ counters, `comment`/`reply` notifications), queue `moderation` | 403, 404, 422, 429 | 60 / hour |
| `POST /rpc/delete_comment` | user (author or post author) | `{ p_id }` | `null` | — | `state='deleted'` (+ counters) | 404 | — |
| `POST /rpc/comments_page` | anon | `{ p_post_id, p_after?, p_limit≤100 }` | `Comment[]` (`{ id, postId, parentId, replyToUserId, body, spoiler, reactions, replyCount, createdAt, state, author, viewer:{reaction} }`) | — | `(post_id, created_at)` | — | — |
| `POST /rpc/set_reaction` | user | `{ p_type: post|comment, p_id, p_kind: loved|cried|screamed|swooned|laughed|furious|null }` | `null` | target active; not blocked | `reactions` upsert/delete (+ counters, episode meter, `reaction` notification grouped per hour) | 403, 404, 422, 429 | 300 / hour |
| `POST /rpc/set_save` | user | `{ p_post_id, p_on }` | `null` | post active | `saves` (+ `save_count`) | 404, 429 | 200 / hour |
| `GET /saves?user_id=eq.<me>&select=post_id,created_at` | user | — | own rows | RLS | — | — | — |
| `POST /rpc/upsert_collection` | user | `{ p: { id, title(1–60), description?(≤240), visibility, coverDramaId? } }` | `null` | owner only on update | `collections` | 422, 429 | 60 / hour |
| `POST /rpc/delete_collection` | user (owner) | `{ p_id }` | `null` | — | cascade items | — | — |
| `POST /rpc/set_collection_item` | user (owner) | `{ p_collection_id, p_drama_id, p_on, p_note? }` | `null` | drama FK | `collection_items` (+ `item_count`) | 404 | — |
| `GET /collections?id=eq.<id>&select=*,collection_items(*)` | anon | — | public or own | RLS | — | — | — |
| `POST /rpc/search_posts` | anon | `{ p_q, p_before?, p_before_id?, p_limit }` | `PostCard[]` | `#tag` → exact hashtag match; else websearch FTS | GIN indexes | — | 120 / hour (client‑side debounce; server bucket in step 8) |
| `POST /rpc/search_people` | anon | `{ p_q, p_limit≤50 }` | `[{ id, handle, displayName, avatarKey, verified, followers }]` | trigram similarity | — | — | — |

### 26.4 Notifications & push

| METHOD / ROUTE | AUTHZ | REQUEST | RESPONSE | VALIDATION | DB | ERRORS | RATE LIMIT |
|---|---|---|---|---|---|---|---|
| `POST /rpc/notifications_page` | user | `{ p_before?, p_limit≤100 }` | `[{ id, kind, group, actorIds, actors[≤3 profiles], postId, commentId, dramaId, season, episode, collectionId, title, body, createdAt, read }]` | — | `(user_id, updated_at)` | 401 | — |
| `POST /rpc/mark_notifications_read` | user | `{ p_ids?: uuid[] }` (null = all) | `null` | — | `read_at` | — | — |
| `POST /rpc/register_push_token` / `unregister_push_token` | user | `{ p_token: ExponentPushToken[...], p_platform, p_device_id? }` | `null` | token format CHECK | `push_tokens` | 422 | — |
| Realtime channel `room:{dramaId}:{season}:{episode}` | user (anon read) | Broadcast `{ kind }` (client sends after `set_reaction` succeeds) · Presence `{ uid }` | — | channel name regex; broadcast only while the episode aired < 3 h ago (server config `realtime_rooms`) | none (ephemeral) | — | Realtime quotas |
| `POST /functions/v1/push-dispatch` (internal, cron) | svc | `{}` | `{ sent, failed }` | bearer = internal key | drains `push_outbox` (≤500), renders title/body per kind, POST to Expo in batches of 100, records tickets, disables tokens on `DeviceNotRegistered` | — | every minute |

### 26.5 Media (Cloudflare Worker `media-api.hallyu.app`)

| METHOD / ROUTE | AUTHZ | REQUEST | RESPONSE | VALIDATION | DB | ERRORS | RATE LIMIT |
|---|---|---|---|---|---|---|---|
| `POST /upload/presign` | user JWT | `{ kind: avatar|image|thumb|video|poster, mime, bytes, parts?: n (≤13 × 8 MB) }` | single: `{ key, url, headers:{Content-Type, Cache-Control}, expiresAt }` · multipart: `{ key, uploadId, parts:[{ partNumber, url }], expiresAt }` | mime allow‑list; `bytes` ≤ 8 MB (images) / 100 MB (video); quotas via `api.media_reserve` (30/day, 12 videos/day; new accounts 5/2) | `media_uploads` (pending) | 401, 413, 415, 429 | 60 / min / user (Durable Object) |
| `PUT <presigned url>` | presigned | raw bytes | 200 + `ETag` | R2 | — | — | — |
| `POST /upload/complete` | user JWT | `{ key, uploadId?, parts?: [{ partNumber, etag }], width?, height?, durationMs? }` | `{ key, bytes, status: ready }` | completes multipart; `HEAD` size vs declared (±5 %); first 64 KB magic‑byte check (JPEG/PNG/WEBP/MP4 `ftyp`); on failure delete object | `api.media_finalize` | 400 corrupt, 404 unknown key, 409 already finalised | 60 / min / user |
| `GET https://media.hallyu.app/<key>` | public | Range supported | bytes with `Cache-Control: public, max-age=31536000, immutable` | — | — | 404 | — |
| cron `*/5` | — | — | — | drains `media_delete` queue (`pgmq_public.read/delete`) → R2 delete + cache purge | — | — | — |

### 26.6 Catalog & moderation

| METHOD / ROUTE | AUTHZ | REQUEST | RESPONSE | VALIDATION | DB | ERRORS | RATE LIMIT |
|---|---|---|---|---|---|---|---|
| `POST /functions/v1/ensure-catalog` | user | `{ tmdbId, kind: drama|actor, withEpisodes?: true }` | `{ id (slug), title, … }` | re‑fetches TMDB server‑side (server key); computes slug; upserts drama + cast + episodes with `air_at` (Korean broadcast slot → UTC) | `catalog_*` (service role) | 404 TMDB miss, 429 | 60 / hour / user |
| `GET /catalog_dramas?id=eq.<slug>` etc. | anon | — | rows | — | — | — | — |
| `POST /rpc/create_report` | user | `{ p_type: post|comment|user|drama|collection, p_id, p_reason, p_detail?(≤500) }` | `null` | reason enum; one report per target per reporter (updates); auto‑hide at 3 distinct mature reporters / 24 h (non‑verified authors) | `reports`, `moderation_actions` | 422, 429 | 20 / day |
| `GET /mod_queue` (view) | mod | — | `[{ targetType, targetId, reports, reasons[], firstReportedAt, lastReportedAt }]` | — | — | 403 (empty) | — |
| `POST /rpc/mod_set_state` | mod | `{ p_type: post|comment|user, p_id, p_state, p_reason? }` | `null` | role check | state change, reports → actioned, `moderation_actions`, `system` notification | 403, 422 | — |
| `POST /rpc/mod_dismiss_reports` | mod | `{ p_type, p_id }` | `null` | — | `reports` | — | — |
| `POST /functions/v1/moderate` (internal, cron) | svc | `{}` | `{ scanned, flagged }` | drains `moderation` queue; OpenAI omni‑moderation on text + first image/poster; thresholds per §19 | `moderation_scans`, `posts/comments.state`, `moderation_actions`, notification | — | every minute |

### 26.7 Client adapter contract (`lib/data/supabaseBackend.ts`)

| Outbox action | Call |
|---|---|
| `follow` | `rpc('set_follow', { p_type: kindSingular, p_id, p_on })` |
| `dramaNotify` | `rpc('set_drama_notify')` |
| `watch` / `progress` / `note` (coalesced) | `rpc('upsert_watchlist')` |
| `react` | `rpc('set_reaction', { p_type, p_id, p_kind })` |
| `save` | `rpc('set_save')` |
| `addPost` | wait for media `ready` (composer uploads first) → `rpc('create_post', { p })` |
| `editPost` / `deletePost` | `rpc('edit_post')` / `rpc('delete_post')` |
| `addComment` / `deleteComment` | `rpc('create_comment')` / `rpc('delete_comment')` |
| `upsertCollection` / `deleteCollection` / `collectionItem` | `rpc('upsert_collection')` / `rpc('delete_collection')` / `rpc('set_collection_item')` |
| `profile` / `prefs` / `onboarding` | `from('profiles').update({...}).eq('id', me)` (prefs merged client‑side, whole object written) |
| `block` / `muteUser` / `muteDrama` | `rpc('set_block')` / `rpc('set_mute')` |
| `report` | `rpc('create_report')` |
| `readNotifications` | `rpc('mark_notifications_read')` |
| `pull('home')` | `rpc('me')` (if signed in) + `rpc('home_rails')` + `rpc('feed_for_you')` (+ `feed_following` when the tab is open) |
| `pull('explore')` | `rpc('home_rails')` (trending slices) |
| `pull('activity')` | `rpc('notifications_page')` |
| `pull('drama')` | `rpc('drama_posts')` + `rpc('episode_room')` for the open episode |
| `pull('profile')` | `rpc('profile_page')` + `rpc('user_posts')` |
