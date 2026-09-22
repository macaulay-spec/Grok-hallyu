// POST /functions/v1/delete-account  {}   (user JWT)
// Google Play / App Store compliant in-app deletion: anonymise the profile, soft-delete content (30-day forensic window,
// then retention_sweep hard-deletes), drop the social graph + devices, remove the user's media objects, then delete the auth user.
import { json, limiter, serve, HttpError } from '../_shared/http.ts';
import { admin, requireUser, rpc, type Admin } from '../_shared/supabase.ts';

const perUser = limiter(3, 60 * 60 * 1000);
const BUCKET = 'media';

async function listAll(db: Admin, prefix: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(BUCKET).list(prefix, { limit: 1000, offset });
    if (error || !data?.length) break;
    for (const o of data) if (o.name) out.push(`${prefix}/${o.name}`);
    if (data.length < 1000) break;
  }
  return out;
}

serve(async (req) => {
  const user = await requireUser(req);
  perUser(user.id);
  const db = admin();

  // 1) database: anonymise + soft delete (returns media keys we own)
  const res = await rpc<{ ok: boolean; keys: string[] }>(db, 'account_anonymise', { p_uid: user.id });

  // 2) storage: everything under posts/{uid} and avatars/{uid} (+ any keys the DB knows about)
  const keys = new Set<string>(res.keys ?? []);
  for (const k of await listAll(db, `posts/${user.id}`)) keys.add(k);
  for (const k of await listAll(db, `avatars/${user.id}`)) keys.add(k);
  const list = [...keys].filter((k) => k.startsWith('posts/') || k.startsWith('avatars/'));
  for (let i = 0; i < list.length; i += 100) {
    const { error } = await db.storage.from(BUCKET).remove(list.slice(i, i + 100));
    if (error) console.warn('storage remove failed', error.message);
  }

  // 3) auth user (sessions die with it)
  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error && !/not found/i.test(error.message)) throw new HttpError(500, 'Could not delete the sign-in account — try again');

  return json({ ok: true, removedMedia: list.length });
});
