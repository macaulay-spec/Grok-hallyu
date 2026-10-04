# Hallyu / Rork Credential Inventory

Handoff document for future development sessions and agents. It is an **inventory** — variable
names, purposes, storage locations and consumers — **not a secret dump**. No raw production secret
belongs in this repository; if you find one, move it to the store named here, rotate it, and run
`node scripts/verify-no-secrets.mjs` before committing.

- **Backend project (Rork Cloud / Supabase):** `kzxlbscfkixnswurpkzb` — `https://kzxlbscfkixnswurpkzb.supabase.co`
- **GitHub repository:** `macaulay-spec/grok-hallyu`
- **Connection contract:** `docs/RORK-CLOUD-CONNECTION-PROMPT.md` · **Connection report:** `docs/RORK-CLOUD-CONNECTION-REPORT.md`

---

## Client / Build Credentials

Client-safe by design: safe to inline into the Expo bundle. All are read at build time from the
environment (`constants/keys.ts`, `env()` semantics — empty string counts as unset). Locally they
live in `.env.local` (gitignored); `.env.example` is the placeholder template.

### `EXPO_PUBLIC_SUPABASE_URL`
- **Where stored:** GitHub Actions secrets ✅ (set) · Rork workspace env ✅ · `.env.local` (local)
- **Purpose:** Supabase project URL — the one backend every client and job talks to.
- **Consumed by:** `lib/api/client.ts` (the app's only Supabase client), `build-apk.yml`,
  `backend-verification.yml` (mapped to `SUPABASE_URL`), edge functions (platform-injected).
- **Local dev:** required for a connected build · **CI:** required for `build-apk.yml` and the
  connected backend job.

### `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- **Where stored:** GitHub Actions secrets ✅ (set) · Rork workspace env ✅ · `.env.local` (local)
- **Purpose:** public anon key — every table is guarded by row level security; this key ships in
  the bundle by design.
- **Consumed by:** same surfaces as the URL.
- **Local dev:** required · **CI:** required.

### `EXPO_PUBLIC_RORK_APP_KEY`
- **Where stored:** GitHub Actions secret ⚠️ (**slot exists but the value was not available to the
  provisioning session — fill it from the Rork project settings**) · Rork workspace env (build-time
  inlined by Rork) · `.env.local` (local)
- **Purpose:** identifies Hallyu in the Rork Auth OAuth token exchange
  (`lib/api/client.ts` → `exchangeRorkToken()`), enabling Google/Apple sign-in.
- **If missing:** email/password auth works; only the Google/Apple exchange path is unavailable.
- **Local dev:** optional · **CI:** required for the connected backend job (Rork leg) and for
  Google/Apple in APK builds.

### `EXPO_PUBLIC_MEDIA_BUCKET`
- **Where stored:** GitHub Actions secrets ✅ (set to `media`) · constant default `media` in
  `constants/keys.ts`
- **Purpose:** the private storage bucket name used for uploads and signed URLs.
- **Consumed by:** `lib/api/client.ts` (`mediaBucket`), media upload flow.
- **Local dev:** optional (default) · **CI:** required by `build-apk.yml`.

### `EXPO_PUBLIC_RORK_AUTH_URL`
- **Where stored:** constant default `https://api.rork.com` in `constants/keys.ts`; overridable.
- **Purpose:** Rork Auth issuer used by the token exchange.

---

## Backend-only Credentials

NEVER expose to the Expo/client bundle. Never commit. CI-only or function-runtime-only.

### `SUPABASE_SERVICE_ROLE_KEY`
- **Where stored:** GitHub Actions secrets ✅ (set, value written from the function runtime — it
  never transited the sandbox) · platform-injected into every Edge Function runtime · Vault entry
  `hallyu_service_role` (created at runtime, see Scheduler below)
- **Purpose:** bypasses RLS for trusted server paths: the live verification suite, edge functions'
  `adminClient()`, and the cron-scheduled HTTP calls.
- **Consumed by:** `scripts/verify-backend.mjs` (connected CI job), `supabase/functions/*` via
  `_shared/supabase.ts`, `backend-verification.yml`, pg_cron → `net.http_post` schedules.
- **Local dev:** only if you run `scripts/verify-backend.mjs` locally (then `.env.local`, never
  committed) · **CI:** required.
- **NEVER expose to Expo/client bundle.**

### `RORK_TEST_REFRESH_TOKEN`
- **Where stored:** GitHub Actions secret ⚠️ (**not set yet** — minting one requires a single
  interactive Rork (Google/Apple) sign-in by a human; the sandbox cannot perform OAuth)
- **Purpose:** lets `scripts/verify-backend.mjs` exercise the real Rork Auth path: refresh →
  access token → accepted by PostgREST.
- **Rotation:** mint a fresh one any time by signing in again; update the secret.
- **NEVER expose to client bundle.** · **Local dev:** optional · **CI:** required by the connected
  backend job (configuration failure if absent, by design — never a silent skip).

---

## Other Backend Secrets

| Variable | Purpose | Client-safe | Stored in | Consumed by | Local dev | CI |
| --- | --- | --- | --- | --- | --- | --- |
| `TMDB_ACCESS_TOKEN` | v4 read token for catalog ingest | read-only public (fallback baked in code, allow-listed by `scripts/lib/secret-scan.mjs`) | fallback in `supabase/functions/_shared/tmdb.ts`; override via Edge Function secret | `catalog-sync` | no | no |
| `TMDB_API_KEY` | v3 fallback key for the same | same | same | `catalog-sync` | no | no |
| `CATALOG_PROVIDER_ID` | provider override (default `tmdb`) | no | Edge Function env (optional) | `catalog-sync` | no | no |
| `TMDB_API_BASE`, `TMDB_IMAGE_BASE` | endpoint overrides | no | Edge Function env (optional) | `catalog-sync` | no | no |
| `EXPO_PUSH_URL`, `EXPO_ACCESS_TOKEN` | Expo push delivery (default: anonymous Expo endpoint) | no | Edge Function env (optional) | `push-dispatch` | no | no |
| Vault `hallyu_project_url` | project URL for cron HTTP calls | no | Supabase Vault (runtime-created by `public.wire_scheduled_functions`) | pg_cron schedules | no | no |
| Vault `hallyu_service_role` | signs cron HTTP calls to edge functions | no | Supabase Vault (same) | pg_cron schedules | no | no |
| `GITHUB_FINE_GRAINED_TOKEN` | session-scoped provisioning token (Contents: RW) | no | held by the Rork session only — **not a repo credential; revoke after the session** | one-shot `ci-relay` function (retired after use) | no | no |

**Rork Cloud injects `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` into every
Edge Function runtime automatically** — functions never need them configured by hand.

---

## CI → secret matrix

| Secret | `build-apk.yml` | `backend-verification.yml` (connected) |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | ✅ required | ✅ required (as `SUPABASE_URL`) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | ✅ required | ✅ required (as `SUPABASE_ANON_KEY`) |
| `EXPO_PUBLIC_RORK_APP_KEY` | ✅ (Google/Apple) | ✅ required |
| `EXPO_PUBLIC_MEDIA_BUCKET` | ✅ required | — |
| `SUPABASE_SERVICE_ROLE_KEY` | never | ✅ required |
| `RORK_TEST_REFRESH_TOKEN` | never | ✅ required |

EAS builds (if adopted) need the four `EXPO_PUBLIC_*` values as EAS secrets too.

---

## Scheduler configuration (registered on the project)

| cron job | schedule | runs |
| --- | --- | --- |
| `hallyu-scheduled-jobs` | `*/15 * * * *` | `select public.run_scheduled_jobs();` — in-database dispatcher; `job_claim` + `job_runs` make runs idempotent and recorded |
| `hallyu-catalog-sync` | `23 * * * *` | HTTP POST → `catalog-sync` (TMDB refresh, hourly) — auth header read from Vault at tick time |
| `hallyu-push-dispatch` | `41 * * * *` | HTTP POST → `push-dispatch` (hourly push delivery) |
| `hallyu-media-cleanup` | `13 5 * * *` | HTTP POST → `media-cleanup` (daily storage reconciliation) |
| `hallyu-purge` | `17 4 * * *` | HTTP POST → `purge-deleted-accounts` (daily retention) |

Inspect: `select jobname, schedule, active from cron.job;` · history: `select * from cron.job_run_logs order by start_time desc limit 20;` · job outcomes: `select job, status, started_at from job_runs order by started_at desc limit 20;`

---

## Secret Recovery / Handoff

Production secret values are intentionally **not** committed to Git.

Authoritative secret locations:

- **GitHub Actions Secrets** — `macaulay-spec/grok-hallyu` → Settings → Secrets and variables →
  Actions (the six names in the matrix above).
- **Rork Cloud secrets/configuration** — Edge Function runtime env (platform-injected Supabase
  trio) and any TMDB/push overrides; manage via the Rork project or `supabase secrets` tooling.
- **Supabase secrets/configuration** — Vault (`vault.decrypted_secrets`, names `hallyu_project_url`,
  `hallyu_service_role`) backing the pg_cron HTTP schedules; Auth admin API (for minting test
  members during verification); Storage `media` bucket policy (private, migration 17).
- **Other providers** — Expo push (optional `EXPO_ACCESS_TOKEN`), TMDB (public read-only creds,
  allow-listed in-repo by design).

### Recovery runbook

1. Lost/rotated Supabase keys → Rork Cloud project settings (or Supabase dashboard → API); update
   the GitHub secrets and re-run the connected workflow.
2. Rork Auth test token expired → one interactive sign-in mints a new refresh token; update
   `RORK_TEST_REFRESH_TOKEN`.
3. TMDB credential rotation → update the function secret AND the two allow-listed fallbacks
   (`constants/keys.ts`, `supabase/functions/_shared/tmdb.ts`) — the scanner matches by value.
4. Cron HTTP calls failing 401 → re-run `public.wire_scheduled_functions(p_service_key,
   p_project_url)` with fresh values (it re-creates the Vault entries and re-registers schedules).

**Final rule:** the repository may be private — that is not permission to commit raw secrets. The
secret scanner (`verify-no-secrets.mjs`) must pass on every commit.
