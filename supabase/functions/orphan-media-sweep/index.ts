// POST /functions/v1/orphan-media-sweep  {}   (internal: pg_cron daily at 4:17 AM, header x-internal-key)
// Drains the `media_delete` queue and deletes orphan media objects from Storage.
//
// An "orphan" is a media_uploads row whose key is no longer referenced by any active post's
// post_media row. The retention_sweep cron marks them 'deleted'; this function actually
// removes the bytes from the storage bucket and drops the ledger rows.
import { fail, json, serve } from '../_shared/http.ts';
import { admin, rpc } from '../_shared/supabase.ts';

const BUCKET = 'media';

serve(async (req) => {
  const db = admin();
  const expected = await rpc<string | null>(db, 'internal_key');
  const got = req.headers.get('x-internal-key') ?? '';
  if (!expected || got.length !== expected.length || !timingSafeEqual(got, expected)) return fail(401, 'Unauthorized', { retryable: false });

  // 1. Read the media_delete queue (messages enqueued by the media_enqueue_delete trigger).
  const msgs = await rpc<{ msgId: number; readCt: number; message: { key: string } }[]>(db, 'queue_read', { p_queue: 'media_delete', p_qty: 500, p_vt: 90 });
  if (!msgs.length) return json({ removed: 0, drained: 0 });

  const keys = [...new Set(msgs.map((m) => m.message?.key).filter(Boolean))];
  let removed = 0;

  // 2. Remove the objects from Storage (in batches of 100).
  for (let i = 0; i < keys.length; i += 100) {
    const chunk = keys.slice(i, i + 100);
    const { error } = await db.storage.from(BUCKET).remove(chunk);
    if (error) console.warn('storage remove failed', error.message);
    else removed += chunk.length;
  }

  // 3. Drop the ledger rows and the queue messages.
  if (keys.length) {
    await db.from('media_uploads').delete().in('key', keys);
  }
  const msgIds = msgs.map((m) => m.msgId);
  await rpc(db, 'queue_delete', { p_queue: 'media_delete', p_ids: msgIds });

  return json({ removed, drained: msgIds.length, keys });
});

function timingSafeEqual(a: string, b: string): boolean {
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}