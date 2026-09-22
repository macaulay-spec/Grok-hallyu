# Hallyu backend — architecture package

Date of research and audit: **2026‑09‑21**. All limits/prices below were checked on that date against the sources cited in `03-infrastructure-research.md`. Free tiers change without notice; re‑verify before each stage upgrade.

| # | File | Sections of the brief it covers |
|---|------|------------------------------------|
| 0 | `README.md` (this file) | 1 Executive summary · 9 Recommended architecture · 10 Diagram · 32 Final recommendation |
| 1 | `01-codebase-audit.md` | 2 Codebase audit · 3 Existing features |
| 2 | `02-feature-backend-map.md` | 4 Backend requirements (feature → DB → API → auth → storage → realtime → notifications → scale) |
| 3 | `03-infrastructure-research.md` | 5 Infrastructure research · 6 Free‑tier comparison (with sources + dates) |
| 4 | `04-feasibility-and-cost-model.md` | 7 200K feasibility · 22 Cost model · 23 Zero‑dollar MVP · 24 1K→200K scaling plan |
| 5 | `05-video-and-media.md` | 8 Video storage comparison · 13 Storage architecture · 14 Video architecture |
| 6 | `06-architecture.md` | 9/10 Architecture options + recommendation · 11 Auth · 16 Realtime · 17 Search · 18 Notifications · 19 Moderation · 20 Security · 21 Backups · 30 Lock‑in · 31 Migration |
| 7 | `07-database.md` + `supabase/migrations/*.sql` | 12 Database architecture · 25 Schema (DDL, indexes, RLS policies, triggers) |
| 8 | `08-api-spec.md` | 15 API architecture · 26 API specification |
| 9 | `09-implementation-roadmap.md` | 27 Repository structure · 28 Implementation roadmap · 29 Risks |
| — | `../../supabase/migrations/*.sql` | the real migrations: legacy demo cleanup, core DDL + RLS + RPCs + triggers + cron/queues, Storage bucket, service RPCs (validated in embedded Postgres 17 by `validate-schema.mjs`) |
| — | `validate-schema.mjs` | loads `supabase/migrations/*.sql` into PGlite with Supabase stubs and runs a functional smoke test of the API (needs `@electric-sql/pglite`) |
| — | `cost-model.js` | the traffic/cost model behind every number in `04` (`node docs/backend/cost-model.js`) |

---

## 1. Executive summary

**What exists.** Hallyu is a finished React Native / Expo SDK 51 client (expo‑router, zustand store, offline‑first outbox). Every write in the app already flows through one seam — `lib/data/backend.ts` (`Backend.push(mutation)` / `pull(scope)`) — and today that seam is a simulated local backend. Auth is already wired to Supabase Auth (`lib/auth.tsx`, `lib/supabase.ts`: email/password, Google OAuth via PKCE, reset, verify, delete‑account edge function call). The catalog (dramas, actors, episodes, posters) is **not** user data: it comes live from TMDB with a public read‑only key and is cached client‑side. There is **no** server code, **no** database, **no** media upload path, **no** real notifications fan‑out, **no** moderation backend.

**What the app actually needs (nothing more).** Accounts + profiles; follows (users, dramas, actors, collections); watchlist with per‑episode progress + private note; posts of six types (post, reaction, discussion, review, recommendation, short) with ≤6 images or one ≤140 s video; one‑level comments; six‑kind reactions on posts and comments; saves; collections; grouped notifications + push for episode air times and social events; live episode rooms (reaction meter); search (posts, people; dramas/actors via TMDB); report / block / mute; account deletion; settings sync. **Not** needed (not in the UI): direct messaging, community membership tables, creator monetisation, an ads pipeline.

**Recommendation (evidence in §6/§7 of this package):**

> **Supabase (Auth + Postgres/RLS + Realtime + pg_cron/pgmq + Edge Functions) for identity and all relational data — Cloudflare R2 for every byte of user media — one Cloudflare Worker for signed uploads, media validation and cache‑controlled delivery — Expo Push for notifications — Postgres full‑text search — OpenAI omni‑moderation + a human queue for moderation — PostHog (free tier) for analytics.**

Why not the alternatives, in one line each: **Firebase** now requires a billing account for *any* Cloud Storage bucket (since Feb 3 2026), its document model fights the feed/spoiler logic, and it has no hard spend cap. **Appwrite Cloud** free tier is capped at 5 GB bandwidth / 2 GB storage / 1 bucket / 2 projects and pauses too; MariaDB‑backed permissions are weaker than RLS for our veil rules. **AWS** removed the 12‑month free tier for new accounts (July 15 2025) — you get ≤$200 of expiring credit. **Postgres + custom API** (Neon + Workers) has the least lock‑in but means writing auth, storage policies and an API layer from scratch for a solo team, and Neon's free compute (100 CU‑hours/project/month) cannot keep a social app's database always‑on. Supabase is chosen because it is the *cheapest correct* option for this codebase, not because it was mentioned before; the lock‑in analysis (§30) shows the exit paths (self‑host, GoTrue is open source, R2 is S3‑compatible).

**The honest $0 answer.** Under the explicit traffic model in `04-feasibility-and-cost-model.md`:

* **$0 is realistic up to roughly 2–3K monthly active users (≈10–15K registered) for a few months.** The first walls are Supabase's **500 MB database (read‑only above it)** and **5 GB/month API egress**, then R2's **10 GB** free storage (video accumulates ~1.5 MB per MAU per month).
* **The first unavoidable payment is Supabase Pro at $25/month** (8 GB DB, 250 GB egress, 100 GB storage, daily backups, no pausing). Under our model it becomes necessary at about **5–10K MAU**, i.e. roughly **25–40K registered users**. R2 adds cents to a few dollars.
* **200,000 registered users (≈50K MAU) costs about $125–175/month.** **200,000 MAU costs about $670–870/month on managed Supabase** (dominated by the per‑MAU charge above 100K at $0.00325/MAU, XL compute and analytics volume) **or ≈$250/month on the documented self‑hosted exit path**. Neither is $0 and no legitimate free stack gets there; the transition path is laid out stage by stage.
* Video is the item most likely to break every free tier; the design keeps it at $0 by **compressing on the phone, storing progressive MP4 in R2 (zero egress), generating thumbnails on device, and deferring transcoding/HLS to a paid tier (Cloudflare Stream) only when watch time justifies it.**

**Sequence.** Phase 1 (this package) is design only. Implementation starts with `09-implementation-roadmap.md` step 1 (Supabase project + migrations) and ends with a load test at 10K simulated MAU. Nothing in the existing UI is redesigned; the client changes are confined to `lib/data/*`, `lib/auth.tsx`, `lib/notifications*`, the composer's upload step, and configuration.

---

## 9. Recommended architecture (one responsibility per box)

| Layer | Service | Single responsibility | Free ceiling that matters | First paid step |
|---|---|---|---|---|
| Client | Expo app (existing) | UI, optimistic store, offline outbox, on‑device image resize + video compression + thumbnail | — | — |
| Identity | **Supabase Auth (GoTrue)** | email/password, Google, Apple (iOS), sessions/refresh, password reset, email verification, roles via `app_metadata` | 50,000 MAU; built‑in SMTP 2 mails/h team‑only → **custom SMTP mandatory** | Pro: 100K MAU incl., then $0.00325/MAU |
| Data | **Supabase Postgres** | all relational data, RLS, counters via triggers, FTS, cron, queues (pgmq), rate‑limit buckets | 500 MB, Nano compute (~0.5 GB RAM, 60 direct / 200 pooled conns), no backups, pauses after 7 idle days | Pro $25 (+$10 compute credit) |
| API | **PostgREST + RPC (SQL functions)** for reads/writes; **Edge Functions** for privileged flows (`delete-account`, `ensure-catalog`, `moderate`, `push-dispatch`) | request handling without a custom server | Edge Functions 500K invocations/mo, 256 MB, 2 s CPU, 150 s wall | Pro: 2M/mo |
| Media store | **Cloudflare R2** (bucket `hallyu-media`) | images, video MP4, thumbnails, avatars; S3‑compatible; **zero egress** | 10 GB storage, 1M Class A, 10M Class B ops/mo | $0.015/GB‑mo, $4.50/M A, $0.36/M B |
| Media edge | **Cloudflare Worker** `media` (+ custom domain `media.hallyu.app`) | presigned upload URLs, upload completion validation (magic bytes, size, duration), cache headers + range serving, purge on delete | 100K req/day, 10 ms CPU | Workers Paid $5/mo |
| Delivery | **Cloudflare CDN** (in front of R2 via the Worker/custom domain) | caching + TLS + DDoS for media; allowed because the video is hosted on R2 (Cloudflare ToS §2.7/2.8 change) | unlimited bandwidth on Free for R2‑hosted content | — |
| Realtime | **Supabase Realtime (Broadcast + Presence)** only inside open live episode rooms | live reaction meter, "N in the room" | 200 peak connections, 2M messages/mo | Pro 500 peak, then $10/1,000 |
| Push | **Expo Push service** (APNs/FCM underneath) | delivery of notifications built by Postgres triggers, dispatched by pg_cron → Edge Function | free, 600 notifications/s | — |
| Email | **Resend** (custom SMTP for Supabase Auth) | verification, reset, deletion confirmations | 3,000/mo, 100/day | $20/mo |
| Search | **Postgres FTS + pg_trgm** (posts, people) + TMDB search (dramas/actors, already in client) | search | inside DB limits | Meilisearch self‑hosted when >~5M posts |
| Moderation | **OpenAI omni‑moderation** (text+image, free) + `reports`/`moderation_actions` tables + moderator role | automated screen + human queue | free endpoint, standard rate limits | Sightengine/Hive if video frames needed |
| Analytics | **PostHog Cloud** | product events already emitted by `lib/analytics.ts` | 1M events/mo | usage‑based |
| Errors | **Sentry** (developer plan) | crash + error tracking | 5K errors/mo | $26/mo |
| CI | **GitHub Actions** (existing workflow) | typecheck, APK build, `supabase db push` on merge | 2,000 min/mo private (unlimited public) | — |

## 10. Architecture diagram

```
                     ┌────────────────────────────────────────────────────────────┐
                     │  HALLYU CLIENT (Expo, existing)                             │
                     │  zustand store ─ optimistic reducer ─ persisted outbox      │
                     │  lib/data/backend.ts  ⇐ SupabaseBackend (new adapter)       │
                     │  on‑device: image resize · video compress · thumbnail       │
                     └───────┬──────────────────────┬───────────────────┬─────────┘
                             │ supabase-js (HTTPS)  │ HTTPS             │ HTTPS (read‑only, public key)
                             ▼                      ▼                   ▼
   ┌─────────────────────────────────────┐  ┌──────────────────┐  ┌────────────────┐
   │ SUPABASE PROJECT                    │  │ CLOUDFLARE       │  │ TMDB API       │
   │  Auth (GoTrue) ── JWT (roles in     │  │  Worker `media`  │  │ posters/cast   │
   │        app_metadata)                │  │   • presign PUT  │  │ episodes       │
   │  PostgREST + RPC ── RLS on every    │  │   • complete →   │  │ (client cache) │
   │        table                        │◄─┤     validate,    │  └────────────────┘
   │  Postgres: profiles, follows,       │  │     notify DB    │
   │   watchlist, posts, post_media,     │  │   • GET /m/*  →  │
   │   comments, reactions, saves,       │  │     R2 + cache   │
   │   collections, notifications,       │  │     + range      │
   │   reports, moderation, push tokens, │  │  R2 bucket       │
   │   catalog mirror, FTS, pgmq queues, │  │   hallyu-media   │
   │   rate_limits, pg_cron jobs         │  │  CDN (custom     │
   │  Realtime: Broadcast/Presence for   │  │   domain, zero   │
   │   live episode rooms only           │  │   egress)        │
   │  Edge Functions: delete-account,    │  └──────────────────┘
   │   ensure-catalog (server TMDB key), │
   │   moderate (OpenAI), push-dispatch  │────► Expo Push API ──► APNs / FCM ──► phones
   │   (drains pgmq → Expo)              │
   │  Custom SMTP → Resend               │────► verification / reset emails
   └─────────────────────────────────────┘
        │ pg_dump (weekly, until Pro)          PostHog (events)   Sentry (errors)
        ▼
      R2 `hallyu-backups`
```

Data ownership rule: **Postgres holds metadata and references only** (`post_media.key`), never binary content. Secrets (service‑role key, R2 access keys, OpenAI key, TMDB server key, Expo access token) live only in Supabase Edge Function secrets and Worker secrets. The client ships only the Supabase publishable key and the TMDB read key it already ships.

## 32. Final recommendation

1. Build the backend exactly as specified in `06-architecture.md`, `07-database.md`/`supabase/migrations/*.sql`, `08-api-spec.md`, in the order given in `09-implementation-roadmap.md`. Start on Supabase Free + R2 Free + Workers Free + Resend Free + Expo Push. Total: **$0** and no credit card except Cloudflare (card required to enable R2 even on free usage) — see research.
2. Instrument the six meters that decide when $0 ends (DB size, API egress, R2 storage, R2 Class B ops, Realtime peak connections, MAU) and alert at 70 %.
3. Budget for **$25/month at ~5–10K MAU** (Supabase Pro). That is the single planned payment before 50K MAU. Everything else stays under $20/month until ~50K MAU.
4. Treat video as the cost lever: keep client compression + progressive MP4 on R2 until watch‑time cost analysis (`05-video-and-media.md` §8) shows Cloudflare Stream is cheaper or ABR/HLS is a product requirement.
5. Re‑evaluate at 100K MAU: either accept ~$250–870/month on managed Supabase or move to the self‑hosted exit path (documented in §31) on two VPSs — the schema, RLS, storage layout and client adapter do not change.
