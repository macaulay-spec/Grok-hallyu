# Hallyu — Frontend Issues (handoff list)

Scope: frontend/config only. Backend items (RLS, storage policies, triggers) are
deliberately NOT included here — the app is at the frontend-skeleton stage and the
database is not configured yet.

Verified with `npx tsc --noEmit` (TypeScript ~5.3, strict) on 2026-09-17.

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

---

## D. Trivial frontend polish

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
stranding), then B4-B7, C2-C4, D.

All items above are frontend/config only. Backend work (RLS policies, storage bucket
policies, notification triggers, real UUID seed rows) is intentionally out of scope
for this list and should be handled when Supabase is configured.
