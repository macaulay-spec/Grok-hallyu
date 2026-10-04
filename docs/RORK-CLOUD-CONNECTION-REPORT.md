# Hallyu → Rork Cloud — connection report

Implementation record for `docs/RORK-CLOUD-CONNECTION-PROMPT.md`. Everything below reflects the
live state of the Rork Cloud backend and this repository after the connection work.

## 1. Rork Cloud project

- **Project ref:** `kzxlbscfkixnswurpkzb` (Rork-provisioned Supabase: Postgres + Auth + Storage +
  Edge runtime + REST/PostgREST gateway).
- **URL:** `https://kzxlbscfkixnswurpkzb.supabase.co` — provisioned by Rork, values land in the
  workspace as `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

## 2. Database

The Hallyu schema lives in the **`public` schema of the Rork Cloud project** — the same schema the
app queries, inspectable from the project's database panel (Tables → `public`): all tables with
their real names, columns, indexes, RLS policies and functions. Verified via `getSchema`/RPC while
connecting, and by the queries in §5 below.

- Extensions `pgcrypto`, `citext`, `pg_trgm` enabled (migration 00).
- `analytics_events` is RANGE-partitioned monthly; `ensure_event_partition()` exists and the
  default partition is in place.

## 3. Migrations applied

**37 of 37**, in filename order (`20260101120000_00` → `20260101123600_36`), then `supabase/seed.sql`
(4 worlds, the `tmdb` provider, 4 official rooms — reference rows only, no member content).

Three application-order notes (the files themselves are untouched — see §13):

1. **`check_function_bodies = off` for the runner session.** Migration 00 defines
   `is_moderator()` (a `language sql` function) before `profiles` exists (migration 03). PostgreSQL
   validates SQL-function bodies at creation time; the session setting lets the chain apply as
   written. Every statement is applied verbatim.
2. **`public.genres_search_text(text[])`** — an immutable wrapper added to the live database before
   migration 02, used by the `titles.search_document` and `posts.search_document` generated columns
   in place of `array_to_string(arr, ' ')`, which is *stable, not immutable* on the current
   PostgreSQL engine (42P17). Token output is identical. Migrations 02 and 08 applied with this
   one expression swapped; `search_titles` (34) uses the wrapper too.
3. **`profiles_select_visible` deferred.** The policy in migration 03 reads `public.posts`
   (created in 08); RLS policy expressions are validated at creation, so this single policy is
   applied immediately after 08 as `03-profiles-deferred` — byte-identical statement.

## 4. Schema

| Object | Live count |
| --- | --- |
| Base tables (37 + `analytics_events_default` partition) | 38 |
| Functions (unique signatures after `create or replace` chains) | 145 |
| Enums | 24 |
| Triggers (non-internal) | 53 |
| Indexes | 132 |
| RLS policies | 93 |
| Storage buckets | `media` (private, 100 MiB, images + MP4/MOV) — migration 17 |

## 5. Security verification (§4.3)

| Check | Result |
| --- | --- |
| Tables / functions / enums | 38 / 145 / 24 |
| Tables with RLS disabled | 1 — `analytics_events_default`, a **partition**; its parent `analytics_events` has RLS + policies and is the only REST-accessible surface |
| Policy-less tables | `analytics_events_default` (partition, expected) |
| `SECURITY DEFINER` functions without pinned `search_path` | **0** |
| `job_runs_job_key_unique` | `UNIQUE (job, run_key)` |
| `post_shares_once_per_day` | `UNIQUE (post_id, user_id, channel, share_date)` |
| Worlds | `anime`, `cdrama`, `hollywood`, `kdrama` |
| Providers | `tmdb` |

(Column-name corrections vs the §4.3 sample text: `worlds.label` not `name`, `providers.id` not
`external_id` — per migration 01.)

## 6. Server functions deployed

All 6, service-role gated via each function's own `requireServiceRole()` (gateway JWT check is
off by design; only callers holding the service-role key pass):

`catalog-sync` · `catalog-jobs` · `push-dispatch` · `media-cleanup` · `moderation-digest` ·
`purge-deleted-accounts` — endpoints at `https://kzxlbscfkixnswurpkzb.supabase.co/functions/v1/<slug>`.

Secrets configured (names only): `TMDB_ACCESS_TOKEN`, `TMDB_API_KEY` (the repository's public
read-only catalog credential, server-side only). `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are
injected by the platform. Optional `EXPO_PUSH_URL` / `EXPO_ACCESS_TOKEN` unset (anonymous Expo
push endpoint is the default).

## 7. Scheduling

The 12 jobs and the idempotent `run_scheduled_jobs()` dispatcher are live in SQL
(`job_claim` + `unique (job, run_key)` make retries/collisions no-ops). **Cron wiring is the one
open infrastructure item:** enable `pg_cron` + `pg_net` on the project and use the commented
reference block in `20260101122700_27_scheduled_jobs.sql` (adapted to the function URLs above), or
call the `catalog-jobs` endpoint from any external scheduler every 15 minutes. Recommended
cadences are in the connection prompt §4.4.

## 8. Credentials / configuration

| Value | Client-safe | Lives in |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | yes | Rork workspace env; GitHub secret (build); `.env.local` (local) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | yes | same |
| `EXPO_PUBLIC_RORK_APP_KEY` | yes | GitHub secret (build); `.env.local` |
| `EXPO_PUBLIC_MEDIA_BUCKET` (`media`) | yes | constant default; overridable |
| `EXPO_PUBLIC_RORK_AUTH_URL` (`https://api.rork.com`) | yes | constant default |
| TMDB v4/v3 (server) | **no** | Edge Function secrets (configured) |
| `SUPABASE_SERVICE_ROLE_KEY` | **no** | platform-injected; GitHub secret for `backend-verification.yml` only |
| `RORK_TEST_REFRESH_TOKEN` | **no** | GitHub secret for the live verification suite |

**GitHub Actions secrets to add** (repository Settings → Secrets → Actions):
`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_RORK_APP_KEY`,
`EXPO_PUBLIC_MEDIA_BUCKET`, `SUPABASE_SERVICE_ROLE_KEY`, `RORK_TEST_REFRESH_TOKEN`.

## 9. Frontend connection (this pass)

- `constants/keys.ts` — backend connection values as `EXPO_PUBLIC_*` reads (non-empty `env()`
  semantics, nothing hardcoded).
- `lib/api/client.ts` — one typed `SupabaseClient` (AsyncStorage-persisted sessions), the
  five-state connection classifier, the `BackendHealth` store (CatalogHealth pattern), the bounded
  `probeBackend()` RPC round trip, and the Rork Auth `exchangeRorkToken()` helper (§1.6).
- `lib/api/bootstrap.ts` — typed `get_bootstrap()` + server-profile → `User` adapter.
- `lib/api/analyticsSink.ts` — `track()` → `record_event` behind the existing sink seam.
- `lib/api/pushToken.ts` — `register_push_token` on sign-in (local reminders stay in addition).
- `lib/auth.tsx` — real Supabase Auth sessions (sign-in/sign-up/reset/verify/password/delete),
  mapping errors onto the existing `AuthError` codes; **the exported `AuthValue` contract is
  unchanged**, and a build without backend env falls back to the original device-local behaviour.
- `app/index.tsx` — the connection gate: cold start proves the backend with a bounded RPC round
  trip before redirecting and states the result on the splash (never claims connected while on
  device data). 6s auto-bailout and boot trail preserved.
- `lib/hooks.ts` — `useBackendHealth()`.
- `package.json` — `@supabase/supabase-js` moved to `dependencies` (bun.lock updated).

Still on the client-local path (by design, §6.2 rollout): the per-screen rewiring of the 65
screens onto the RPC surface (home rails → `get_home_discovery`, feed → `feed_page`, search →
`search_all`, etc.). The store/selectors remain the read cache — that work layers onto them.

## 10. Connection gate

Five states in `lib/api/client.ts` (`connecting | connected | unavailable | offline |
misconfigured`), surfaced by `useBackendHealth()` and on the splash during cold start. The gate
verifies the real hosted path — `get_bootstrap()` when signed in, the anonymous
`handle_is_available()` probe otherwise — with a 5s bounded timeout; a build without backend env
reports **local mode** honestly instead of pretending.

## 11. GitHub Actions

`build-apk.yml`: the job env now carries the four client-safe backend values from repository
secrets (`EXPO_PUBLIC_SUPABASE_URL/ANON_KEY/RORK_APP_KEY/MEDIA_BUCKET` — never the service-role
key), and the release note no longer claims "no backend connected". `npm run test:home-render`
and all other gates unchanged. EAS builds need the same values via EAS secrets when used.

## 12. Verification results

**A. Repository gates — PASS (exit 0):** typecheck, lint, `test:fandoms`, `test:sql` (37
migrations parse; RLS; search_path; no secrets), `test:db-types`, `test:backend-surface`,
`test:secrets`, `test:home-render`.

**B. Live end-to-end (`scripts/verify-backend.mjs`) — NOT RUN yet.** It requires
`SUPABASE_URL` + `SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` (+ `RORK_TEST_REFRESH_TOKEN`
for the Rork Auth leg) as repository secrets. Run it after adding the secrets in §8; it exits
0/1/2 (pass/fail/not-configured) and is safe to re-run (throwaway members, everything cleaned up).

## 13. Preserved & deviations

**Preserved:** all 37 migration files byte-intact; RLS/policy surface; counter guards; keyset
pagination; the Zustand store and selectors as the client cache; the memoised `useApp()` accessors
and the render-loop guard; the TTL-memo TMDB catalog and its `verify-backend-surface` allow-list
(removed only when the client stops calling TMDB); local reminders (push registration is
additive); device-local media; boot trail and the 6s failsafe.

**Deviations (smallest possible, documented in §3):** runner-session `check_function_bodies=off`
(no file change); the immutable `genres_search_text` wrapper in the live DB (PostgreSQL version
constraint); `profiles_select_visible` applied directly after migration 08.

## 14. Open items

1. GitHub repository secrets (§8) → then the live verification suite (§12B) and connected APK CI.
2. Cron wiring for the 12 scheduled jobs (§7).
3. Per-screen RPC adoption (§9 list) — foundation is in place; screens roll over one by one.
4. Rork Auth Google/Apple UI wiring on the sign-in screens (`exchangeRorkToken()` is ready).
5. `app/settings/about.tsx` diagnostics: extend the existing panel with `useBackendHealth()`.

---

## Completion update (connection loop finished)

State after the completion pass — `RORK-CREDENTIALS.md` is the credential inventory:

- **GitHub Actions secrets configured** (written via the repo API, values never transited chat):
  `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_MEDIA_BUCKET`,
  `SUPABASE_SERVICE_ROLE_KEY`, `EXPO_PUBLIC_RORK_APP_KEY`. Two value gaps: the Rork app key's
  value is platform-held (fill from Rork project settings — builds degrade to email/password until
  then), and `RORK_TEST_REFRESH_TOKEN` needs one interactive Rork sign-in to mint — until then the
  connected CI job fails loudly, by design (§9).
- **Scheduler live (§7/§11):** `hallyu-scheduled-jobs` (`*/15` → in-database
  `run_scheduled_jobs()`; ticks verified firing on their own, `job_runs` recorded) plus four
  Vault-backed HTTP schedules via pg_net — `hallyu-catalog-sync` (hourly TMDB refresh),
  `hallyu-push-dispatch`, `hallyu-media-cleanup`, `hallyu-purge` — registered idempotently by
  `public.wire_scheduled_functions(p_service_key, p_project_url)` (service-role only, re-runnable
  for rotation; Vault names `hallyu_service_role` / `hallyu_project_url`).
- **Two live-only ingest bugs fixed** (unreachable by offline parsing): plpgsql name collisions in
  `catalog_upsert_title` — the local `external_id` vs the column, and the `RETURNS TABLE (id,…)`
  out-column vs `titles.id` in the unchanged-row branch. Fixed live and in migration 24. First
  real TMDB run after the fix: **80 items seen, 13 written, 67 unchanged confirmations, 0 errors**;
  catalog serving real titles over anon PostgREST.
- **Production catalog path is server-only (§5/§6):** `lib/api/serverCatalog.ts` implements the
  full `CatalogProvider` on backend RPCs/PostgREST; `lib/catalog.ts` selects it for every connected
  build — the TMDB adapter answers only in device-local builds (honest local mode, gate-labelled).
  Home hydrates from `get_home_discovery()` (`lib/api/homeDiscovery.ts`) when signed in +
  connected; the connection gate still reports only a real RPC round trip as connected (§5).
- **CI (§8/§9):** `backend-verification.yml` split into offline + connected jobs with the
  `EXPO_PUBLIC_*` → script-env mapping (one Supabase project everywhere) and configuration /
  authentication / test failures clearly separated — missing secrets are red, never a silent skip.
  `build-apk.yml` passes `CONNECTED_BUILD` to `scripts/ci/boot-check.sh`, which now fails a
  connected build that does not reach `gate:connected` (a real backend RPC round trip) before
  navigation; crash/navigation/FATAL assertions unchanged.
- **Media flow verified live (§7):** private `media` bucket upload → metadata → signed URL →
  authenticated fetch → anonymous read blocked → delete, all green.
- **Remaining:** mint `RORK_TEST_REFRESH_TOKEN` (one sign-in), fill `EXPO_PUBLIC_RORK_APP_KEY`'s
  value, then run the connected workflow once; EAS secrets if EAS builds are adopted.

---

## Live-project verification update

The first live run of the connected suite (2026-10-04, commit `a877324`) failed 117 of 119 checks.
Every failure reproduced against a PostgreSQL 14 instance built from `supabase/migrations` — **none of
them were live drift**: they were definitions in this repository that parse as text but never execute
correctly. Fourteen were fixed in the migrations (see the commit message for the list), and the
blind spot that let them through is now a gate:

- `scripts/localdb/apply.mjs` applies the migrations verbatim, in filename order, to a real database.
- `scripts/localdb/check.mjs` replays 19 behaviour checks (member post creation under RLS, reactions,
  comments, notifications + delivery, catalog ingest, communities, media, feed/search, jobs,
  `get_bootstrap`) as SQL.
- `scripts/localdb/surface.mjs` compiles and plans **every** function body — the only offline way to
  see inside one.
- All three run in the `offline` job against a `postgres:16` service container, and are available
  locally as `npm run test:db-exec`.

**What this means for the project:** the fixes live in the repository, so the connected job keeps
failing until `supabase/migrations` is applied to the Rork Cloud project again. That needs database
credentials this workspace does not have. `scripts/verify-schema-sync.mjs` runs after the live suite
and names every function the project is missing, so the next run states the cause instead of a wall
of symptoms.

---

## Second live run: two platform rules the schema had never met

Run `37196389209` (commit `639d186`) still failed 45 of 119 live checks, but most of the remaining
failures were symptoms of two things that have nothing to do with the fourteen body defects above.
Both were found by reproducing the run against a real PostgreSQL, and both are fixed in migration 37.

**1. SQL is not allowed to delete storage.** Supabase installs `storage.protect_delete()`, a
`BEFORE DELETE` trigger on `storage.objects` and `storage.buckets` that refuses a direct `DELETE` for
*every* role: *"Direct deletion from storage tables is not allowed. Use the Storage API instead."*
Migrations 20, 22, 30 and 36 all removed bytes that way, so `delete_account()` could never delete an
account and the media sweeper could never remove an orphan — the two promises the product makes
about personal data. The division of labour is now explicit: SQL decides what disappears and writes
the path to `media_removal_queue`; `media-cleanup` and `purge-deleted-accounts` drain it through the
Storage API (`_shared/media-removal.ts`). The queue is durable rather than a returned array because
`purge_deleted_accounts()` hard-deletes the rows that identify the paths in the same transaction.
`scripts/verify-sql.mjs` now fails the build if any surviving function definition deletes a storage
row, and `scripts/localdb/apply.mjs` emulates `protect_delete()` so the local gate reproduces the
live failure.

**2. `profiles_update_self` did not protect `role`.** The policy checked `id` and `account_status`,
which looks closed; it could not compare the stored row with the incoming one, so
`update { role: 'admin' }` on your own profile passed both clauses. `profiles_guard_privileges()`
(37) refuses `role`, `verified`, `account_status` and `deleted_at` changes to anything that is not an
admin, the service role, or a write that did not come from a client at all. It is deliberately *not*
`SECURITY DEFINER` — a definer trigger runs with its owner's `current_user`, which is exactly the
privilege it exists to withhold; `verify-backend-surface.mjs` fails the build if that ever changes.

Two harness defects were fixed at the same time, because they were reporting fiction:

- `verify-backend.mjs` probed every RPC with a made-up `__probe__` parameter. PostgREST resolves calls
  by name *and* parameter list, so that reports **every** function as missing — which is why the last
  run claimed 70 missing RPCs on a project that has them. The probe now sends the parameters the
  migrations declare (all null), through the shared parser in `scripts/lib/db-signatures.mjs`, and
  `scripts/test-db-signatures.mjs` pins the classification with the live project's own error strings.
- When the OpenAPI document could not be read at all, every schema check died with
  `Cannot read properties of null`, and the RPC check inherited the failure. An unreadable schema is
  now reported as *blocked* — counted, named, and never counted as a pass.

**APK run `37196389143` (same commit):** the boot gate passed (`gate:connected`, a real RPC round
trip, installed, cold-started, no JS crash), and the device sign-in gate passed — a brand-new CI
account signs in, lands on `/(onboarding)/fandoms`, and the session is restored after a force-stop and
relaunch. Its one remaining failure was in this repository, not the device: `scripts/ci/test-account.mjs`
queried `analytics_events.created_at`, and the table is partitioned by `occurred_at`.

---

## Final state of this branch

Four further commits closed the loop on the last live runs, and every check they added is
reproduced offline.

| Commit | What it fixes |
| --- | --- |
| `a8e57d6` | `storage.protect_delete()` (bytes leave through the Storage API via `media_removal_queue`), the `profiles_guard_privileges` trigger, and the CI account proof that read `analytics_events.created_at` |
| `1be168a` | the RPC probe that reported a healthy project as empty, a raising function reported as unreachable, and a schema root fetched in a form that declares no relationships |
| `b12263b` | `download()` returns a Blob (not an ArrayBuffer), the foreign-key check reported as blocked rather than failed, and the storage policies exercised offline for the first time |
| `c81aec4` | two checks that were green for the wrong reason: the queue check passed on a project with no queue table, and the scheduler check passed with "0 job(s) run" because the run key is hourly |

Workflow results on this branch:

- **Build APK `37200311876` — success** on the final tree, and `37198148729` and `37198731358`
  before it. The release APK builds, installs on an emulator, cold-starts, and reaches
  `gate:connected` — a real RPC round trip against the live project. The device signs in with a real
  CI test account, lands on `/(onboarding)/fandoms`, and the session is restored after a force-stop and
  relaunch. `scripts/ci/test-account.mjs verify` confirms the proof it exists for: an `auth.signin`
  event recorded server-side for that member.
- **Backend verification `37200311797` — offline and rork-auth jobs pass; connected job fails**, because
  the project still runs the schema from before `639d186`. The report says so precisely:
  **41 failed, 1 blocked, of 120 checks**, and **present: 114 · missing: 6 · unreachable: 0** — the six
  are `genres_search_text`, `author_has_live_post`, `notify_at_for`, `queue_media_removal`,
  `claim_media_removals`, `complete_media_removals`, i.e. exactly what this branch added. No failure is
  a harness artefact any more, and the run no longer reports phantom "missing RPCs" or null-crashes.

  The count went from 40 to 41 because one more check stopped passing for free. `c81aec4` made the
  media-removal-queue check prove the queue exists before claiming a client cannot see it — against a
  project without the table it now fails outright instead of passing vacuously. That is a true failure
  added, not a regression. The scheduler checks in the same commit now read `job_runs` instead of
  trusting the dispatcher's return value, so "the scheduler ran" is evidenced: the live window's
  `catalog.status` run finished `succeeded` with 15 items processed.

The one blocked check is honest about what it is: the project's schema document declares no
relationships at all, so the suite cannot say whether the foreign keys exist. They are exercised
behaviourally instead, and offline `repro.sql` proves the policies are scoped to the owner.

**The remaining 41 failures are live drift, not repository defects.** Each one is a definition the
project is still running and this branch has replaced — `posts_insert_own` recursing through
`profiles_select_visible`, `text[] & text[]` in `recommended_titles`, the enum casts in
`join_community` and `begin_media_upload`, the `syntax error at or near "union"/"if"` bodies, and
`delete_account` deleting storage rows. Applying `supabase/migrations` in filename order (with
`check_function_bodies = off` for the session) is the whole remedy, and it needs database credentials
this workspace does not have.
