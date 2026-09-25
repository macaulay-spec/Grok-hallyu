import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  auth as fbAuth,
  googleProvider,
  signInWithGoogle as fbSignInWithGoogle,
  signOutFirebase,
  db
} from './firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification as fbSendEmailVerification,
  sendPasswordResetEmail,
  updatePassword as fbUpdatePassword,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { supabase } from './supabase';
import { track } from './analytics';

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
    emailVerified: u.emailVerified,
  };
}

function normalise(e: unknown): AuthError {
  if (e instanceof AuthError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.toLowerCase();
  if (m.includes('network') || m.includes('fetch') || m.includes('failed to connect') || m.includes('timeout')) {
    return new AuthError('network', 'We can’t reach the server right now. Check your connection and try again.');
  }
  if (m.includes('invalid-credential') || m.includes('wrong-password') || m.includes('user-not-found') || m.includes('invalid login')) {
    return new AuthError('credentials', 'That email and password don’t match. Try again or reset your password.');
  }
  if (m.includes('email-already-in-use') || m.includes('already registered')) {
    return new AuthError('exists', 'There’s already an account with this email. Sign in instead.');
  }
  if (m.includes('weak-password') || (m.includes('password') && m.includes('weak'))) {
    return new AuthError('weak_password', 'Use at least 8 characters, with a number or symbol.');
  }
  if (m.includes('too-many-requests') || m.includes('rate limit')) {
    return new AuthError('rate_limit', 'Too many attempts. Wait a minute and try again.');
  }
  if (m.includes('popup-closed-by-user') || m.includes('cancelled') || m.includes('dismissed')) {
    return new AuthError('cancelled', 'Sign-in was cancelled.');
  }
  return new AuthError('unknown', msg || 'Something went wrong. Please try again.');
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [recoveryPending, setRecoveryPending] = useState(false);
  const booted = useRef(false);

  // Sync profile document to Firestore on user login
  const syncProfileToFirestore = async (fbUser: FirebaseUser) => {
    try {
      const userRef = doc(db, 'users', fbUser.uid);
      const snap = await getDoc(userRef);
      const mapped = fromFirebaseUser(fbUser);
      if (!snap.exists()) {
        await setDoc(userRef, {
          id: mapped.id,
          handle: mapped.handle,
          displayName: mapped.displayName,
          email: mapped.email || '',
          avatarUrl: mapped.avatarUrl || '',
          bio: '',
          followersCount: 0,
          followingCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.warn('Firestore profile sync note:', err);
    }
  };

  // Boot Auth listener with fast-fallback guarantee
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;

    // Fast resolution timer so loading never hangs
    const fallbackTimer = setTimeout(async () => {
      setStatus((current) => {
        if (current === 'loading') {
          return 'signedOut';
        }
        return current;
      });
    }, 1500);

    const unsubscribe = onAuthStateChanged(fbAuth, async (fbUser) => {
      clearTimeout(fallbackTimer);
      if (fbUser) {
        const u = fromFirebaseUser(fbUser);
        setUser(u);
        setStatus('signedIn');
        syncProfileToFirestore(fbUser).catch(() => {});
      } else {
        try {
          const guest = await AsyncStorage.getItem(GUEST_KEY);
          if (guest === '1') {
            setUser(null);
            setStatus('guest');
          } else {
            // Check if there is an existing Supabase fallback session
            const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
            if (data?.session) {
              const u = fromFirebaseUser({
                uid: data.session.user.id,
                email: data.session.user.email,
                displayName: data.session.user.user_metadata?.display_name || data.session.user.email?.split('@')[0],
                photoURL: data.session.user.user_metadata?.avatar_url,
                emailVerified: !!data.session.user.email_confirmed_at,
                providerData: [{ providerId: data.session.user.app_metadata?.provider === 'google' ? 'google.com' : 'password', email: data.session.user.email }],
              } as any);
              setUser(u);
              setStatus('signedIn');
            } else {
              setUser(null);
              setStatus('signedOut');
            }
          }
        } catch {
          setUser(null);
          setStatus('signedOut');
        }
      }
    });

    return () => {
      clearTimeout(fallbackTimer);
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const cred = await signInWithEmailAndPassword(fbAuth, email.trim(), password);
      await AsyncStorage.removeItem(GUEST_KEY);
      track('auth.signin', { provider: 'email' });
    } catch (fbErr) {
      try {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw fbErr;
        await AsyncStorage.removeItem(GUEST_KEY);
        track('auth.signin', { provider: 'email_supabase_fallback' });
      } catch {
        throw normalise(fbErr);
      }
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    try {
      const cred = await createUserWithEmailAndPassword(fbAuth, email.trim(), password);
      if (cred.user) {
        await updateProfile(cred.user, { displayName: displayName.trim() });
        await fbSendEmailVerification(cred.user);
        await syncProfileToFirestore(cred.user);
      }
      setPendingEmail(email.trim());
      return 'verify' as const;
    } catch (fbErr) {
      try {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: displayName.trim(), handle: handleFrom(email, displayName) } },
        });
        if (error) throw fbErr;
        if (data.session) return 'signedIn' as const;
        setPendingEmail(email.trim());
        return 'verify' as const;
      } catch {
        throw normalise(fbErr);
      }
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      const fbUser = await fbSignInWithGoogle();
      if (fbUser) {
        await AsyncStorage.removeItem(GUEST_KEY);
        await syncProfileToFirestore(fbUser);
        track('auth.signin', { provider: 'google_firebase' });
      }
    } catch (e) {
      throw normalise(e);
    }
  }, []);

  const sendReset = useCallback(async (email: string) => {
    try {
      await sendPasswordResetEmail(fbAuth, email.trim());
    } catch (e) {
      try {
        await supabase.auth.resetPasswordForEmail(email.trim());
      } catch {
        throw normalise(e);
      }
    }
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    try {
      if (fbAuth.currentUser) {
        await fbUpdatePassword(fbAuth.currentUser, password);
      } else {
        await supabase.auth.updateUser({ password });
      }
      setRecoveryPending(false);
    } catch (e) {
      throw normalise(e);
    }
  }, []);

  const resendVerification = useCallback(async (email: string) => {
    try {
      if (fbAuth.currentUser) {
        await fbSendEmailVerification(fbAuth.currentUser);
      } else {
        await supabase.auth.resend({ type: 'signup', email: email.trim() });
      }
    } catch (e) {
      throw normalise(e);
    }
  }, []);

  const continueAsGuest = useCallback(() => {
    AsyncStorage.setItem(GUEST_KEY, '1').catch(() => {});
    setStatus('guest');
    track('auth.guest');
  }, []);

  const signOut = useCallback(async () => {
    await AsyncStorage.removeItem(GUEST_KEY);
    setUser(null);
    setStatus('signedOut');
    try {
      await signOutFirebase();
    } catch {}
    try {
      await supabase.auth.signOut();
    } catch {}
  }, []);

  const deleteAccount = useCallback(async () => {
    if (fbAuth.currentUser) {
      try {
        await fbAuth.currentUser.delete();
      } catch (err: any) {
        console.warn('Firebase user delete note:', err);
      }
    }
    if (user) {
      try {
        await supabase.functions.invoke('delete-account');
      } catch {}
    }
    await signOut();
  }, [user, signOut]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      pendingEmail,
      recoveryPending,
      signIn,
      signUp,
      signInWithGoogle,
      sendReset,
      updatePassword,
      resendVerification,
      continueAsGuest,
      signOut,
      deleteAccount,
      clearRecovery: () => setRecoveryPending(false),
    }),
    [status, user, pendingEmail, recoveryPending, signIn, signUp, signInWithGoogle, sendReset, updatePassword, resendVerification, continueAsGuest, signOut, deleteAccount],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
