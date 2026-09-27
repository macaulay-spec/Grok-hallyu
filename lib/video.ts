/**
 * Video, without a video backend.
 *
 * The server-backed build uploaded an mp4 to object storage and ledgered the key. With no backend the
 * device *is* the storage: a post's video is the local file URI captured by the picker, which plays
 * straight from disk and survives in the persisted store. That keeps the whole create → post → watch
 * loop exercisable offline.
 *
 * Re-attaching real storage means implementing `uploadVideo` again and swapping the identity
 * `videoUrl` for a key→public-URL mapping; the previous implementation is parked as
 * `backend/video-upload.ts`.
 */

/** Local cap, kept in step with the picker's UI copy. */
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024;

/**
 * Can this build carry video posts? Always — no bucket, no quota, no ledger to consult. Note this is
 * synchronous on purpose: the create screen checks it before choosing the video path, and an async
 * check there would always look constructible.
 */
export function videoUploadsAvailable(): boolean {
  return true;
}

/**
 * Playable source for a stored video reference.
 *
 * There is no storage key namespace to resolve any more: posts hold either a remote URL from a
 * server-backed build or a local file URI from this one. Both are already sources, so this is an
 * identity function — which also means the existing call sites
 * (`url.startsWith('http') ? url : videoUrl(url)`) keep working unchanged for both cases.
 */
export function videoUrl(key: string): string {
  return key;
}
