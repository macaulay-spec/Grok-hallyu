/**
 * Client credentials wired into the app.
 *
 * Everything here is a public, read-only client credential by design (it ships inside every
 * installed bundle, exactly like the Supabase publishable key). Nothing here can write to TMDB or
 * bypass Supabase RLS. Rotate at themoviedb.org → Settings → API and paste the new value.
 *
 * An `EXPO_PUBLIC_*` variable overrides a value ONLY when it is non-empty — CI and copied
 * `.env.example` files often define the variable as an empty string, which must not blank the key.
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

/** Hallyu backend (auth + Postgres). The HALYU_ prefix keeps these distinct from the video-storage project's generic EXPO_PUBLIC_SUPABASE_* names. */
export const SUPABASE_URL = env(process.env.EXPO_PUBLIC_HALYU_SUPABASE_URL) ?? 'https://psmxekrmoltwabefgqpd.supabase.co';
export const SUPABASE_ANON_KEY = env(process.env.EXPO_PUBLIC_HALYU_SUPABASE_ANON_KEY) ?? 'sb_publishable_C6xEGHQxutS_ub-1ebuUDQ_TxVa_-v0';

/** Video-storage project (Rork cloud): owns the public `videos` bucket + video-upload broker. Bytes only — no tables, no auth. */
export const VIDEO_STORAGE_URL = env(process.env.EXPO_PUBLIC_SUPABASE_URL) ?? 'https://smijjihlnuushnlkbktm.supabase.co';
