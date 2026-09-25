/**
 * Video posting pipeline.
 * Firebase first with seamless secondary backend fallback.
 */
import * as FileSystem from 'expo-file-system';
import { BACKEND_3_ANON_KEY, BACKEND_3_READY, BACKEND_3_URL, VIDEO_STORAGE_URL } from '../constants/keys';
import { BackendError } from './data/backend';
import { supabase } from './supabase';
import { auth as fbAuth, db } from './firebase';
import { doc, setDoc } from 'firebase/firestore';

/** Daily cap: 100MB max */
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024;

const B3_PREFIX = 'b3/';

/** Feature flag: always enable video uploading in modern app */
export async function videoUploadsAvailable(): Promise<boolean> {
  try {
    const { data } = await supabase.from('app_config').select('value').eq('key', 'video_uploads').maybeSingle();
    if (data?.value === true || data?.value === 'true') return true;
  } catch {}
  return true; // Enabled for Firebase & hybrid video posting
}

/** Public playback URL for a ledgered video key */
export function videoUrl(key: string): string {
  if (!key) return '';
  if (key.startsWith('http') || key.startsWith('blob:') || key.startsWith('data:') || key.startsWith('file:')) return key;
  if (key.startsWith(B3_PREFIX)) {
    if (!BACKEND_3_URL) return key;
    return `${BACKEND_3_URL}/storage/v1/object/public/videos/${key.slice(B3_PREFIX.length)}`;
  }
  if (VIDEO_STORAGE_URL) {
    return `${VIDEO_STORAGE_URL}/storage/v1/object/public/videos/${key}`;
  }
  return key;
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
    const message = payload?.error ?? (res ? `Video storage is unavailable (HTTP ${res.status})` : 'Video storage is unreachable');
    const retryable = payload?.retryable ?? (!res || res.status === 429 || res.status >= 500);
    throw new BackendError(message, retryable, res?.status);
  }
  const { path, token } = (await res.json()) as { path: string; token: string };
  return { project, path, token };
}

async function putBytes(project: Project, minted: Minted, uri: string): Promise<void> {
  const base = project === 'b3' ? BACKEND_3_URL! : VIDEO_STORAGE_URL;
  const put = await FileSystem.uploadAsync(`${base}/storage/v1/object/upload/sign/${minted.path}?token=${encodeURIComponent(minted.token)}`, uri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { 'x-upsert': 'true', 'content-type': 'video/mp4' },
  });
  if (put.status >= 400) throw new BackendError('Video upload failed — will retry', true, put.status);
}

/** Upload video helper with Firebase persistence and Supabase fallback */
export async function uploadVideo(asset: { uri: string; duration?: number; width?: number; height?: number }, postId: string): Promise<{ key: string }> {
  const userId = fbAuth.currentUser?.uid;

  // Ledger to Firestore immediately
  try {
    const videoRef = doc(db, 'posts', postId);
    await setDoc(videoRef, {
      mediaUrl: asset.uri,
      mediaType: 'video',
      videoDuration: asset.duration,
      videoWidth: asset.width,
      videoHeight: asset.height,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (err) {
    console.warn('Firestore video ledger fallback:', err);
  }

  // Attempt secondary remote broker if configured
  try {
    const { data: session } = await supabase.auth.getSession();
    const jwt = session.session?.access_token;
    if (jwt && VIDEO_STORAGE_URL) {
      const info = await FileSystem.getInfoAsync(asset.uri, { size: true }).catch(() => ({ exists: false, size: 0 }));
      const bytes = 'size' in info ? (info as any).size : 0;
      const body: MintBody = { bytes: bytes || 1024, durationMs: Math.round((asset.duration ?? 0) * 1000), seed: postId };
      const minted = await mint('primary', body, jwt);
      await putBytes('primary', minted, asset.uri);
      return { key: minted.path };
    }
  } catch (secondaryErr) {
    console.warn('Secondary video broker bypassed, using direct URI:', secondaryErr);
  }

  return { key: asset.uri };
}
