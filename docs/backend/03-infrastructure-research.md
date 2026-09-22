# 03 — Infrastructure research and free‑tier comparison (sections 5–6)

All figures **checked 2026‑09‑21**. Source flags: **O** = read on the vendor's official docs/pricing page; **R** = vendor pricing as summarised by a dated third‑party roundup (re‑verify on the vendor page before relying on it for a purchase decision). Free tiers change quarterly — the roadmap re‑checks them at every stage gate.

## Vocabulary used everywhere in this package

| Term | Definition | How vendors bill it |
|---|---|---|
| **Registered users** | rows in `auth.users` | never billed directly by anyone in this comparison |
| **MAU** (monthly active) | distinct users who obtained/refreshed a session in a calendar month | Supabase, Appwrite, Clerk, Auth0, Cognito, Neon Auth bill/limit this |
| **DAU** | distinct users active on a day | drives request/egress volume (assume DAU ≈ 25–30 % of MAU for a social app) |
| **Concurrent** | sockets open at the same instant | Realtime / RTDB limits (Supabase 200 free, Appwrite 250, Firebase RTDB 100) |
| **Ops / invocations** | API calls (PostgREST requests, R2 Class A/B, Worker requests, Edge Function invocations) | request‑based quotas (Workers 100K/day, R2 10M/month, Edge Functions 500K/month) |

## 5.1 Backend‑as‑a‑Service platforms

| Platform | Free tier (limits that matter for Hallyu) | Paid entry | Fit for Hallyu | Source (checked 2026‑09‑21) |
|---|---|---|---|---|
| **Supabase** | $0, no card. DB 500 MB (read‑only when exceeded), Nano compute (shared CPU, ~0.5 GB RAM, 60 direct / 200 pooled connections), 1 GB file storage, **50 MB per upload**, 5 GB egress + 5 GB cached egress, **50,000 MAU**, 500K Edge Function invocations (256 MB, 2 s CPU, 150 s wall), Realtime 200 peak connections / 2M msgs, 2 active projects, **no backups**, 1‑day logs, **pauses after 7 days without activity**; built‑in auth mailer = 2 emails/hour to team members only → custom SMTP required for real users | **Pro $25/mo/org** incl. $10 compute credit (Micro 1 GB RAM 60/200 conns; Small $15; Medium $60; Large $110 2 vCPU/8 GB; XL $210), 8 GB DB ($0.125/GB over), 100 GB storage ($0.021/GB), 250 GB egress ($0.09/GB), **100K MAU ($0.00325/MAU over, third‑party‑auth MAU billed the same)**, 500 GB uploads (TUS), 2M functions, Realtime 500 peak / 5M msgs ($10 per 1,000 peak, $2.50/M msgs), daily backups 7 d; PITR +$100; Team $599 | **Best fit**: Postgres + RLS matches spoiler/veil/block rules; client already uses supabase‑js; open‑source exit path | O: supabase.com/pricing; supabase.com/docs/guides/functions/limits; supabase.com/docs/guides/storage/uploads/file-limits; supabase.com/docs/guides/auth/auth-smtp; supabase.com/docs/guides/database/connecting-to-postgres |
| **Firebase** | Spark $0, no card. **Auth email/social free and unlimited (Identity Platform tier: 50K MAU)**; Firestore 1 GiB, **50K reads / 20K writes / 20K deletes per day**, 10 GiB egress/mo; RTDB 1 GB stored / 10 GB egress / 100 concurrent; FCM, Analytics, Crashlytics free; **Cloud Storage for Firebase requires Blaze (card) since 2026‑02‑03** (then GCS always‑free 5 GB) | Blaze pay‑as‑you‑go: Firestore $0.03/100K reads, $0.09/100K writes, $0.18/GiB‑mo; **no hard spend cap** (budgets only alert) | Poor: feed of 20 posts + authors + counts = dozens of reads per screen → 50K reads/day ≈ 400–800 DAU; no SQL joins for spoiler/context queries; storage needs a card | R: firebase.google.com/pricing via 2026 roundups (storage‑Blaze change confirmed in Firebase release notes) |
| **Appwrite Cloud** | Free: 75K MAU, 2 GB storage, **5 GB bandwidth**, 750K executions, **1 database / 1 bucket / 2 functions per project**, 2 projects, Realtime 250 conns / 2M msgs (enforced from 2026‑04‑30), pauses after 1 week, Appwrite branding | Pro $15–25/mo: 150 GB storage, 300 GB–2 TB bandwidth, 200K MAU, 3.5M executions, 7‑day backups; overages storage $0.03/GB, bandwidth $0.04/GB, MAU $0.0025 | Viable but weaker: MariaDB‑backed permissions (document‑level, no row policies with SQL predicates), 1 bucket, tight bandwidth; self‑host is MIT | R: appwrite.io/pricing via 2026 roundups |
| **AWS Amplify (Cognito + AppSync/DynamoDB + S3)** | Accounts created after **2025‑07‑15**: no 12‑month free tier; **$100 credit + up to $100 more for 6 months**, then Always‑Free items only (Lambda 1M req, DynamoDB 25 GB, SNS, **CloudFront 1 TB egress**); Cognito 10K MAU free | Cognito Essentials $0.015/MAU after 10K; S3 $0.023/GB + egress $0.09/GB; AppSync per‑request | Poor for $0: credits expire; S3 egress is the exact cost we must avoid for video; highest operational complexity | R: aws.amazon.com/free + aws.amazon.com/cognito/pricing via 2026 roundups |
| **PocketBase** (self‑host, SQLite) | free software; needs a VPS (Oracle Always‑Free ARM is the only $0 host; instances are reclaimed when idle and capacity is unstable) | VPS $5–20/mo | Excellent for hobby scale; single‑node SQLite + local files = no CDN, manual backups, no horizontal path to 200K MAU | R: pocketbase.io docs; oracle.com/cloud/free via 2026 roundups |
| **Hatchable / Back4App / others** | small caps, badges, non‑standard stacks | — | not considered further | R |

## 5.2 Authentication

| Provider | Free | Paid | Fit | Source |
|---|---|---|---|---|
| **Supabase Auth (GoTrue)** | 50K MAU; email/pw, magic link, OAuth (Google, Apple…), PKCE for native; RLS integration via JWT; **must bring SMTP** | 100K MAU in Pro, then $0.00325/MAU | already integrated; roles via `app_metadata` | O |
| Firebase Auth | unlimited email/social (50K MAU on Identity Platform SKU, then $0.0055/MAU) | — | free at any scale but Supabase bills third‑party MAU anyway; only useful if the DB moves off Supabase | R |
| Clerk | 10K MAU (2026 roundups report 50K "MRU" on Hobby) | Pro $25/mo + $0.02/MAU | polished UI, but 200K MAU ≈ $3,800/mo | R: clerk.com/pricing |
| Auth0 | 25K MAU free | Essentials $35/mo for 500 MAU… ≈ $350/mo at 5K | not viable at scale on our budget | R: auth0.com/pricing |
| Cognito | 10K MAU (Lite/Essentials) | Essentials $0.015/MAU → 200K MAU ≈ $2,850/mo | no | R |

## 5.3 Databases

| Option | Free | Paid | Verdict | Source |
|---|---|---|---|---|
| **Supabase Postgres** | 500 MB, Nano | Pro 8 GB + compute add‑ons | chosen (bundled with auth/RLS/realtime/cron/queues) | O |
| Neon Postgres | 0.5 GB/project (5 GB aggregate over 10 projects — **not** one 5 GB DB), 100 CU‑hours/project/month (0.25 CU ≈ 400 h — cannot stay on 24×7), autoscale ≤2 CU, **scale‑to‑zero after 5 min (not disableable)**, 6 h PITR, 5 GB egress, Neon Auth 60K MAU | Launch: $0.106/CU‑hour + $0.35/GB‑month, no minimum (always‑on 1 CU + 10 GB ≈ $81/mo) | best pure‑Postgres alternative; cold starts + no RLS‑aware API layer → would need our own API | R: neon.com/pricing via 2026 roundups |
| Firestore | 1 GiB, 50K reads/day | $0.03/100K reads | wrong shape for feeds (see above) | R |
| PlanetScale / CockroachDB / Turso | free tiers removed or serverless‑only in 2025–26 | — | not considered | R |

## 5.4 Object storage (images, video)

| Option | Free | Paid | Egress | Verdict | Source |
|---|---|---|---|---|---|
| **Cloudflare R2** | 10 GB‑month, 1M Class A (writes/list), 10M Class B (reads) per month; **card required to enable R2 but $0 within limits** | $0.015/GB‑mo, $4.50/M A, $0.36/M B; Infrequent Access $0.01/GB + $0.01/GB retrieval | **$0 always**; serving video via Cloudflare CDN is explicitly allowed when hosted on R2 (ToS update May 2023) | **chosen** for all media | O: developers.cloudflare.com/r2/pricing; blog.cloudflare.com/updated-tos |
| Supabase Storage | 1 GB, 50 MB/file, 5 GB egress (+5 GB cached) | Pro 100 GB ($0.021/GB), 250 GB egress ($0.09/GB) | billed | egress price kills video; keep for nothing (or avatars only) | O |
| Backblaze B2 | 10 GB; egress free up to 3× stored/month and free to Cloudflare (Bandwidth Alliance) | $6–6.95/TB‑month; API fees eliminated (2026‑05) | $0.01/GB beyond 3× | cheapest cold storage; good **backup target** and R2 alternative | R: backblaze.com/cloud-storage/pricing |
| AWS S3 | 5 GB only inside the 6‑month credit window for new accounts | $0.023/GB | **$0.09/GB** (CloudFront 1 TB/month always‑free can front it) | egress cost model is the exact risk for video | R |
| Firebase Storage / GCS | Firebase needs Blaze; GCS always‑free 5 GB + 100 GB egress NA‑only, billing account (card) required | $0.02/GB, egress $0.12/GB | billed | no | R: cloud.google.com/free |

## 5.5 Video platforms (transcoding + adaptive delivery)

| Option | Free | Paid | Notes | Source |
|---|---|---|---|---|
| **Client compression + R2 progressive MP4** (our baseline) | R2 free tier | R2 storage only | no ABR, no transcoding; fine for ≤140 s clips at 720p | this package §05 |
| Cloudflare Stream | **none** (min $5/mo prepaid) | **$5 per 1,000 minutes stored** (renditions may count), **$1 per 1,000 minutes delivered**; encoding/ingest free; H.264 ≤1080p; TUS direct creator uploads; signed URLs | best upgrade path (same account as R2/Workers) | O: developers.cloudflare.com/stream/pricing |
| Bunny Stream | $1/mo minimum, 14‑day trial | storage $0.005–0.01/GB‑mo; CDN $0.01/GB EU/US, $0.03 Asia, $0.045 S.America, **$0.06 MEA**; encoding free (premium paid); TUS, signed URLs | cheapest paid ABR; Africa egress is 6× EU | R: bunny.net/pricing/stream |
| Mux | encoding free; **100K delivered minutes/month free** (2026 roundups); storage ~$0.003/min; delivery $0.0008/min | pay‑as‑you‑go | strongest player analytics; verify free minutes on mux.com before relying | R |
| Self‑hosted ffmpeg worker | needs compute: Koyeb free instance (0.1 vCPU, 512 MB, sleeps after 1 h, **no worker services**), Render free (spins down, workers paid), Fly.io (no free tier since 2024), Oracle Always‑Free ARM (reclaimable) | $5–10/mo VPS | deferred; the client does the compression instead | R: snapdeploy/hatchable/srvrlss 2026 roundups |

## 5.6 CDN / edge compute / queues / cache

| Option | Free | Paid | Verdict | Source |
|---|---|---|---|---|
| **Cloudflare CDN + Workers** | Workers 100K requests/day (resets 00:00 UTC; 1027 error when exceeded), 10 ms CPU, 128 MB, 50 subrequests, 5 cron triggers, 100 MB request body; KV 100K reads / 1K writes per day; SQLite Durable Objects on Free; Workers AI ~10K neurons/day | Workers Paid $5/mo (10M req, +$0.30/M, 30 s CPU, Queues) | chosen for upload presign/validation/serving; **reads of media do not need to pass through the Worker if the bucket has a custom domain** (they can, for cache/range control) | O: developers.cloudflare.com/workers/platform/limits |
| Bunny CDN | no free | ~$0.01/GB | fallback if Cloudflare ToS ever changes | R |
| CloudFront | 1 TB/month always‑free | $0.085/GB | only with S3/other origins | R |
| Upstash Redis | 256 MB, 500K commands/mo, 10 GB bandwidth | $0.20/100K commands | not needed at first (Postgres + client cache); rate‑limit buckets can live in Postgres or Durable Objects | R: upstash.com/pricing |
| Cloudflare Queues | needs Workers Paid | $5/mo | not needed: **pgmq (Supabase Queues) is free** | O |
| **Supabase pg_cron + pg_net + pgmq** | included on Free | — | chosen for schedulers, fan‑out, push outbox, purge jobs | O: supabase.com/docs (cron, queues) |

## 5.7 Push, email, observability, search, moderation, CI

| Need | Choice | Free | Paid | Source |
|---|---|---|---|---|
| Push | **Expo Push service** (APNs/FCM) | free, unlimited, 600 notifications/s per project | — | O: docs.expo.dev/push-notifications/faq |
| Transactional email | **Resend** (SMTP for Supabase Auth) | 3,000/mo, 100/day, 1 domain | $20/mo (50K) | R: resend.com/pricing |
| Email alt. | Brevo 300/day; Mailjet 6,000/mo (200/day); SES no new‑account free tier; SendGrid free retired 2025 | | | R |
| Product analytics | **PostHog Cloud** | 1M events, 5K replays, 100K exceptions/mo, no card | usage‑based | R: posthog.com/pricing |
| Errors | **Sentry** Developer | 5K errors/mo, 1 user | $26/mo | R: sentry.io/pricing |
| Search | **Postgres FTS** | inside DB | — | O |
| Search alt. | Algolia 10K records / 10K searches per mo; Meilisearch Cloud from ~$30/mo (self‑host free); Typesense Cloud ~$25–29/mo | | | R |
| Text+image moderation | **OpenAI omni‑moderation‑latest** | free for API users (rate limits apply) | — | R: edenai roundups 2026‑07 |
| Image/video moderation alt. | Sightengine 2,000 ops/mo; PicPurify 2,000; Azure Content Safety 5,000 images/mo; Google Vision SafeSearch 1,000/mo; Perspective (text) free but sunsetting after 2026 | $1–3 per 1K | | R |
| CI | **GitHub Actions** | 2,000 min/mo private, unlimited public repos | — | O: docs.github.com/billing |
| Backups (while on Supabase Free) | logical export → R2 `hallyu-backups` (Worker cron via PostgREST for small DBs; `supabase db dump` from a dev machine before every migration) | free | Pro includes daily backups | O |
| Compute for occasional jobs | Supabase Edge Functions (500K invocations), Cloudflare Workers cron (5 triggers) | free | | O |

## 6. Free‑tier comparison for the whole stack (registered vs MAU vs DAU vs concurrent)

| Provider / plan | What is limited | Limit | Meaning for Hallyu (using the traffic model in `04`) | Date checked | Source |
|---|---|---|---|---|---|
| Supabase Free | MAU | 50,000 | not the binding limit (DB size and egress bind far earlier) | 2026‑09‑21 | O |
| Supabase Free | DB size | 500 MB → read‑only | binding: ≈20 KB/MAU/month growth ⇒ **2.5K MAU fills it in ~10 months, 10K MAU in ~2.5 months** | 2026‑09‑21 | O |
| Supabase Free | API egress | 5 GB/mo (+5 GB cached) | ≈1.2 MB/MAU/month ⇒ **≈4K MAU** | 2026‑09‑21 | O |
| Supabase Free | Realtime | 200 peak concurrent, 2M msgs/mo | live rooms only: peak 0.5 % of MAU ⇒ ≈40K MAU before cap (but a hit finale can spike; degrade to polling) | 2026‑09‑21 | O |
| Supabase Free | Edge Functions | 500K invocations/mo | ≈ moderation (0.75/MAU) + push dispatch (cron 43K/mo) + catalog ⇒ **>200K MAU** OK | 2026‑09‑21 | O |
| Supabase Free | Compute | Nano, 60/200 connections | DAU‑driven concurrency ≈ 1 % of DAU active ⇒ ~2–3K MAU comfortable; beyond that latency climbs | 2026‑09‑21 | O |
| Supabase Free | Inactivity | pause after 7 days | irrelevant once real users exist; keep a cron ping during private beta | 2026‑09‑21 | O |
| Supabase Auth Free | outbound email | 2/h team‑only | **must configure Resend SMTP before the first external tester** | 2026‑09‑21 | O |
| Cloudflare R2 Free | storage | 10 GB‑month | ≈1.5 MB/MAU/month cumulative ⇒ 1K MAU ≈ 7 months, 2.5K MAU ≈ 3 months, then $0.015/GB (≈$0.5–5/mo for a year) | 2026‑09‑21 | O |
| Cloudflare R2 Free | Class B (reads) | 10M/mo | ≈550 media requests/MAU/month ⇒ **≈18K MAU**, then $0.36/M | 2026‑09‑21 | O |
| Cloudflare R2 Free | Class A (writes) | 1M/mo | ≈3 uploads(parts)/MAU/month ⇒ >200K MAU OK | 2026‑09‑21 | O |
| Cloudflare R2 | egress | $0 | video/image delivery never costs bandwidth — the reason R2 is chosen | 2026‑09‑21 | O |
| Cloudflare Workers Free | requests | 100K/day | presign+complete ≈ 1.2/MAU/month ⇒ irrelevant; **if media GETs go through the Worker**, 550/MAU/month ⇒ ≈5.4K MAU/day‑cap ⇒ use R2 custom domain for GETs (bypasses Worker) or pay $5 | 2026‑09‑21 | O |
| Expo Push | rate | 600/s | `episode_aired` fan‑out to 100K followers ≈ 3 min at full rate | 2026‑09‑21 | O |
| Resend Free | emails | 100/day, 3,000/mo | sign‑up verification + resets ⇒ ≈ **60–80 sign‑ups/day**; upgrade at ~2K sign‑ups/month | 2026‑09‑21 | R |
| PostHog Free | events | 1M/mo | ≈25 events/MAU/month ⇒ ≈40K MAU | 2026‑09‑21 | R |
| Sentry Developer | errors | 5K/mo | fine to ~50K MAU with sampling | 2026‑09‑21 | R |
| Firebase Spark | Firestore reads | 50K/day | ≈60 reads/DAU ⇒ ≈800 DAU (≈3K MAU) — the *whole* free tier is smaller than Supabase's | 2026‑09‑21 | R |
| Appwrite Free | bandwidth | 5 GB/mo | JSON + media through Appwrite ⇒ ≈1K MAU | 2026‑09‑21 | R |
| Neon Free | compute | 100 CU‑hours/project/mo | cannot keep one 0.25 CU endpoint on 24×7 (needs 180 CU‑h) ⇒ scale‑to‑zero cold starts in production | 2026‑09‑21 | R |
| AWS (new accounts) | credits | ≤$200, 6 months | not a free tier; excluded from the $0 plan | 2026‑09‑21 | R |

**Conclusion of the research.** Only two combinations can host Hallyu at $0 with legitimate single accounts and no card‑gated services on the critical path: (1) **Supabase Free + Cloudflare R2/Workers Free** (card on file for Cloudflare, $0 charged), or (2) **Appwrite Free + R2** (weaker permissions, 5 GB bandwidth). Firebase fails on Storage (card + Blaze), Firestore read economics and spend caps; AWS fails on expiring credits and egress; self‑hosting on Oracle Always‑Free is not a production‑grade $0 option. Option (1) is selected; the next file quantifies exactly where $0 ends.
