# Hallyu

Full Expo + React Native + TypeScript rebuild of Hallyu, following the approved cinematic black/magenta UI direction.

## Backend (source of truth)

The app runs on the **Rork-managed Supabase** backend. Nothing in this repository provisions,
migrates or replaces it — the schemas, functions, triggers, RLS policies and Storage buckets already
exist there.

| Piece | Value |
| --- | --- |
| Supabase | `https://mwgmzncsitgibbkhsktt.supabase.co` |
| Rork Auth | `https://api.rork.com` (project `ss819xdajyzsa3znsyi9t`) |
| Identity | Rork Auth JWT → `lib/supabase.ts` access-token bridge → RLS (`user_id()` = JWT `sub`) |
| Media | Supabase Storage, `media` bucket (`lib/storage.ts`) |
| Catalog | TMDB (read-only credentials in `constants/keys.ts`) |

Client credentials are public by design and committed in `constants/keys.ts`; a build may override
them with `EXPO_PUBLIC_*` values, but overrides are validated against the live backend before they
are compiled in, and a privileged (service-role / secret) key is refused outright.

## Run

```
bun install          # or npm install
npx expo start
```

`npm run check` runs the type checker, the linter and the offline test suites.

## Android

```
npx expo run:android
```

An installable release APK comes from the **Build APK** GitHub Actions workflow, which validates the
client configuration, builds, then reads the configuration back out of the APK before publishing it.
Backend connectivity and the client/schema contract are checked by the **Hallyu Backend Health**
workflow.

The included `assets/` folder contains the brand, font and on-device visual assets.
