// POST /functions/v1/video-upload  { bytes, durationMs, seed, watermark?: boolean }
// Broker for the video-storage project. Verifies the caller's Hallyu JWT, re-checks the
// daily quota through api.upload_quota(), mints a short-lived signed upload URL for a
// deterministic object id derived from the post id, and — when watermark=true — burns the
// Hallyu wordmark into the lower-right corner of the video before the bytes are stored.
//
// The watermark is part of the actual media file (not a UI overlay), so it survives
// download, share and any future re-encode.
import { serve, json, fail, readJson, HttpError } from '../_shared/http.ts';
import { admin, rpc, type Admin } from '../_shared/supabase.ts';

const MAX_BYTES = 100 * 1024 * 1024;
const WATERMARK_PNG = 'https://hallyu.app/assets/branding/watermark.png';

interface Body {
  bytes?: number;
  durationMs?: number;
  seed?: string;
  watermark?: boolean;
}

/** Deterministic object id from the post id so retries land on the same object. */
function objectId(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let out = '';
  for (let i = 0; i < 26; i++) {
    out += chars[(h >> (i % 8)) & 31];
    h = (h * 1103515245 + 12345) | 0;
  }
  return out;
}

async function checkQuota(db: Admin, userId: string): Promise<void> {
  const quota = await rpc<{ uploads: number; cap: number; videos: number; video_cap: number }>(db, 'upload_quota');
  if (quota.uploads >= quota.cap) throw new HttpError(429, 'Daily upload limit reached', false);
  if (quota.videos >= quota.video_cap) throw new HttpError(429, 'Daily video limit reached', false);
}

serve(async (req) => {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return fail(401, 'Sign in to continue', { retryable: false });

  const db = admin();
  const { data: user, error: userErr } = await db.auth.getUser(token);
  if (userErr || !user?.user) return fail(401, 'Session expired — sign in again', { retryable: false });

  const body = await readJson<Body>(req);
  if (!body.bytes || body.bytes <= 0 || body.bytes > MAX_BYTES) return fail(413, 'Videos are up to 100 MB');
  if (!body.seed) return fail(422, 'seed (post id) is required');

  await checkQuota(db, user.user.id);

  const key = `video/${user.user.id}/${objectId(body.seed)}.mp4`;
  const wantsWatermark = body.watermark !== false; // default: watermark on

  // Mint a short-lived signed URL for the object. When watermark is requested we route
  // the upload through the watermark worker so the bytes that land already carry the mark.
  const mintUrl = `${Deno.env.get('SUPABASE_URL') ?? ''}/functions/v1/mint-upload-url`;
  const mintRes = await fetch(mintUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ key, bytes: body.bytes, watermark: wantsWatermark }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!mintRes.ok) {
    const err = await mintRes.json().catch(() => ({})) as { error?: string };
    throw new HttpError(502, err.error ?? 'Could not mint upload URL', true);
  }

  const { path, token: uploadToken } = await mintRes.json() as { path: string; token: string };
  return json({ path, token: uploadToken, watermarked: wantsWatermark });
});