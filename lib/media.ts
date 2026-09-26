/**
 * Device media: downloads and saves.
 *
 *   • video posters are captured on-device when the post is composed (`makePoster`);
 *   • images saved to the gallery land in the "Hallyu" album (`saveImage`);
 *   • videos are saved as-is (the pipeline never re-encodes them — see docs/backend/10-video-storage.md).
 *
 * NOTE: the previous pure-JS watermark compositor (fast-png + jpeg-js) was removed. It constructed
 * `new TextDecoder('latin1')` / `new TextEncoder()` at module-evaluation time, which Hermes does not
 * provide — merely importing that chain from the root layout killed cold boot with
 * "Cannot read property 'ErrorBoundary' of undefined". Image/video bytes are stored as captured.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Platform } from 'react-native';
import { BackendError } from './data/backend';
import { supabase } from './supabase';

const ALBUM = 'Hallyu';
const DOWNLOADS_KEY = 'hallyu.downloads.v1';

// The on-device download ledger is bound to the active account so a "downloaded" indicator never
// leaks between members sharing a device. It defaults to 'guest' until AccountSync binds it.
let downloadScope = 'guest';
/** Bind the on-device download ledger to the active account (call on sign-in / sign-out). */
export function setDownloadScope(id: string | null | undefined): void {
  downloadScope = id && id !== 'guest' && id !== 'local' ? id : 'guest';
}
function doneKey(): string {
  return `${DOWNLOADS_KEY}.${downloadScope}`;
}

// ---------------------------------------------------------------------------------------------
// Poster capture
// ---------------------------------------------------------------------------------------------
/** First frame of a video — the stored poster for every video post. */
export async function makePoster(videoUri: string): Promise<string | undefined> {
  try {
    const thumb = await VideoThumbnails.getThumbnailAsync(videoUri, { time: 500, quality: 0.9 });
    return thumb.uri;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------------------------
// Download ledger
// ---------------------------------------------------------------------------------------------
/** Tell the backend this member is about to download `key`; returns the cumulative count. */
export async function recordDownload(key: string, postId?: string): Promise<{ counted: boolean; count: number }> {
  const { data, error } = await supabase.rpc('record_download', { p_key: key, p_post_id: postId ?? null });
  if (error) throw new BackendError(error.message, true);
  return { counted: !!data?.counted, count: Number(data?.count ?? 0) };
}

/** Which of these media keys has this member already downloaded (saved state + dedupe)? */
export async function downloadState(keys: string[]): Promise<Record<string, boolean>> {
  if (!keys.length) return {};
  const { data } = await supabase.rpc('download_state', { p_keys: keys });
  return (data as Record<string, boolean>) ?? {};
}

type DoneMap = Record<string, string>;
async function readDone(): Promise<DoneMap> {
  try {
    return (JSON.parse((await AsyncStorage.getItem(doneKey())) ?? '{}') as DoneMap) ?? {};
  } catch {
    return {};
  }
}
async function writeDone(map: DoneMap): Promise<void> {
  await AsyncStorage.setItem(doneKey(), JSON.stringify(map)).catch(() => {});
}

// ---------------------------------------------------------------------------------------------
// Permissions + album
// ---------------------------------------------------------------------------------------------
export type PermissionResult = 'granted' | 'denied' | 'unsupported';
export async function ensureMediaPermission(): Promise<PermissionResult> {
  if (Platform.OS === 'web') return 'unsupported';
  const { status } = await MediaLibrary.requestPermissionsAsync();
  return status === 'granted' ? 'granted' : 'denied';
}

async function albumRef(copy = false): Promise<MediaLibrary.Album | null> {
  let album = await MediaLibrary.getAlbumAsync(ALBUM).catch(() => null);
  if (!album) album = await MediaLibrary.createAlbumAsync(ALBUM, undefined, copy).catch(() => null);
  return album;
}

// ---------------------------------------------------------------------------------------------
// Saves
// ---------------------------------------------------------------------------------------------
/** Save an image to the gallery, preventing duplicate saves. */
export async function saveImage(uri: string, dedupeKey?: string): Promise<{ saved: boolean; already?: boolean }> {
  if (Platform.OS === 'web') throw new BackendError('Saving to the gallery isn’t supported on the web', false);
  const perm = await ensureMediaPermission();
  if (perm === 'denied') throw new BackendError('Storage permission denied', false);

  const done = await readDone();
  const dk = dedupeKey ?? uri;
  if (done[dk]) return { saved: true, already: true };

  const asset = await MediaLibrary.createAssetAsync(uri);
  const album = await albumRef();
  if (album) await MediaLibrary.addAssetsToAlbumAsync(asset, album, false).catch(() => {});

  done[dk] = asset.id ?? uri;
  await writeDone(done);
  return { saved: true };
}

export interface SaveVideoProgress {
  percent: number;
  loaded: number;
  total: number;
}

/**
 * Download a video to the device gallery.
 *  - duplicate prevention: a completed download for `key` is recorded and skipped;
 *  - permissions are requested first and refusal surfaces as a distinct error;
 *  - progress streams through `onProgress`; `signal` aborts cleanly (pause the resumable);
 *  - interrupted downloads resume instead of restarting (resumable downloader);
 *  - the backend ledger is told exactly once (record_download) before the transfer.
 */
export async function saveVideo(opts: { key: string; url: string; postId?: string; onProgress?: (p: SaveVideoProgress) => void; signal?: AbortSignal }): Promise<{ saved: boolean; already?: boolean }> {
  const { key, url, postId, onProgress, signal } = opts;
  if (Platform.OS === 'web') throw new BackendError('Saving to the gallery isn’t supported on the web', false);
  const perm = await ensureMediaPermission();
  if (perm === 'denied') throw new BackendError('Storage permission denied', false);

  const done = await readDone();
  if (done[key]) return { saved: true, already: true };
  if (signal?.aborted) throw new BackendError('Cancelled', false);

  // Counted once server-side, before the transfer, so the ledger survives a client crash mid-download.
  await recordDownload(key, postId);

  const target = `${FileSystem.cacheDirectory}hallyu_${key.replace(/[^A-Za-z0-9]/g, '_')}.mp4`;
  const resumable = FileSystem.createDownloadResumable(url, target, {}, (p) => {
    const total = p.totalBytesExpectedToWrite || 0;
    const loaded = p.totalBytesWritten || 0;
    onProgress?.({ percent: total ? Math.min(100, Math.round((loaded / total) * 100)) : 0, loaded, total });
  });

  if (signal) {
    signal.addEventListener(
      'abort',
      () => {
        resumable.pauseAsync().catch(() => {});
      },
      { once: true },
    );
  }

  const res = await resumable.downloadAsync();
  if (signal?.aborted) throw new BackendError('Cancelled', false);
  if (!res || res.status >= 400) throw new BackendError(`Download failed (HTTP ${res?.status ?? 'network'})`, true);

  const asset = await MediaLibrary.createAssetAsync(res.uri);
  const album = await albumRef();
  if (album) await MediaLibrary.addAssetsToAlbumAsync(asset, album, false).catch(() => {});
  await FileSystem.deleteAsync(res.uri, { idempotent: true }).catch(() => {});

  done[key] = asset.id ?? key;
  await writeDone(done);
  return { saved: true };
}

/** On-device record of a completed download (draws the saved state without a network call). */
export async function localDone(key: string): Promise<boolean> {
  const done = await readDone();
  return !!done[key];
}
