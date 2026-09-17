# Hallyu
### The social home for K-drama fans
Zero-budget • Mobile-first • Android APK only • Cinematic premium design

---

## 1. Strategy & Positioning

### Current landscape
K-drama fans currently live across:
- MyDramaList (lists + ratings, weak social)
- Reddit (r/KDRAMA, long discussions)
- TikTok / YouTube Shorts (edits & reactions)
- Twitter/X (live reactions & spoilers)
- Viki / Netflix (watching + limited comments)
- Discord & Telegram groups

**What’s missing**  
A clean, dedicated social layer that is *only* about the dramas themselves — not celebrities, not general communities.

### Hallyu’s gap
A mobile-first social app where every post is tied to one or more dramas, the feed mixes people you follow + dramas you follow, and the entire experience feels cinematic and premium.

### Target personas
1. **The Obsessive** (22–32) – wants to talk about dramas *while* watching and find the next emotional hit.
2. **The Taste-Maker** (25–40) – wants a clean place to share short honest takes and follow good taste.
3. **The Poster / Editor** (18–28) – wants to post stills, short clips and reactions tied to specific dramas.

---

## 2. Product Scope (MVP)

### Must-haves
- Auth (email/password via Supabase)
- Profiles (avatar, display name, bio, favorite dramas)
- Drama entities (title, poster, year, genres, synopsis, cast as text)
- Posts (text + images) tagged to dramas
- Home feed: For You + Following
- Likes, comments, saves
- Follow users + follow dramas
- Notifications
- Basic reporting

### Explicitly excluded
- Actor / celebrity pages
- Community / group features
- Live streaming / DMs
- Complex algorithms
- iOS (for now)
- Landing page (out of current scope)

### All screens
1. Splash / Logo  
2. Welcome  
3. Login  
4. Signup  
5. Onboarding – Drama selection  
6. Onboarding – Profile setup  
7. Home Feed (For You / Following)  
8. Discover / Search  
9. Create Post  
10. Post Detail  
11. Drama Detail  
12. User Profile (own)  
13. Other User Profile  
14. Edit Profile  
15. Notifications  
16. Settings  

---

## 3. Brand & Design System

**Accent**: Electric Magenta `#E11D48`  
Deep blacks + luminous magenta. Cinematic, Apple-level restraint.

**Colors**
- Background `#0A0A0A`
- Surface `#141414`
- Text Primary `#FAFAFA`
- Text Secondary `#A1A1AA`
- Accent `#E11D48`
- Border `#27272A`

**Typography**: Inter / System UI  
**Radius**: 8 → 24 → full  
**Spacing**: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64

---

## 4. Technical Architecture

- **App**: Expo (React Native + TypeScript) + Expo Router
- **Backend**: Supabase free tier (Auth, Postgres, Storage, Realtime)
- **State**: Zustand (ready) + Auth Context
- **Media**: expo-image-picker + Supabase Storage
- **Distribution**: EAS Build → APK

### Core data model
profiles, dramas, posts, post_dramas, comments, likes, saves, follows_users, follows_dramas, notifications, reports

See `supabase/schema.sql` for the full ready-to-run SQL.

---

## 5. How to run

1. Create a free Supabase project
2. Run `supabase/schema.sql` in the SQL editor
3. Create public storage buckets: `avatars` and `posts`
4. Copy `.env.example` → `.env` and fill in your keys
5. `npm install`
6. `npx expo start`
7. Scan QR with Expo Go (or build APK with EAS)

---

## 6. Execution Plan (Solo)

**Phase 1 – Foundation** (Days 1–4)  
Repo, schema, Expo scaffold, design system, auth shell

**Phase 2 – Auth + Profiles + Dramas** (Days 5–10)  
Full auth, onboarding, profile, drama detail

**Phase 3 – Posts + Feed** (Days 11–18)  
Create post, media upload, home feed, likes/comments/saves

**Phase 4 – Follows + Notifications** (Days 19–23)  

**Phase 5 – Polish + APK** (Days 24–28)  

**Phase 6 – Soft launch** (Days 29–30)

---

## Project structure

```
hallyu/
├── docs/
│   └── HALLYU.md
├── src/
│   ├── app/                 # Expo Router screens
│   ├── components/
│   │   ├── ui/              # Design system primitives
│   │   └── feed/
│   ├── constants/           # theme.ts
│   ├── lib/                 # supabase + auth context
│   ├── types/
│   └── hooks/
├── supabase/
│   └── schema.sql
├── package.json
├── app.json
└── tsconfig.json
```

This is the complete foundation for Hallyu.
