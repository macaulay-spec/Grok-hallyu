# Backend #3 — future private backend (preparation only)

Backend #3 is a **future, private backend** that the provider ("Supa Naija") will supply together
with its credentials, should the product later choose to start using it. It is **inactive**: the
app does not read or call it anywhere. This document records the placeholders and the security
rules so a future migration can be wired without re-plumbing configuration.

## Status

| Item | Value | State |
| --- | --- | --- |
| `BACKEND_3_URL` | `EXPO_PUBLIC_BACKEND_3_URL` | ACTIVE — the video-fallback storage project |
| `BACKEND_3_ANON_KEY` | `EXPO_PUBLIC_BACKEND_3_ANON_KEY` | ACTIVE — publishable key for the fallback |
| `BACKEND_3_SERVICE_ROLE_KEY` | server/CI secret only | required on the Backend #3 broker function |

Backend #3 is the **video fallback**: when the primary video-storage project (Backend #2) is
exhausted or unavailable, video uploads redirect to Backend #3 automatically — no user action, no
downtime. Until `EXPO_PUBLIC_BACKEND_3_URL` / `EXPO_PUBLIC_BACKEND_3_ANON_KEY` are provided, the
fallback is dormant and the app behaves exactly as before (Backend #2 only).

The app continues to use exactly what it used before otherwise:

- **Backend #1 — Hallyu** (`psmxekrmoltwabefgqpd`): auth, profiles, posts, comments, likes,
  follows, notifications, catalog, search, saved state, download records, preferences, RPCs, Edge
  Functions. Client config: `EXPO_PUBLIC_HALYU_SUPABASE_URL` / `EXPO_PUBLIC_HALYU_SUPABASE_ANON_KEY`.
- **Backend #2 — video storage** (`smijjihlnuushnlkbktm`): the public `videos` bucket + the
  `video-upload` broker. Client config: `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

## How the fallback works (lib/video.ts)

1. The app mints a signed upload URL on **Backend #2** first, as always.
2. If the mint fails in a storage-shaped way (unreachable, HTTP 5xx, degraded) **and Backend #3 is
   configured**, the same upload is minted and PUT on **Backend #3** instead. The ledgered key gets
   a `b3/` prefix (`b3/video/{uid}/{ulid}.mp4`).
3. Deliberate per-account quota rejections (HTTP 429 from the Hallyu DB rules) never fall back —
   the ledger would refuse the key anyway.
4. Playback, download-ledger and purge-sweep routing all resolve on the key prefix, so a video on
   Backend #3 plays and cleans up exactly like one on Backend #2.
5. Backend #3 needs the migration `20260922001100_backend3_video.sql` applied on **Backend #1**
   (the Hallyu DB) so `register_media` accepts `b3/`-prefixed keys.

## Provisioning Backend #3 (one time)

1. Create the storage project (any Supabase project dedicated to video bytes).
2. Run `supabase/backend3/setup-videos-bucket.sql` **on it** — creates the public `videos` bucket
   (mp4 only, 100 MB) with service-role-only writes.
3. Deploy the broker: `supabase functions deploy video-upload --project-ref <backend3-ref>` with
   env `HALLYU_SUPABASE_URL` + `HALLYU_SERVICE_ROLE_KEY` (identity + quota still live on Backend
   #1; the function is already parameterised for this).
4. Apply `supabase/migrations/20260922001100_backend3_video.sql` on **Backend #1**.
5. Set the client secrets `EXPO_PUBLIC_BACKEND_3_URL` / `EXPO_PUBLIC_BACKEND_3_ANON_KEY` (GitHub
   Actions secrets for the APK build) and the server secret `BACKEND_3_SERVICE_ROLE_KEY` for the
   purge sweep on Backend #1's `orphan-media-sweep` function env.

Storage math: a Supabase storage project is **not unlimited** — Free plan holds 1 GB, Pro includes
100 GB (then $0.0213 per GB-month), with 5 GB (Free) / 250 GB (Pro) monthly egress. With the
100 MB per-video cap that is roughly 10 videos on Free or ~1,000 on Pro before the fallback kicks
in — and when either project fills, the other one takes the load automatically.

## Security rules (non-negotiable)

## Where the placeholders live

- **Client (public-safe):** `constants/keys.ts` exports `BACKEND_3_URL` and `BACKEND_3_ANON_KEY`
  from `EXPO_PUBLIC_BACKEND_3_URL` / `EXPO_PUBLIC_BACKEND_3_ANON_KEY`. Both are intentionally
  `undefined` until real values are provided (no hard-coded defaults).
- **Environment template:** `.env.example` lists all three names, with the service-role key
  clearly marked server-side-only.
- **CI:** the service-role key, if ever needed, must be added as a **GitHub Actions secret** — never
  committed and never injected into the client build. `build-apk.yml` deliberately does **not**
  inject any `BACKEND_3_*` value.

## Security rules (non-negotiable)

1. **Never hard-code secret credentials in source.**
2. **Never expose the service-role (or any private) key** to the React Native client, the Expo
   bundle, the APK, the frontend source, or a public GitHub repository.
3. Only the **publishable (anon) key** and the **URL** may ever be shipped to the client.
4. The service-role key is **server-side only** — an Edge Function / CI secret, never
   `EXPO_PUBLIC_*`.

## Enabling it later (when the provider supplies credentials)

1. Add `EXPO_PUBLIC_BACKEND_3_URL` and `EXPO_PUBLIC_BACKEND_3_ANON_KEY` (client) and the
   service-role key (CI secret).
2. Introduce a backend adapter for it alongside `lib/data/supabaseBackend.ts` and register it via
   `setBackend()` (`lib/data/sync.ts`) — the sync engine already abstracts `push`/`pull`.
3. Migrate one scope at a time behind a flag; keep Backend #1 authoritative until each scope is
   verified.
