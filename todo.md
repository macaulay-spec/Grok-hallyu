# Hallyu — Final Backend, Persistence & Integration Audit

## Phase 0: Recon
- [x] Map repo structure (app/, lib/, components/, supabase/)
- [x] Identify all data-layer files (supabase client, backend abstraction, stores)
- [x] Identify all mock/demo/seed code paths (none in production paths)

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
- [x] Email/password: signup, login, logout, session restore, confirm, reset
- [x] Google OAuth flow (skipBrowserRedirect + openAuthSessionAsync + code exchange)
- [x] Session persistence across app kill (AsyncStorage-backed supabase client)
- [x] Account-switch contamination check (AccountSync reset on id change)
- [x] FIX: display-name metadata mismatch (client `display_name` vs trigger `displayName`) → migration 20260922000900_signup_display_name.sql

## Phase 4: Email / SMTP
- [x] Identify configured provider + credential storage (GitHub Actions secrets SMTP_*)
- [x] Verify Supabase Auth uses it (CI Management-API step PATCH /config/auth applies smtp_*)
- [x] Verify redirect/deep-link URLs (uri_allow_list covers hallyu://auth/callback, web + exp + localhost)

## Phase 5: Posts / Social / Feed / Notifications
- [x] Posts CRUD persistence (addPost/editPost/deletePost push cases)
- [x] Likes/comments/follows (react/addComment/deleteComment/follow push cases)
- [x] Feed/discovery real data + pagination (useRemote/useRefresh, PAGE=12, empty/loading states)
- [x] Notifications + account isolation (activity scope; FIX: monotonic read-state in mergeNotifications)

## Phase 6: Video System (verify only, NO rewrite)
- [x] Upload auth (Hallyu JWT verified by broker), signed URL (deterministic object id), registration (register_media ownership regex), playback (videoUrl), quota (upload_quota), errors — verified, no change

## Phase 7: Downloads & Media State
- [x] Download record persistence + UI + isolation (FIX: per-account on-device ledger via setDownloadScope)

## Phase 8: GitHub Actions
- [x] Secrets present, build green, correct endpoints, no leaks (build-apk.yml injects only Backend #1/#2; Backend #3 NOT injected)

## Phase 9: Backend #3 (future-only placeholders)
- [x] Create BACKEND_3_URL / ANON / SERVICE_ROLE placeholders (constants/keys.ts, .env.example, docs/backend/BACKEND-3.md)
- [x] Ensure inactive, no migration (not wired into any runtime path; no build-time injection)

## Phase 10: Final Report
- [x] Produce structured audit report
