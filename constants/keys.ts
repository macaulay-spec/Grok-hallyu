/**
 * Client configuration & public API keys.
 *
 * 1. TMDB read-only credentials (used by `lib/catalog.ts` for live 4-world catalog discovery).
 * 2. Hallyu cloud (Rork Cloudflare Worker + Durable Object database, `functions/`):
 *    - `RORK_FUNCTIONS_URL` — the app's own backend. Public fallback keeps every build
 *      (Rork CI, GitHub APK) pointed at the same cloud without secrets.
 *    - `RORK_AUTH_URL` / `RORK_APP_KEY` — Rork Auth (Google/Apple OAuth). Public values,
 *      injected at build time; sign-in degrades gracefully when absent.
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
const ENV_FUNCTIONS_URL = env(process.env.EXPO_PUBLIC_RORK_FUNCTIONS_URL);
const ENV_PROJECT_ID = env(process.env.EXPO_PUBLIC_PROJECT_ID);
const ENV_AUTH_URL = env(process.env.EXPO_PUBLIC_RORK_AUTH_URL);
const ENV_APP_KEY = env(process.env.EXPO_PUBLIC_RORK_APP_KEY);

/** Hallyu cloud backend (Worker + Durable Object). */
export const RORK_FUNCTIONS_URL = (ENV_FUNCTIONS_URL ?? 'https://app-ui-redesign-yws4ash-backend.rork.app').replace(/\/+$/, '');

/** True when the cloud backend is configured for this build. */
export const rorkBackendAvailable = !!RORK_FUNCTIONS_URL;

/** Rork Auth (Google / Apple OAuth). Both values required; absent → sign-in buttons degrade. */
export const RORK_PROJECT_ID = ENV_PROJECT_ID ?? 'sjrfbjtc53nefg7r7516j';
export const RORK_AUTH_URL = ENV_AUTH_URL;
export const RORK_APP_KEY = ENV_APP_KEY;
export const rorkAuthAvailable = !!(RORK_AUTH_URL && RORK_APP_KEY);

/** Deep-link scheme the OAuth browser redirects back into (registered in app.json). */
export const RORK_SCHEME = `rork-${RORK_PROJECT_ID}`;
