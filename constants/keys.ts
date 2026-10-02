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

// Must stay as literal `process.env.EXPO_PUBLIC_*` member expressions so Metro inlines them.
const ENV_SUPABASE_URL = env(process.env.EXPO_PUBLIC_SUPABASE_URL);
const ENV_SUPABASE_ANON_KEY = env(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
const ENV_PROJECT_ID = env(process.env.EXPO_PUBLIC_PROJECT_ID);
const ENV_AUTH_URL = env(process.env.EXPO_PUBLIC_RORK_AUTH_URL);
const ENV_APP_KEY = env(process.env.EXPO_PUBLIC_RORK_APP_KEY);

/** Hallyu cloud backend (managed Supabase Postgres + RLS). */
export const SUPABASE_URL = ENV_SUPABASE_URL ?? 'https://mwgmzncsitgibbkhsktt.supabase.co';
export const SUPABASE_ANON_KEY = ENV_SUPABASE_ANON_KEY ?? 'sb_publishable_k-MC7g7Wn-jXFtmki2DDGg_LuMOS8la';

/** True when the cloud backend is configured for this build. */
export const supabaseAvailable = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

/** Rork Auth (Google / Apple OAuth). Public client values, baked as fallbacks so every build
 * (Rork CI, GitHub APK) signs in without repo secrets. */
export const RORK_PROJECT_ID = ENV_PROJECT_ID ?? 'ss819xdajyzsa3znsyi9t';
export const RORK_AUTH_URL = ENV_AUTH_URL ?? 'https://api.rork.com';
export const RORK_APP_KEY = ENV_APP_KEY ?? 'rpk_9zghvnfx64mxp9u8ghn4sbe9pk0a4c3u';
export const rorkAuthAvailable = !!(RORK_AUTH_URL && RORK_APP_KEY);

/** Deep-link scheme the OAuth browser redirects back into (registered in app.json). */
export const RORK_SCHEME = `rork-${RORK_PROJECT_ID}`;
