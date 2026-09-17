# Hallyu

**The cinematic social home for K-drama fans.**

Zero-budget • Expo + React Native + TypeScript • Supabase free tier • Android APK first

---

## Quick start

```bash
# 1. Install
npm install

# 2. Environment
cp .env.example .env
# → fill in your Supabase URL + anon key

# 3. Database
# Open Supabase SQL editor and run supabase/schema.sql
# Create two public storage buckets: "avatars" and "posts"

# 4. Run
npx expo start
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

Full product, strategy, architecture and roadmap → `docs/HALLYU.md`

---

Built with obsession for K-dramas and zero budget.
