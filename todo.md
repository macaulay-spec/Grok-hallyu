# Hallyu — Final Backend, Persistence & Integration Audit

## Phase 0: Recon
- [x] Map repo structure (app/, lib/, components/, supabase/)
- [x] Identify all data-layer files (supabase client, backend abstraction, stores)
- [x] Identify all mock/demo/seed code paths

## Phase 1: Saved State Bug (FIRST PRIORITY)
- [x] Trace save/unsave flow end-to-end
- [x] Check DB write + RPC + optimistic UI + cache invalidation
- [x] Confirm root cause: pull races clobber optimistic saves (viewerSync/me) + push re-derives intent
- [x] Fix ingestCards viewer-presence guard
- [x] Fix viewerSync/me pending-save guard
- [x] Fix push save to carry intended target
- [x] Add Saved screen server fetch
- [x] Verify persistence across reload/logout/account-switch
- [x] Regression test scripts/verify-save-flow.mjs (14 checks)

## Phase 2: Settings / Preferences
- [x] Enumerate every setting + its storage
- [x] Verify persistence + account isolation (writes use explicit patch; device prefs carried)
- [x] Harden me() against stale prefs clobber (mergePendingPrefs guard)

## Phase 3: Authentication
- [ ] Email/password: signup, login, logout, session restore, confirm, reset
- [ ] Google OAuth flow
- [ ] Session persistence across app kill
- [ ] Account-switch contamination check

## Phase 4: Email / SMTP
- [ ] Identify configured provider + credential storage
- [ ] Verify Supabase Auth uses it
- [ ] Verify redirect/deep-link URLs

## Phase 5: Posts / Social / Feed / Notifications
- [ ] Posts CRUD persistence
- [ ] Likes/comments/follows
- [ ] Feed/discovery real data + pagination
- [ ] Notifications + account isolation

## Phase 6: Video System (verify only, NO rewrite)
- [ ] Upload auth, signed URL, registration, playback, quota, errors

## Phase 7: Downloads & Media State
- [ ] Download record persistence + UI + isolation

## Phase 8: GitHub Actions
- [ ] Secrets present, build green, correct endpoints, no leaks

## Phase 9: Backend #3 (future-only placeholders)
- [x] Create BACKEND_3_URL / ANON / SERVICE_ROLE placeholders (constants/keys.ts, .env.example, docs/backend/BACKEND-3.md)
- [x] Ensure inactive, no migration (not wired into any runtime path; no build-time injection)

## Phase 10: Final Report
- [ ] Produce structured audit report
