/**
 * Client credentials wired into the app.
 *
 * This is the frontend-only build, so exactly one provider is configured: TMDB, which the drama and
 * actor catalog is read from directly by the client (lib/catalog.ts). The catalog token is a public,
 * read-only credential by design — it ships inside every installed bundle and cannot write to TMDB.
 * Rotate it at themoviedb.org → Settings → API and paste the new value.
 *
 * Supabase project URLs and publishable keys used to live here. They are not needed by the app any
 * more and have moved next to the code that consumed them: see `backend/supabase.ts`. Do not add
 * database or storage credentials back into this file — a bundle ships them to every device.
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
