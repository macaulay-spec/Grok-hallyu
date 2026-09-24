# Hallyu — Production Defect Fixes (12 items)

## 1. Profile + settings persistence
- [x] Root cause: api.profiles is a read-only security_invoker view; view UPDATE grant broken
- [x] Add secure api.update_profile(jsonb) RPC (SECURITY DEFINER, auth.uid()-scoped, column whitelist)
- [x] Revoke view UPDATE from anon/authenticated
- [x] Update frontend data layer (profile/prefs/onboarding pushes → RPC)
- [x] Local verify via PGlite validator (RPC works, prefs merge, whitelist 422, language 422, view read-only)
- [x] Deploy migration to live Backend #1 (workflow_dispatch success) + runtime verify (RPC, prefs merge, 422, view 403, persistence across re-login, cross-account isolation)

## 2. Google OAuth
- [x] Inspect Supabase Google provider config (external.google=true; client_id configured; redirect_uri correct)
- [x] Inspect Android OAuth config (browser flow; hallyu:// deep link registered; no native client needed)
- [x] Surface OAuth callback errors in lib/auth.tsx (was silently swallowed)
- [x] Report REQUIRES MANUAL CONFIGURATION (invalid Google client secret)

## 3. AccountSync race conditions
- [x] Generation guard (gen/inFlight/applied), stale() identity checks
- [x] applied.current = completed state only
- [x] Identity guards in store 'me' reducer + supabaseBackend pull layer

## 4. Global startup crash protection
- [x] Rework provider hierarchy (silent ErrorBoundaries around startup components)
- [x] reportError diagnostics instead of empty catch blocks
- [x] Root ErrorBoundary sits high enough

## 5. Verify signup + display name (runtime, live DB)
- [x] Live signup → profile created → display_name = "Test Kdrama Fan" (verified in api.profiles)
## 6. Verify email login full flow (runtime)
- [x] Live: create account → session → profile fetch → re-login → profile fetch (app AccountSync/home flow pending APK)
## 7. TMDB graceful failure (success/empty/401/429/network/missing image)
- [x] Live API: 200 (20 results), empty (0 results), 401 (error JSON)
- [x] Code: health tracking, friendlyCatalogCopy, useLoad catch, Poster fallback, ErrorState
## 8. Video backend reconciliation (Backend #1 vs #2 video-upload)
- [x] Confirmed Backend #2 (smijjihlnuushnlkbktm) owns production video (app endpoint + live broker)
- [x] Confirmed Backend #1 video-upload genuinely unused (no refs; backend.yml never deploys it)
- [x] Added guarded idempotent cleanup step; ran it → "Removed stale video-upload from Backend #1 (HTTP 200)"
- [x] Verified live: Backend #1 video-upload now 404; Backend #2 broker still functional; Backend #3 inactive
## 9. Preserve working fixes (saved state, download isolation, notif read state, display-name, TMDB, Backend #3)
## 10. Android runtime test (build APK, verify, install, full flow)
## 11. Security rules (no privileged creds in client)
## 12. Final verification report (exact status format)

## Build/Deploy
- [ ] Commit + push branch arena/production-defect-fixes
- [ ] Deploy backend migration to live project
