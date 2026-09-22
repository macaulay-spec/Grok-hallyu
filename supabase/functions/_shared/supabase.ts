// Supabase clients for Edge Functions. Data access goes through schema `api` only (see migrations).
import { createClient, type User } from 'npm:@supabase/supabase-js@2';
import { HttpError } from './http.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/** Service-role client bound to schema `api` (bypasses RLS; RPCs still check `is_service_role()`). */
export const admin = () =>
  createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false }, db: { schema: 'api' }, global: { headers: { 'x-hallyu-fn': '1' } } });
export type Admin = ReturnType<typeof admin>;

/** Resolve the calling user from the Authorization header; 401 when missing/invalid. */
export async function requireUser(req: Request): Promise<User> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'Sign in to continue', false);
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Session expired — sign in again', false);
  return data.user;
}

/** Call an `api.*` RPC with the service role and turn PostgREST errors into HttpErrors. */
export async function rpc<T>(client: Admin, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) {
    const m = /^PT(\d{3})$/.exec(error.code ?? '');
    throw new HttpError(m ? Number(m[1]) : 500, error.message || 'Database error');
  }
  return data as T;
}
