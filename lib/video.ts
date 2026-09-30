/**
 * Video & media upload helper for Hallyu.
 *
 *   • Offline/Demo mode: local file URIs are preserved directly so create → post → watch works offline.
 *   • Lovable Cloud mode: resolves storage bucket keys (`shorts-videos/...`) to public Lovable Cloud
 *     Storage URLs and provides `uploadMediaToLovableCloud` via the `media-upload` Edge Function.
 */
import { LOVABLE_CLOUD_URL } from '../constants/keys';
import { getLovableClient } from './data/lovableBackend';

export const VIDEO_MAX_BYTES = 100 * 1024 * 1024;

export function videoUploadsAvailable(): boolean {
  return true;
}

/**
 * Playable source for a stored video reference.
 * Local (`file://`, `blob:`, `data:`) or remote (`http://`, `https://`) URIs pass through unchanged;
 * storage keys (`<userId>/<filename>.mp4`) resolve against Lovable Cloud Storage when configured.
 */
export function videoUrl(key: string): string {
  if (!key) return key;
  if (/^(https?:|file:|blob:|data:|content:|ph:)/i.test(key)) return key;
  if (LOVABLE_CLOUD_URL) {
    const cleanBase = LOVABLE_CLOUD_URL.replace(/\/$/, '');
    const cleanKey = key.replace(/^shorts-videos\//, '');
    return `${cleanBase}/storage/v1/object/public/shorts-videos/${cleanKey}`;
  }
  return key;
}

export async function uploadMediaToLovableCloud(opts: {
  bucket: 'avatars' | 'banners' | 'post-images' | 'shorts-videos';
  uri: string;
  mimeType: string;
  sizeBytes: number;
  ext: string;
  postId?: string;
}): Promise<{ key: string; publicUrl: string }> {
  const client = getLovableClient();
  if (!client) {
    return { key: opts.uri, publicUrl: opts.uri };
  }
  const { data, error } = await client.functions.invoke('media-upload', {
    body: {
      bucket: opts.bucket,
      mimeType: opts.mimeType,
      sizeBytes: opts.sizeBytes,
      ext: opts.ext,
      postId: opts.postId,
    },
  });
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? 'Failed to mint upload URL');
  }
  const resp = await fetch(opts.uri);
  const blob = await resp.blob();
  const uploadRes = await fetch(data.signedUrl as string, {
    method: 'PUT',
    headers: { 'Content-Type': opts.mimeType },
    body: blob,
  });
  if (!uploadRes.ok) {
    throw new Error(`Upload failed (${uploadRes.status})`);
  }
  return { key: String(data.key), publicUrl: String(data.publicUrl) };
}
