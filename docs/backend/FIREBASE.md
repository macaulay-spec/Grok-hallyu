# Hallyu on Firebase — architecture, data model, rules and operations

Firebase is Hallyu's **primary backend and source of truth**: Auth, Firestore and Storage own
every piece of Hallyu data (profiles, posts, comments, reactions, follows, watchlist, collections,
notifications, prefs, blocks/mutes, reports, download ledger, and all media bytes).

* **Supabase** survives only as a *legacy recovery/migration adapter*
  (`lib/data/supabaseBackend.ts` + `supabase/functions` + `supabase/migrations`). It is NOT wired
  into the app: `lib/data/sync.ts` defaults to `firebaseBackend`, and the adapter can only be
  activated deliberately via `setBackend()`. `lib/video.ts videoUrl()` still *reads* pre-migration
  storage keys so old posts keep playing; nothing writes to the old broker anymore.
* **TMDB** stays a fully external catalog API (`lib/catalog.ts`). No TMDB catalog is ever stored
  in Firestore. Posts only denormalize the *display title/poster* of the drama they reference
  (user-content metadata, not a catalog copy). The "Airing today" home rail is intentionally fed
  by the TMDB-backed local catalog, not Firestore.

Project: `zesty-structure-gcf5x` — config in `firebase-applet-config.json` (public client config,
no secrets; security lives entirely in the rules below). Firestore uses a **named database**:
`ai-studio-grokhallyu-4c476fa2-ed9d-495f-a176-30f839145a57` (see `firebase.json`).

## Module map

| File | Role |
| --- | --- |
| `lib/firebase.ts` | App singleton, guarded init (never throws at import), RN auth persistence, Storage upload helpers, `mapFirebaseError` → `BackendError`, `storagePaths` |
| `lib/auth.tsx` | Firebase-only AuthProvider: email sign-in/up + verification gate, reset links, Google credential sign-in, session restore, account deletion |
| `lib/googleAuth.ts` | Native Google sign-in: Custom Tab → implicit `id_token` → nonce/audience verify → Firebase credential (web keeps the SDK popup) |
| `lib/authLinks.ts` | Pure parser for Firebase email-action links (deep link or web URL) |
| `lib/data/firebaseBackend.ts` | Every mutation (push) and every feed/profile scope (pull); `fetchConnections`; `purgeUserData` |
| `lib/data/sync.ts` | Outbox engine: retries, rollback + toast on give-up, dedupe, account-switch guard (unchanged; now talks to Firebase) |
| `lib/media.ts` | Downloads ledger: Firestore `users/{uid}/downloads/*` + on-device AsyncStorage ledger |
| `lib/video.ts` | Video upload = Firebase Storage resumable pipeline; legacy key resolution for playback |

### React Native auth persistence (firebase JS SDK v12)

firebase v12 removed the public `firebase/auth/react-native` entry, and the `firebase/auth`
wrapper resolves to the *browser* bundle under Metro (no AsyncStorage persistence → everybody
signed out on every relaunch). We therefore:

1. depend on `@firebase/auth` **directly** (its `exports` map has a `react-native` condition →
   Metro bundles `dist/rn/index.js`, which exports `getReactNativePersistence`);
2. call `initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })` on native
   (guarded: if an Auth instance already exists we fall back to `getAuth`);
3. keep `getAuth` on web (browserLocalPersistence).

Sessions now survive restart, background/foreground and process death; `onAuthStateChanged` is
the single source of truth for the auth boot (1.5 s failsafe → `signedOut`, splash never hangs).

**Hermes polyfills (`lib/polyfills.ts`).** Android's Hermes engine has no global
`TextDecoder`/`TextEncoder`, and `@firebase/firestore` constructs one while initializing its
Platform singleton — a release-only `ReferenceError: Property 'TextDecoder' doesn't exist` that
kills the bundle before React mounts (dev/Chrome has it natively, so debug builds never showed
it; the CI emulator gate caught it on the first honest run). `lib/polyfills.ts` installs both
globals (via `text-encoding-polyfill`) plus `react-native-url-polyfill`, and is imported FIRST
by `index.js` and by every module that imports `firebase/*` directly (firebase.ts, auth.tsx,
media.ts, firebaseBackend.ts). `scripts/test-firebase-backend.mjs` fails if that order ever
regresses.

`.npmrc` sets `legacy-peer-deps=true` because `@firebase/auth` declares an *optional* peer on
`@react-native-async-storage/async-storage@^2||^3` while Expo SDK 51 ships 1.23.1 — the
persistence API surface it uses (`getItem/setItem/removeItem`) is identical across those majors.

## Firestore data model

Shaped by access patterns (feeds, episode rooms, profile tabs), not copied from Postgres:

```
users/{uid}                        public profile card (handle, handleLower, displayName,
                                   avatarUrl, bio, counts, verified, isPrivate) — NO email/prefs
users/{uid}/private/me             email, prefs, onboarding, lastSeenActivity (owner-only)
users/{uid}/watchlist/{dramaId}    WatchlistItem (status, season, episode, note)
users/{uid}/saved/{postId}         save record (presence = saved)
users/{uid}/follows/{kind}_{id}    {kind: users|dramas|actors|collections, targetId}
users/{uid}/followers/{uid2}       reverse index — written by the FOLLOWER
users/{uid}/dramaNotify/{dramaId}  episode-alert opt-in
users/{uid}/collections/{colId}    Collection (owner's copy, incl. private)
users/{uid}/blocks/{uid2}
users/{uid}/mutes/{user_x|drama_x}
users/{uid}/reactions/{targetId}   my reaction on a post OR comment (server truth for counters)
users/{uid}/commentRefs/{cid}      {postId} — locates my comments for deletion
users/{uid}/notifications/{nid}    Notification — created by the ACTING member (fan-out on write)
users/{uid}/downloads/{keyId}      {key, postId, count, firstAt, lastAt}
posts/{postId}                     Post + denormalized authorHandle/Name/Avatar,
                                   dramaTitle/dramaPosterPath, bodyLower(400), counters
posts/{postId}/comments/{cid}      Comment + denormalized author fields
collections/{colId}                public mirror of public collections (community tab)
reports/{rid}                      moderation reports — create-only, never readable by clients
```

Design notes:

* **Denormalization over joins.** Feed cards render without extra reads (author + drama display
  fields live on the post). Profiles are split public/private so the public card can be world-
  readable while email/prefs are owner-only.
* **Notifications are fan-out-on-write** with deterministic ids (`kind_postId_uid`) written with
  `merge` — retries dedupe instead of stacking.
* **Counters are increment deltas** (`reactions.*`, `commentCount`, `saveCount`, `followersCount`,
  `followingCount`, `followerCount`) so concurrent writers never clobber each other. Reaction
  kind-switches read the member's own reaction doc first (server truth), then apply ±1 deltas.
* **Deletion is a tombstone** (`state: 'deleted'`) for posts/comments so counters and threads
  stay coherent; account deletion (`purgeUserData`) hard-deletes everything the member owns
  (posts + their comments, all subcollections, public mirrors, follower back-references, Storage
  objects) before `user.delete()` removes the Firebase Auth account. Firebase UID is the one
  canonical identity — there is no Supabase auth fallback that could mint a second id.

### Query policy: zero composite indexes

Every query is restricted to auto-indexed shapes (see `firestore.indexes.json` — intentionally
empty):

* **For You / activity / comments**: global `orderBy(createdAt desc)` + `orderBy(__name__ desc)`
  with `startAfter(createdAt, docRef)` cursors — true server paging on a single-field index.
* **Episode rooms**: equality zigzag (`context.dramaId ==`, `context.season ==`,
  `context.episode ==`) — Firestore merges single-field indexes for equality-only queries.
* **Following feed**: `authorId in [≤30 ids]` chunks (equality-only), merged client-side.
* **People search**: `handleLower >= q AND <= q+\uf8ff` prefix range (single field).
* **Shorts / drama tabs / profile posts / home rails**: one bounded window (`limit 120`) fetched
  with equality or plain `createdAt` order, then filtered (blocks/mutes), sorted and paged
  client-side (`windowPage`). At current scale a 120-doc window is cheap; if a scope outgrows it,
  add the composite index and switch that scope to server cursors — the pull signatures won't
  change.
* **Post text search**: hashtag `array-contains` + `bodyLower` prefix + a recent-window text
  scan. Firestore has no full-text index; the documented scale-up path is an external search
  index (e.g. Typesense/Algolia) fed by the same fan-out — NOT a TMDB or catalog copy.

Known, accepted limitations (deliberate, not bugs):

* `airingToday` home rail comes from TMDB (external by design) and renders once the local catalog
  warms; the Firestore pull sets it empty/exhausted.
* Text search reaches the recent window only (see above).

## Security rules

`firestore.rules` + `storage.rules` are **default-deny** with explicit matches:

* Public reads: profile cards, posts, comments, public collections, follows/followers lists,
  Storage media (download URLs are embedded in public posts).
* Owner-only: everything under `users/{uid}/private/**` and the private subcollections
  (watchlist, saved, blocks, mutes, dramaNotify, reactions, commentRefs, downloads,
  notifications read/update).
* Cross-member writes are narrowed to exactly what the social graph requires:
  * `posts/{id}` non-owner updates: ONLY `reactions.*` counter keys, `commentCount`, `saveCount`,
    `updatedAt` — body/media/state/authorship are owner-only;
  * `users/{id}` non-owner updates: ONLY `followersCount`/`followingCount`/`updatedAt`;
  * `users/{id}/followers/{followerId}`: create/delete by the follower (or profile owner delete);
  * `collections/{id}` non-owner updates: ONLY `followerCount`/`updatedAt`;
  * `users/{id}/notifications/*`: create only by a member whose uid is in `actorIds`
    (≤ 8 actors, `read == false` at creation);
  * `reports/*`: create-only (`reporterId == auth.uid`), never readable back by any client.
* Storage: writes are uid-path-scoped (`users/{uid}`, `posts/{uid}`, `videos/{uid}`) with size
  caps (avatar 10 MB, images/posters 20 MB, video 100 MB = `VIDEO_MAX_BYTES`) and content-type
  constraints; everything else denied.

### Deploying rules (named database!)

```bash
npm i -g firebase-tools
firebase login
firebase deploy --only firestore:rules,storage --project zesty-structure-gcf5x
```

`firebase.json` pins `firestore.database` to the named database, so the deploy targets the same
DB the app reads/writes. **Do not** deploy with a bare `firebase deploy` from another checkout
without that `firebase.json` — it would write rules to the default `(default)` database and the
app would keep running on stale rules.

Rules validation needs the emulator suite (network-dependent, cannot run in a locked sandbox):

```bash
firebase emulators:exec --only auth,firestore,storage \
  "node scripts/test-firebase-backend.mjs"
```

`scripts/test-firebase-backend.mjs` runs the pure logic (auth-link parsing) plus ~45 static
architecture assertions (no silent Supabase fallback, no `default: break` mutations, rules holes
closed, CI gate integrity). It is part of `npm run check` and of the APK workflow.

## Google sign-in on Android — one-time console setup

Native Google sign-in uses the **implicit id_token flow** in a Custom Tab
(`lib/googleAuth.ts`): it needs an **Android OAuth client** in the Firebase/Google Cloud console.
The web client id alone does NOT work on native (Google rejects it with
`redirect_uri_mismatch`). Until this is done, the app shows a clear "Google sign-in is not
configured" error — email auth is unaffected.

1. Firebase console → project `zesty-structure-gcf5x` → **Authentication → Sign-in method →
   Google**: enable (it already is, for email/popup parity).
2. Google Cloud console → APIs & Services → **OAuth consent screen**: add the SHA-1 of the
   release keystore AND of the CI debug keystore (see below).
3. **Credentials → Create OAuth client ID → Android**:
   * package name: `com.hallyu.app`
   * SHA-1: from `cd android && ./gradlew signingReport` (release), or for the CI APK from
     the debug keystore: `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android`.
4. Put the resulting client id into the repo secret
   `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` (the APK workflow injects it; `constants/keys.ts`
   reads it). For local builds, `.env` with the same variable works.
5. (iOS, later) repeat with an iOS client for bundle id `app.hallyu.mobile` →
   `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.

The id_token is verified locally (nonce round-trip + audience check against the Android client
or the project web client `490855512954-au8e3sco0ru4ptuquadt5qp9ua9flppm.apps.googleusercontent.com`)
before being exchanged via `signInWithCredential(GoogleAuthProvider.credential(idToken))`.

## Email action links (verify / reset)

`ACTION_LINK_SETTINGS` uses `handleCodeInApp: true` + `continueUrl: hallyu://auth/callback`,
so Firebase forwards the action to the app scheme; `lib/auth.tsx` consumes cold-start and warm
deep links (`parseAuthActionUrl`):

* `verifyEmail` → `applyActionCode` + `user.reload()` (the sign-up waiting room clears).
* `resetPassword` → the oob code is parked (`hasPendingReset`), the user is routed to
  `/(auth)/reset-password`, and `updatePassword()` calls `confirmPasswordReset`. The member then
  signs in with the new password (Firebase invalidates sessions on reset — by design).

In the Firebase console, add `hallyu://auth/callback` to **Authentication → Settings →
Authorized domains / custom schemes** if action links ever fall back to the web interstitial.

## Account deletion

Fully Firebase-side, no edge function: `lib/auth.tsx deleteAccount()` →
`purgeUserData(uid)` (Firestore + Storage, best-effort-bounded, logs anything it couldn't remove)
→ `user.delete()`. Firebase may require a recent sign-in for deletion: the error is surfaced as
actionable, and Google accounts auto-reauthenticate with a fresh id_token before retrying.
The legacy `supabase/functions/delete-account` remains in the repo for recovering/migrating old
Supabase-side data only.

## Supabase occurrence classification (audit result)

* **A — migrated to Firebase:** auth (all flows), every `plan()` mutation, every pull scope,
  media uploads (images/posters/avatars/video), download ledger, connections lists,
  account deletion, notifications fan-out.
* **B — legit fallback/recovery (kept, unwired):** `lib/supabase.ts` client,
  `lib/data/supabaseBackend.ts` (registered only via explicit `setBackend()`),
  `supabase/functions/*`, `supabase/migrations/*`, `scripts/check-edge-functions.mjs`.
* **C — intentional external services:** TMDB (`lib/catalog.ts`), legacy video-key READ
  resolution (`lib/video.ts videoUrl()`, `BACKEND_3_URL`/`VIDEO_STORAGE_URL` env).
* **D — dead:** `searchPeopleRemote` (no callers; people search now runs on Firestore
  `handleLower`), the broker upload path in `lib/video.ts` (removed),
  `record_download`/`download_state` RPC calls (removed from `lib/media.ts`).

## CI

`.github/workflows/build-apk.yml`: `npm ci` → typecheck → lint → firebase-backend unit tests →
`expo prebuild --clean` → `gradlew assembleRelease` → install-safety check → **hard** emulator
boot gate (no `continue-on-error`).

The boot gate logic lives in **`scripts/ci/boot-check.sh`** and the workflow invokes it as one
command (`script: sh scripts/ci/boot-check.sh`). This is structural, not stylistic:
`reactivecircus/android-emulator-runner` splits a multi-line `script:` input **line-by-line** and
runs every line as a separate `sh -c` process (`src/script-parser.ts` in the action), so inline
functions/`if`/`while` blocks get shredded — that is the proven root cause of the historical
gate failures (exit 127 = `note: not found` in a fresh shell; exit 2 = stray `fi`). Never move
shell logic back inline in that step.

The gate asserts the release APK installs, the package is present, cold start prints
`[hallyu:boot] … index:redirect` within ~60 s, and that logcat contains NO `[hallyu:crash]`,
`Attempted to navigate before mounting`, `index:nav-failed`, `FATAL EXCEPTION` or `ANR in`.
Logcat evidence is uploaded as the `boot-test-logcat` artifact on every run.
No `google-services.json` exists or is needed: the Firebase JS SDK takes the public web config —
the missing-file reference in `app.json` that used to break the Android build is gone.
