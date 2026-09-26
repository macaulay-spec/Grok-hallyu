/**
 * Authentication — Firebase ONLY (canonical).
 *
 * Hallyu's identity system is Firebase Auth; the Firebase UID is THE Hallyu user id everywhere
 * (Firestore docs, Storage paths, follows, notifications). There is deliberately NO Supabase
 * auth fallback: a silent fallback would mint a second identity (Supabase UUID ≠ Firebase UID)
 * for the same person and split their data across two backends. Supabase remains only as a
 * legacy data/recovery source (lib/data/supabaseBackend.ts) — never for sign-in.
 *
 * Flows:
 *   • email sign-in / sign-up (verification required before first sign-in, same UX as before)
 *   • email verification + password reset via Firebase action links deep-linked into the app
 *     (hallyu://auth/callback?mode=..&oobCode=.. — parsed by lib/authLinks.ts)
 *   • native Google sign-in: expo-auth-session consent flow → id_token → Firebase credential
 *     (lib/googleAuth.ts). Web keeps the SDK popup.
 *   • session persistence: initializeAuth + AsyncStorage (lib/firebase.ts) — survives restarts
 *     and background/foreground transitions; onAuthStateChanged is the single source of truth.
 *   • account deletion: purge the member's Firestore/Storage data, then delete the Firebase
 *     auth account (with re-auth handling for stale sessions / Google accounts).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  applyActionCode,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification as fbSendEmailVerification,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  updatePassword as fbUpdatePassword,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { FIREBASE_PROJECT_ID, fbAuth, fbDb, firebaseAuthErrorCode } from './firebase';
import { fetchGoogleIdToken, GoogleAuthError, googleAuthConfigured } from './googleAuth';
import { parseAuthActionUrl } from './authLinks';
import { purgeUserData } from './data/firebaseBackend';
import { track } from './analytics';
import { markBoot } from './boot';

export type AuthStatus = 'loading' | 'signedOut' | 'guest' | 'signedIn';
export type AuthProviderName = 'email' | 'google';

export interface AuthUser {
  id: string;
  email?: string;
  displayName: string;
  handle: string;
  avatarUrl?: string;
  provider: AuthProviderName;
  emailVerified: boolean;
}

export class AuthError extends Error {
  code: 'network' | 'credentials' | 'exists' | 'unverified' | 'weak_password' | 'rate_limit' | 'cancelled' | 'unknown';
  constructor(code: AuthError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

interface AuthValue {
  status: AuthStatus;
  user: AuthUser | null;
  pendingEmail: string | null;
  recoveryPending: boolean;
  /** A password-reset action link has been received and holds a one-time code. */
  hasPendingReset: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<'signedIn' | 'verify'>;
  signInWithGoogle: () => Promise<void>;
  sendReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  continueAsGuest: () => void;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  clearRecovery: () => void;
}

const Ctx = createContext<AuthValue | null>(null);
const GUEST_KEY = 'hallyu.auth.guest';

/** Auth action links must land in the app: hallyu://auth/callback?mode=..&oobCode=.. */
const ACTION_LINK_SETTINGS = {
  url: 'hallyu://auth/callback',
  handleCodeInApp: true,
  android: { packageName: 'com.hallyu.app', installApp: false },
} as const;

function handleFrom(email?: string, name?: string): string {
  const base = (name ?? email?.split('@')[0] ?? 'member').toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20) || 'member';
  return base;
}

function fromFirebaseUser(u: FirebaseUser): AuthUser {
  const isGoogle = u.providerData.some((p) => p.providerId === 'google.com');
  const displayName = u.displayName || u.email?.split('@')[0] || 'Member';
  return {
    id: u.uid,
    email: u.email ?? undefined,
    displayName,
    handle: handleFrom(u.email ?? undefined, displayName),
    avatarUrl: u.photoURL ?? undefined,
    provider: isGoogle ? 'google' : 'email',
    // Google accounts have no password-email to verify; treat provider-verified as verified.
    emailVerified: u.emailVerified || isGoogle,
  };
}

function normalise(e: unknown): AuthError {
  if (e instanceof AuthError) return e;
  if (e instanceof GoogleAuthError) {
    if (e.code === 'cancelled') return new AuthError('cancelled', e.message);
    if (e.code === 'not_configured') return new AuthError('unknown', e.message);
    return new AuthError('unknown', e.message);
  }
  const code = firebaseAuthErrorCode(e);
  const msg = e instanceof Error ? e.message : String(e);
  switch (code) {
    case 'invalid-credential':
    case 'wrong-password':
    case 'user-not-found':
      return new AuthError('credentials', 'That email and password don’t match. Try again or reset your password.');
    case 'email-already-in-use':
      return new AuthError('exists', 'There’s already an account with this email. Sign in instead.');
    case 'weak-password':
      return new AuthError('weak_password', 'Use at least 8 characters, with a number or symbol.');
    case 'too-many-requests':
      return new AuthError('rate_limit', 'Too many attempts. Wait a minute and try again.');
    case 'network-request-failed':
      return new AuthError('network', 'We can’t reach the server right now. Check your connection and try again.');
    case 'operation-not-allowed':
      return new AuthError('unknown', 'That sign-in method is not enabled for this app yet.');
    case 'requires-recent-login':
      return new AuthError('credentials', 'For your security, sign out and back in — then try that again.');
    case 'invalid-email':
      return new AuthError('credentials', 'That email address doesn’t look right.');
    case 'expired-action-code':
    case 'invalid-action-code':
      return new AuthError('unknown', 'That link has expired or was already used. Request a fresh one.');
    case 'cancelled':
      return new AuthError('cancelled', 'Sign-in was cancelled.');
    default:
      break;
  }
  const m = msg.toLowerCase();
  if (m.includes('network') || m.includes('fetch') || m.includes('failed to connect') || m.includes('timeout')) {
    return new AuthError('network', 'We can’t reach the server right now. Check your connection and try again.');
  }
  if (m.includes('popup-closed-by-user') || m.includes('cancelled') || m.includes('dismissed')) {
    return new AuthError('cancelled', 'Sign-in was cancelled.');
  }
  if (m.includes('operation-not-supported-in-this-environment')) {
    return new AuthError('unknown', 'Google sign-in needs the native flow — this build could not start it.');
  }
  return new AuthError('unknown', msg || 'Something went wrong. Please try again.');
}

/**
 * Create the member's Firestore identity docs (idempotent). Public profile lives at users/{uid};
 * private account data (email, prefs, onboarding, lastSeenActivity) lives at users/{uid}/private/me
 * so security rules can keep the public card readable while the private doc stays owner-only.
 */
async function syncProfileToFirestore(fbUser: FirebaseUser): Promise<void> {
  try {
    const db = fbDb();
    const mapped = fromFirebaseUser(fbUser);
    const userRef = doc(db, 'users', fbUser.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        id: mapped.id,
        handle: mapped.handle,
        handleLower: mapped.handle.toLowerCase(),
        displayName: mapped.displayName,
        avatarUrl: mapped.avatarUrl || '',
        bio: '',
        favoriteGenres: [],
        favoriteDramaIds: [],
        followersCount: 0,
        followingCount: 0,
        verified: false,
        isPrivate: false,
        provider: mapped.provider,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } else {
      // Keep identity-linked fields fresh (display name / avatar can change on the Google side).
      await setDoc(
        userRef,
        {
          displayName: mapped.displayName,
          avatarUrl: mapped.avatarUrl || snap.data()?.avatarUrl || '',
          handleLower: String(snap.data()?.handleLower ?? mapped.handle.toLowerCase()),
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
    }
    const privateRef = doc(db, 'users', fbUser.uid, 'private', 'me');
    const privateSnap = await getDoc(privateRef);
    if (!privateSnap.exists()) {
      await setDoc(privateRef, {
        email: fbUser.email ?? '',
        emailVerified: mapped.emailVerified,
        prefs: {},
        onboarding: {},
        lastSeenActivity: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } else {
      await setDoc(privateRef, { email: fbUser.email ?? '', emailVerified: mapped.emailVerified, updatedAt: new Date().toISOString() }, { merge: true });
    }
  } catch (err) {
    // Profile doc sync is best-effort at sign-in; the me-pull and mutations heal it later.
    console.warn('[hallyu:auth] profile sync note:', err);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [recoveryPending, setRecoveryPending] = useState(false);
  const booted = useRef(false);
  /** One-time password-reset code received via deep link (consumed by updatePassword). */
  const pendingResetOob = useRef<string | null>(null);
  const [hasPendingReset, setHasPendingReset] = useState(false);

  /** Consume a Firebase auth action link (deep link or cold-start URL). */
  const consumeAuthLink = useCallback(async (url: string | null) => {
    const action = parseAuthActionUrl(url);
    if (!action) return;
    markBoot(`auth:link:${action.mode}`);
    try {
      if (!action.oobCode) return;
      const auth = fbAuth();
      if (action.mode === 'resetPassword') {
        // The reset screen collects the new password, then updatePassword() confirms the code.
        pendingResetOob.current = action.oobCode;
        setHasPendingReset(true);
        setRecoveryPending(true);
        return;
      }
      if (action.mode === 'verifyEmail' || action.mode === 'recoverEmail' || action.mode === 'revertSecondFactorAddition') {
        await applyActionCode(auth, action.oobCode);
        if (auth.currentUser) {
          await auth.currentUser.reload();
          setUser(fromFirebaseUser(auth.currentUser));
        }
      }
    } catch (e) {
      console.warn('[hallyu:auth] action link failed:', e);
      pendingResetOob.current = null;
      setHasPendingReset(false);
    }
  }, []);

  // Boot the single source of truth: Firebase's persisted session (AsyncStorage) resolves
  // onAuthStateChanged shortly after launch. A fast-fallback timer guarantees 'loading' never
  // hangs the splash gate even if the SDK wedges.
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    markBoot('auth:boot');

    const fallbackTimer = setTimeout(() => {
      setStatus((current) => (current === 'loading' ? 'signedOut' : current));
      markBoot('auth:fallback-signedout');
    }, 1500);

    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = onAuthStateChanged(
        fbAuth(),
        async (fbUser) => {
          clearTimeout(fallbackTimer);
          markBoot(fbUser ? 'auth:signed-in' : 'auth:signed-out');
          if (fbUser) {
            setUser(fromFirebaseUser(fbUser));
            setStatus('signedIn');
            void AsyncStorage.removeItem(GUEST_KEY).catch(() => {});
            void syncProfileToFirestore(fbUser);
          } else {
            pendingResetOob.current = null;
            setHasPendingReset(false);
            try {
              const guest = await AsyncStorage.getItem(GUEST_KEY);
              setUser(null);
              setStatus(guest === '1' ? 'guest' : 'signedOut');
            } catch {
              setUser(null);
              setStatus('signedOut');
            }
          }
        },
        (err) => {
          // Auth listener error (should not happen): don't hang the splash.
          clearTimeout(fallbackTimer);
          console.warn('[hallyu:auth] listener error:', err);
          setUser(null);
          setStatus('signedOut');
        },
      );
    } catch (e) {
      clearTimeout(fallbackTimer);
      console.warn('[hallyu:auth] firebase unavailable at boot:', e);
      setUser(null);
      setStatus('signedOut');
    }

    // Deep links: cold start (initial URL) + warm (listener).
    Linking.getInitialURL()
      .then((url) => void consumeAuthLink(url))
      .catch(() => {});
    const sub = Linking.addEventListener('url', (e) => void consumeAuthLink(e.url));

    return () => {
      clearTimeout(fallbackTimer);
      unsubscribe?.();
      sub.remove();
    };
  }, [consumeAuthLink]);

  const signIn = useCallback(async (email: string, password: string) => {
    const auth = fbAuth();
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password).catch((e) => {
      throw normalise(e);
    });
    // Product rule (unchanged UX): password accounts verify their email before first sign-in.
    if (!cred.user.emailVerified) {
      const u = cred.user;
      await auth.signOut().catch(() => {});
      setPendingEmail(email.trim());
      void fbSendEmailVerification(u, { ...ACTION_LINK_SETTINGS }).catch(() => {});
      throw new AuthError('unverified', 'Check your email and tap the verification link, then sign in.');
    }
    await AsyncStorage.removeItem(GUEST_KEY);
    track('auth.signin', { provider: 'email' });
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const auth = fbAuth();
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password).catch((e) => {
      throw normalise(e);
    });
    await updateProfile(cred.user, { displayName: displayName.trim() }).catch(() => {});
    await fbSendEmailVerification(cred.user, { ...ACTION_LINK_SETTINGS }).catch((e) => {
      console.warn('[hallyu:auth] verification email failed:', e);
    });
    await syncProfileToFirestore(cred.user);
    setPendingEmail(email.trim());
    track('auth.signup', { provider: 'email' });
    // Keep the waiting-room UX: sign out until the email is verified (signIn re-checks).
    await auth.signOut().catch(() => {});
    return 'verify' as const;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const auth = fbAuth();
    let fbUser: FirebaseUser;
    try {
      if (Platform.OS === 'web') {
        const result = await signInWithPopup(auth, new GoogleAuthProvider());
        fbUser = result.user;
      } else {
        if (!googleAuthConfigured()) {
          throw new GoogleAuthError(
            'not_configured',
            'Google sign-in is not configured in this build yet — use email sign-in, or add the Android OAuth client (docs/backend/FIREBASE.md).',
          );
        }
        const idToken = await fetchGoogleIdToken();
        const cred = GoogleAuthProvider.credential(idToken);
        const result = await signInWithCredential(auth, cred);
        fbUser = result.user;
      }
    } catch (e) {
      throw normalise(e);
    }
    await AsyncStorage.removeItem(GUEST_KEY);
    await syncProfileToFirestore(fbUser);
    track('auth.signin', { provider: 'google_firebase' });
  }, []);

  const sendReset = useCallback(async (email: string) => {
    await sendPasswordResetEmail(fbAuth(), email.trim(), { ...ACTION_LINK_SETTINGS }).catch((e) => {
      throw normalise(e);
    });
    setPendingEmail(email.trim());
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const auth = fbAuth();
    // Path 1: an emailed reset link is waiting — confirm its one-time code. Firebase invalidates
    // the current session on password reset, so the member signs in again right after.
    if (pendingResetOob.current) {
      const oob = pendingResetOob.current;
      await confirmPasswordReset(auth, oob, password).catch((e) => {
        throw normalise(e);
      });
      pendingResetOob.current = null;
      setHasPendingReset(false);
      setRecoveryPending(false);
      return;
    }
    // Path 2: signed-in password change (settings → account).
    if (!auth.currentUser) {
      throw new AuthError('credentials', 'Sign in again to change your password.');
    }
    await fbUpdatePassword(auth.currentUser, password).catch((e) => {
      throw normalise(e);
    });
    setRecoveryPending(false);
  }, []);

  const resendVerification = useCallback(async (email: string) => {
    const auth = fbAuth();
    if (auth.currentUser && auth.currentUser.email === email.trim()) {
      await fbSendEmailVerification(auth.currentUser, { ...ACTION_LINK_SETTINGS }).catch((e) => {
        throw normalise(e);
      });
      return;
    }
    // Not signed in (waiting-room resend): re-issue against the account by attempting a reset-
    // style verification is not possible without a session — surface a clear instruction.
    throw new AuthError('unknown', 'Open the latest link in your email, or sign in to resend verification.');
  }, []);

  const continueAsGuest = useCallback(() => {
    AsyncStorage.setItem(GUEST_KEY, '1').catch(() => {});
    setStatus('guest');
    track('auth.guest');
  }, []);

  const signOut = useCallback(async () => {
    await AsyncStorage.removeItem(GUEST_KEY);
    pendingResetOob.current = null;
    setHasPendingReset(false);
    setRecoveryPending(false);
    setUser(null);
    setStatus('signedOut');
    try {
      await fbAuth().signOut();
    } catch {}
  }, []);

  const deleteAccount = useCallback(async () => {
    const auth = fbAuth();
    const u = auth.currentUser;
    if (!u) {
      await signOut();
      return;
    }
    // Firebase requires a recent login for destructive account ops. Google accounts re-auth with a
    // fresh consent id_token; email accounts that went stale get a clear, actionable error.
    const isGoogle = u.providerData.some((p) => p.providerId === 'google.com');
    try {
      if (isGoogle && googleAuthConfigured()) {
        const idToken = await fetchGoogleIdToken().catch(() => null);
        if (idToken) await reauthenticateWithCredential(u, GoogleAuthProvider.credential(idToken)).catch(() => {});
      }
    } catch {}
    // 1) Purge Hallyu data owned by this member (posts, comments, likes, saves, watchlist,
    //    follows, collections, notifications, downloads, private doc, profile, Storage objects).
    await purgeUserData(u.uid).catch((e) => {
      console.warn('[hallyu:auth] purge note (continuing with account deletion):', e);
    });
    // 2) Delete the Firebase Auth account itself.
    try {
      await u.delete();
    } catch (e) {
      const code = firebaseAuthErrorCode(e);
      if (code === 'requires-recent-login') {
        throw new AuthError('credentials', 'For your security, sign out and sign back in — then delete your account.');
      }
      throw normalise(e);
    }
    await AsyncStorage.removeItem(GUEST_KEY);
    pendingResetOob.current = null;
    setHasPendingReset(false);
    setRecoveryPending(false);
    setUser(null);
    setStatus('signedOut');
    track('auth.delete');
  }, [signOut]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      pendingEmail,
      recoveryPending,
      hasPendingReset,
      signIn,
      signUp,
      signInWithGoogle,
      sendReset,
      updatePassword,
      resendVerification,
      continueAsGuest,
      signOut,
      deleteAccount,
      clearRecovery: () => {
        pendingResetOob.current = null;
        setHasPendingReset(false);
        setRecoveryPending(false);
      },
    }),
    [status, user, pendingEmail, recoveryPending, hasPendingReset, signIn, signUp, signInWithGoogle, sendReset, updatePassword, resendVerification, continueAsGuest, signOut, deleteAccount],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}

/** Re-exported for the FIREBASE docs/runbook: the project id used by auth action links. */
export const FIREBASE_PROJECT = FIREBASE_PROJECT_ID;
