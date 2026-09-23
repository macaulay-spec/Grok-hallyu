// POST /functions/v1/video-upload  { bytes, durationMs, seed }
// Broker for the video-storage project (deployed there; see docs/backend/10-video-storage.md).
//
//   1. Verifies the caller's Hallyu JWT against the Hallyu auth server.
//   2. Re-checks the daily quota through api.upload_quota() on the Hallyu DB (RLS-free, service role).
//   3. Mints a short-lived signed upload URL for a deterministic object id derived from the post id,
//      so sync-engine retries PUT to the same object (x-upsert) instead of orphaning a new one.
//
// The client then PUTs the bytes and calls api.register_media() on the Hallyu DB, which re-validates
// ownership (`video/{uid}/…`), mime, size and quota. Nothing here trusts the client's numbers.
//
// Branding: the Hallyu mark is burned into the poster that every video post must carry, on-device,
// before upload (lib/watermark.ts) — see migration 0007 and docs/backend/10-video-storage.md for why
// the video track itself is not re-encoded here (Edge Runtime has no transcoder: 2 s CPU / 256 MB,
// no subprocess, no ffmpeg binary).
import { serve, json, fail, readJson } from '../_shared/http.ts';
import { admin, hallyu, rpc } from '../_shared/supabase.ts';

const MAX_BYTES = 100 * 1024 * 1024;
const BUCKET = 'videos';

interface Body {
  bytes?: number;
  durationMs?: number;
  seed?: string;
}

/**
 * Deterministic, collision-resistant object id from the post id (a UUID). We hash with FNV-1a into
 * two 32-bit lanes and emit 26 base32 chars — the shape api.register_media() validates.
 */
function objectId(seed: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c + i, 0x85ebca6b) >>> 0;
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let out = '';
  let a = h1;
  let b = h2;
  for (let i = 0; i < 26; i++) {
    a = (Math.imul(a, 1103515245) + 12345) >>> 0;
    b = (Math.imul(b ^ (a >>> 16), 2654435761) + i) >>> 0;
    out += chars[(a >>> (i % 27)) & 31] ?? chars[(b >>> 7) & 31];
  }
  return out;
}

serve(async (req) => {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return fail(401, 'Sign in to continue', { retryable: false });

  // Identity + quota live on the Hallyu project; the signed URL is minted on the project we run on.
  const db = hallyu();
  const { data: user, error: userErr } = await db.auth.getUser(token);
  if (userErr || !user?.user) return fail(401, 'Session expired — sign in again', { retryable: false });

  const body = await readJson<Body>(req);
  if (!body.bytes || body.bytes <= 0 || body.bytes > MAX_BYTES) return fail(413, 'Videos are up to 100 MB');
  // The seed must be a UUID: it becomes the storage key, so it is never client-chosen free text.
  if (!body.seed || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.seed)) return fail(422, 'seed (post id) is required');

  const quota = await rpc<{ uploads: number; cap: number; videos: number; video_cap: number }>(db, 'upload_quota');
  if (quota.uploads >= quota.cap) return fail(429, 'Daily upload limit reached', { retryable: false });
  if (quota.videos >= quota.video_cap) return fail(429, 'Daily video limit reached', { retryable: false });

  const path = `video/${user.user.id}/${objectId(body.seed)}.mp4`;
  const { data, error } = await admin().storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (error || !data?.token) return fail(502, error?.message ?? 'Could not mint upload URL', { retryable: true });

  // `token` (not `signedUrl`) is what the client appends as ?token= on the sign endpoint.
  return json({ path: data.path, token: data.token });
});
