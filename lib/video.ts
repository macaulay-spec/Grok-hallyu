/**
 * Video posting pipeline.
 *
 * Video bytes live on a dedicated storage project (`VIDEO_STORAGE_URL` — the Rork cloud
 * backend), NOT on the Hallyu app database. The Hallyu database only keeps the ledger
 * (`media_uploads`) and enforces identity + quotas. Flow:
 *
 *   1. mint   — POST /functions/v1/video-upload on the storage project with the Hallyu JWT;
 *               the broker verifies the session, re-checks the daily quota, and returns a
 *               short-lived signed upload URL.
 *   2. PUT    — raw bytes via FileSystem.uploadAsync (BINARY_CONTENT), x-upsert so retries
 *               land on the same object (the object id is derived from the post id server-side).
 *   3. ledger — rpc register_media on the Hallyu DB; create_post's media_ready() then accepts
 *               the key for post_media.
 *
 * See docs/backend/10-video-storage.md.
 */
import * as FileSystem from 'expo-file-system';
import { VIDEO_STORAGE_URL } from '../constants/keys';
import { supabase } from './supabase';
import { BackendError } from './data/backend';

/** Daily cap mirrors api.upload_quota() — enforced again server-side. */
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024;

/** Feature flag from app_config (set true by migration 0005). */
export async function videoUploadsAvailable(): Promise<boolean> {
  const { data } = await supabase.from('app_config').select('value').eq('key', 'video_uploads').maybeSingle();
  return data?.value === true || data?.value === 'true';
}

/** Public playback URL for a ledgered video key (or the key itself when it is already a URL). */
export function videoUrl(key: string): string {
  if (key.startsWith('http')) return key;
  return `${VIDEO_STORAGE_URL}/storage/v1/object/public/videos/${key}`;
}

/** Upload one mp4 for post `postId`; returns the ledgered storage key (`video/{uid}/{ulid}.mp4`). */
export async function uploadVideo(asset: { uri: string; duration?: number; width?: number; height?: number }, postId: string): Promise<{ key: string }> {
  const { data: session } = await supabase.auth.getSession();
  const jwt = session.session?.access_token;
  if (!jwt) throw new BackendError('Sign in to upload video', false);

  const info = await FileSystem.getInfoAsync(asset.uri, { size: true });
  if (!info.exists) throw new BackendError('That video could not be read', false);
  const bytes = 'size' in info ? info.size : 0;
  if (bytes > VIDEO_MAX_BYTES) throw new BackendError('Videos are up to 100 MB — trim it and try again', false);

  // 1. Mint a signed upload URL (the broker derives a deterministic object id from the post id).
  const mint = await fetch(`${VIDEO_STORAGE_URL}/functions/v1/video-upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bytes, durationMs: Math.round((asset.duration ?? 0) * 1000), seed: postId }),
  }).catch(() => undefined);
  if (!mint?.ok) {
    const message = mint ? ((await mint.json().catch(() => ({}))) as { error?: string }).error : undefined;
    throw new BackendError(message ?? 'Video storage is unavailable — try again later', true);
  }
  const { path, token } = (await mint.json()) as { path: string; token: string };

  // 2. PUT the bytes (idempotent: x-upsert on the same signed path).
  const put = await FileSystem.uploadAsync(
    `${VIDEO_STORAGE_URL}/storage/v1/object/upload/sign/${path}?token=${encodeURIComponent(token)}`,
    asset.uri,
    {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { 'x-upsert': 'true', 'content-type': 'video/mp4' },
    },
  );
  if (put.status >= 400) throw new BackendError('Video upload failed — will retry', true);

  // 3. Ledger it on the Hallyu DB (create_post requires the ledger row).
  const { error } = await supabase.rpc('register_media', {
    p_key: path,
    p_kind: 'video',
    p_mime: 'video/mp4',
    p_bytes: bytes,
    p_width: asset.width ?? null,
    p_height: asset.height ?? null,
    p_duration_ms: Math.round((asset.duration ?? 0) * 1000),
  });
  if (error) throw new BackendError(error.message, true);
  return { key: path };
}
