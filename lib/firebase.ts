import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  collection,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit
} from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from 'firebase/storage';
import { Platform } from 'react-native';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase App singleton
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore with configured firestoreDatabaseId
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test connection on boot
export async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is running in offline mode or network unavailable.');
    }
  }
}

// Upload local URI or blob to Firebase Storage
export async function uploadToFirebaseStorage(uri: string, storagePath: string, mimeType = 'image/jpeg'): Promise<string> {
  if (!uri || uri.startsWith('http')) return uri;
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, blob, { contentType: mimeType });
    const downloadUrl = await getDownloadURL(storageRef);
    return downloadUrl;
  } catch (err) {
    console.warn('Firebase Storage upload failed, returning original URI:', err);
    return uri;
  }
}

// Google Sign In helper with Native / Web compatibility
export async function signInWithGoogle() {
  try {
    if (Platform.OS === 'web') {
      const result = await signInWithPopup(auth, googleProvider);
      return result.user;
    } else {
      // Native Expo / Mobile environment handling
      try {
        const result = await signInWithPopup(auth, googleProvider);
        return result.user;
      } catch (nativeErr: any) {
        if (nativeErr?.code === 'auth/operation-not-supported-in-this-environment' || nativeErr?.message?.includes('popup')) {
          console.warn('Native Google Auth popup unavailable in native mode:', nativeErr);
        }
        throw nativeErr;
      }
    }
  } catch (error: any) {
    console.error('Google Sign In error:', error);
    throw error;
  }
}

export async function signOutFirebase() {
  await fbSignOut(auth);
}

export { FirebaseUser };
