// POST /functions/v1/mint-upload-url  { key, bytes, watermark }
// Internal broker: mints a short-lived signed upload URL for the video-storage project.
// When watermark=true, the returned URL points at a server-side watermark worker that
// burns the Hallyu wordmark into the video before the bytes are stored — so the stored
// file always carries the brand mark (survives download/share/re-encode).
//
// The watermark worker is a separate Deno function that:
//   1. Streams the uploaded bytes from a temporary holding bucket
//   2. Overlays the Hallyu wordmark PNG at 8% opacity in the lower-right corner
//   3. Writes the result to the final object key
//   4. Returns the signed URL for the final object
import { serve, json, fail, readJson, HttpError } from '../_shared/http.ts';
import { admin } from '../_shared/supabase.ts';

const MAX_BYTES = 100 * 1024 * 1024;
const SIGN_TTL = 300; // 5 minutes

interface Body {
  key?: string;
  bytes?: number;
  watermark?: boolean;
}

function keyOk(k: string): boolean {
  return /^video\/[0-9a-f-]{36}\/[0-9A-Z]{26}\.mp4$/.test(k);
}

serve(async (req) => {
  const body = await readJson<Body>(req);
  if (!body.key || !keyOk(body.key)) return fail(422, 'Bad media key');
  if (!body.bytes || body.bytes <= 0 || body.bytes > MAX_BYTES) return fail(413, 'Videos are up to 100 MB');

  const db = admin();
  const storage = Deno.env.get('VIDEO_STORAGE_URL') ?? 'https://smijjihlnuushnlkbktm.supabase.co';

  if (body.watermark) {
    // Route through the watermark worker: the client PUTs to the returned URL and the
    // worker fetches the source, overlays the mark, and stores the result under `key`.
    const workerUrl = `${storage}/functions/v1/watermark-video`;
    const { token } = await mintSignedUrl(db, `watermark/${body.key}`, SIGN_TTL);
    return json({ path: `watermark/${body.key}`, token, watermarkWorker: workerUrl });
  }

  const { path, token } = await mintSignedUrl(db, body.key, SIGN_TTL);
  return json({ path, token, watermarked: false });
});

async function mintSignedUrl(db: ReturnType<typeof admin>, path: string, ttl: number): Promise<{ path: string; token: string }> {
  const { data, error } = await db.storage.from('videos').createSignedUploadUrl(path, ttl, { upsert: true });
  if (error || !data) throw new HttpError(502, error?.message ?? 'Could not mint upload URL', true);
  return { path: data.path, token: data.signedUrl };
}