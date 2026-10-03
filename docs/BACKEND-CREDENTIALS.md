# Hallyu backend — credentials and connection

Everything the Hallyu backend needs is defined in this repository. What is deliberately *not* here
is a single credential value. This page is the map: what each credential is, who consumes it,
whether it is client-safe, and what to do when the Rork project exists.

## The connection sequence

```
BACKEND SOURCE (supabase/*)          ← this repository, complete and reproducible
      ↓
RORK CREATES / PROVIDES A PROJECT     ← creates the Supabase project and mints the keys
      ↓
CREDENTIALS INSERTED                  ← GitHub Secrets (CI) and .env.local (local, git-ignored)
      ↓
APP CONNECTED                         ← next phase: constants/keys.ts + lib/auth.tsx
      ↓
VERIFICATION                          ← GitHub Actions → Backend verification
```

Until step two happens, nothing in this repository talks to a server.

## Credential inventory

| Credential | Where it lives | Client-safe? | Consumed by | Notes |
| --- | --- | --- | --- | --- |
| `SUPABASE_URL` | GitHub Secret + `.env.local` | **Yes** (`EXPO_PUBLIC_` in the app) | `constants/keys.ts`, `scripts/verify-backend.mjs` | Project URL, e.g. `https://<ref>.supabase.co`. |
| `SUPABASE_ANON_KEY` | GitHub Secret + `.env.local` | **Yes** | `constants/keys.ts`, client, verification | Publishable/anon key. Every table has RLS enabled, so this key alone reads only public rows. |
| `SUPABASE_SERVICE_ROLE_KEY` | GitHub Secret only | **No — privileged** | `scripts/verify-backend.mjs`, Edge Functions (`SUPABASE_SERVICE_ROLE_KEY` secret) | Bypasses RLS. Must never be bundled, never logged, never committed. |
| `RORK_APP_KEY` | GitHub Secret + `.env.local` | **Yes** | Rork OAuth start (`lib/auth.tsx`, next phase), verification | Public client value, as passwordless. |
| `RORK_AUTH_URL` | constant (`https://api.rork.com`) | Yes | Rork OAuth start | Not a secret. |
| `RORK_TEST_REFRESH_TOKEN` | GitHub Secret only | **No** | verification script | A refresh token for one real test member. Revoke it whenever the test member is removed. |
| `EXPO_PUBLIC_TMDB_ACCESS_TOKEN` | already in `constants/keys.ts` | **Yes** | `lib/catalog.ts` (the pre-existing device-local catalog) | Public read-only catalog credential, by design. |
| `EXPO_PUBLIC_MEDIA_BUCKET` | constant (`media`) | Yes | client, verification | Bucket is created by migration 17 and is **private**. |
| `TMDB_ACCESS_TOKEN` | Supabase function secret | **No — server-side** | `supabase/functions/catalog-sync` | Read-only TMDB v4 bearer token. Read from the function environment, never bundled. |
| `TMDB_API_KEY` | Supabase function secret | **No — server-side** | `catalog-sync` | v3 key, used only when no v4 token is set. |
| `EXPO_ACCESS_TOKEN` | Supabase function secret | **No — server-side** | `supabase/functions/push-dispatch` | Optional; raises the Expo push rate limit. Absent, the anonymous endpoint still works. |
| `CATALOG_PROVIDER_ID` | constant (`tmdb`) | Yes | `catalog-sync` | The `providers` row the ingest writes through. |

## Where the Rork values are inserted

1. **Rork creates the Supabase project** and provides the project URL, the anon key and the service-role key.
2. **GitHub**: Settings → Secrets and variables → Actions → New repository secret, one secret per row
   of the table above. The workflow `.github/workflows/backend-verification.yml` reads them from there
   and nowhere else.
3. **Local development**: copy `.env.example` to `.env.local` and fill in the values. `.gitignore`
   blocks `.env`, `.env.local` and every `.env.*` except `.env.example`.
4. **Supabase function secrets** (for the Edge Functions):
   ```sh
   supabase secrets set --project-id <project-id> \
     SUPABASE_SERVICE_ROLE_KEY=<service-role key> \
     TMDB_ACCESS_TOKEN=<read-only TMDB v4 token>
   ```
   Everything else has a working default: the catalog provider id, the TMDB base URLs and the Expo push
   endpoint. Without `TMDB_ACCESS_TOKEN`, `catalog-sync` reports `503 not configured` instead of
   failing the deployment.

5. **Scheduled jobs** (optional, but the catalog only stays current with one):
   ```sql
   -- Requires pg_cron and pg_net; enable them in Dashboard → Database → Extensions.
   select vault.create_secret('<project-url>', 'hallyu_project_url', 'Hallyu project URL');
   select vault.create_secret('<anon-key>',     'hallyu_anon_key',    'Signs the function call');
   ```
   Then apply the commented-out `cron.schedule(...)` block at the bottom of
   `supabase/migrations/20260101122700_27_scheduled_jobs.sql`. Suggested cadence:
   `catalog-jobs` every 15 minutes, `catalog-sync` hourly, `push-dispatch` hourly, `media-cleanup`
   daily, `purge-deleted-accounts` daily.

## Applying the backend to a project

Every object — tables, indexes, constraints, triggers, functions, RLS policies, the storage bucket —
is created by a migration. Nothing requires a dashboard click.

```sh
# Locally: starts Postgres + the API, replays every migration, then runs the seed.
supabase start
supabase db reset

# Against a real project (needs the access token, CI-only):
supabase link --project-ref <project-ref>
supabase db push                      # applies every migration in filename order
supabase functions deploy purge-deleted-accounts moderation-digest catalog-sync catalog-jobs push-dispatch media-cleanup
```

`supabase/config.toml` ships with the project so the local stack matches what CI verifies.

## Verifying

```sh
node scripts/verify-sql.mjs             # offline: every migration parses, RLS + security invariants
node scripts/verify-db-types.mjs        # offline: the TypeScript contract matches the migrations
node scripts/verify-backend-surface.mjs  # offline: every required capability exists, none is a stub
node scripts/verify-backend.mjs         # live: real CRUD, RLS isolation, storage, cleanup
```

The live script exits `0` on pass, `1` on failure and `2` when the project credentials are absent, so
CI can tell "broken backend" apart from "no backend yet".

## Rules this repository enforces

- `scripts/verify-sql.mjs` fails if a `SECURITY DEFINER` function does not pin its `search_path`, if
  dynamic SQL uses a raw `%s`, if an RLS-enabled table has no policy, or if any migration contains a
  credential literal.
- `scripts/verify-backend-surface.mjs` fails if a required capability is missing, if a function raises
  "not implemented", if a scheduled job is absent from the dispatcher, if a migration performs a
  network call (notification creation and delivery must stay separate), if the client starts calling
  TMDB directly, or if any required Edge Function or `config.toml` entry is missing.
- `scripts/verify-backend.mjs` runs a repository-wide scan and fails on any service-role key, JWT,
  Supabase key or Rork key committed to the tree.