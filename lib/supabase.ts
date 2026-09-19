import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

// Env vars win (CI/local overrides); baked-in fallbacks keep every
// release build connected. The publishable key is public-safe by
// design — all data access is guarded by RLS policies.
export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://psmxekrmoltwabefgqpd.supabase.co';
export const SUPABASE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'sb_publishable_C6xEGHQxutS_ub-1ebuUDQ_TxVa_-v0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
