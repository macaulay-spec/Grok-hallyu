# 09 — Repository structure, implementation roadmap, risks (sections 27–29)

Nothing below has been started; this is the plan that begins once the package is approved.

## 27. Repository structure (additions to the existing Expo repo — monorepo, no new repos)

```
Grok-hallyu/
├─ app/ components/ lib/ constants/ …        (existing client — untouched except the files listed in §28)
├─ lib/data/
│  ├─ backend.ts                              (existing seam; unchanged)
│  ├─ sync.ts                                 (existing; + per-user outbox key, + media gate for addPost)
│  ├─ supabaseBackend.ts                      NEW  Backend implementation (push → RPCs, pull → projections)
│  ├─ projections.ts                          NEW  server JSON → store slices (PostCard → Post, me() → slices)
│  ├─ media.ts                                NEW  compress → presign → upload (single/multipart, retry) → complete
│  └─ realtime.ts                             NEW  useLiveRoom(dramaId, season, ep) (Broadcast/Presence + polling fallback)
├─ lib/push.ts                                NEW  Expo push token registration + handlers (reminders.ts becomes fallback)
├─ supabase/
│  ├─ config.toml                             project config (auth redirect URLs, custom SMTP env)
│  ├─ migrations/0001_init.sql                = docs/backend/schema.sql (split into 0001_schema, 0002_rls, 0003_rpcs, 0004_cron as it grows)
│  ├─ seed.sql                                reserved handles, app_config, dev fixtures
│  └─ functions/
│     ├─ _shared/{supabase.ts, tmdb.ts, expo.ts, moderation.ts}
│     ├─ delete-account/index.ts
│     ├─ ensure-catalog/index.ts
│     ├─ moderate/index.ts
│     └─ push-dispatch/index.ts
├─ workers/media/
│  ├─ wrangler.toml                           R2 binding, DO binding, cron, secrets list
│  ├─ src/{index.ts, presign.ts, complete.ts, purge.ts, jwt.ts, magic.ts, quota.ts}
│  └─ test/…                                  vitest + miniflare
├─ docs/backend/                              this package (+ validate-schema.mjs runs in CI)
└─ .github/workflows/
   ├─ build-apk.yml                           existing (unchanged)
   └─ backend.yml                             NEW  schema validation (PGlite) → supabase db push (main) → wrangler deploy → functions deploy
```

Environment/secrets (never in the client): `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` (CI), `R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY` (Worker), `INTERNAL_FN_KEY` (cron → functions), `TMDB_SERVER_KEY`, `OPENAI_API_KEY`, `EXPO_ACCESS_TOKEN` (optional, for push security), `RESEND_SMTP_*` (Supabase dashboard). Client config additions: `EXPO_PUBLIC_MEDIA_BASE`, `EXPO_PUBLIC_MEDIA_API`.

## 28. Implementation roadmap (exact order; each step ends with a checkable completion criterion)

| # | Step | Files to create / modify | Infra | Tests | Done when |
|---|---|---|---|---|---|
| 1 | **Project + schema** | `supabase/config.toml`, `supabase/migrations/0001_init.sql` (from `schema.sql`), `supabase/seed.sql`, `.github/workflows/backend.yml` (PGlite validation job only) | link existing project `psmxekrmoltwabefgqpd`; enable `pg_cron`, `pg_net`, `pgmq`; expose schema `api` (Dashboard → API); custom SMTP = Resend; redirect allow‑list | `validate-schema.mjs` green in CI; `supabase db push` applies cleanly to a scratch project | tables/RLS live; `select api.home_rails()` returns JSON via REST with the anon key |
| 2 | **Catalog function** | `supabase/functions/ensure-catalog/index.ts`, `_shared/tmdb.ts` | secret `TMDB_SERVER_KEY` | unit: slug generation, Korean slot → UTC; integration: upsert for 3 dramas | posting with a new drama id succeeds after the client calls `ensure-catalog` |
| 3 | **Client adapter (reads)** | `lib/data/supabaseBackend.ts` (`pull`), `lib/data/projections.ts`, `lib/supabase.ts` (`db.schema='api'`), `lib/format.ts` (`uuid()` via `expo-crypto` for post/comment/collection ids), `lib/store.tsx` (no shape change; `hydrate` from `me()`), `lib/data/sync.ts` (`setBackend(supabase)` when signed in, outbox key per user) | — | jest: projections (PostCard → Post) round‑trip; jsdom crawl with `DEMO=0` against a seeded project | Home/Explore/Drama/Profile render real server data for a signed‑in test user and for a guest |
| 4 | **Client adapter (writes)** | `supabaseBackend.ts` (`push` for every action in `02` table), error mapping to `BackendError` | — | jest: action → RPC payload table; manual: airplane‑mode outbox replay | all 22 syncable actions persist; undo on 4xx works; retries on 429/5xx |
| 5 | **Media pipeline** | `workers/media/*`, `lib/data/media.ts`, `app/create/[type].tsx` (upload step + progress), `app/edit-profile.tsx` (avatar), `components/media/FeedVideo.tsx` + `ImageCarousel.tsx` (URL = `MEDIA_BASE + key`), `package.json` (+`react-native-compressor` SDK‑51‑compatible version, `expo-crypto`), trigger `profiles.avatar_key` ownership | R2 bucket + custom domain; Worker deploy; secrets | vitest/miniflare: presign auth, magic bytes, multipart complete; device test: 140 s clip → ≤45 MB → plays inline on Android | image post, avatar and short video round‑trip end‑to‑end; deleted post's media disappears within 30 min of the grace period |
| 6 | **Notifications + push** | `lib/push.ts`, `lib/reminders.ts` (suppress local when token registered), `app/(tabs)/activity.tsx` (pull from `notifications_page`), `supabase/functions/push-dispatch/index.ts`, `_shared/expo.ts` | cron `push-dispatch` (vault secrets) | integration: reaction → notification row → outbox → Expo ticket; receipts prune bad tokens | a test device receives social + episode pushes; quiet hours respected |
| 7 | **Account deletion + moderation** | `supabase/functions/delete-account/index.ts`, `functions/moderate/index.ts`, `app/settings/delete-account.tsx` + `app/delete.tsx` (call function, then sign out), moderator SQL views | secrets `OPENAI_API_KEY`, cron `moderate` | integration: deletion anonymises + purges; flagged fixture → hidden + system notification | Play "delete account" URL works end‑to‑end; `mod_queue` populated by fixtures |
| 8 | **Live rooms + search** | `lib/data/realtime.ts`, `components/feed/LiveReactions.tsx` (real meter), `app/search.tsx` (`search_posts/people`), remote flag `realtime_rooms` | Realtime enabled for the project | manual: two devices in one room see each other's reactions; search returns hashtag + text hits | LiveReactions shows real counts; polling fallback verified by disabling Realtime |
| 9 | **Observability + backups** | `lib/analytics.ts` sink → PostHog; Sentry init in `app/_layout.tsx` and functions; `workers/media/src/backup.ts` (weekly export → R2 `hallyu-backups`) | PostHog + Sentry projects; R2 backup bucket | restore drill into a scratch project | dashboards show events/errors; a restore from the weekly export succeeds |
| 10 | **Hardening + load test** | k6 script `docs/backend/load/feed.js` (10K simulated MAU pattern: 80 % reads, 20 % writes); index tuning from `pg_stat_statements` | Supabase Free (then Pro when needed) | p95 `feed_for_you` < 300 ms at 50 rps on Nano/Micro; no RLS bypass in an authz test suite (`docs/backend/authz.test.mjs`: 40 negative cases) | release candidate; APK CI still green; `tsc --noEmit` clean |

Sequencing rules: steps 1–4 ship the "real backend" for text posts; 5 makes media real; 6–7 satisfy store policies; 8–10 are polish and safety. Each step is a separate PR onto this branch, with the web preview rebuilt so the owner sees results live.

Client files deliberately **not** touched: all screen layouts, design tokens, navigation, `selectors.ts` ranking (still used for local ordering and offline), spoiler logic, components' visual code.

## 29. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Free‑tier terms change (Supabase, Cloudflare, Resend, PostHog) | medium | cost/timing | monthly re‑check of `03` sources; alerts at 70 % of every quota; $25 Pro budget pre‑approved |
| Supabase Free project pauses during a quiet beta week | medium | outage | cron ping is not allowed to count as activity forever — instead keep at least weekly real usage, or move to Pro before public launch |
| Video bytes exceed the model (users upload longer/bigger clips) | high | R2 storage cost | on‑device compression is mandatory (no raw uploads accepted > 100 MB); per‑user quotas; measure avg bytes per video weekly |
| Android output has `moov` atom at the end → slower start | high | UX | acceptable at $0 (one extra range request); fix by Stream/ffmpeg at stage 5; test on low‑end devices |
| `react-native-compressor` SDK‑51 compatibility / CI build | medium | build break | pin the last version supporting RN 0.74; fallback: `expo-image-manipulator` for images + reject videos > 60 MB with a friendly message until upgrade |
| Realtime connection cap on finale nights | medium | degraded live room | polling fallback built in; rooms open only within the airing window; Pro raises to 500 |
| Abuse: spam accounts, reaction bots, report brigading | medium | trust | rate limits in SQL, new‑account quotas, Turnstile on sign‑up when triggered, auto‑hide requires mature accounts, moderator queue |
| Supabase MAU overage at 100K+ | low (later) | $325/mo at 200K | planned self‑host exit (§31 in `06`) |
| RLS mistake exposes data | low | severe | negative authz test suite (step 10) runs in CI on every migration; no direct table writes for content; `security definer` functions pin `search_path` |
| TMDB rate limits or outage | low | catalog gaps | client cache exists; server mirror serves referenced dramas; `ensure-catalog` retries with backoff |
| Single developer bus factor | high | delivery | everything is SQL + TypeScript in one repo; this package is the runbook; no bespoke servers to babysit |

## Completion definition for the whole backend

1. All 22 syncable actions and all `pull` scopes are served by Supabase; no code path reads `lib/seed.ts` unless `SHOW_DEMO`.
2. A new user can sign up on a fresh device, follow a drama, post text + 6 images + a 140 s clip, see it on another device, receive a push for a reply, report a post, block a user, and delete their account — with $0 infrastructure.
3. `docs/backend/validate-schema.mjs` and the authz suite are green in CI; `build-apk.yml` still produces an APK; `tsc --noEmit` passes.
4. The six quota meters are visible on one dashboard with alerts.
