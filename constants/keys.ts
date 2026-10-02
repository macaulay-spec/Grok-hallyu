/**
 * Client configuration & public API keys.
 *
 * 1. TMDB read-only credentials (used by `lib/catalog.ts` for live 4-world catalog discovery).
 * 2. Hallyu cloud (managed Supabase Postgres — Rork cloud database):
 *    - `SUPABASE_URL` / `SUPABASE_ANON_KEY` — the anon key is a public client credential; all
 *      authorization happens server-side through Row Level Security. Values ship as build-time
 *      fallbacks so every build (Rork CI, GitHub APK) points at the same cloud without secrets.
 * 3. Rork Auth (Google/Apple OAuth). Public values, injected at build time; sign-in degrades
 *    gracefully when absent.
 */
const env = (v: string | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};

/** TMDB v4 read access token (preferred — sent as `Authorization: Bearer`). */
export const TMDB_ACCESS_TOKEN =
  env(process.env.EXPO_PUBLIC_TMDB_ACCESS_TOKEN) ??
  'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJmZjAxZjI4ZmM1YzQ3NzkxZTI4MDM4MzQ5NDQ1YmY1OCIsIm5iZiI6MTc4OTAyMDA1Ny43NzksInN1YiI6IjZhYTI0Nzk5OGQ1YWFjZTczMzY2ODJkMyIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.ETon7kqWQjj7jtJJOXyRgAWme9Sh9B7OUrdAI61uuH8';

/** TMDB v3 API key (used as `?api_key=` when no v4 token is available). */
export const TMDB_API_KEY = env(process.env.EXPO_PUBLIC_TMDB_API_KEY) ?? 'ff01f28fc5c47791e28038349445bf58';

/**
 * Anything bundled into the APK can be read by anyone who installs it. A service-role / secret key
 * (or the old `service_role` JWT) must therefore never be accepted from the build environment, even
 * if CI is misconfigured — refuse it and fall back to the public client credential instead.
 * `c2VydmljZV9yb2xl` is base64("service_role"), which is what such a JWT's payload contains.
 */
function clientSafe(value: string | undefined, fallback: string, what: string): string {
  if (!value) return fallback;
  if (/^sb_secret_/i.test(value) || /service_role/.test(value) || /c2VydmljZV9yb2xl/.test(value)) {
    console.warn(`[hallyu] ignoring ${what}: a privileged key must never ship inside the app.`);
    return fallback;
  }
  return value;
}

/** Only ever accept the Rork cloud this app is built against; a foreign URL is a misconfiguration. */
function pinnedUrl(value: string | undefined, expected: string, what: string): string {
  if (!value) return expected;
  if (value.replace(/\/+$/, '') !== expected) {
    console.warn(`[hallyu] ignoring ${what} (“${value}”): this build targets ${expected}.`);
    return expected;
  }
  return expected;
}

const CLOUD_URL = 'https://mwgmzncsitgibbkhsktt.supabase.co';
const CLOUD_ANON_KEY = 'sb_publishable_k-MC7g7Wn-jXFtmki2DDGg_LuMOS8la';
const RORK_AUTH = 'https://api.rork.com';
const RORK_PROJECT = 'ss819xdajyzsa3znsyi9t';
const RORK_APP = 'rpk_9zghvnfx64mxp9u8ghn4sbe9pk0a4c3u';

// Must stay as literal `process.env.EXPO_PUBLIC_*` member expressions so Metro inlines them.
const ENV_SUPABASE_URL = env(process.env.EXPO_PUBLIC_SUPABASE_URL);
const ENV_SUPABASE_ANON_KEY = env(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
const ENV_PROJECT_ID = env(process.env.EXPO_PUBLIC_PROJECT_ID);
const ENV_AUTH_URL = env(process.env.EXPO_PUBLIC_RORK_AUTH_URL);
const ENV_APP_KEY = env(process.env.EXPO_PUBLIC_RORK_APP_KEY);
const ENV_MEDIA_BUCKET = env(process.env.EXPO_PUBLIC_MEDIA_BUCKET);

/** Hallyu cloud backend (managed Supabase Postgres + RLS). */
export const SUPABASE_URL = pinnedUrl(ENV_SUPABASE_URL, CLOUD_URL, 'EXPO_PUBLIC_SUPABASE_URL');
export const SUPABASE_ANON_KEY = clientSafe(ENV_SUPABASE_ANON_KEY, CLOUD_ANON_KEY, 'EXPO_PUBLIC_SUPABASE_ANON_KEY');

/** Storage bucket holding uploaded images, video posters and short video files. */
export const MEDIA_BUCKET = ENV_MEDIA_BUCKET ?? 'media';

/** True when the cloud backend is configured for this build. */
export const supabaseAvailable = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

/** Rork Auth (Google / Apple OAuth). Public client values, baked as fallbacks so every build
 * (Rork CI, GitHub APK) signs in without repo secrets. The project id must match the app key and
 * the registered deep-link scheme, so a foreign value is refused rather than trusted. */
export const RORK_PROJECT_ID = pinnedUrl(ENV_PROJECT_ID, RORK_PROJECT, 'EXPO_PUBLIC_PROJECT_ID');
export const RORK_AUTH_URL = pinnedUrl(ENV_AUTH_URL, RORK_AUTH, 'EXPO_PUBLIC_RORK_AUTH_URL');
export const RORK_APP_KEY = ENV_APP_KEY?.startsWith('rpk_') ? ENV_APP_KEY : RORK_APP;
export const rorkAuthAvailable = !!(RORK_AUTH_URL && RORK_APP_KEY);

/** Deep-link scheme the OAuth browser redirects back into (registered in app.json). */
export const RORK_SCHEME = `rork-${RORK_PROJECT_ID}`;
