# Backend #3 — future private backend (preparation only)

Backend #3 is a **future, private backend** that the provider ("Supa Naija") will supply together
with its credentials, should the product later choose to start using it. It is **inactive**: the
app does not read or call it anywhere. This document records the placeholders and the security
rules so a future migration can be wired without re-plumbing configuration.

## Status

| Item | Value | State |
| --- | --- | --- |
| `BACKEND_3_URL` | `EXPO_PUBLIC_BACKEND_3_URL` (blank) | placeholder, unused |
| `BACKEND_3_ANON_KEY` | `EXPO_PUBLIC_BACKEND_3_ANON_KEY` (blank) | placeholder, unused |
| `BACKEND_3_SERVICE_ROLE_KEY` | server/CI secret only | placeholder, unused |

The app continues to use exactly what it used before:

- **Backend #1 — Hallyu** (`psmxekrmoltwabefgqpd`): auth, profiles, posts, comments, likes,
  follows, notifications, catalog, search, saved state, download records, preferences, RPCs, Edge
  Functions. Client config: `EXPO_PUBLIC_HALYU_SUPABASE_URL` / `EXPO_PUBLIC_HALYU_SUPABASE_ANON_KEY`.
- **Backend #2 — video storage** (`smijjihlnuushnlkbktm`): the public `videos` bucket + the
  `video-upload` broker. Client config: `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

No functionality is migrated to Backend #3 by this change.

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
