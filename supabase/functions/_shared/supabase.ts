// Supabase clients for Edge Functions. Data access goes through schema `api` only (see migrations).
//
// Two projects are involved (docs/backend/10-video-storage.md):
//   • Hallyu   — auth, Postgres, the `media` image bucket. This is what SUPABASE_URL points at.
//   • Video    — the object-storage project that owns the public `videos` bucket (Rork cloud).
// `video-upload` is deployed on the video project and still needs Hallyu identity + quota, so it
// reaches back through HALLYU_*. Every helper falls back to SUPABASE_* so a single-project
// deployment (or `supabase functions serve`) works without extra env.
import { createClient, type User } from 'npm:@supabase/supabase-js@2';
import { HttpError } from './http.ts';

const client = (url: string, key: string) =>
  createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'api' },
    global: { headers: { 'x-hallyu-fn': '1' } },
  });

/** Service-role client bound to schema `api` (bypasses RLS; RPCs still check `is_service_role()`). */
export type Admin = ReturnType<typeof client>;

const url = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/** Service-role client for the project this function is deployed on. */
export const admin = (): Admin => client(url, serviceKey);

/**
 * Service-role client for the Hallyu database (identity, quota, ledger). Falls back to `admin()`
 * when HALLYU_* is unset, i.e. when the function already runs on the Hallyu project.
 */
export const hallyu = (): Admin => {
  const hUrl = Deno.env.get('HALLYU_SUPABASE_URL');
  const hKey = Deno.env.get('HALLYU_SERVICE_ROLE_KEY');
  return hUrl && hKey ? client(hUrl, hKey) : admin();
};

/**
 * Service-role client for the project that owns the `videos` bucket. Falls back to `admin()` when
 * VIDEO_STORAGE_* is unset, i.e. when video bytes live on the Hallyu project itself.
 */
export const videoStore = (): Admin => {
  const vUrl = Deno.env.get('VIDEO_STORAGE_URL');
  const vKey = Deno.env.get('VIDEO_STORAGE_SERVICE_ROLE_KEY');
  return vUrl && vKey ? client(vUrl, vKey) : admin();
};

/** Resolve the calling user from the Authorization header; 401 when missing/invalid. */
export async function requireUser(req: Request, db: Admin = hallyu()): Promise<User> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'Sign in to continue', false);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Session expired — sign in again', false);
  return data.user;
}

/** Call an `api.*` RPC with the service role and turn PostgREST errors into HttpErrors. */
export async function rpc<T>(db: Admin, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db.rpc(fn, args as never);
  if (error) {
    const m = /^PT(\d{3})$/.exec(error.code ?? '');
    throw new HttpError(m ? Number(m[1]) : 500, error.message || 'Database error');
  }
  return data as T;
}

/** Constant-time compare for the shared pg_cron → Edge Function key (never short-circuits). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
