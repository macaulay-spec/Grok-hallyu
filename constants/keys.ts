/**
 * Client configuration & public API keys.
 *
 * 1. TMDB read-only credentials (used by `lib/catalog.ts` for live 4-world catalog discovery).
 * 2. Lovable Cloud connection placeholders (`LOVABLE_CLOUD_URL` & `LOVABLE_CLOUD_ANON_KEY`).
 *    Leave them empty during local/demo mode; once your Lovable Cloud project is provisioned,
 *    set `EXPO_PUBLIC_LOVABLE_CLOUD_URL` and `EXPO_PUBLIC_LOVABLE_CLOUD_ANON_KEY` (or fill them
 *    in below) and `lib/data/sync.ts` will automatically switch from `demoBackend` to
 *    `lovableBackend`.
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

/** Lovable Cloud project URL (unwired placeholder until your Lovable Cloud backend is connected). */
export const LOVABLE_CLOUD_URL = env(process.env.EXPO_PUBLIC_LOVABLE_CLOUD_URL) ?? 'https://c--1829371b-7ee9-4f4a-8408-8f045a1e362b-prod.lovable.cloud';

/** Lovable Cloud publishable anon key (unwired placeholder until your Lovable Cloud backend is connected). */
export const LOVABLE_CLOUD_ANON_KEY = env(process.env.EXPO_PUBLIC_LOVABLE_CLOUD_ANON_KEY) ?? 'sb_publishable_yByktsPhjBMpcYv3W1A6Mw_tOdkI6dc';
