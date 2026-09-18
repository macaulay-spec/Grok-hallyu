# Hallyu — Frontend Issues (handoff list)

Scope: frontend/config only. Backend items (RLS, storage policies, triggers) are
deliberately NOT included here — the app is at the frontend-skeleton stage and the
database is not configured yet.

Verified with `npx tsc --noEmit` (TypeScript ~5.3, strict) on 2026-09-17.

---

## ⚡ STATUS UPDATE — ALL ITEMS RESOLVED (2026-09-17, third pass)

Everything below is now fixed, including a new **demo mode** (`src/lib/demo.ts`):
when Supabase env vars are absent/placeholder the app runs 100% offline —
mock auth, in-memory feed with working likes/saves/posting, local profile
editing — and a GitHub Actions workflow (`.github/workflows/build-apk.yml`)
builds an installable APK with `expo prebuild` + Gradle (no EAS account).
Original second-pass notes kept for history.

Verification: `npx tsc --noEmit` → **0 errors ✅** · `npx expo export --platform android` → **bundles clean ✅** · assets valid PNGs at correct sizes ✅

| Item | Status | Note |
|------|--------|------|
| A1 Relationships | ✅ FIXED* | *`Relationships: []` alone was NOT enough — see A3 below |
| A2 Input style | ✅ FIXED | |
| A3 Views/Functions missing | ✅ FIXED (by auditor) | New root cause, see below |
| B1 dead "+" tab | ✅ FIXED | tabPress now pushes `/create-post` directly |
| B2 onboarding gate | ✅ FIXED | Gate now checks `username`; onboarding upsert sets it — but see **B8** |
| B3 sign-out stranding | ✅ FIXED | Profile tab now navigates to welcome |
| B4 avatar upload unchecked | ✅ FIXED | Throws on upload error |
| B5 swallowed errors | ✅ FIXED | create-post throws; follows_dramas logs warning |
| B6 feed refresh after post | ✅ FIXED | `useFocusEffect` refetch on tab focus |
| B7 seed UUIDs | ✅ FIXED | Proper uuid-format ids + `length > 10` filter before DB write |
| C1 missing assets | ✅ FIXED | icon/adaptive-icon 1024×1024, splash 1284×2778, valid PNGs |
| C2 lint script broken | ✅ FIXED | eslint 8 + eslint-config-expo 7.1.2 + .eslintrc.js; `npm run lint` passes (0 errors) |
| C3 AsyncStorage tokens | ✅ FIXED | SecureStore-backed auth storage adapter |
| C4 unused deps | ✅ FIXED | Removed expo-av, zustand, expo-image, react-dom, async-storage; kept expo-font/expo-constants (needed by vector-icons/router), expo-system-ui (needed by app.json userInterfaceStyle) |
| C5 react-native-web missing | ✅ FIXED | Removed `web` script + react-dom (Android-first scope) |
| C6 no eas.json | ✅ RESOLVED | Superseded: GitHub Actions Gradle build, no EAS needed |
| D push→navigate (tabs)/index | ✅ FIXED | `router.navigate` |
| D auth-context double fetch | ✅ FIXED | onAuthStateChange only (INITIAL_SESSION) |
| D welcome ImageBackground | ✅ FIXED | |
| D getTimeAgo "0m ago" | ✅ FIXED | "now" + future-date guard |
| D signup `data` unused | ✅ FIXED | Session check + "check your email" confirmation flow |

### A3. (NEW, fixed) `Database['public']` was missing `Views`/`Functions` — the true cause of the `never` errors
`package.json` allows `@supabase/supabase-js@^2.45.0`, which installs **2.116.0**.
In postgrest-js 2.x, `GenericSchema = { Tables; Views; Functions }`, and
`SupabaseClient` resolves `Schema` to **`never`** when `Database['public']` doesn't
extend it. Adding `Relationships: []` (A1) was necessary but NOT sufficient —
`Views`, `Functions` (plus `Enums`, `CompositeTypes` to match `supabase gen types`
output) had to be added to `src/types/database.ts`. Done; typecheck is now clean.
Lesson: pin the supabase-js version or generate types with `supabase gen types typescript`
instead of hand-maintaining the file.

### B8. (NEW, FIXED) Username collision blocks onboarding — `src/app/(onboarding)/profile.tsx:76`
The B2 fix generates `username` as
`displayName.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 30)`, but
`profiles.username` has a **UNIQUE constraint** (`supabase/schema.sql:11`). Two users
who both enter e.g. "Alex Morgan" → second upsert fails with
`duplicate key value violates unique constraint` → user is stuck in onboarding with a
generic "Something went wrong" alert. Fix: on unique-violation (Postgres error code
23505) retry with a random numeric suffix, or let the user pick/edit a username and
check availability before submitting.
**Resolution:** onboarding now catches Postgres error code `23505` on the profiles
upsert and retries once with a random 4-digit suffix.

### A4. (NEW, FIXED) Empty `Relationships` broke typed embeds — `src/types/database.ts`
Once `Views`/`Functions` were added (A3), supabase-js 2.116's query parser started
type-checking embeds and rejected `profile:profiles(*)` with
`SelectQueryError<"could not find the relation between posts and profiles">` because
every table declared `Relationships: []`. Fixed by populating real FK metadata for
all 11 tables, mirroring `supabase/schema.sql` (posts→profiles, post_dramas→posts/dramas,
comments/likes/saves/follows/notifications/reports→their FKs, profiles→auth.users).
This matches what `supabase gen types typescript` would output.

---

## A. TypeScript compile errors — `npm run typecheck` currently fails (5 errors)

### A1. Root cause: `src/types/database.ts` — missing `Relationships` key
Every table in `Database['public']['Tables']` defines only `Row`, `Insert`, `Update`.
@supabase/supabase-js v2.45+ requires a `Relationships` array on each table type;
without it, mutation payloads resolve to `never`. This produces 4 of the 5 errors:

- `src/app/(onboarding)/profile.tsx:75` — TS2353 on `profiles.upsert({...})` (`'id' does not exist in type 'never[]'`)
- `src/app/(onboarding)/profile.tsx:92` — TS2345 on `follows_dramas.upsert(rows)`
- `src/app/create-post.tsx:64` — TS2353 on `posts.insert({...})`
- `src/app/edit-profile.tsx:48` — TS2345 on `profiles.update({...})`

Fix: add `Relationships: [];` to all 11 table definitions in `src/types/database.ts`
(profiles, dramas, posts, post_dramas, comments, likes, saves, follows_users,
follows_dramas, notifications, reports). Long-term better: generate the file with
`supabase gen types typescript` instead of hand-writing it.

### A2. `src/components/ui/Input.tsx:41` — TS2769
`error && styles.inputError` evaluates to `"" | { borderColor } | undefined` when
`error` is an empty string, which is not assignable to a style.
Fix: `error ? styles.inputError : undefined` (same for any `string &&` style pattern).

---

## B. Frontend logic / navigation bugs (broken even in demo mode)

### B1. The "+" create tab is dead
- `src/app/(tabs)/_layout.tsx:47-51` — the `create` tab's `tabPress` listener calls
  `e.preventDefault()`, so `(tabs)/create.tsx` never mounts.
- `src/app/(tabs)/create.tsx:10-11` — its `useEffect(() => router.push('/create-post'))`
  therefore never runs. Net effect: tapping the center "+" button does nothing.
- Secondary flaw: even if it mounted, `router.back()` from the create-post modal would
  land the user on the blank `<View />` create tab.

Fix: in the `tabPress` listener call `router.push('/create-post')` directly (the modal
is already registered in the root `_layout.tsx`), and delete the create.tsx redirect —
or remove the `create` tab screen entirely and keep only the tab-bar icon.

### B2. Onboarding screens are unreachable — `src/app/index.tsx:22`
The router gate is `else if (!profile?.display_name) router.replace('/(onboarding)/dramas')`.
But a profile row always has `display_name` populated from the moment of signup (the
DB trigger fills it; the onboarding upsert also sets it). The condition can therefore
never be true → the onboarding flow can never be shown.
Fix: gate on a signal that actually distinguishes "onboarded" — e.g. `!profile?.username`
(only set in onboarding/edit flows) or a dedicated `onboarding_completed` boolean read
by the frontend.
Also: `fetchProfile` in `src/lib/auth-context.tsx` swallows errors, so a failed profile
fetch leaves `profile === null` and this gate would then throw a signed-in user into
onboarding. Handle the error state separately from "profile incomplete".

### B3. Sign-out from Profile tab strands the user in the app — `src/app/(tabs)/profile.tsx:68`
`onPress={signOut}` clears the session but nothing navigates; the user stays inside
`(tabs)` with a null profile. (`src/app/settings.tsx` does it correctly with
`router.replace('/(auth)/welcome')`.)
Fix: navigate after sign-out here too, or add a global guard in the root layout that
redirects to `/(auth)/welcome` whenever `session` becomes null while inside a
protected group.

### B4. Avatar upload failure saves a broken URL — `src/app/edit-profile.tsx:41`
The `storage.from('avatars').upload(...)` result is awaited but its `error` is never
checked; lines 42-44 then compute `getPublicUrl` unconditionally, so a failed upload
still writes a dead `avatar_url` to the profile.
Fix: destructure `{ error }`, and on failure throw/alert and skip the URL update.

### B5. Swallowed errors in onboarding + create-post
- `src/app/(onboarding)/profile.tsx:92` — `follows_dramas.upsert(rows)` result ignored;
  failures are silent. At minimum log/toast.
- `src/app/create-post.tsx` (upload block) — `if (!uploadError)` silently skips media;
  the post is then created WITHOUT the image and the user is never told.
Fix: surface upload errors (alert) and abort or retry instead of posting without media.

### B6. Feed never refreshes after posting
`src/app/create-post.tsx` calls `router.back()` after insert, but
`src/app/(tabs)/index.tsx` only fetches on mount / pull-to-refresh, so a new post is
invisible until manual refresh.
Fix: refetch with `useFocusEffect` (or an event/Zustand signal) when the home tab regains focus.

### B7. Seed/demo IDs are not UUIDs — will break as soon as anything is wired
- `src/app/(onboarding)/dramas.tsx:142+` — `SEED_DRAMAS` uses ids `'1'…'6'`. These ids
  flow into the `follows_dramas` upsert (`drama_id` is a uuid FK column) → guaranteed
  failure for any user who picks a seed drama.
- `src/app/(tabs)/search.tsx:17+` — `TRENDING` uses ids `'1'…'6'` and navigates to
  `/drama/1…6`; those routes expect real drama UUIDs.
Fix: give seed/demo items valid uuid-format strings (e.g. fixed
`'00000000-0000-4000-8000-000000000001'` style) and never send seed ids to the DB.

---

## C. Config / tooling (frontend repo)

### C1. `app.json` references image assets that don't exist
- `app.json:7` → `./src/assets/images/icon.png`
- `app.json:11` → `./src/assets/images/splash.png`
- `app.json:24` → `./src/assets/images/adaptive-icon.png`
`src/assets/images/` is empty → `expo prebuild` / EAS Android APK build fails
(and `expo start` warns). Fix: add the three PNGs (1024×1024 icon, 1284×2778 splash,
1024×1024 adaptive foreground) or remove the references until art exists.

### C2. `npm run lint` is broken — `package.json:10`
Script is `"lint": "eslint ."`, but there is no eslint dependency and no eslint config
file anywhere. Fix: add `eslint` + `eslint-config-expo` (devDependencies) and an
`eslint.config.js`, or remove the script.

### C3. Auth tokens stored in AsyncStorage — `src/lib/supabase.ts:15`
`expo-secure-store` is already a dependency but unused. Supabase's own Expo guide
recommends a SecureStore-backed storage adapter for the session. Frontend-only change.

### C4. Unused dependencies bloat the APK — `package.json`
Zero imports found for: `expo-av`, `zustand`, `expo-font`, `expo-image`,
`expo-secure-store`, `expo-constants`, `react-dom`. Keep only the ones actually planned
(e.g. zustand/secure-store/expo-av for later phases); remove the rest.
Also `expo-system-ui` (package.json:29) is not registered in `app.json` → `plugins`,
so it has no effect as configured.

### C5. `npm run web` is broken — `react-native-web` missing
`package.json:9` defines `"web": "expo start --web"`, but `react-native-web` is not in
dependencies (web support in SDK 51 requires `react-native-web` + `react-dom`; only
`react-dom` is present). `expo start --web` will fail or prompt to install.
Fix: `npx expo install react-native-web` — or remove the `web` script if web is out of scope.

### C6. No `eas.json` / EAS project config
Stated goal is "Android APK first", but there is no `eas.json` and no
`expo.extra.eas.projectId` in `app.json`. `eas build` will not work out of the box.
Fix: run `eas build:configure` (creates eas.json + projectId) when the build step begins,
or add a minimal eas.json with a `preview` profile using `"buildType": "apk"`.

---

## D. Trivial frontend polish

- `src/app/(tabs)/index.tsx:87` — home header uses `router.push('/(tabs)/notifications')`
  from INSIDE the tabs navigator; pushing a tab route can stack a duplicate tab
  navigator. Use `router.navigate('/(tabs)/notifications')` (or switch tab via href).
- `src/lib/auth-context.tsx:52,63` — profile is fetched twice on cold start
  (`getSession().then(fetchProfile)` AND the `onAuthStateChange` initial callback both
  call it), and again on every token refresh. Deduplicate (e.g. only fetch in
  `onAuthStateChange`, which fires initially anyway).
- `src/app/(auth)/welcome.tsx:2` — `ImageBackground` imported but never used.
- `src/app/(auth)/signup.tsx:32` — `data` from `signUp()` unused; note the flow assumes
  a session exists immediately after signup, which breaks when Supabase email
  confirmation is enabled (frontend flow decision: handle `data.session === null`).
- `src/app/(onboarding)/dramas.tsx:36` — destructured `error` from the dramas query is
  never used (fetch failures silently fall through to seed data).
- `src/components/feed/PostCard.tsx:114` — `getTimeAgo` returns `"0m ago"` for anything
  under a minute (should be `"now"`); no guard for future timestamps.
- `src/app/(tabs)/index.tsx` — home feed `useEffect` deps include `activeTab`, so
  switching tabs re-runs an identical query (harmless today; will matter once the
  Following tab has its own query).

---

## Summary for the coding AI

Priority order: **A1 → A2** (make `npm run typecheck` pass), **B1** (dead + button),
**B2** (unreachable onboarding), **C1** (build-blocking assets), **B3** (sign-out
stranding), then B4-B7, C2-C6, D.

Verification done on 2026-09-17: `npx tsc --noEmit` (5 errors, all listed in A) and
`npx expo export --platform android` (Metro bundle compiles cleanly — no other
import/syntax/module-resolution errors exist in the JS). Everything statically
verifiable without a configured Supabase project or a physical device is covered here.

All items above are frontend/config only. Backend work (RLS policies, storage bucket
policies, notification triggers, real UUID seed rows) is intentionally out of scope
for this list and should be handled when Supabase is configured.
