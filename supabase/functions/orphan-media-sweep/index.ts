// POST /functions/v1/orphan-media-sweep  {}   (internal: pg_cron daily at 4:17, header x-internal-key)
//
// Two jobs, in order:
//   1. `api.orphan_media_sweep()` — marks ledger rows for media that no active post references
//      (plus the abandoned-upload rows retention_sweep already marked). Marking fires the
//      media_enqueue_delete trigger, which puts each key on the `media_delete` queue.
//   2. Drain that queue: delete the bytes from the bucket that actually owns the key, then drop
//      the ledger rows and the queue messages.
//
// Keys are routed by prefix: `video/…` lives in the `videos` bucket on the primary video-storage
// project, `b3/video/…` lives in the `videos` bucket on Backend #3 (the video-fallback project),
// `posts/…` and `avatars/…` live in the `media` bucket here (docs/backend/10-video-storage.md,
// docs/backend/BACKEND-3.md).
import { fail, json, serve } from '../_shared/http.ts';
import { admin, backend3, rpc, timingSafeEqual, videoStore } from '../_shared/supabase.ts';

const IMAGE_BUCKET = 'media';
const VIDEO_BUCKET = 'videos';
const BATCH = 100;

serve(async (req) => {
  const db = admin();
  const expected = await rpc<string | null>(db, 'internal_key');
  const got = req.headers.get('x-internal-key') ?? '';
  if (!expected || !timingSafeEqual(got, expected)) return fail(401, 'Unauthorized', { retryable: false });

  // 1. Mark anything the ledger knows about that no live post points at.
  const sweep = await rpc<{ marked?: number }>(db, 'orphan_media_sweep', { p_dry_run: false }).catch((e) => {
    console.warn('orphan_media_sweep failed', (e as Error).message);
    return {} as { marked?: number };
  });

  // 2. Drain the purge queue.
  const msgs = await rpc<{ msgId: number; readCt: number; message: { key: string } }[]>(db, 'queue_read', { p_queue: 'media_delete', p_qty: 500, p_vt: 90 });
  if (!msgs.length) return json({ marked: sweep.marked ?? 0, removed: 0, drained: 0 });

  const keys = [...new Set(msgs.map((m) => m.message?.key).filter((k): k is string => !!k))];
  const videos = keys.filter((k) => k.startsWith('video/'));
  // b3/ keys live on the Backend #3 project — strip the ledger prefix before removing there.
  const b3Videos = keys.filter((k) => k.startsWith('b3/video/')).map((k) => k.slice('b3/'.length));
  const images = keys.filter((k) => k.startsWith('posts/') || k.startsWith('avatars/'));

  let removed = 0;
  const remove = async (client: ReturnType<typeof videoStore>, bucket: string, list: string[]) => {
    for (let i = 0; i < list.length; i += BATCH) {
      const chunk = list.slice(i, i + BATCH);
      const { error } = await client.storage.from(bucket).remove(chunk);
      // Storage reports "not found" for objects that never landed; that is a success for a purge.
      if (error && !/not found|The resource does not exist/i.test(error.message)) console.warn(`remove ${bucket} failed`, error.message);
      else removed += chunk.length;
    }
  };
  if (videos.length) await remove(videoStore(), VIDEO_BUCKET, videos);
  if (b3Videos.length) await remove(backend3(), VIDEO_BUCKET, b3Videos);
  if (images.length) await remove(db, IMAGE_BUCKET, images);

  // 3. Drop the ledger rows and the queue messages so the next run does not redo the work.
  await db.from('media_uploads').delete().in('key', keys);
  await rpc(db, 'queue_delete', { p_queue: 'media_delete', p_ids: msgs.map((m) => m.msgId) });

  return json({ marked: sweep.marked ?? 0, removed, drained: msgs.length });
});
