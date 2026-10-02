# Hallyu backend restoration — final report

**Branch:** `arena/01a0fc71-grok-hallyu` → **PR #13** (base `main`)
**Backend (authoritative, unchanged):** Rork-managed Supabase `https://mwgmzncsitgibbkhsktt.supabase.co`
**Identity:** Rork Auth `https://api.rork.com`, project `ss819xdajyzsa3znsyi9t`
**Date:** 2026-10-02

Nothing was replaced: no new Supabase project, no Firebase, no Lovable Cloud, no Rork Worker, no new
database, no auth migration. Every fix keeps Rork as the identity provider and its Supabase as the
store, and no schema was created, altered or migrated by this work.

## Verdict by area

| # | Area | Status | Evidence / reason |
|---|------|--------|-------------------|
| 1 | Repo audit + runtime chain trace (`APK → Rork Auth → JWT → Supabase → RLS → DB`) | **PASS** | Chain traced end to end in code; every link verified live except the authenticated RLS leg (see #5) |
| 2 | GitHub credential/reference cleanup | **PASS (audit) / BLOCKED (deletion)** | Audit complete; the integration token gets HTTP 403 on the secrets API, so deletion is a UI action — exact names listed below |
| 3 | `backend.yml` created as a real diagnostic workflow | **PASS** | `.github/workflows/backend.yml` exists: config, credentials, PostgREST, schema/contract probes, RLS posture, storage, retired-backend scan, optional authenticated bridge test |
| 4 | APK build → runtime config | **PASS** | Build-time validation of every credential *and* post-build verification read back out of the shipped bundle; two green builds |
| 5 | Rork JWT → Supabase bridge | **PARTIAL — one leg unexercised** | Unauthenticated links verified live (key accepted, tables/columns/RPCs present, RLS hides private tables). The authenticated leg is implemented as a CI test but needs a `RORK_TEST_REFRESH_TOKEN` that only the project owner can supply |
| 6 | `supabaseBackend` operation classification | **PASS** | Each operation classified; the failures were token expiry + silent drops, both fixed (details below) |
| 7 | TMDB + video posting | **PARTIAL** | Video: root cause fixed (see below) but uploads need a `media` bucket that does not exist yet. TMDB: credential and endpoint verified live, failure-masking fixed; device-level repro was not possible |
| 8 | Settings/data not saving | **PASS (code + tests)** | Root cause found and fixed: the one-hour Rork pass was never renewed after boot; two silent-drop paths removed; regression tests added |
| 9 | `build-apk.yml` audit | **PASS** | YAML valid, credentials validated before build, obsolete secrets inventoried, no privileged key can reach the bundle |
| 10 | Typecheck / lint / tests / YAML / live probes | **PASS** | `tsc --noEmit`, `eslint .`, `test:save`, `test:fandoms`, `test:session`; workflows parse; live probes green |
| 11 | Commit + report | **PASS** | 6 commits on the branch; PR #13 open against `main` |

## Root causes fixed

1. **The session died after one hour (the "nothing saves" bug).**
   Rork passes last one hour and are meant to be renewed quietly (`POST /oauth/refresh`). The app
   restored or refreshed the pass **once at boot** and then attached the stale pass to every request;
   the Supabase client has `autoRefreshToken: false`. An hour into a session every write was rejected
   and every personal read came back empty.
   *Fixed:* `lib/auth.tsx` renews on demand (single-flight, 60 s before expiry) and on foreground,
   keeps the session when renewal fails only because of the network, and ends it only when the
   refresh token is refused. Pure decision logic lives in `lib/session.ts`; `scripts/verify-session-renewal.mjs`
   (15 assertions, part of `npm run check`) pins the "an hour later" sequence.

2. **A write could be dropped as if it had been delivered.**
   `supabaseBackend.push()` returned early when no live token was cached; the outbox then removed the
   mutation. That is a fake success by construction.
   *Fixed:* a missing pass now throws a real `BackendError` (the optimistic change rolls back with a
   reason) and only guests — local-only by design — skip the write.

3. **A profile save could be a fake save.**
   `update().eq('id')` reports success with zero rows changed.
   *Fixed:* the write verifies the affected row and repairs it; `pull()` also resolves its session
   from a token that is actually valid.

4. **Catalog failures were recorded as healthy.**
   `markFallbackOk()` wrote `state:'ok', status:200` after a failed TMDB request, so an unreachable or
   rejected catalogue rendered as an empty-but-fine rail.
   *Fixed:* failures stay failures (the precise status from `tmdb()` is preserved) and the UI can show
   its retry copy. The TMDB credential itself was verified live (bearer, HTTP 200).

5. **Video/image posts never uploaded anything.**
   Media was stripped client-side, so shorts could never appear for anyone else; the composer now
   uploads through the existing Storage layer and refuses a clip it could not publish (a cached,
   non-blocking bucket probe) instead of accepting it and dropping it at insert time. That refusal is
   currently active because the project has **no Storage bucket at all** (verified: `GET /storage/v1/object/public/media/.probe` → `NoSuchBucket`).

6. **Nothing verified what was actually baked into the APK.**
   `verify-apk-config.mjs` now reads the configuration back out of the release artefact (Hermes string
   table, both encodings) and fails on any privileged key, retired host, or missing runtime path — including
   the `/oauth/refresh` renewal call. `resolve-client-config.mjs` refuses `sb_secret_`, `sbp_` and
   service-role JWTs before a build can bake one in.

## Live verification performed (via GitHub Actions — the sandbox cannot reach the backend hosts)

* Supabase PostgREST reachable, client key accepted (HTTP 200); root `/rest/v1/` answers `401 Secret API
  key required` **by design** (that is the gateway's policy for that endpoint, not a client-key verdict).
* Schema contract: 18 tables present with the columns the client uses; the three PostgREST embeds the
  client builds (`posts_author_id_fkey`, `comments_author_id_fkey`, `collections → collection_items`)
  work; a deliberately wrong column returns `42703` (so "missing" and "empty" are distinguishable).
* RPCs present and reachable: `react`, `merge_prefs`, `merge_onboarding`, `delete_account`.
* RLS posture: anonymous reads of private tables return `[]` (nothing leaks).
* Rork Auth accepts the shipped app key (HTTP 200, redirect host `oauth.rork.com`); TMDB accepts the
  shipped bearer (HTTP 200).
* APK: `Verify release APK (install-safety)` green, `boot-check PASSED — installed, cold-started,
  redirected, no JS crash, no FATAL/ANR`, artifact `hallyu-apk` uploaded.

## Blocked — needs the project owner (exact actions)

1. **Delete obsolete secrets** (repository → Settings → Secrets and variables → Actions). The CI
   inventory names them; values are never printed. Leftovers from the retired backends:
   `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_DBPASSWORD`, `SUPABASE_PASSWORD`,
   `SUPABASE_PAT`, `SUPABASE_TOKEN`, `SUPABASE_ACCESS`, `SUPABASE_ACESSTOKEN`, `SUPABASE_ACESTOKEN`,
   `SUPABASE_ACCESSTOKEN`, `SUPABASE_API_TOKEN`, `DATABASE_PASSWORD`, `DB_PASSWORD`, `ACCESS_TOKEN`,
   `SUPABASE_ANON_KEY` variants for the old projects, `LOVABLE_CLOUD_*`, `EXPO_PUBLIC_LOVABLE_*`,
   `EXPO_PUBLIC_HALYU_SUPABASE_*`, `EXPO_PUBLIC_BACKEND_3_*`, `GOOGLE_CLIENT_ID/SECRET`, `SMTP_*`.
   (The integration token is refused by `GET /actions/secrets` with HTTP 403, so this cannot be done
   from the agent session.)
2. **Create a public `media` bucket** on the Supabase project (or set `EXPO_PUBLIC_MEDIA_BUCKET` to the
   name of an existing public bucket). Until then the composer honestly refuses video clips and image
   uploads cannot complete.
3. **Approve the pending workflow runs** (Actions → the runs marked "Waiting for approval"), or merge
   PR #13 — runs on `main` execute without approval. Pending at the time of writing:
   `37008790596`, `37008008236`, `37007677076` (Build APK) and `37007547236`, `37005918859` (Hallyu
   Backend Health). This token is refused by both the approval and the dispatch API (HTTP 403).
4. **Optional, to close area 5:** add a `RORK_TEST_REFRESH_TOKEN` secret (a refresh token for a
   throwaway account). The health workflow then exercises the real `Rork Auth → JWT → Supabase → RLS`
   path on every run; without it the run says so instead of pretending.

## Rotation

No privileged credential was found in the repository or in any shipped bundle: the only JWT ever
committed is the TMDB **read-only** catalog token, and the Supabase/Rork values are publishable client
credentials that ship inside the app by design. Nothing here is evidence of exposure, so nothing was
rotated — rotating working Rork credentials without evidence was explicitly out of scope.
