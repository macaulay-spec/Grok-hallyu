import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

export type DownloadResult = 'saved' | 'already_saved';

/** Downloads media once into the device gallery. The URL is never written to the gallery directly. */
export async function saveMediaToDevice(url: string, filename: string): Promise<DownloadResult> {
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) throw new Error('Hallyu needs photo and video permission to save this file.');
  const dir = `${FileSystem.cacheDirectory}hallyu-downloads/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const target = `${dir}${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const existing = await FileSystem.getInfoAsync(target);
  if (existing.exists) return 'already_saved';
  const result = await FileSystem.downloadAsync(url, target);
  if (result.status < 200 || result.status >= 300) {
    await FileSystem.deleteAsync(target, { idempotent: true });
    throw new Error('The download failed. Check your connection and try again.');
  }
  try {
    await MediaLibrary.saveToLibraryAsync(result.uri);
  } finally {
    await FileSystem.deleteAsync(result.uri, { idempotent: true });
  }
  return 'saved';
}
