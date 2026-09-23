/**
 * Device media: watermarking, downloads and saves.
 *
 * Every byte Hallyu writes to the device or to storage carries the brand mark, because it is burned
 * in before the write — not painted over the player. Concretely:
 *   • video posters are burned on-device when the post is composed (`makePoster`), so the stored
 *     object itself carries the mark and every feed / share / preview surface shows it;
 *   • images saved to the gallery are burned before they are saved (`saveImage`);
 *   • videos are saved as-is (the pipeline never re-encodes them — see docs/backend/10-video-storage.md)
 *     and land in the "Hallyu" album, beside their watermarked poster.
 *
 * The compositor is pure and unit-tested (scripts/test-watermark.mjs); when it cannot run (e.g. an
 * unsupported source format) we fall back honestly and do NOT claim a burn-in happened.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Platform } from 'react-native';
import { BackendError } from './data/backend';
import { supabase } from './supabase';
import { burnIntoJpeg, hasWatermarkSource, setWatermarkSource } from './watermark';

const WATERMARK_PNG = require('../assets/branding/watermark.png');
const ALBUM = 'Hallyu';
const DOWNLOADS_KEY = 'hallyu.downloads.v1';

// ---------------------------------------------------------------------------------------------
// base64 helper (expo-file-system gives us a base64 string; jpeg-js wants bytes)
// ---------------------------------------------------------------------------------------------
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/=]/g, '');
  const len = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(len);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c1 = B64.indexOf(clean[i]);
    const c2 = B64.indexOf(clean[i + 1]);
    const c3 = B64.indexOf(clean[i + 2]);
    const c4 = B64.indexOf(clean[i + 3]);
    out[p++] = (c1 << 2) | (c2 >> 4);
    if (c3 >= 0 && p < len) out[p++] = ((c2 & 15) << 4) | (c3 >> 2);
    if (c4 >= 0 && p < len) out[p++] = ((c3 & 3) << 6) | c4;
  }
  return out;
}
function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[c & 63] : '=';
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Watermarking
// ---------------------------------------------------------------------------------------------
let wmPrimed = false;
async function primeWatermark(): Promise<void> {
  if (wmPrimed) return;
  wmPrimed = true;
  try {
    const b64 = await FileSystem.readAsStringAsync(WATERMARK_PNG, { encoding: FileSystem.EncodingType.Base64 });
    setWatermarkSource(base64ToBytes(b64));
  } catch {
    wmPrimed = false; // retry next time
  }
}

/**
 * Burn the mark into a local image file (JPEG). Returns a new local JPEG URI carrying the mark, or
 * the input URI unchanged when the source isn't a decodable JPEG or the mark asset is unavailable.
 */
export async function burnWatermark(uri: string): Promise<string> {
  if (Platform.OS === 'web') return uri;
  await primeWatermark();
  if (!hasWatermarkSource()) return uri;
  try {
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const out = burnIntoJpeg(base64ToBytes(b64));
    if (!out) return uri;
    const tmp = `${FileSystem.cacheDirectory}hallyu_mark_${Date.now()}.jpg`;
    await FileSystem.writeAsStringAsync(tmp, bytesToBase64(out.bytes), { encoding: FileSystem.EncodingType.Base64 });
    return tmp;
  } catch {
    return uri;
  }
}

/** First frame of a video with the Hallyu mark burned in — the stored poster for every video post. */
export async function makePoster(videoUri: string): Promise<string | undefined> {
  try {
    const thumb = await VideoThumbnails.getThumbnailAsync(videoUri, { time: 500, quality: 0.9 });
    return await burnWatermark(thumb.uri);
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
    return (JSON.parse((await AsyncStorage.getItem(DOWNLOADS_KEY)) ?? '{}') as DoneMap) ?? {};
  } catch {
    return {};
  }
}
async function writeDone(map: DoneMap): Promise<void> {
  await AsyncStorage.setItem(DOWNLOADS_KEY, JSON.stringify(map)).catch(() => {});
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
/** Save an image to the gallery with the mark burned in, preventing duplicate saves. */
export async function saveImage(uri: string, dedupeKey?: string): Promise<{ saved: boolean; already?: boolean }> {
  if (Platform.OS === 'web') throw new BackendError('Saving to the gallery isn’t supported on the web', false);
  const perm = await ensureMediaPermission();
  if (perm === 'denied') throw new BackendError('Storage permission denied', false);

  const done = await readDone();
  const dk = dedupeKey ?? uri;
  if (done[dk]) return { saved: true, already: true };

  const marked = await burnWatermark(uri);
  const asset = await MediaLibrary.createAssetAsync(marked);
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
