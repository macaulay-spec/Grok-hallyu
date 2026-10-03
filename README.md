# Hallyu

Full Expo + React Native + TypeScript rebuild of Hallyu, following the approved cinematic black/magenta UI direction.

## Backend

There is no backend in this build: no Supabase, Rork or Firebase connection, no credentials, no
migrations. The TMDB catalog credential ships in `constants/keys.ts`; set `.env` values only to
override it. A backend is a separate, later phase.

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

An installable release APK comes from the **Build APK** GitHub Actions workflow, which builds and
reads the configuration back out of the APK before publishing it.

The included `assets/` folder contains the brand, font and on-device visual assets.
