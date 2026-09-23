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
 * The watermark is burned into the actual media file by the watermark-video worker, so it
 * survives download, share and any future re-encode. It is NOT a UI overlay.
 *
 * See docs/backend/10-video-storage.md.
 */
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';
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

/**
 * Download a video to the device. Returns the local file URI.
 * Handles Android permissions, duplicate-download prevention, network failures,
 * loading/progress states, and interrupted-download recovery.
 */
export interface DownloadOptions {
  uri: string;
  filename?: string;
  onProgress?: (progress: { loaded: number; total: number; percent: number }) => void;
  signal?: AbortSignal;
}

export async function downloadVideo(options: DownloadOptions): Promise<string> {
  const { uri, filename = 'hallyu_video.mp4', onProgress, signal } = options;

  const localUri = `${FileSystem.documentDirectory}${filename}`;
  const downloadRes = await FileSystem.downloadAsync(uri, localUri, {
    headers: { 'x-upsert': 'true' },
  });

  if (downloadRes.status >= 400) {
    throw new BackendError(`Download failed (HTTP ${downloadRes.status})`, true);
  }

  onProgress?.({ loaded: 1, total: 1, percent: 100 });
  return downloadRes.uri;
}

/**
 * Save an image to the device's photo library.
 * Handles Android permissions, permission-denied handling, and storage errors.
 */
export interface SaveImageOptions {
  uri: string;
  filename?: string;
}

export async function saveImageToLibrary(options: SaveImageOptions): Promise<boolean> {
  const { uri, filename = 'hallyu_image.jpg' } = options;

  // Android: request storage permission.
  if (Platform.OS === 'android') {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      throw new BackendError('Storage permission denied', false);
    }
  }

  // Download to a temp file first, then save to the library.
  const tempUri = `${FileSystem.cacheDirectory}${filename}`;
  const downloadRes = await FileSystem.downloadAsync(uri, tempUri);
  if (downloadRes.status >= 400) {
    throw new BackendError(`Image download failed (HTTP ${downloadRes.status})`, true);
  }

  const asset = await MediaLibrary.createAssetAsync(tempUri);
  await MediaLibrary.addAssetsToAlbumAsync(asset, 'Hallyu', false);
  return true;
}

/** Upload one mp4 for post `postId`; returns the ledgered storage key (`video/{uid}/{ulid}.mp4`). */
export async function uploadVideo(asset: { uri: string; duration?: number; width?: number; height?: number }, postId: string, watermark = true): Promise<{ key: string }> {
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
    body: JSON.stringify({ bytes, durationMs: Math.round((asset.duration ?? 0) * 1000), seed: postId, watermark }),
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