/**
 * Video posting pipeline.
 *
 * Video bytes live on dedicated storage projects, NOT on the Hallyu app database. Backend #2
 * (`VIDEO_STORAGE_URL`) is the primary project; Backend #3 (`BACKEND_3_URL`) is the fallback that
 * automatically takes over when the primary is exhausted or unavailable. The Hallyu database only
 * keeps the ledger (`media_uploads`) and enforces identity + quotas. Flow:
 *
 *   1. mint   — POST /functions/v1/video-upload on the storage project with the Hallyu JWT; the
 *               broker verifies the session, re-checks the daily quota, and returns a short-lived
 *               signed upload URL for a deterministic object id derived from the post id.
 *   2. PUT    — raw bytes via FileSystem.uploadAsync (BINARY_CONTENT), x-upsert so retries land on
 *               the same object.
 *   3. ledger — rpc register_media on the Hallyu DB; create_post's media_ready() then accepts the
 *               key for post_media.
 *
 * Fallback routing: keys stored on Backend #3 are ledgered with a `b3/` prefix
 * (`b3/video/{uid}/{ulid}.mp4`), so playback URLs, download ledger and purge sweeps all resolve to
 * the project that actually owns the bytes. No client code anywhere else needs to know.
 *
 * Device-side downloads / saves and the watermark compositor live in `lib/media.ts` (kept separate
 * so they can pull in the image libraries without bloating this module).
 *
 * See docs/backend/10-video-storage.md and docs/backend/BACKEND-3.md.
 */
import * as FileSystem from 'expo-file-system';
import { BACKEND_3_ANON_KEY, BACKEND_3_READY, BACKEND_3_URL, VIDEO_STORAGE_URL } from '../constants/keys';
import { BackendError } from './data/backend';
import { supabase } from './supabase';

/** Daily cap mirrors api.upload_quota() — enforced again server-side. */
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024;

const B3_PREFIX = 'b3/';

/** Feature flag from app_config (set true by migration 0005). */
export async function videoUploadsAvailable(): Promise<boolean> {
  const { data } = await supabase.from('app_config').select('value').eq('key', 'video_uploads').maybeSingle();
  return data?.value === true || data?.value === 'true';
}

/** Public playback URL for a ledgered video key (`b3/…` resolves on Backend #3, the rest on #2). */
export function videoUrl(key: string): string {
  if (key.startsWith('http')) return key;
  if (key.startsWith(B3_PREFIX)) {
    if (!BACKEND_3_URL) return key; // unconfigured — surface the ledger key rather than a dead URL
    return `${BACKEND_3_URL}/storage/v1/object/public/videos/${key.slice(B3_PREFIX.length)}`;
  }
  return `${VIDEO_STORAGE_URL}/storage/v1/object/public/videos/${key}`;
}

interface MintBody {
  bytes: number;
  durationMs: number;
  seed: string;
}

type Project = 'primary' | 'b3';

interface Minted {
  project: Project;
  path: string;
  token: string;
}

/** Ask a storage project's broker for a signed upload URL. Network/5xx are retryable by shape. */
async function mint(project: Project, body: MintBody, jwt: string): Promise<Minted> {
  const base = project === 'b3' ? BACKEND_3_URL! : VIDEO_STORAGE_URL;
  const anonKey = project === 'b3' ? BACKEND_3_ANON_KEY : undefined;
  const res = await fetch(`${base}/functions/v1/video-upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      ...(anonKey ? { apikey: anonKey } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }).catch(() => undefined);
  if (!res?.ok) {
    const payload = res ? ((await res.json().catch(() => ({}))) as { error?: string; retryable?: boolean }) : undefined;
    const message = payload?.error ?? (res ? `Video storage is unavailable (HTTP ${res.status})` : 'Video storage is unreachable — check your connection');
    // The broker flags hard quota failures as retryable:false; network holes and 5xx are retryable.
    const retryable = payload?.retryable ?? (!res || res.status === 429 || res.status >= 500);
    throw new BackendError(message, retryable, res?.status);
  }
  const { path, token } = (await res.json()) as { path: string; token: string };
  return { project, path, token };
}

/** PUT the raw bytes to a signed upload path (idempotent: x-upsert on the same object). */
async function putBytes(project: Project, minted: Minted, uri: string): Promise<void> {
  const base = project === 'b3' ? BACKEND_3_URL! : VIDEO_STORAGE_URL;
  const put = await FileSystem.uploadAsync(`${base}/storage/v1/object/upload/sign/${minted.path}?token=${encodeURIComponent(minted.token)}`, uri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { 'x-upsert': 'true', 'content-type': 'video/mp4' },
  });
  if (put.status >= 400) throw new BackendError('Video upload failed — will retry', true, put.status);
}

/** Upload one mp4 for post `postId`; returns the ledgered storage key (with a `b3/` prefix when it landed on Backend #3). */
export async function uploadVideo(asset: { uri: string; duration?: number; width?: number; height?: number }, postId: string): Promise<{ key: string }> {
  const { data: session } = await supabase.auth.getSession();
  const jwt = session.session?.access_token;
  if (!jwt) throw new BackendError('Sign in to upload video', false);

  const info = await FileSystem.getInfoAsync(asset.uri, { size: true });
  if (!info.exists) throw new BackendError('That video could not be read', false);
  const bytes = 'size' in info ? info.size : 0;
  if (bytes > VIDEO_MAX_BYTES) throw new BackendError('Videos are up to 100 MB — trim it and try again', false);

  const body: MintBody = { bytes, durationMs: Math.round((asset.duration ?? 0) * 1000), seed: postId };

  // Primary storage first. When it is full or unreachable and Backend #3 is configured, the upload
  // redirects there automatically. Quota rejections (429, deliberate per-account rules) do NOT
  // fall back — the Hallyu ledger would refuse the key afterwards anyway.
  let project: Project = 'primary';
  let minted: Minted;
  try {
    minted = await mint('primary', body, jwt);
  } catch (primaryError) {
    const retryable = primaryError instanceof BackendError && primaryError.retryable;
    if (!BACKEND_3_READY || !retryable) throw primaryError;
    project = 'b3';
    minted = await mint('b3', body, jwt).catch(() => {
      throw primaryError; // keep the primary's message — it describes the real failure
    });
  }

  try {
    await putBytes(project, minted, asset.uri);
  } catch (putError) {
    // A 5xx PUT usually means the bucket is full or the project is degraded — same redirect rule.
    const fallback = project === 'primary' && BACKEND_3_READY && putError instanceof BackendError && (putError.status ?? 0) >= 500;
    if (!fallback) throw putError;
    project = 'b3';
    minted = await mint('b3', body, jwt).catch(() => {
      throw putError;
    });
    await putBytes('b3', minted, asset.uri);
  }

  // Ledger it on the Hallyu DB (create_post requires the ledger row; keys may carry the b3/ prefix).
  const key = project === 'b3' ? `${B3_PREFIX}${minted.path}` : minted.path;
  const { error } = await supabase.rpc('register_media', {
    p_key: key,
    p_kind: 'video',
    p_mime: 'video/mp4',
    p_bytes: bytes,
    p_width: asset.width ?? null,
    p_height: asset.height ?? null,
    p_duration_ms: Math.round((asset.duration ?? 0) * 1000),
  });
  if (error) throw new BackendError(error.message, true);
  return { key };
}
