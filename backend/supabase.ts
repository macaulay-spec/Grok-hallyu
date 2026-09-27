/**
 * PARKED BACKEND CONFIG — not imported by the app.
 *
 * This was `lib/supabase.ts`. When the product moved to a frontend-only demo build, the Supabase
 * client and its credentials came out of the app bundle and moved here, next to the only code that
 * used them. Nothing under `app/`, `components/` or `lib/` imports this file; it is excluded from
 * both tsconfig and ESLint. See backend/README.md for how to put it back.
 *
 * These values are the ones that were wired into the app. The publishable key is public-safe by
 * design (all data access was guarded by row-level security); a service-role key must never live
 * in a client bundle or in this repository.
 */
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

/** Hallyu backend #1 — auth + Postgres (PostgREST `api` schema). */
export const SUPABASE_URL = 'https://psmxekrmoltwabefgqpd.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_C6xEGHQxutS_ub-1ebuUDQ_TxVa_-v0';

/** Hallyu backend #2 — public `videos` bucket + upload broker. Bytes only; no tables, no auth. */
export const VIDEO_STORAGE_URL = 'https://smijjihlnuushnlkbktm.supabase.co';

/**
 * Backend #3 — a future private backend, intentionally INACTIVE and left unset. Video uploads only
 * redirected here when the primary project was exhausted. There were deliberately no defaults.
 */
export const BACKEND_3_URL: string | undefined = undefined;
export const BACKEND_3_ANON_KEY: string | undefined = undefined;

/** True once Backend #3 is configured — see the original constants/keys.ts note. */
export const BACKEND_3_READY = !!(BACKEND_3_URL && BACKEND_3_ANON_KEY);

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  // PostgREST exposed only the `api` schema (views + RPCs) — see docs/backend/08.
  db: { schema: 'api' },
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
