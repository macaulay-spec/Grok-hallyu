# 05 — Video and media (sections 8, 13, 14)

Video is first‑class: shorts (3–60 s) and clips attached to posts (≤140 s), inline autoplay in the feed (`components/media/FeedVideo.tsx` via `expo-av`), posters, and a carousel of ≤6 images. Everything below keeps the UI unchanged; only the source of the URLs changes.

## 8. Video storage & delivery options — with the numbers that decide it

Workload from `04` (per MAU per month): 0.06 uploads × 45 s, 30 plays × ~24 s watched ≈ 0.26 GB delivered. Cumulative stored minutes after 12 months = MAU × 0.06 × 0.75 min × 12.

| Option | What you get | Free tier | Cost at **10K MAU** (300K plays ≈ 120K min delivered / mo; 5,400 min stored; 2.5 TB / mo) | Cost at **50K MAU** (600K min delivered; 27K min stored; 12.7 TB / mo) | Notes |
|---|---|---|---|---|---|
| **A. On‑device compression → R2 progressive MP4 (chosen for stages 0–4)** | one H.264/AAC file per clip, byte‑range streaming, CDN caching, no transcoding, no ABR | 10 GB, 10M reads | **≈ $2** (storage 160 GB → $2.3; reads 6M free) | **≈ $19** (800 GB → $12; 29M reads → $7) | quality fixed at upload (≤720p); poster from device; works with existing `expo-av` player |
| B. Cloudflare Stream | ingest + transcode + HLS/DASH ABR + signed URLs + player analytics | none ($5 min) | storage 5,400 min → $27 + delivery 120K min → $120 = **≈ $150** | storage 27K min → $135 + delivery 600K min → $600 = **≈ $735** | same account as R2/Workers; simplest paid upgrade; delivery minutes dominate |
| C. Bunny Stream + Bunny CDN | transcode + ABR + CDN | $1/mo min | storage ~1 TB‑equivalent negligible; delivery 2.5 TB × $0.01 (EU/US) … $0.06 (MEA) = **$25–150** | 12.7 TB × $0.01…$0.06 = **$127–760** | **Nigeria/Africa traffic is billed at the MEA rate ($0.06/GB)** — 6× the EU/US rate; region mix matters |
| D. Mux | transcode + ABR + best analytics | 100K delivered min/mo (per 2026 roundups — verify) | delivery (120K−100K) × $0.0008 = $16 + storage 5,400 × $0.003 = $16 → **≈ $32** | delivery 500K × $0.0008 = $400 + storage $81 → **≈ $480** | cheapest ABR at 10K MAU *if* the free minutes exist; expensive at scale |
| E. Self‑hosted ffmpeg worker + R2 | transcode to 480p/720p MP4 (+ optional HLS) into R2 | no free always‑on compute (Koyeb free cannot run workers; Fly has no free tier; Oracle ARM is reclaimable) | VPS $5–10 + R2 as A | VPS $10–20 + R2 as A | best cost at scale; adds an ops surface; stage‑5 option |
| F. Supabase Storage | S3‑like bucket + CDN | 1 GB, 50 MB/file, 5 GB egress | 2.5 TB egress → **≈ $225** | 12.7 TB → **≈ $1,140** | egress pricing disqualifies it for video |
| G. Firebase Storage / S3+CloudFront | object storage + CDN | card required / 1 TB CF free | 1.5 TB × $0.085–0.12 → **$130–180** | **$1,000+** | disqualified |

**Decision:** A now. Re‑evaluate at stage 5 (≥100K MAU) between E (self‑hosted ffmpeg) and B (Stream) — by then real watch‑time data replaces these assumptions.

## 13. Storage architecture (all media)

| Item | Decision |
|---|---|
| Bucket | R2 `hallyu-media` (public read through a custom domain `media.hallyu.app`; no bucket listing), R2 `hallyu-backups` (private) |
| Key layout (immutable, unguessable ULIDs) | `avatars/{uid}/{ulid}.jpg` · `posts/{uid}/{ulid}.jpg` + `posts/{uid}/{ulid}_t.jpg` (640 px thumb) · `video/{uid}/{ulid}.mp4` + `video/{uid}/{ulid}_p.jpg` (poster) |
| What the DB stores | `post_media.key`, `width`, `height`, `bytes`, `duration_ms`, `mime`, `status`; never a full URL. Client: `url = MEDIA_BASE + key` (one constant → CDN can be swapped without a migration) |
| Object metadata set at upload | `Content-Type` (from allow‑list), `Cache-Control: public, max-age=31536000, immutable` |
| Access model | everything public‑by‑URL (like X/Instagram CDNs). Private data (avatars of blocked users etc.) is filtered at the API layer, not at the CDN. No signed URLs needed until private collections carry media (not a feature) |
| Uploads | presigned S3 PUT (single ≤20 MB) or S3 multipart (8 MB parts, ≤100 MB video); presigned by the Worker, never by the client (R2 keys stay in the Worker) |
| Deletion | `media_delete` pgmq queue → Worker cron (every 5 min) deletes objects + purges CDN URL; post delete has a 24 h grace (undo/appeals), account delete purges immediately after the auth user is gone |
| Cleanup | pg_cron hourly: `media_uploads.status='pending'` older than 24 h → enqueue delete; orphan sweep weekly (keys without rows) |
| Quotas (enforced in the Worker via `rpc media_quota_check`) | per user: 30 uploads/day, 12 videos/day; accounts younger than 24 h: 5 uploads/day, 2 videos; per‑object: images ≤8 MB, video ≤100 MB hard (targets: ≤25 MB short, ≤45 MB clip) |
| Costs that matter | Class A per PUT/part (1M free), Class B per GET/range (10M free), storage 10 GB free; egress $0 |

## 14. Video architecture — pipeline

```
picker → validate duration → compress (device) → poster (device) → presign → upload (PUT/multipart, retry)
      → complete (Worker validates magic bytes + size, marks ready) → create_post (RPC checks media ready & owned)
      → moderation (pgmq → Edge Function → OpenAI omni‑moderation on poster + caption) → visible
      → delivery: media.hallyu.app/{key} (CDN cache + HTTP range) → expo-av inline player (poster first)
      → cleanup (pending >24 h, deleted posts, account deletion)
```

### 14.1 Client (only step that changes in the existing composer `app/create/[type].tsx`)

| Step | Implementation | Limits / validation |
|---|---|---|
| Pick | existing `expo-image-picker` (`videoMaxDuration` 60/140 already set; `allowsEditing` trims) | reject `asset.duration` > limit + 1 s; reject unknown mime |
| Compress video | **`react-native-compressor`** `Video.compress(uri, { compressionMethod: 'manual', maxSize: 1280, bitrate: 3_000_000, minimumFileSizeForCompress: 8 })` → H.264/AAC MP4, longest side 1280 px (720p), ~3 Mbps video + 128 kbps audio. iOS output is faststart (`moov` first); Android output (MediaMuxer) has `moov` last — ExoPlayer streams it via one extra range request, acceptable at $0 | reject if output > 100 MB; progress UI reuses existing composer progress state; requires a dev build (not Expo Go) — CI already prebuilds |
| Poster | `createVideoThumbnail(uri)` from the same library (or `expo-video-thumbnails`), then compress to JPEG ≤640 px | always required; posts without a ready poster are rejected by `create_post` |
| Images | `Image.compress(uri, { maxWidth: 1600, quality: 0.82 })` → JPEG ≤1.5 MB; plus a 640 px thumb | ≤6 per post; server hard cap 8 MB |
| Upload | `expo-file-system` `uploadAsync`/`fetch` PUT to presigned URL(s); multipart when > 20 MB; per‑part retry ×3 with backoff; resumable = re‑request presign for the missing parts only (`/upload/presign` returns existing `uploadId` + completed parts) | background continuation on Android via foreground‑service‑free approach: keep the composer open with a persistent "Uploading…" toast; the outbox holds the `addPost` mutation until media is `ready` |
| Offline | media upload is *not* enqueued in the outbox (files may be gone); the composer saves a draft instead when offline | existing draft flow |

### 14.2 Worker `media` (Cloudflare Workers Free; TypeScript; `workers/media/`)

| Route | Purpose | Key checks |
|---|---|---|
| `POST /upload/presign` | verify Supabase JWT (JWKS, cached), call `rpc media_quota_check`, insert `media_uploads` (service role, server‑side only), return presigned PUT or multipart part URLs (15‑min expiry), key prefix bound to `uid` | mime allow‑list `image/jpeg,image/png,image/webp,video/mp4`; declared bytes ≤ cap; kind ∈ avatar/image/thumb/video/poster |
| `POST /upload/complete` | complete multipart (if any), `HEAD` object, read first 64 KB and check magic bytes (`FFD8FF`, `89504E47`, `RIFF….WEBP`, `....ftyp` with brands `isom/iso2/mp41/mp42/avc1/M4V `), set `status='ready'` with actual `bytes`; else delete object and set `failed` | rejects mismatched declared/actual size beyond 5 %; rate limit 60/min/user |
| `GET /m/{key}` (optional; default is the R2 custom domain) | pass‑through with cache API when we need custom headers or signed access | not used at launch (saves Worker requests) |
| cron `*/5 * * * *` | drain `media_delete` queue (`pgmq` via PostgREST with service key), delete objects, purge cache | idempotent |

Why not Supabase Storage for uploads and R2 behind it: Supabase would charge egress on playback; a Worker with S3‑presigned R2 URLs costs $0 and keeps a single media origin.

### 14.3 Validation & moderation

| Layer | Check |
|---|---|
| DB (`create_post`) | every referenced `media_uploads.key` exists, `owner_id = auth.uid()`, `status = 'ready'`, kind matches slot, video count ≤1, images ≤6, video posts require poster key, duration ≤ limit for post type |
| Automated | `moderation` pgmq message per post → Edge Function → OpenAI `omni-moderation-latest` with caption + poster/thumb image URLs → store scores in `moderation_scans`; categories above thresholds (sexual/minors, violence/graphic, self‑harm) → `posts.state='hidden'` + `system` notification + moderator queue; medium scores → queue only |
| Human | reports (`reports` table) + moderator RPCs; video is reviewed by watching the clip URL |
| Later (paid) | Sightengine video frames / Hive if volume requires; Cloudflare Stream adds server‑side duration/codec truth |

### 14.4 Playback

* Same `FeedVideo` component; URL = `MEDIA_BASE + key`; poster shown immediately from `_p.jpg`.
* `expo-av` `Video` with `shouldPlay` driven by the existing `FeedViewport`, muted autoplay, `progressUpdateIntervalMillis: 500`, `isLooping` for shorts; `prefs.autoplay` and `prefs.dataSaver` gate autoplay (data saver: poster + tap to play).
* Preload: prefetch the next card's poster only (no video preloading at $0).
* Analytics: `video_play`, `video_complete`, `video_dwell_ms` events → PostHog (needed to decide the stage‑5 video upgrade).

### 14.5 What changes when upgrading to Cloudflare Stream / self‑hosted transcoding

`post_media` gains `provider` (`r2` | `stream`) and `playback` JSON (`hls`, `dash`, `thumbnail`); `FeedVideo` prefers HLS when present (expo‑av plays HLS on both platforms); uploads switch to Stream direct‑creator TUS URLs issued by the same Worker route. Nothing else changes.
