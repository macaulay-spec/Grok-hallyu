# 04 — Feasibility at 200K users, cost model, zero‑dollar MVP, scaling plan (sections 7, 22, 23, 24)

## 7.0 Traffic model (every number below derives from these assumptions)

Assumptions are per **MAU per month**, calibrated for a mobile‑first fandom/social app where most users read and a minority posts. Change a number here and every table changes; the model is reproducible with the script in §7.6.

| Dimension | Assumption | Rationale |
|---|---|---|
| Registered → MAU | **MAU = 25 % of registered** (for the "registered" scenarios) | typical 1‑year retention for consumer social; MAU scenarios are modelled independently |
| Sessions | 12 / MAU / month, 25 API calls per session, 4 KB average JSON response | feeds return 20 posts per page with author/drama/viewer‑state embedded |
| Writes | posts 0.4 · comments 1.2 · reactions 8 · saves 1 · follows 1.5 · watchlist updates 6 · searches 8 · reports 0.02 | 90/9/1 participation |
| Notifications | 12 created, 8 pushed | quiet hours + prefs suppress a third |
| Images | 0.35 uploads × (300 KB full + 60 KB thumb) — resized on device to ≤1600 px / ≤640 px | no server‑side image processing at $0 |
| Video | 0.06 uploads × 22 MB (≈45 s at 720p, ~3.5 Mbps after on‑device compression) + 60 KB poster | 6 % of MAU post one clip a month |
| Media views | 250 thumbnail views, 20 full‑image opens, 30 video plays × 8 MB delivered (partial watches) ≈ **0.26 GB delivered / MAU / month** | R2 egress is free; only request counts cost |
| Request counts | ≈550 R2 Class B / MAU / month (≈10 range requests per play), ≈0.9 Class A | |
| DB growth | 20 KB / MAU / month (rows + indexes) + 50 MB base | posts ~1 KB, reactions ~120 B, notifications ~200 B, all with indexes ×2, 90‑day notification retention |
| Realtime | peak concurrent in live rooms = 0.5 % of MAU; 24 messages / MAU / month | rooms open only on a live episode page |
| Email | 1.2 emails per sign‑up; sign‑ups = 8 % of registered per month (registered scenarios) or 10 % of MAU (MAU scenarios) | verification + occasional reset |
| Analytics | 25 events / MAU / month | |
| Catalog | TMDB posters/backdrops served by TMDB's CDN — **zero Hallyu bandwidth** | permitted with attribution |

## 7.1 Free‑tier walls at fixed MAU (month 6 / month 12 of steady state)

| MAU | Supabase API egress (5 GB free) | DB size @6 mo / @12 mo (500 MB free) | R2 storage @6 mo / @12 mo (10 GB free) | R2 Class B (10M free) | Realtime peak (200 free) | Verdict |
|---|---|---|---|---|---|---|
| 500 | 0.6 GB | 109 / 167 MB | 4.2 / 8.5 GB | 0.28M | 3 | **$0 for a year** |
| 1,000 | 1.1 GB | 167 / 284 MB | 8.5 / 17 GB | 0.57M | 5 | $0 for ~7 months, then R2 ≈ $0.10/mo |
| 1,500 | 1.7 GB | 226 / 402 MB | 12.7 / 25 GB | 0.85M | 8 | R2 pennies from month 5; DB fine for ~13 months |
| 2,000 | 2.3 GB | 284 / 519 MB | 17 / 34 GB | 1.1M | 10 | **DB wall at ~11 months**; R2 ≈ $0.35/mo |
| 2,500 | 2.9 GB | 343 / 636 MB | 21 / 42 GB | 1.4M | 13 | DB wall at ~8 months |
| 3,000 | 3.4 GB | 402 / 753 MB | 25 / 51 GB | 1.7M | 15 | DB wall at ~7 months |
| 4,000 | 4.6 GB | 519 / 988 MB | 34 / 68 GB | 2.3M | 20 | egress at the edge; DB wall at ~5 months |
| 5,000 | **5.7 GB** | 636 / 1,222 MB | 42 / 85 GB | 2.9M | 25 | **egress over → Pro required immediately** |

**Where $0 stops (explicit):**

1. **Strict $0 (no charge of any kind)** ends when R2 exceeds 10 GB — at 1K MAU after ~7 months, at 2.5K MAU after ~3 months. The overage is cents ($0.015/GB) but it is a real charge on the Cloudflare card.
2. **Supabase Free ends** at whichever comes first: DB 500 MB (≈ 2–2.5K MAU sustained for 8–11 months, or ≈ 10K MAU within 2–3 months), API egress 5 GB (≈ 4–4.5K MAU), or Nano compute latency (noticeable from ~3K MAU at evening peaks). Conclusion used throughout: **$0 is realistic to ≈2–3K MAU (≈10–15K registered); Supabase Pro ($25) is unavoidable by ≈5–10K MAU (≈25–40K registered).**
3. Nothing else in the stack (Workers, Expo Push, Edge Functions, pg_cron/pgmq, PostHog, Sentry, OpenAI moderation, GitHub Actions) is hit before Supabase Pro.

## 7.2 Registered‑user scenarios (MAU = 25 %), steady state at month 12

| Scale | Registered | MAU | DB growth / size @12 mo | Media growth / total @12 mo | of which video | Delivered / mo | R2 Class B | Realtime peak | Pushes / mo | Emails / mo | Monthly cost @12 mo | Free‑tier feasibility |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1,000 | 250 | +5 MB → 0.11 GB | +0.35 GB → 4 GB | 3.9 GB | 64 GB | 0.1M | 1 | 2K | ~100 | **$0** | fully free for >2 years |
| 2 | 10,000 | 2,500 | +49 MB → 0.62 GB | +3.5 GB → 42 GB | 40 GB | 0.64 TB | 1.4M | 13 | 20K | ~1,000 | **$25** (Pro from month ~8) + R2 $0.50 | free ≈ 3 months strictly, ≈ 8 months except R2 pennies |
| 3 | 50,000 | 12,500 | +244 MB → 2.9 GB | +17.7 GB → 212 GB | 200 GB | 3.2 TB | 7.1M | 63 | 100K | ~4,800 | **≈ $53** (Pro $25 + Small compute $5 net + R2 $3 + Resend $20) | Supabase Pro needed within 2 months |
| 4 | 100,000 | 25,000 | +488 MB → 5.8 GB | +35 GB → 424 GB | 400 GB | 6.4 TB | 14.3M | 125 | 200K | ~9,600 | **≈ $58–100** (as above + R2 $8; Medium compute optional +$45) | not free |
| 5 | 200,000 | 50,000 | +977 MB → 11.5 GB (8 GB incl.) | +71 GB → 848 GB | 800 GB | 12.7 TB | 28.5M | 250 | 400K | ~19,200 | **≈ $127–175** (Pro $25 + Medium $50 net + DB overage ~$0.5 + R2 $19 + Resend $20 + PostHog ~$13; Large compute +$50 if p95 > 300 ms) | not free; still cheaper than one VPS pair with backups |

Delivered volume (12.7 TB/month at 200K registered) would cost **≈ $1,140/month on S3+CloudFront or Supabase Storage egress at $0.09/GB** — that single line is why media lives on R2.

## 7.3 MAU scenarios (independent of registrations), steady state at month 12

| MAU | API calls / mo | Supabase egress | DB growth / size @12 mo | Media growth / total @12 mo | Video total | R2 Class B | Realtime peak | Pushes | Edge Fn invocations | Analytics events | Monthly cost @12 mo | Line items |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 10,000 | 3.0M | 11 GB | +0.19 GB → 2.3 GB | +14 GB → 170 GB | 160 GB | 6M | 50 | 80K | 52K | 0.3M | **≈ $32** | Pro $25 + Small compute $5 net + R2 $2; everything else free |
| 50,000 | 15M | 57 GB | +0.95 GB → 11.5 GB | +71 GB → 848 GB | 800 GB | 29M | 250 | 400K | 86K | 1.3M | **≈ $127** | Pro $25 + Medium $50 + DB overage $0.4 + R2 $19 + Resend $20 + PostHog ~$13 |
| 100,000 | 30M | 114 GB | +1.9 GB → 23 GB | +141 GB → 1.7 TB | 1.6 TB | 57M | 500 (Pro cap) | 800K | 129K | 2.5M | **≈ $190–265** | Pro $25 + Large $100 + DB overage $2 + R2 $42 + Resend $20 + PostHog $0–75 (sample events to stay ≤1M) |
| 200,000 | 60M | 229 GB (250 incl.) | +3.8 GB → 46 GB | +283 GB → 3.4 TB | 3.2 TB | 114M | 1,000 | 1.6M | 215K | 5M | **≈ $670–870** | Pro $25 + XL compute $200 + **MAU overage $325** + DB overage $5 + Realtime $5 + R2 $88 + Resend $20 + PostHog $0–200 |

At 200K MAU the two dominant lines are Supabase MAU overage ($325) and compute ($200). The exit path (§31 in `06-architecture.md`) — self‑hosting the same Postgres/GoTrue/PostgREST stack on two 8 GB VPSs (~$60–100/month) with managed backups — cuts that to roughly $200–300/month total, at the price of running servers. That decision is only due at ≥100K MAU.

## 7.4 Per‑subsystem feasibility (which limit each subsystem hits, and when)

| Subsystem | Design | Free ceiling hit at | Mitigation before paying |
|---|---|---|---|
| Authentication | Supabase Auth, custom SMTP | 50K MAU (Free) / 100K (Pro); Resend 100/day at ~60–80 sign‑ups/day | Brevo 300/day as second free sender; Pro raises MAU |
| Database ops | PostgREST + RPC, keyset pagination, counters via triggers | Nano compute ~3K MAU (latency), 500 MB ~2–2.5K MAU sustained | notification retention 90 d; compact reactions; prune soft‑deleted after 30 d |
| Feed reads | SQL scoring over 7‑day candidate window + follows; client cache 60 s | egress 5 GB at ~4K MAU | smaller pages (15), trim JSON (no bodies >280 chars in list mode) |
| Posts / comments / reactions / follows | RPC each; one row + one counter update | none before Pro | — |
| Notifications | trigger inserts + pg_cron dispatcher | none (Expo unlimited) | batch 100/request |
| Search | Postgres FTS (GIN) | GIN growth counts toward DB size | limit index to title/body prefix 2 KB |
| Realtime | Broadcast/Presence in open rooms only | 200 peak at ~40K MAU average, earlier on finale nights | polling fallback when channel join fails |
| Uploads | Worker presign → R2 | Workers 100K req/day irrelevant (≈1.2 req/MAU/mo) | — |
| Video storage | R2 | 10 GB at 1K MAU × 7 months | user quota (e.g. 20 videos/month), delete media of removed posts within 24 h |
| Video playback | progressive MP4 via CDN + range | Class B 10M at ~18K MAU | longer `Cache-Control`, `immutable` keys; 1 poster per video |
| CDN | Cloudflare (R2 custom domain) | none | — |
| Background jobs | pg_cron + pgmq + Edge Functions | 500K invocations ≫ need | — |
| Push | Expo Push | none | — |
| Moderation | OpenAI omni‑moderation + reports queue | free; human time ≈ 27 reports/day at 40K MAU | auto‑hide thresholds; trusted‑user skip |

## 22. Cost table (required format)

| Scale | Registered | MAU | Storage (DB) | Video Storage (cumulative @12 mo) | Bandwidth (media delivered / mo) | Cost / month | Free‑tier feasibility |
|---|---|---|---|---|---|---|---|
| Seed | 1,000 | 250 | 0.11 GB | 3.9 GB | 64 GB | $0 | ✅ fully free |
| Early | 10,000 | 2,500 | 0.62 GB | 40 GB | 0.64 TB | $0 → $25 (month ~8) | ⚠️ free ≈ 3–8 months |
| Growth | 50,000 | 12,500 | 2.9 GB | 200 GB | 3.2 TB | ≈ $53 | ❌ Supabase Pro required by month 2 |
| Scale | 100,000 | 25,000 | 5.8 GB | 400 GB | 6.4 TB | ≈ $58–100 | ❌ |
| Target | 200,000 | 50,000 | 11.5 GB | 800 GB | 12.7 TB | ≈ $127–175 | ❌ |
| MAU‑10K | — | 10,000 | 2.3 GB | 160 GB | 2.5 TB | ≈ $32 | ❌ |
| MAU‑50K | — | 50,000 | 11.5 GB | 800 GB | 12.7 TB | ≈ $127 | ❌ |
| MAU‑100K | — | 100,000 | 23 GB | 1.6 TB | 25 TB | ≈ $190–265 | ❌ |
| MAU‑200K | — | 200,000 | 46 GB | 3.2 TB | 51 TB | ≈ $670–870 (managed) / ≈ $250 (self‑hosted exit) | ❌ |

## 23. Zero‑dollar MVP plan

| Concern | Use now | Free limit | What to monitor (alert at 70 %) | Replace / upgrade later |
|---|---|---|---|---|
| Auth | Supabase Auth + Resend SMTP | 50K MAU; 100 emails/day | daily emails, MAU | Pro; Resend Pro $20 |
| DB | Supabase Free Postgres | 500 MB, Nano | `pg_database_size`, p95 query time, connections | Pro + Small/Medium compute |
| API | PostgREST/RPC + 4 Edge Functions | 5 GB egress; 500K invocations | egress (dashboard), invocations | Pro |
| Media | R2 + Worker (presign/complete) + custom domain | 10 GB, 10M reads | bucket size, Class B | pay $0.015/GB (cents) |
| Video | on‑device compression, MP4 progressive, on‑device poster | as above | avg bytes per video, plays | Cloudflare Stream when ABR/analytics needed or storage > ~500 GB |
| Realtime | Supabase Realtime in live rooms | 200 peak | peak connections | Pro 500; polling fallback |
| Push | Expo Push | none | delivery receipts errors | — |
| Jobs | pg_cron + pgmq | none | queue depth | — |
| Search | Postgres FTS | DB size | slow query log | Meilisearch self‑hosted |
| Moderation | OpenAI omni‑moderation + reports table + SQL views in Studio | rate limits | queue age | in‑app moderator screens |
| Analytics / errors | PostHog + Sentry | 1M events / 5K errors | usage pages | sampling, paid |
| Backups | weekly logical export to R2 + `supabase db dump` before migrations | — | last successful export age | Pro daily backups; PITR |
| CI | GitHub Actions | 2,000 min | minutes used | — |

## 24. Scaling plan by stage

| Stage | Registered / MAU | Bottleneck that ends the stage | Action | First cost of the stage |
|---|---|---|---|---|
| 0 Private beta | ≤1K / ≤300 | none (watch pause‑after‑7‑days during quiet weeks) | ship all of stage‑0 roadmap; seed catalog for airing dramas | $0 |
| 1 Public launch | ≤15K / ≤3K | R2 > 10 GB (video) | enable R2 billing awareness; media quotas; purge job | cents (R2) |
| 2 Traction | ≤40K / ≤10K | Supabase DB 500 MB, egress 5 GB, Nano latency | **Supabase Pro** (+ Small compute if p95 > 300 ms); daily backups now managed | $25–40/mo |
| 3 Growth | ≤100K / ≤25K | R2 Class B > 10M; Resend 100/day; PostHog 1M | Resend Pro; longer cache TTLs; event sampling | $55–100/mo |
| 4 Scale | ≤200K / ≤50K | compute (Medium), DB > 8 GB, Realtime finale spikes | Medium compute; archive notifications; partition `reactions` by month; polling fallback | $125–175/mo |
| 5 100K MAU | — / 100K | MAU cap of Pro (100K), Large compute, Realtime 500 | Large compute; read replica ($) or PgBouncer tuning; consider Cloudflare Stream for top clips | $190–265/mo |
| 6 200K MAU | — / 200K | MAU overage $325, XL compute | decide managed (≈$700–870) vs self‑host exit (≈$250) — schema/API unchanged | see above |

## 7.6 Reproducing the numbers

The model is a 60‑line Node script (`docs/backend/cost-model.js`); run `node docs/backend/cost-model.js`. Edit the `A` constants at the top to test other assumptions (e.g. 10 % video posters instead of 6 %).
