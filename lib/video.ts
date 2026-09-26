/**
 * Video posting pipeline — Firebase Storage is the ONLY upload path.
 *
 * History: video bytes used to flow through a Supabase edge-function broker (`video-upload`)
 * that minted signed upload URLs into a separate storage project. Per the Firebase-first
 * architecture that broker upload path is REMOVED — uploads now go straight to Firebase Storage
 * via the resumable pipeline in lib/firebase.ts (progress + cancellation supported).
 *
 * What remains of the legacy broker is READ-only: videoUrl() still resolves storage keys of
 * pre-migration posts (b3/… and VIDEO_STORAGE_URL keys) so old media keeps playing. Those keys
 * are ledgered in old Firestore/Supabase rows; nothing new creates them.
 */
import { BACKEND_3_URL, VIDEO_STORAGE_URL } from '../constants/keys';
import { BackendError } from './data/backend';
import {
  fbAuth,
  isLocalMediaUri,
  storagePaths,
  uploadVideoToFirebaseStorage,
  type VideoUploadProgress,
} from './firebase';

/** Daily cap: 100MB max */
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024;

const B3_PREFIX = 'b3/';

/** Feature flag: video uploading is always available (Firebase Storage needs no broker). */
export function videoUploadsAvailable(): boolean {
  return true;
}

/**
 * Public playback URL for a ledgered video reference.
 *  • http(s)/blob/data/file URLs (incl. Firebase Storage download URLs) pass through.
 *  • Legacy broker keys (b3/… or the old video-storage project) resolve to their public buckets
 *    so pre-migration posts keep playing.
 */
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

export interface UploadVideoResult {
  /** Firebase Storage download URL (tokenized, playable everywhere). */
  url: string;
  /** Storage object path — stable identity for cleanup (downloads, post deletion, purge). */
  key: string;
}

/**
 * Upload a local video asset to Firebase Storage (resumable pipeline).
 * Throws BackendError on every failure — never returns the local uri pretending it uploaded.
 * Remote http(s) inputs pass through unchanged.
 */
export async function uploadVideo(
  asset: { uri: string; duration?: number; width?: number; height?: number },
  postId: string,
  opts: { onProgress?: (p: VideoUploadProgress) => void; signal?: AbortSignal } = {},
): Promise<UploadVideoResult> {
  if (!asset?.uri) throw new BackendError('Nothing to upload', false);
  if (!isLocalMediaUri(asset.uri)) return { url: asset.uri, key: asset.uri };
  const uid = fbAuth().currentUser?.uid;
  if (!uid) throw new BackendError('Sign in to upload video', false, 401);
  const path = storagePaths.video(uid, postId);
  const url = await uploadVideoToFirebaseStorage(asset.uri, path, opts);
  return { url, key: path };
}
