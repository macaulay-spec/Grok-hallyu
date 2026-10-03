// Shared Supabase client for the Hallyu Edge Functions.
//
// Service-role credentials come from the function's own environment (set by `supabase secrets set`)
// or from the project's default Edge Function secrets. They are never read from the repository and
// never returned to a caller.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
export const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

export function adminClient(): SupabaseClient {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set as function secrets');
  }

  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-application-name': 'hallyu-edge' } },
  });
}

/**
 * Guards the function against an unauthenticated caller.
 *
 * With `verify_jwt = true` (config.toml) Supabase already rejects requests without a valid JWT. This
 * check is the second lock: the function only accepts the service role, so a signed-in member's JWT
 * is not enough to run maintenance.
 */
export function requireServiceRole(request: Request): { ok: true } | { ok: false; response: Response } {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';

  if (!token || token !== SERVICE_ROLE_KEY) {
    return { ok: false, response: new Response(JSON.stringify({ error: 'service role required' }), { status: 401 }) };
  }

  return { ok: true };
}