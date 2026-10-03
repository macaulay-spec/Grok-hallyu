# Hallyu

Full Expo + React Native + TypeScript rebuild of Hallyu, following the approved cinematic black/magenta UI direction.

## Backend

The Hallyu backend is **defined in this repository** and is **not connected**:

- `supabase/migrations/` — 23 ordered migrations that create the whole database: profiles, the social
  graph, posts, comments, reactions, saves, collections, watchlist, notifications, preferences, push
  tokens, moderation reports, a partitioned analytics table, the entertainment catalog cache, 47
  functions/RPCs, 26 triggers, row level security on every table, and the private `media` storage
  bucket. No dashboard step is required for any of it.
- `supabase/functions/` — two Deno Edge Functions (account retention purge, moderation digest).
- `supabase/types/database.ts` — the typed contract, kept honest by `npm run test:db-types`.
- `supabase/seed.sql`, `supabase/config.toml` — reference data and the local project configuration.

The app itself still runs device-local: there is **no credential in this repository**, no client code
points at a server, and the TMDB catalog is still read directly by `lib/catalog.ts`. Connecting the
app is the next phase; the contract it will consume is written down in
[`docs/BACKEND-CONNECTION-CONTRACT.md`](docs/BACKEND-CONNECTION-CONTRACT.md), and the credential map
in [`docs/BACKEND-CREDENTIALS.md`](docs/BACKEND-CREDENTIALS.md).

Architecture and the migration-by-migration map: [`docs/BACKEND.md`](docs/BACKEND.md).

## Run

```
bun install          # or npm install
npx expo start
```

`npm run check` runs the type checker, the linter and the offline suites: the fandom checks, the SQL
migration validation and the type-contract drift check.

## Verify the backend

```
node scripts/verify-sql.mjs        # offline: parses every migration, checks RLS + security invariants
node scripts/verify-db-types.mjs   # offline: the TypeScript contract matches the migrations
node scripts/verify-backend.mjs    # live: real CRUD, RLS isolation and storage against a project
```

`.github/workflows/backend-verification.yml` runs all three from GitHub Secrets and fails the build
when a live check fails.

## Android

```
npx expo run:android
```

An installable release APK comes from the **Build APK** GitHub Actions workflow, which builds and
reads the configuration back out of the APK before publishing it.

The included `assets/` folder contains the brand, font and on-device visual assets.