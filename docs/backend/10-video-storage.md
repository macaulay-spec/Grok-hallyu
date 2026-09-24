# 10 — Video storage (Rork cloud)

Video bytes never touch the Hallyu Supabase project. They live on a separate object-storage
project (Rork cloud) whose only job is video: a public `videos` bucket and one broker Edge
Function. The Hallyu database keeps the ledger (`media_uploads`) and enforces identity + quotas.

## Layout

```
Hallyu app ──JWT──▶ video-upload fn (storage project) ──▶ api.upload_quota() (Hallyu DB)
    │                        │ mints signed upload URL (service role)
    │                        ▼
    └──PUT bytes────────▶ videos bucket (public read, 100 MB, video/mp4)
    │
    └──rpc register_media (Hallyu DB) ──▶ media_uploads row (status ready)
    └──rpc create_post ─────────────────▶ post_media (key passes media_ready via the ledger)
```

Keys follow the shared layout `video/{uid}/{ulid}.mp4`. The object id is derived
deterministically from the post id, so sync-engine retries re-upload to the same object
(`x-upsert`) instead of orphaning a new one.

## Pieces

| Piece | Where | Responsibility |
| --- | --- | --- |
| `api.upload_quota()` | Hallyu DB (migration 0005) | Quota snapshot: 5 uploads/day for accounts younger than 24 h (2 videos), 30/day after (12 videos), 100 MB cap |
| `api.register_media()` | Hallyu DB (migration 0005) | Ledger a finished upload; re-checks ownership (`video/{uid}/…`), mime, size, quota |
| `video-upload` Edge Function | storage project | Verify the Hallyu JWT (`/auth/v1/user`), re-check quota, mint signed upload URL |
| `videos` bucket | storage project | Public read, `video/mp4` only, 100 MB limit; writes only via service-minted signed URLs |
| `lib/video.ts` | app | mint → PUT (`FileSystem.uploadAsync`, no base64 in memory) → ledger |
| `pushAddPost` | `lib/data/supabaseBackend.ts` | Uploads video + poster, then includes `{ key, kind: 'video', posterKey, durationMs }` in `create_post` |

## Client contract

- `constants/keys.ts` reads the storage project from `EXPO_PUBLIC_SUPABASE_URL` (owned by the
  Rork backend entry). The Hallyu backend moved to `EXPO_PUBLIC_HALYU_SUPABASE_URL/KEY`.
- Posters are first frames generated on-device (`expo-video-thumbnails`) and uploaded as regular
  images to the Hallyu `media` bucket (`posts/{uid}/{ulid}.jpg`) — `create_post` requires a
  poster key for every video.
- Playback URLs resolve as `videoUrl(key)` (`lib/video.ts`); `fileUrl` in the backend adapter
  routes `video/`-prefixed keys there automatically. Keys prefixed `b3/` resolve on Backend #3 —
  the video-fallback project that takes over when this one is exhausted (docs/backend/BACKEND-3.md).

## Why not Supabase Storage on the Hallyu project?

The image bucket stays on the Hallyu project (8 MB images are cheap). Video egress is the
expensive part, so bytes are isolated on a project that can be scaled/rescued independently,
while identity, quotas and moderation stay in one place (this database).

## Watermarking (Hallyu brand mark)

The mark is burned into **real bytes**, never painted over the player:

- **Posters** — every video post requires a poster; `lib/media.ts makePoster()` composites the brand
  PNG into the first frame on-device (pure JS compositor, unit-tested in `scripts/test-watermark.mjs`)
  *before* upload, so the stored object carries the mark and every feed / share / preview shows it.
- **Saved images** — `saveImage()` burns the mark before writing to the gallery.
- **Videos** — are saved/downloaded as-is and land in the `Hallyu` album beside their watermarked
  poster. The video track is **not** re-encoded: the Edge Runtime has no transcoder (2 s CPU / 256 MB,
  no subprocess, no ffmpeg binary) and the one maintained on-device option is an unvetted 0.x native
  module we will not bolt onto the verified upload path. `media_uploads.watermarked` therefore records
  burn-in truth per object; nothing in the product claims a mark that was not applied.
