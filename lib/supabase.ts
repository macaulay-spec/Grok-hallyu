import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL as SUPABASE_URL_KEY } from '../constants/keys';

// Credentials live in constants/keys.ts (wired into the app; env overrides only when non-empty).
// The publishable key is public-safe by design — all data access is guarded by RLS policies.
export const SUPABASE_URL = SUPABASE_URL_KEY;
export const SUPABASE_KEY = SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
