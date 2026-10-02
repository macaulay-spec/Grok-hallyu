/**
 * Media upload — the missing half of the compose → publish pipeline.
 *
 * A device recording is a `file://` URI. Postgres cannot store it, other members cannot fetch it,
 * and `supabaseBackend` refuses to insert local paths (it used to strip them silently, which is why
 * video posts "posted" and then lost their video — and why shorts, whose feed requires a video,
 * never appeared at all). Local media is therefore uploaded to the cloud's Storage bucket first and
 * the row keeps the resulting public URL.
 *
 * The transport is expo-file-system's binary upload: the file is streamed straight from disk, so a
 * 100 MB clip never lands in JS memory (no base64 round-trip).
 *
 * Availability: a bucket that does not exist is a configuration problem, not a network problem — it
 * is detected explicitly (`storageReady`) so the composer can tell the truth instead of queueing an
 * upload that can never succeed. Anything else (transient failure, RLS refusal, timeout) surfaces as
 * a typed BackendError so the outbox retries or the user sees the real reason.
 */
import * as FileSystem from 'expo-file-system';
import { MEDIA_BUCKET, SUPABASE_ANON_KEY, SUPABASE_URL } from '../constants/keys';
import { freshAccessToken } from './auth';
import { BackendError } from './data/backend';
import { uid } from './format';
import { supabase } from './supabase';

/** How long a single media transfer may take before it is reported as a failure. */
export const IMAGE_UPLOAD_TIMEOUT_MS = 60_000;
export const VIDEO_UPLOAD_TIMEOUT_MS = 240_000;

type StorageState = 'unknown' | 'ready' | 'missing';

let state: StorageState = 'unknown';
let checkedAt = 0;
const PROBE_TTL_MS = 5 * 60_000;

/** Public URL for a stored key (pure, no request). */
export function publicMediaUrl(key: string): string {
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(key).data.publicUrl;
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Is the cloud bucket actually there?
 *
 * The probe asks the public read route for an object that never exists. Supabase answers
 * "Object not found" for a bucket that exists and "Bucket not found" for one that does not; only
 * the second is treated as unavailability, and a network error is never cached (a device that is
 * offline must not permanently conclude that uploads are broken).
 */
export async function storageReady(force = false): Promise<boolean> {
  if (!force && state !== 'unknown' && Date.now() - checkedAt < PROBE_TTL_MS) return state === 'ready';
  const probe = `${SUPABASE_URL}/storage/v1/object/public/${MEDIA_BUCKET}/.hallyu-storage-probe`;
  try {
    const res = await fetchWithTimeout(probe, { headers: { apikey: SUPABASE_ANON_KEY } }, 8_000);
    const body = await res.text().catch(() => '');
    state = /bucket not found/i.test(body) ? 'missing' : 'ready';
    checkedAt = Date.now();
    return state === 'ready';
  } catch {
    // Offline or blocked: not evidence about the bucket. Leave the verdict unknown and let the
    // upload itself report the failure (and be retried by the outbox).
    return true;
  }
}

/** Force a fresh probe (after an upload reveals the bucket is gone). */
function markMissing(): void {
  state = 'missing';
  checkedAt = Date.now();
}

export function storageMissing(): boolean {
  return state === 'missing';
}

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  webm: 'video/webm',
  '3gp': 'video/3gpp',
};

function extensionOf(uri: string, kind: 'image' | 'video'): string {
  const match = /\.([A-Za-z0-9]{2,5})(?:\?|#|$)/.exec(uri);
  const ext = match?.[1]?.toLowerCase();
  if (ext && MIME[ext]) return ext;
  return kind === 'video' ? 'mp4' : 'jpg';
}

function publicUrlFor(key: string): string {
  return publicMediaUrl(key);
}

interface UploadErrorBody {
  error?: string;
  message?: string;
}

/** Turn a Storage response into the right kind of failure (retryable vs permanent, with a reason). */
function uploadFailure(status: number, body: string): BackendError {
  let detail = '';
  try {
    const parsed = JSON.parse(body) as UploadErrorBody;
    detail = parsed.message ?? parsed.error ?? '';
  } catch {
    detail = body.slice(0, 200);
  }
  if (/bucket not found/i.test(detail) || /bucket not found/i.test(body)) {
    markMissing();
    return new BackendError(`The cloud media bucket (“${MEDIA_BUCKET}”) is missing`, false, status);
  }
  if (status === 401 || status === 403) return new BackendError(detail || 'Media storage refused the upload', false, status);
  if (status === 408 || status === 413 || status === 429 || status >= 500)
    return new BackendError(detail || `Upload failed (HTTP ${status})`, true, status);
  return new BackendError(detail || `Upload failed (HTTP ${status})`, false, status);
}

export interface UploadedMedia {
  /** Public URL the database row stores. */
  url: string;
  /** Storage key (bucket-relative path), kept on the post so the file can be found again. */
  key: string;
}

/**
 * Upload one local file and return its public URL. `http(s)` URIs are already remote and pass
 * through untouched, so callers can run this over a mixed list safely.
 */
export async function uploadMedia(
  localOrRemoteUri: string,
  opts: { kind: 'image' | 'video'; ownerId: string; timeoutMs?: number },
): Promise<UploadedMedia> {
  if (/^https?:\/\//i.test(localOrRemoteUri)) return { url: localOrRemoteUri, key: '' };

  const token = await freshAccessToken();
  if (!token) throw new BackendError('Sign in to upload media', false);

  const ext = extensionOf(localOrRemoteUri, opts.kind);
  const key = `${opts.kind === 'video' ? 'videos' : 'images'}/${opts.ownerId}/${uid()}.${ext}`;
  const endpoint = `${SUPABASE_URL}/storage/v1/object/${MEDIA_BUCKET}/${key}`;
  const timeoutMs = opts.timeoutMs ?? (opts.kind === 'video' ? VIDEO_UPLOAD_TIMEOUT_MS : IMAGE_UPLOAD_TIMEOUT_MS);

  let result: FileSystem.FileSystemUploadResult;
  try {
    result = await withTimeout(
      FileSystem.uploadAsync(endpoint, localOrRemoteUri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': MIME[ext] ?? 'application/octet-stream',
          'cache-control': 'max-age=31536000',
          'x-upsert': 'false',
        },
      }),
      timeoutMs,
      opts.kind,
    );
  } catch (e) {
    if (e instanceof BackendError) throw e;
    throw new BackendError(`Could not upload the ${opts.kind} — check your connection`, true);
  }

  if (result.status < 200 || result.status >= 300) throw uploadFailure(result.status, result.body ?? '');
  return { url: publicUrlFor(key), key };
}

function withTimeout<T>(promise: Promise<T>, ms: number, kind: 'image' | 'video'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new BackendError(`The ${kind} upload timed out`, true)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
