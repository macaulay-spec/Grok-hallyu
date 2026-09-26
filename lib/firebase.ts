/**
 * Firebase app singleton — Hallyu's PRIMARY backend.
 *
 * Architecture (see docs/backend/FIREBASE.md):
 *   • Firebase Auth + Firestore + Storage own all Hallyu data (profiles, posts, comments,
 *     reactions, follows, watchlist, collections, notifications, downloads, media bytes).
 *   • Supabase remains ONLY as a legacy recovery/migration source (lib/data/supabaseBackend.ts)
 *     and for resolving media keys of pre-migration posts (lib/video.ts videoUrl()).
 *   • TMDB stays an external catalog API (lib/catalog.ts) — never stored in Firebase.
 *
 * React Native notes:
 *   • Auth uses initializeAuth + getReactNativePersistence(AsyncStorage) so sessions survive
 *     app restarts and background/foreground transitions (the firebase JS SDK's default RN
 *     persistence is in-memory only — that silently signed everybody out on every relaunch).
 *   • This is the Firebase JS SDK, not @react-native-firebase: NO google-services.json and no
 *     native modules are required; the client config below is public by design (rules guard data).
 *   • Module load must never throw: startup safety requires the root navigator to mount even if
 *     Firebase init somehow fails — errors surface at first use via requireFirebase().
 */
import './polyfills'; // TextDecoder/TextEncoder (Hermes) + URL — MUST precede firebase/* below
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  signOut as fbSignOut,
  type Auth,
  type Persistence,
} from 'firebase/auth';
// firebase JS SDK v12 removed the public React Native auth entry (firebase/auth resolves to the
// browser bundle, which has no AsyncStorage persistence). The RN persistence factory still ships
// inside the underlying @firebase/auth package — Metro resolves its "react-native" field to the
// RN build. This is the documented v12 pattern; the factory has no public types, hence the cast.
import * as FirebaseAuthInternal from '@firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';
import { BackendError } from './data/backend';

// ---------------------------------------------------------------------------------------------
// Init (guarded — a broken config must degrade, never crash the bundle at import time)
// ---------------------------------------------------------------------------------------------
let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;
let initError: Error | null = null;

try {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  // The AI-Studio applet project uses a NAMED Firestore database; getFirestore(app, databaseId)
  // targets it. Guard against SDKs where the 2nd arg is unsupported.
  dbInstance = (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId
    ? getFirestore(app, (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId as string)
    : getFirestore(app);
  storageInstance = getStorage(app);
  if (Platform.OS === 'web') {
    authInstance = getAuth(app);
  } else {
    // Real device persistence. initializeAuth throws if an Auth instance already exists for the
    // app (e.g. fast refresh or a prior getAuth) — fall back to getAuth in that case.
    const getRNPersistence = (
      FirebaseAuthInternal as unknown as {
        getReactNativePersistence?: (storage: {
          getItem: (key: string) => Promise<string | null>;
          setItem: (key: string, value: string) => Promise<void>;
          removeItem: (key: string) => Promise<void>;
        }) => Persistence;
      }
    ).getReactNativePersistence;
    if (!getRNPersistence) throw new Error('Firebase Auth build has no React Native persistence support');
    try {
      authInstance = initializeAuth(app, {
        persistence: getRNPersistence(AsyncStorage),
      });
    } catch {
      authInstance = getAuth(app);
    }
  }
} catch (e) {
  initError = e instanceof Error ? e : new Error(String(e));
  console.warn('[hallyu:firebase] init failed (backend calls will error clearly):', initError.message);
}

/** Firebase is fully initialized (auth + firestore + storage available). */
export function firebaseReady(): boolean {
  return !!(app && authInstance && dbInstance && storageInstance);
}

function requireFirebase(): { app: FirebaseApp; auth: Auth; db: Firestore; storage: FirebaseStorage } {
  if (!app || !authInstance || !dbInstance || !storageInstance) {
    throw new BackendError(
      `Firebase is not available on this device (${initError?.message ?? 'initialization failed'})`,
      true,
    );
  }
  return { app, auth: authInstance, db: dbInstance, storage: storageInstance };
}

/** Live accessors — throw a retryable BackendError if init failed, so callers degrade cleanly. */
export function fbAuth(): Auth {
  return requireFirebase().auth;
}
export function fbDb(): Firestore {
  return requireFirebase().db;
}
export function fbStorage(): FirebaseStorage {
  return requireFirebase().storage;
}

// ---------------------------------------------------------------------------------------------
// Error mapping — Firebase codes → BackendError (the sync engine's retry/rollback contract)
// ---------------------------------------------------------------------------------------------
export function mapFirebaseError(e: unknown, context: string): BackendError {
  const code = (e as { code?: string })?.code ?? '';
  const msg = e instanceof Error ? e.message : String(e);
  switch (code) {
    case 'unavailable':
    case 'aborted':
    case 'deadline-exceeded':
    case 'resource-exhausted':
    case 'internal':
      return new BackendError(`${context}: service unavailable — will retry (${code || msg})`, true);
    case 'permission-denied':
      return new BackendError(`${context}: permission denied by security rules`, false, 403);
    case 'unauthenticated':
      return new BackendError(`${context}: sign in again to continue`, false, 401);
    case 'failed-precondition':
      // Typically a missing composite index; the query layer avoids those by design, so treat as
      // a permanent configuration error with an actionable message.
      return new BackendError(`${context}: query needs a Firestore index that is not deployed (see docs/backend/FIREBASE.md)`, false);
    case 'not-found':
      return new BackendError(`${context}: not found`, false, 404);
    case 'already-exists':
      return new BackendError(`${context}: already exists`, false, 409);
    case 'invalid-argument':
      return new BackendError(`${context}: rejected by the server (${msg})`, false);
    case 'cancelled':
      return new BackendError(`${context}: cancelled`, false);
    default:
      if (/network|fetch failed|Failed to connect|timeout/i.test(msg)) {
        return new BackendError(`${context}: network error — will retry`, true);
      }
      return new BackendError(`${context}: ${msg || 'unknown error'}`, true);
  }
}

/** Map a Firebase *Auth* error to a stable code the UI layer already understands. */
export function firebaseAuthErrorCode(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  return code.replace(/^auth\//, '');
}

// ---------------------------------------------------------------------------------------------
// Storage paths — scoped by authenticated user so rules can enforce ownership
// ---------------------------------------------------------------------------------------------
export const storagePaths = {
  avatar: (uid: string) => `users/${uid}/avatar.jpg`,
  postImage: (uid: string, postId: string, idx: number) => `posts/${uid}/${postId}/image_${idx}.jpg`,
  postPoster: (uid: string, postId: string) => `posts/${uid}/${postId}/poster.jpg`,
  postVideo: (uid: string, postId: string) => `posts/${uid}/${postId}/video.mp4`,
  video: (uid: string, postId: string) => `videos/${uid}/${postId}.mp4`,
};

const LOCAL_URI = /^(file:|blob:|content:)/;

/** True when a media reference is a local file that still needs uploading. */
export function isLocalMediaUri(uri: string | undefined): boolean {
  return !!uri && LOCAL_URI.test(uri);
}

async function uriToBlob(uri: string): Promise<Blob> {
  const res = await fetch(uri);
  if (!res.ok) throw new Error(`Could not read the file for upload (HTTP ${res.status})`);
  return res.blob();
}

/**
 * Upload a local file (image/poster/avatar) to Firebase Storage and return its download URL.
 * FAILS LOUDLY: on any error this throws a BackendError (retryable classification included) —
 * an upload that silently returned the local uri would ledger an unplayable file:// URL into
 * Firestore and pretend the post succeeded. Remote http(s) inputs pass through unchanged.
 */
export async function uploadToFirebaseStorage(uri: string, storagePath: string, mimeType = 'image/jpeg'): Promise<string> {
  if (!uri) throw new BackendError('Nothing to upload', false);
  if (!isLocalMediaUri(uri)) return uri;
  const { storage } = requireFirebase();
  try {
    // Dynamic requires keep the module graph light at boot; storage internals are only needed
    // at upload time.
    const { ref, uploadBytes, getDownloadURL } = require('firebase/storage') as typeof import('firebase/storage');
    const blob = await uriToBlob(uri);
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, blob, { contentType: mimeType });
    return await getDownloadURL(storageRef);
  } catch (e) {
    throw mapFirebaseError(e, 'Media upload');
  }
}

export interface VideoUploadProgress {
  percent: number;
  bytesSent: number;
  bytesTotal: number;
}

/**
 * Upload a video with the resumable pipeline: progress events, pause/resume and cancel come from
 * the SDK task itself (see uploadVideo in lib/video.ts for the caller-facing wrapper). Throws a
 * BackendError on failure — never returns the local uri as if it had uploaded.
 */
export async function uploadVideoToFirebaseStorage(
  uri: string,
  storagePath: string,
  opts: { onProgress?: (p: VideoUploadProgress) => void; signal?: AbortSignal } = {},
): Promise<string> {
  if (!uri) throw new BackendError('Nothing to upload', false);
  if (!isLocalMediaUri(uri)) return uri;
  const { storage } = requireFirebase();
  const { ref, uploadBytesResumable, getDownloadURL } = require('firebase/storage') as typeof import('firebase/storage');
  let blob: Blob;
  try {
    blob = await uriToBlob(uri);
  } catch (e) {
    throw new BackendError(`Could not read the video file (${e instanceof Error ? e.message : 'unknown'})`, true);
  }
  return new Promise<string>((resolve, reject) => {
    const task = uploadBytesResumable(ref(storage, storagePath), blob, { contentType: 'video/mp4' });
    const onAbort = () => {
      task.cancel(); // returns boolean in firebase v12 — no promise
    };
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    task.on(
      'state_changed',
      (snap) => {
        const total = snap.totalBytes || 0;
        const sent = snap.bytesTransferred || 0;
        opts.onProgress?.({ percent: total ? Math.min(100, Math.round((sent / total) * 100)) : 0, bytesSent: sent, bytesTotal: total });
      },
      (error) => {
        opts.signal?.removeEventListener('abort', onAbort);
        if (opts.signal?.aborted) reject(new BackendError('Video upload cancelled', false));
        else reject(mapFirebaseError(error, 'Video upload'));
      },
      async () => {
        opts.signal?.removeEventListener('abort', onAbort);
        try {
          resolve(await getDownloadURL(task.snapshot.ref));
        } catch (e) {
          reject(mapFirebaseError(e, 'Video upload finalize'));
        }
      },
    );
  });
}

/** Delete a stored object (best-effort — used by post deletion and account deletion). */
export async function deleteFirebaseStorageFile(storagePath: string): Promise<void> {
  const { storage } = requireFirebase();
  const { ref, deleteObject } = require('firebase/storage') as typeof import('firebase/storage');
  await deleteObject(ref(storage, storagePath)).catch((e) => {
    const code = (e as { code?: string })?.code ?? '';
    if (code !== 'storage/object-not-found' && code !== 'storage/unauthorized') {
      console.warn('[hallyu:firebase] storage delete failed:', code || e);
    }
  });
}

/** Sign out of Firebase Auth (sessions persisted in AsyncStorage are cleared by the SDK). */
export async function signOutFirebase(): Promise<void> {
  await fbSignOut(fbAuth());
}

/** Firebase web API key (public client identifier — used for auth action links). */
export const FIREBASE_API_KEY = (firebaseConfig as { apiKey: string }).apiKey;
export const FIREBASE_PROJECT_ID = (firebaseConfig as { projectId: string }).projectId;
export const FIREBASE_AUTH_DOMAIN = (firebaseConfig as { authDomain?: string }).authDomain;
/** The project's own web OAuth client (from the applet config) — a valid id_token audience. */
export const FIREBASE_OAUTH_WEB_CLIENT_ID = (firebaseConfig as { oAuthClientId?: string }).oAuthClientId ?? '';
