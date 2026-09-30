/**
 * Client configuration & public API keys.
 *
 * 1. TMDB read-only credentials (used by `lib/catalog.ts` for live 4-world catalog discovery).
 * 2. Lovable Cloud connection (`LOVABLE_CLOUD_URL` & `LOVABLE_CLOUD_ANON_KEY`).
 *    Production APKs get these from `EXPO_PUBLIC_LOVABLE_CLOUD_URL` / `EXPO_PUBLIC_LOVABLE_CLOUD_ANON_KEY`,
 *    which `.github/workflows/build-apk.yml` injects from GitHub Secrets at Expo build time
 *    (Metro inlines `process.env.EXPO_PUBLIC_*` into the JS bundle). When both are set,
 *    `lib/data/sync.ts` and `lib/auth.tsx` use `lovableBackend` (Lovable Cloud Auth + data).
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
const ENV_CLOUD_URL = env(process.env.EXPO_PUBLIC_LOVABLE_CLOUD_URL);
const ENV_CLOUD_KEY = env(process.env.EXPO_PUBLIC_LOVABLE_CLOUD_ANON_KEY);

/** Local/dev fallback pair (one backend). Only used when the build did not supply BOTH values. */
const FALLBACK_CLOUD_URL = 'https://c--1829371b-7ee9-4f4a-8408-8f045a1e362b-prod.lovable.cloud';
const FALLBACK_CLOUD_KEY = 'sb_publishable_yByktsPhjBMpcYv3W1A6Mw_tOdkI6dc';

// URL and key are taken as a pair — never mix a build-time key with the fallback URL (or vice
// versa), which authenticates against the wrong backend and makes every request fail.
const useEnvPair = Boolean(ENV_CLOUD_URL && ENV_CLOUD_KEY);

/** Lovable Cloud project URL (no trailing slash — supabase-js appends `/auth/v1`, `/rest/v1`). */
export const LOVABLE_CLOUD_URL = (useEnvPair ? (ENV_CLOUD_URL as string) : FALLBACK_CLOUD_URL).replace(/\/+$/, '');

/** Lovable Cloud publishable anon key. */
export const LOVABLE_CLOUD_ANON_KEY = useEnvPair ? (ENV_CLOUD_KEY as string) : FALLBACK_CLOUD_KEY;
