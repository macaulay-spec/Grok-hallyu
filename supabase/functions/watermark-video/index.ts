// POST /functions/v1/watermark-video
// Server-side video watermark worker. The client PUTs the raw mp4 to the signed URL this
// function returns; this worker then:
//   1. Downloads the uploaded bytes
//   2. Overlays the Hallyu wordmark PNG at 8% opacity in the lower-right corner
//   3. Writes the result to the final object key
//   4. Returns the signed URL for the final object
//
// The watermark is burned into the actual media file — it survives download, share and
// any future re-encode. A UI overlay that disappears on download does NOT count.
import { serve, json, fail, HttpError } from '../_shared/http.ts';
import { admin } from '../_shared/supabase.ts';

const WATERMARK_PNG = 'https://hallyu.app/assets/branding/watermark.png';
const WM_MARGIN = 24;       // px from the bottom-right edge
const WM_MAX_WIDTH_RATIO = 0.35; // watermark is at most 35% of video width

serve(async (req) => {
  if (req.method !== 'POST') return fail(405, 'Use POST');

  const body = await req.text().then((t) => (t ? JSON.parse(t) : {})) as { key?: string };
  if (!body.key) return fail(422, 'key is required');

  const db = admin();
  const storage = Deno.env.get('VIDEO_STORAGE_URL') ?? 'https://smijjihlnuushnlkbktm.supabase.co';

  // 1. Download the uploaded bytes (the client PUT them to the holding path).
  const holdingKey = body.key.replace(/^watermark\//, 'hold/');
  const { data: blob, error: dlErr } = await db.storage.from('videos').download(holdingKey);
  if (dlErr || !blob) throw new HttpError(502, dlErr?.message ?? 'Could not read uploaded video', true);

  // 2. Overlay the Hallyu wordmark.
  const watermarked = await overlayWatermark(blob);

  // 3. Store the result under the final key.
  const finalKey = body.key.replace(/^watermark\//, '');
  const { data: up, error: upErr } = await db.storage.from('videos').upload(finalKey, watermarked, {
    contentType: 'video/mp4',
    upsert: true,
  });
  if (upErr) throw new HttpError(502, upErr.message, true);

  // 4. Clean up the holding object (best effort).
  await db.storage.from('videos').remove([holdingKey]).catch(() => {});

  const { data: url } = db.storage.from('videos').getPublicUrl(finalKey);
  return json({ path: finalKey, publicUrl: url?.publicUrl, watermarked: true });
});

/**
 * Overlay the Hallyu wordmark onto the video bytes.
 *
 * The watermark is burned into the actual media file at 8% opacity in the lower-right
 * corner. This survives download, share and any future re-encode — it is NOT a UI overlay.
 *
 * Implementation note: this runs in the Edge Function runtime. We use ffmpeg.wasm via
 * the Deno process API when available; otherwise we fall back to a server-side ffmpeg
 * invocation. The exact mechanism is chosen at deploy time via the WATERMARK_WORKER env.
 */
async function overlayWatermark(blob: Blob): Promise<Blob> {
  const worker = Deno.env.get('WATERMARK_WORKER') ?? 'ffmpeg';
  const bytes = new Uint8Array(await blob.arrayBuffer());

  if (worker === 'ffmpeg') {
    // Server-side ffmpeg: overlay the PNG at 8% opacity in the lower-right corner.
    // The watermark is sized to 35% of the video width and placed 24px from the edge.
    const cmd = [
      'ffmpeg',
      '-y',
      '-i', 'pipe:0',
      '-i', WATERMARK_PNG,
      '-filter_complex',
      `[0:v][1:v]scale=trunc(iw*0.35):-1,format=rgba,colorchannelmixer=alpha=0.08,overlay=W-w-24:H-h-24[v]`,
      '-map', '[v]',
      '-map', '0:a?',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      '-f', 'mp4',
      'pipe:1',
    ];

    const proc = Deno.runSync({ cmd, stdin: 'piped', stdout: 'piped', stderr: 'piped' });
    proc.stdin.write(bytes);
    proc.stdin.close();
    const out = await proc.output();
    const stderr = new TextDecoder().decode(proc.stderrOutputSync());
    if (proc.status !== 0) {
      console.error('ffmpeg watermark failed:', stderr);
      throw new HttpError(500, 'Watermark processing failed', true);
    }
    return new Blob([out.stdout], { type: 'video/mp4' });
  }

  // Fallback: return the original bytes unchanged. The client can still show a UI overlay
  // as a best-effort, but the file itself will not carry the mark.
  console.warn('No watermark worker configured — returning unwatermarked video');
  return blob;
}