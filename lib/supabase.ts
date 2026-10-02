/**
 * Hallyu cloud client — managed Supabase Postgres (Rork cloud database).
 *
 * Identity is Rork Auth: the client never holds a Supabase session. The `accessToken` callback
 * feeds the Rork Auth JWT to every request, and server-side Row Level Security (via the JWT's
 * `sub`, exposed as `user_id()`) authorizes each row — the client cannot forge an identity.
 */
import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseAvailable } from '../constants/keys';

export type AccessTokenProvider = () => string | null;

let tokenProvider: AccessTokenProvider | null = null;

/**
 * Wire the live Rork Auth token into the client. Called once from AuthProvider at mount —
 * keep this module free of imports from lib/auth so nothing loads before the crash trap.
 */
export function setAccessTokenProvider(provider: AccessTokenProvider): void {
  tokenProvider = provider;
}

export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      // No Supabase sessions — Rork Auth owns identity; the JWT is attached per request.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    accessToken: async () => tokenProvider?.() ?? null,
  },
);

/** True when this build reaches the cloud (constants/keys.ts). */
export { supabaseAvailable };
