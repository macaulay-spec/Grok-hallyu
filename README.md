# Hallyu

**The cinematic social home for K-drama fans.**

Zero-budget • Expo + React Native + TypeScript • Supabase free tier • Android APK first

---

## Demo mode (no backend needed)

If no Supabase env vars are set (or they still contain the placeholder values),
the app automatically runs in **demo mode**:

- No network calls to Supabase at all — everything stays on-device
- Login/signup accept any email + password (demo session stored in SecureStore)
- Feed, likes, saves and posting work against an in-memory demo store
- Onboarding, edit-profile and avatar picking all work locally

This is how the CI-built APK ships — install it and interact with the full
front-end immediately, no schema, no keys, no account.

---

## Get the demo APK (GitHub Actions)

A workflow (`.github/workflows/build-apk.yml`) builds an installable APK:

```bash
# trigger manually (once the workflow is on main)
gh workflow run build-apk.yml

# or: any push to main / arena branches triggers it automatically

# watch the run
gh run list --workflow=build-apk.yml
gh run watch

# download the APK
gh run download <run-id> --name hallyu-demo-apk
```

Each run also publishes a **GitHub Release** (`apk-<run-number>`) with the APK
attached — open the repo's Releases page on your Android phone, download the
APK, allow "install unknown apps" for your browser, and install.

No Expo/EAS account required: the workflow runs `expo prebuild` + Gradle
directly on GitHub's runners (release build signed with the debug keystore —
fine for testing; generate a real keystore before publishing to Play).

### Build locally instead

```bash
npm install
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```

---

## Quick start (development)

```bash
# 1. Install
npm install

# 2. Environment — OPTIONAL: skip entirely for demo mode
cp .env.example .env
# → fill in your Supabase URL + anon key to connect the real backend

# 3. Database (only when connecting Supabase)
# Open Supabase SQL editor and run supabase/schema.sql
# Create two public storage buckets: "avatars" and "posts"
# ⚠️ Add RLS policies before going live — schema.sql does not include them yet

# 4. Run
npx expo start
```

Checks before committing:

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint (expo config)
```

---

## Design system

- Base: pure black `#0A0A0A`
- Accent: electric magenta `#E11D48`
- Style: cinematic, premium, Apple-level restraint

All tokens live in `src/constants/theme.ts`.

---

## Screens included

- Splash
- Welcome / Login / Signup
- Onboarding (drama selection + profile)
- Home feed (For You + Following)
- Discover
- Create Post
- Post Detail
- Drama Detail
- Profile (own + other)
- Edit Profile
- Notifications
- Settings

---

## Docs

- Full product, strategy, architecture and roadmap → `docs/HALLYU.md`
- Frontend issue tracker / fix status → `docs/FRONTEND-ISSUES.md`

---

Built with obsession for K-dramas and zero budget.
