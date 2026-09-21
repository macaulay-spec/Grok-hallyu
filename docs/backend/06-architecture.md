# 06 — Architecture options, recommendation and cross‑cutting designs (sections 9–11, 16–21, 30–31)

## 9.1 Options compared (A–H)

Scoring: 1 (poor) – 5 (excellent). "$0 reach" = highest MAU a single legitimate account can serve free under the `04` model. "Team fit" = one or two developers who already know TypeScript + the existing seam.

| Option | Stack | $0 reach | Cost @ 50K MAU | Video story | Fit with existing code | Lock‑in | Ops burden | Team fit | Total |
|---|---|---|---|---|---|---|---|---|---|
| **A. Supabase only** (Auth + DB + Storage + Realtime + Functions) | one vendor | ~2K MAU (Storage 1 GB / 5 GB egress hit first) | ~$110 + **media egress ≈ $1,140** | bad (egress) | 5 | 3 | 5 | 5 | ✗ egress |
| **B. Firebase only** (Auth + Firestore + Storage + FCM + Functions) | one vendor | ~800 DAU (50K reads/day); Storage needs a card + Blaze | reads $150–300 + storage/egress $1,000+ | bad (egress) + card | 2 (rewrite data layer, no SQL for veils) | 1 (proprietary queries/rules) | 5 | 3 | ✗ |
| **C. Appwrite Cloud + R2** | Appwrite for auth/DB/realtime, R2 media | ~1K MAU (5 GB bandwidth) | ~$40 + R2 $19 | ok via R2 | 3 (rewrite auth + data; document permissions) | 3 (self‑host MIT) | 4 | 3 | △ |
| **D. Supabase (Auth + DB + Realtime + Functions) + R2 + Worker** | best‑of‑breed, two vendors | **~2–3K MAU** | **~$127** | good (zero egress; Stream later) | **5** (auth done; seam exists) | 3 (Postgres + GoTrue + S3‑compatible → self‑host path) | 4 | 5 | **✓ chosen** |
| E. Neon Postgres + Hono API on Cloudflare Workers + Firebase Auth/Clerk + R2 | hand‑built API | ~1K MAU (Neon 100 CU‑h; cold starts) | ~$81 Neon + $5 Workers + R2 | good | 2 (write API, authz, feed, notifications from scratch) | 4 | 3 | 2 | △ (best at 200K MAU cost, worst time‑to‑ship) |
| F. PocketBase / self‑hosted Supabase on Oracle Always‑Free | single VM | fragile (reclaimed idle VMs) | $0–20 (if VM survives) | poor (no CDN unless + R2) | 3 | 5 | 1 | 2 | ✗ for production |
| G. AWS Amplify (Cognito + AppSync + DynamoDB + S3/CloudFront) | one vendor | credits only (6 months) | Cognito $600 @ 50K MAU + DynamoDB + egress | CloudFront 1 TB free then $0.085/GB | 1 | 1 | 2 | 2 | ✗ |
| H. Supabase now → self‑hosted Supabase (VPS pair) at ≥100K MAU | D with a planned exit | as D | as D | as D | 5 | 4 (same open‑source stack) | 2 at exit time | 4 | ✓ = D + exit plan |

**Recommendation = D with H as the planned exit.** D is the only option that (1) needs zero rewrites of the finished client beyond the seam, (2) is $0 to a real beta, (3) makes video economics survivable, and (4) can be self‑hosted later without changing schema, RLS, storage keys or API shapes.

## 9.2 Service responsibilities (one each)

* **Supabase Auth** – identity only. Never stores profile data (that is `profiles`). Roles in `app_metadata.role` (`user` | `moderator` | `admin`) set only by the `admin` via SQL.
* **Postgres** – all state that must be consistent: social graph, content metadata, counters, notifications, reports, quotas, catalog mirror, queues (pgmq), schedules (pg_cron).
* **PostgREST/RPC** – the API. Reads through views/RPCs shaped for screens; writes through RPCs that validate exactly what `lib/model.ts LIMITS` validates.
* **Edge Functions** – privileged glue only: `delete-account`, `ensure-catalog` (server TMDB key), `moderate` (OpenAI key), `push-dispatch` (Expo token). Each is < 150 lines, idempotent, and secret‑bearing.
* **Worker `media`** – anything touching R2 credentials: presign, complete, delete/purge.
* **R2 + CDN** – bytes.
* **Realtime** – ephemeral fan‑out inside live rooms; never a source of truth (counts are re‑read from Postgres on join).
* **Expo Push** – delivery only; templates and grouping are computed in SQL.

## Feed design (the heaviest read path)

The client's `lib/selectors.ts forYou()` scoring is reproduced server‑side so the UI behaves identically:

```
score = log10(1 + loved + cried + screamed + swooned + laughed + furious + 2*comments + 3*saves)
      + affinity(0.8 if drama followed/in watchlist, 0.5 if author followed, 0.3 if actor followed, 0.2 if genre in favourites)
      + recency(- age_hours / 18)
      + type_bonus(discussion +0.15 when episode aired < 48 h)
```

* Candidate set: posts from the last 7 days with `state='active'`, excluding blocked/muted authors and muted dramas, plus everything from followed authors in the last 30 days; capped at 600 rows before scoring (index `(created_at desc) where state='active'`).
* Keyset pagination on `(score bucket, created_at, id)`; the RPC returns 20 posts **with author, drama, media, viewer state (my reaction, saved)** in one JSON payload (≈4 KB/post in list mode; bodies truncated to 280 chars with `has_more`).
* Following feed = simple keyset on `created_at` over followed authors/dramas/actors (`follows` join), no scoring.
* Shorts feed = `type='short'` with the same scoring.
* Spoiler veils stay client‑side (the server returns `spoiler`, `context.episode` and the viewer's watchlist progress; the client already decides what to veil).
* Trending = materialised views `mv_trending_posts` / `mv_trending_dramas` refreshed by pg_cron every 5 minutes (reaction velocity over 24 h).
* Cache: the client caches each feed page 60 s in the store (existing behaviour); no server cache at $0. At stage 4, add a Worker cache for anonymous For You (public, 30 s).

## 11. Authentication & authorization

| Topic | Decision |
|---|---|
| Providers | email/password (verification required before posting; reading allowed), Google (existing PKCE flow), Apple when iOS ships (App Store requirement when Google login exists) |
| Sessions | supabase‑js in AsyncStorage (existing); JWT 1 h, refresh rotation on; `detectSessionInUrl:false` (existing) |
| Anonymous | no anonymous sign‑in; guest = requests without JWT → `anon` role → public SELECT policies only |
| Emails | Resend SMTP (domain‑verified `auth@hallyu.app`); templates customised; redirect allow‑list = `hallyu://auth/callback`, `https://hallyu.app/auth/callback` |
| Roles | `app_metadata.role`; SQL helper `auth_role()`; moderators cannot escalate (metadata is server‑set) |
| Profile creation | trigger on `auth.users` insert → `profiles` row with generated handle `user_xxxxx`; onboarding claims a real handle via `rpc claim_handle` (unique, `^[a-z0-9_]{3,20}$`, reserved list: admin, hallyu, support, mod, root, api…) |
| Verified badge | `profiles.verified` set by admin only |
| Account deletion | Edge Function `delete-account` (JWT required): marks `profiles.state='deleted'`, anonymises handle/display name, soft‑removes posts/comments (kept 30 days for abuse forensics), enqueues media purge, deletes `auth.users` row (cascade on FKs with `on delete cascade` where safe); web `/delete` route already exists and triggers the same function after sign‑in |
| Rate limits (auth) | Supabase defaults (e.g. 30 emails/h once custom SMTP, OTP 360/h, token refresh 1800/5 min per IP); captcha (Turnstile, free) on sign‑up once abuse appears |
| Block semantics | blocked ↔ blocker cannot see each other's posts/comments/profiles beyond handle; enforced in RPCs via `is_blocked_pair(a,b)`; `follows` rows removed both ways on block |

## 16. Realtime

| Use | Mechanism | Free‑tier behaviour |
|---|---|---|
| Live episode room meter ("N reacting", kind deltas) | Realtime **Broadcast** on channel `room:{drama}:{season}:{ep}`; the client sends `{kind}` on reaction (also persisted via RPC); server truth = `episode_reaction_counts` polled every 20 s as a fallback and on join | 200 peak connections; channel join failure → polling only |
| "N in the room" | Realtime **Presence** on the same channel | included |
| Activity badge | optional `postgres_changes` on `notifications` filtered by `user_id` (RLS‑checked) — enabled only while the app is foregrounded; default is pull on focus | cheap; can be disabled centrally with a remote flag |
| Feed | **no realtime** (pull‑to‑refresh + 60 s cache) | — |
| Comments under an open post | polling every 15 s while open (RPC `comments_since`) | — |

## 17. Search

* **Posts:** `posts.fts tsvector` generated column (`to_tsvector('simple', coalesce(title,'') || ' ' || left(body, 2000) || ' ' || array_to_string(hashtags,' '))`, GIN); ranking `ts_rank_cd` × recency; hashtag exact match via `hashtags @> array[$1]`.
* **People:** `pg_trgm` GIN on `handle` and `display_name` (`ilike`/similarity), boosted by follower_count.
* **Dramas / actors:** TMDB search from the client (existing) + a local `catalog_dramas` `pg_trgm` index for dramas already referenced in Hallyu (so results include fandom counts).
* **Recent searches** stay on device.
* Upgrade path: Meilisearch (self‑hosted, free) or Typesense Cloud ($25+) fed by a `search_outbox` trigger when > ~5M posts or when relevance complaints arrive.

## 18. Notifications

| Piece | Design |
|---|---|
| Creation | AFTER INSERT triggers on `reactions`, `comments`, `follows`, `post mentions` → `notify()` function inserts/merges into `notifications` using `group_key` (`reaction:post:{id}:{hour}`), appending `actor_ids` (max 50) — reproduces the client's grouped rendering |
| Episode events | pg_cron hourly `schedule_episode_notifications()`: for `catalog_episodes.air_at` in the next hour → users with `drama_notify` on (or watching + prefs.episodes) → `episode_aired`/`episode_live` rows (idempotent on `(user_id, kind, drama_id, season, episode)`) |
| Preferences | `profiles.prefs.notifications.*` and quiet hours evaluated in SQL before enqueueing a push (`should_push(user_id, kind, now())`) |
| Push tokens | `push_tokens(user_id, token, platform, device_id, last_seen_at)`; registered via `rpc register_push_token` after the OS permission prompt (existing `lib/reminders.ts` already requests permission); stale tokens removed on Expo `DeviceNotRegistered` receipts |
| Dispatch | trigger enqueues `push_outbox` (pgmq); pg_cron every minute calls Edge Function `push-dispatch` via pg_net; it reads ≤500 messages, posts to `https://exp.host/--/api/v2/push/send` in batches of 100, stores ticket ids, and 15 min later checks receipts (second cron) |
| Retention | `notifications` older than 90 days deleted nightly; read state per row (`read_at`) — `rpc mark_notifications_read(ids?)` |
| Local reminders | keep `lib/reminders.ts` as an offline fallback; de‑duplicate by suppressing local schedule when a push token is registered |

## 19. Moderation

| Piece | Design |
|---|---|
| Data | `reports(reporter_id, target_type, target_id, reason, detail, status, created_at)`, `moderation_actions(actor_id, target_type, target_id, action, reason, created_at)`, `moderation_scans(target_type, target_id, provider, scores jsonb, flagged bool)`, `posts.state`/`comments.state`/`profiles.state` ∈ active/hidden/removed/deleted |
| Automated | pgmq `moderation` → Edge `moderate` → OpenAI omni‑moderation (text + poster/first image) → thresholds: `≥0.9` on sexual/minors, violence/graphic, self‑harm/instructions → hide + queue; `≥0.6` → queue; else nothing |
| Report handling | ≥3 distinct reporters within 24 h on the same target → auto‑`hidden` pending review (except targets by `verified` authors → queue only) |
| Moderator tooling | v0: Supabase Studio views `v_mod_queue`, `v_report_stats` + RPCs `mod_set_state`, `mod_ban_user`; v1: role‑gated `/admin/*` routes in the existing app (web) — after launch |
| User‑side | block, mute user/drama, muted words (client), report reasons already in the UI; `system` notification on action; appeal via support email link in Settings → Help |
| Compliance | Play UGC policy (report + block + terms) already covered; keep removed content 30 days for legal requests, then hard delete |

## 20. Security

* Client ships only publishable keys (Supabase anon/publishable, TMDB read). Service role, R2 keys, OpenAI key, Expo access token, Resend key live in Supabase Function secrets / Worker secrets / GitHub Actions secrets.
* **RLS on every table**, default‑deny; `security definer` RPCs run with `set search_path = public` and explicit `auth.uid()` checks; PostgREST exposes only schema `api` (views + RPCs) — base tables live in `public` but are not exposed, which prevents accidental wide queries.
* Input validation in SQL (lengths from `LIMITS`, enums, media ownership, edit window, depth‑1 comments, no self‑follow, no reactions on hidden content).
* JWT verification in the Worker via Supabase JWKS (`/auth/v1/.well-known/jwks.json`) with 10‑min cache; `aud='authenticated'`.
* Rate limiting (see §21b). Turnstile on sign‑up when needed.
* Abuse patterns handled: spam posting (quotas + new‑account limits), reaction bots (per‑user per‑minute caps), report brigading (auto‑hide requires distinct accounts older than 24 h), handle squatting (reserved list, 3 changes/30 days), enumeration (no sequential ids — uuid v7).
* Secrets rotation: quarterly for R2/Resend/OpenAI; Supabase JWT secret rotation documented (forces re‑login).
* Logging: Postgres slow query log; Worker `console.log` sampled; Sentry in app and functions; no PII in logs.

## 21. Backups & disaster recovery

| Stage | Backup | RPO / RTO |
|---|---|---|
| Free | weekly logical export: Worker cron → PostgREST (service key) → JSONL per table → R2 `hallyu-backups/{date}/`; plus `supabase db dump` from a developer machine before every migration (stored encrypted in R2) | 7 days / hours |
| Pro | Supabase daily backups (7‑day retention) + the weekly export kept | 24 h / 1 h |
| Stage 5+ | PITR add‑on ($100) or self‑hosted WAL archiving to R2 | minutes / 1 h |
| Media | R2 is 11‑nines durable; deleted objects are unrecoverable → 24 h grace queue before deletion; optional weekly `rclone` sync to Backblaze B2 (10 GB free; free egress to Cloudflare) once media matters | — |
| Restore drill | quarterly restore of the latest dump into a scratch Supabase project | — |
| Provider outage | app is offline‑first (outbox, cached feeds, TMDB direct); read‑only banner via `SyncStrip` already exists | — |

## 21b. Caching and rate limiting

| Layer | Mechanism |
|---|---|
| Client | existing store cache (60 s per feed page), `expo-image` disk cache, `Cache-Control: immutable` on media |
| CDN | media cached at Cloudflare edge; catalog images from TMDB CDN |
| DB | materialised views for trending/home rails (5 min); `pg_stat_statements` reviewed monthly |
| API rate limits | `rate_limits(user_id, bucket, window_start, count)` checked inside write RPCs (`check_rate(bucket, limit, window)`): posts 20/h, comments 60/h, reactions 300/h, follows 100/h, reports 20/day, searches 120/h, uploads per §13; anonymous reads limited by Supabase's own PostgREST limits + Cloudflare in front of the custom domain (stage 3: Supabase custom domain add‑on $10/mo enables WAF rules) |
| Worker | 60 req/min per user on `/upload/*` using a Durable Object counter (free SQLite DO) |
| Abuse response | `profiles.state='limited'` (can read, cannot write) set by moderators or automatically after 3 hidden posts in 7 days |

## 30. Vendor lock‑in assessment

| Component | Lock‑in | Exit |
|---|---|---|
| Postgres schema, RLS, functions, pg_cron, pgmq | none (open source) | `pg_dump` → any Postgres 15+; pgmq/pg_cron are open extensions |
| GoTrue (Supabase Auth) | low | self‑host GoTrue; password hashes export via support/self‑host; or migrate to another IdP with password reset flow |
| PostgREST API shapes | low | self‑host PostgREST identically; client uses supabase‑js which targets PostgREST |
| Realtime | medium (Broadcast API is Supabase‑specific) | small surface (one hook `useLiveRoom`) → swap for a WebSocket Worker/Durable Object |
| Edge Functions (Deno) | low | plain `fetch` handlers; port to a Worker/Node in hours |
| R2 | none (S3 API) | `rclone` to B2/S3/GCS; `MEDIA_BASE` constant switch |
| Expo Push | low | tokens are Expo tokens; switching to raw FCM/APNs needs re‑registration |
| Resend / PostHog / Sentry | none | SMTP/SDK swaps |

## 31. Migration strategy (managed → self‑hosted, or vendor change)

1. **Trigger:** ≥100K MAU or Supabase invoice > $400/month for two months, or a policy change that breaks the free/paid economics.
2. **Target:** two VPSs (8 GB each, e.g. €10–20/month class) running the official Supabase docker‑compose (Postgres, GoTrue, PostgREST, Realtime, Storage disabled) behind Cloudflare, plus managed Postgres backups to R2/B2 via `wal-g`.
3. **Steps:** (a) provision + restore latest dump; (b) run both stacks with logical replication from managed → self‑hosted for 48 h; (c) switch `SUPABASE_URL`/keys via remote config (`EXPO_PUBLIC_*` already supported) and a forced app update window; (d) freeze writes on the old project for 10 minutes during cut‑over (outbox absorbs it); (e) keep the old project read‑only for 30 days.
4. **Vendor change (e.g. Cloudflare → Bunny for media):** copy bucket with `rclone`, flip `MEDIA_BASE`, keep old domain 90 days.
