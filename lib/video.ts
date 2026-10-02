/**
 * Video & media helper for Hallyu.
 *
 * Playable sources pass through unchanged: local (`file://`, `blob:`, `data:`, `content:`, `ph:`)
 * while composing, remote (`http://`, `https://`) once uploaded. Publishing needs the cloud to
 * accept the file: `lib/storage.ts` uploads it to the backend's Storage bucket and the row keeps the
 * public URL.
 *
 * `videoUploadsAvailable()` is the composer's honesty gate. It asks the bucket whether it is really
 * there (a cached, non-blocking probe) so the UI can refuse to attach a clip it could never publish —
 * instead of accepting one and silently dropping it at insert time, which is what made a short look
 * "posted" while its video never left the device.
 */
import { publicMediaUrl, storageReady } from './storage';

export const VIDEO_MAX_BYTES = 100 * 1024 * 1024;

/**
 * Can the cloud accept a video right now? False when the media bucket is confirmed missing (a
 * backend configuration problem the composer must explain). An unreachable network is *not* treated
 * as "unavailable": the clip is accepted, the outbox retries, and a real failure is reported.
 */
export async function videoUploadsAvailable(): Promise<boolean> {
  return storageReady();
}

/** Playable source for a stored video reference (uploads store absolute URLs; older rows may not). */
export function videoUrl(key: string): string {
  if (!key) return key;
  if (/^(https?:|file:|content:|ph:|blob:|data:)/.test(key)) return key;
  return publicMediaUrl(key);
}
