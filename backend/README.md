# Parked backend

This directory holds the server-backed half of Hallyu. None of it is imported by the app any more.

The product is currently a **frontend-only demo build**: every write is applied optimistically by the
store's reducer and persisted to AsyncStorage, every read is served by the app's own local ranking
fallbacks, and the drama/actor catalog is fetched from TMDB directly from the client
(`lib/catalog.ts`). The app boots, posts, threads, tracks and spoils **with no server reachable**.

Nothing here is deleted — it is kept so the backend can be re-attached without rewriting the product.

## What is here

| File | Was | Notes |
| --- | --- | --- |
| `supabase.ts` | `lib/supabase.ts` | Supabase client + the project credentials that used to live in `constants/keys.ts` |
| `supabaseBackend.ts` | `lib/data/supabaseBackend.ts` | The `Backend` implementation: every `pull` scope and every `push` mutation as `api.*` RPCs, plus `ensure-catalog` |
| `video-upload.ts` | `lib/video.ts` | Storage upload broker (mint → PUT → `register_media` ledger), including the Backend #3 fallback |
| `scripts/check-edge-functions.mjs` | `scripts/check-edge-functions.mjs` | Deno typecheck of `supabase/functions/*` |
| `scripts/validate-schema.mjs` | `docs/backend/validate-schema.mjs` | Loads `supabase/migrations/*.sql` into PGlite and smoke-tests the API |
| `workflows/backend.yml` | `.github/workflows/backend.yml` | Applied migrations + validated the schema + deployed edge functions on push |

Still in place and untouched: `supabase/` (migrations, functions, config) and `docs/backend/`
(the schema, API contract and cost model). The schema is the source of truth for a restore.

## What changed in the app

- `lib/data/demoBackend.ts` is now the `Backend`. It accepts every write and seeds the social
  fixtures in `lib/data/demoSeed.ts` once per identity.
- `lib/data/backend.ts` gained an optional `network?: boolean`. `demoBackend` sets it `false`, which
  tells the sync engine to skip its connectivity gate — otherwise a device with the radio off would
  park the outbox behind a wait that can never be satisfied.
- `lib/auth.tsx` is local accounts in AsyncStorage. The `AuthValue` interface is unchanged.
- `lib/video.ts` is local-only: a post's video is the device's own file URI.
- `lib/media.ts` keeps its download ledger on device instead of calling `record_download` /
  `download_state`.
- `lib/data/connections.ts` answers the followers/following screens from the local graph.

## Restoring a server backend

1. Move the files back (`supabase.ts` → `lib/supabase.ts`, `supabaseBackend.ts` →
   `lib/data/supabaseBackend.ts`, `video-upload.ts` → `lib/video.ts`) and fix their relative imports
   — they were rewritten to resolve from this directory.
2. Restore the credentials in `constants/keys.ts` (they were removed so no database key ships in the
   bundle), or point the parked files at the values in `supabase.ts`.
3. `setBackend(supabaseBackend)` in `lib/data/sync.ts`, or just change its default import. The store,
   screens, selectors and optimistic-write path need no changes — that seam is why this is a one-line
   switch.
4. Delete `lib/data/demoBackend.ts` and `lib/data/demoSeed.ts`, or keep them and use `setBackend` to
   toggle, which is what the tests do.
5. Restore `check:edge` / `validate:db` in `package.json` if you want the schema validated in CI
   again (the scripts moved here), and move the workflow back to `.github/workflows/`.

## Why it is excluded from the build

`tsconfig.json` and `.eslintrc.js` both exclude this directory. The parked code still references
`@supabase/supabase-js`, which remains installed precisely so a restore is a move rather than an
install — but Metro only bundles what is reachable from `index.js`, so none of it reaches the APK.
