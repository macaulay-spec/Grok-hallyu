// POST /functions/v1/delete-account  {}   (user JWT)
// Google Play / App Store compliant in-app deletion: anonymise the profile, soft-delete content (30-day forensic window,
// then retention_sweep hard-deletes), drop the social graph + devices, remove the user's media objects, then delete the auth user.
//
// Media spans two projects (docs/backend/10-video-storage.md): images/avatars in the `media` bucket here,
// video bytes in the `videos` bucket on the video-storage project. Both are swept — account deletion must
// not leave a member's clips behind.
import { json, limiter, serve, HttpError } from '../_shared/http.ts';
import { admin, hallyu, requireUser, rpc, videoStore, type Admin } from '../_shared/supabase.ts';

const perUser = limiter(3, 60 * 60 * 1000);

async function listAll(db: Admin, bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error || !data?.length) break;
    for (const o of data) if (o.name) out.push(`${prefix}/${o.name}`);
    if (data.length < 1000) break;
  }
  return out;
}

async function removeAll(db: Admin, bucket: string, keys: string[]): Promise<number> {
  let n = 0;
  for (let i = 0; i < keys.length; i += 100) {
    const { error } = await db.storage.from(bucket).remove(keys.slice(i, i + 100));
    if (error && !/not found|The resource does not exist/i.test(error.message)) console.warn(`storage remove ${bucket} failed`, error.message);
    else n += Math.min(100, keys.length - i);
  }
  return n;
}

serve(async (req) => {
  const user = await requireUser(req);
  perUser(user.id);
  const db = admin();

  // 1) database: anonymise + soft delete (returns every media key the ledger attributes to this member)
  const res = await rpc<{ ok: boolean; keys: string[] }>(db, 'account_anonymise', { p_uid: user.id });

  // 2) storage: everything under this member's folders, on both projects, unioned with the ledger's keys
  const owned = new Set<string>(res.keys ?? []);
  for (const k of await listAll(db, 'media', `posts/${user.id}`)) owned.add(k);
  for (const k of await listAll(db, 'media', `avatars/${user.id}`)) owned.add(k);
  const vids = videoStore();
  for (const k of await listAll(vids, 'videos', `video/${user.id}`)) owned.add(k);

  const images = [...owned].filter((k) => k.startsWith('posts/') || k.startsWith('avatars/'));
  const videos = [...owned].filter((k) => k.startsWith('video/'));
  const removedImages = await removeAll(db, 'media', images);
  const removedVideos = await removeAll(vids, 'videos', videos);

  // 3) auth user (sessions die with it)
  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error && !/not found/i.test(error.message)) throw new HttpError(500, 'Could not delete the sign-in account — try again');

  return json({ ok: true, removedMedia: removedImages + removedVideos, removedImages, removedVideos });
});
