/**
 * Video & media helper for Hallyu.
 *
 * Playable sources pass through unchanged: local (`file://`, `blob:`, `data:`, `content:`, `ph:`)
 * for offline/demo content and remote (`http://`, `https://`) for cloud content. Remote upload of
 * new media arrives with the storage milestone (see docs/CONTINUATION-ON-THIS-PROJECT.md).
 */

export const VIDEO_MAX_BYTES = 100 * 1024 * 1024;

export function videoUploadsAvailable(): boolean {
  return true;
}

/** Playable source for a stored video reference. */
export function videoUrl(key: string): string {
  if (!key) return key;
  return key;
}
