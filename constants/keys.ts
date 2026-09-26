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

/**
 * Backend #3 — FUTURE private backend (preparation only, intentionally INACTIVE).
 *
 * Nothing in the app reads these yet: Hallyu keeps using Backend #1 (auth + Postgres) and
 * Backend #2 (video storage) exactly as before. They exist so a future migration can be wired
 * without re-plumbing config once the provider ("Supa Naija") supplies the project and keys.
 *
 * SECURITY: only the public URL and the publishable (anon) key may ever live in the client — both
 * are safe to ship, like the Supabase publishable key. The service-role key is SERVER-SIDE ONLY and
 * must NEVER be added here, imported into app code, or bundled into the APK. It belongs in a
 * server/CI secret (e.g. a GitHub Actions secret), never in this file or the repo.
 *
 * See docs/backend/BACKEND-3.md. There are deliberately NO hard-coded defaults: they stay empty
 * until the provider provides real values.
 */
export const BACKEND_3_URL = env(process.env.EXPO_PUBLIC_BACKEND_3_URL);
export const BACKEND_3_ANON_KEY = env(process.env.EXPO_PUBLIC_BACKEND_3_ANON_KEY);

/**
 * True once Backend #3 is fully configured (URL + publishable key). While true, video uploads
 * automatically redirect here when the primary video storage (Backend #2) is exhausted or
 * unavailable — see lib/video.ts. With no configuration the app behaves exactly as before and
 * Backend #2 remains the only video destination.
 */
export const BACKEND_3_READY = !!(BACKEND_3_URL && BACKEND_3_ANON_KEY);

/**
 * Google Sign-In OAuth client IDs (Firebase Auth → Google provider).
 *
 * These are PUBLIC identifiers (they ship in the bundle by design, like the Firebase web API
 * key — an OAuth client ID authenticates nothing by itself; the signed id_token does).
 *
 * - WEB client: used by `expo start --web` (popup flow) and as the identity-provider client for
 *   Firebase credential exchange. Defaults to the project's own web client.
 * - ANDROID client: REQUIRED for native Google Sign-In. Create it in Google Cloud Console →
 *   Credentials → OAuth client ID → Android, with package `com.hallyu.app` and the SHA-1 of the
 *   signing key (debug: `cd android && ./gradlew signingReport`; release: the upload key).
 *   Until it is set, native Google sign-in reports a clear "not configured" error instead of
 *   pretending to work — see lib/googleAuth.ts.
 * - IOS client: same, for a future iOS build (bundle id `com.hallyu.app`).
 */
export const GOOGLE_WEB_CLIENT_ID =
  env(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) ??
  '490855512954-au8e3sco0ru4ptuquadt5qp9ua9flppm.apps.googleusercontent.com';
export const GOOGLE_ANDROID_CLIENT_ID = env(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID);
export const GOOGLE_IOS_CLIENT_ID = env(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID);

