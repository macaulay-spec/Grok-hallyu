# Hallyu — Production Defect Fixes (12 items)

## 1. Profile + settings persistence
- [x] Root cause: api.profiles is a read-only security_invoker view; view UPDATE grant broken
- [x] Add secure api.update_profile(jsonb) RPC (SECURITY DEFINER, auth.uid()-scoped, column whitelist)
- [x] Revoke view UPDATE from anon/authenticated
- [x] Update frontend data layer (profile/prefs/onboarding pushes → RPC)
- [x] Local verify via PGlite validator (RPC works, prefs merge, whitelist 422, language 422, view read-only)
- [ ] Deploy migration to live Backend #1 + runtime verify

## 2. Google OAuth
- [ ] Inspect Supabase Google provider config + Android OAuth config
- [ ] Correct programmatically-fixable values
- [ ] Report REQUIRES MANUAL CONFIGURATION for console-only values

## 3. AccountSync race conditions
- [x] Generation guard (gen/inFlight/applied), stale() identity checks
- [x] applied.current = completed state only
- [x] Identity guards in store 'me' reducer + supabaseBackend pull layer

## 4. Global startup crash protection
- [x] Rework provider hierarchy (silent ErrorBoundaries around startup components)
- [x] reportError diagnostics instead of empty catch blocks
- [x] Root ErrorBoundary sits high enough

## 5. Verify signup + display name (runtime, live DB)
## 6. Verify email login full flow (runtime)
## 7. TMDB graceful failure (success/empty/401/429/network/missing image)
## 8. Video backend reconciliation (Backend #1 vs #2 video-upload)
## 9. Preserve working fixes (saved state, download isolation, notif read state, display-name, TMDB, Backend #3)
## 10. Android runtime test (build APK, verify, install, full flow)
## 11. Security rules (no privileged creds in client)
## 12. Final verification report (exact status format)

## Build/Deploy
- [ ] Commit + push branch arena/production-defect-fixes
- [ ] Deploy backend migration to live project
