/**
 * Local authentication for the frontend-only build.
 *
 * There is no server and no auth provider: an account here is a small record in AsyncStorage. That
 * keeps every screen, gate and deep-link path in the product exercisable end to end, and because the
 * shape of `AuthValue` is unchanged, no screen had to be rewritten to drop the backend.
 *
 * What this deliberately does NOT pretend to do: verify an email, send a reset link, or talk to
 * Google. Those flows are reachable in a server-backed build (`backend/` — see backend/README.md);
 * until then the UI says what is real. `demo` on the context lets any screen say so inline.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { reportError, track } from './analytics';
import { markBoot } from './boot';

export type AuthStatus = 'loading' | 'signedOut' | 'guest' | 'signedIn';

/** How this account was established. 'demo' is the shared, pre-populated device account. */
export type AuthProviderName = 'email' | 'google' | 'demo';

export interface AuthUser {
  id: string;
  email?: string;
  displayName: string;
  handle: string;
  avatarUrl?: string;
  emailVerified: boolean;
  provider: AuthProviderName;
}

/**
 * The code union is deliberately wider than this build can produce.
 *
 * 'network', 'unverified', 'rate_limit' and 'cancelled' describe failures only a server can return.
 * They stay in the vocabulary so the existing screens' branches (`error.code === 'network'`, the
 * resend-verification button, the cancelled-OAuth toast) remain valid and immediately correct when a
 * backend is re-attached — see backend/README.md. Nothing in the local implementation emits them.
 */
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
  /** true while the build runs without a server (accounts are device-local) */
  demo: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<'signedIn' | 'verify'>;
  /**
   * Continue with Google. In a server-backed build this runs the OAuth dance and returns a
   * verified Google account; in this frontend-only build it establishes the local Google-provider
   * account (same `provider: 'google'` shape), so the door behaves identically end to end.
   */
  signInWithGoogle: () => Promise<void>;
  /** Enter the shared demo account — a populated member, so the product is usable immediately. */
  signInDemo: () => Promise<void>;
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
const ACCOUNT_KEY = 'hallyu.auth.account.v1';
const DEMO_ACCOUNT_KEY = 'hallyu.auth.demo.v1';
const GOOGLE_ACCOUNT_KEY = 'hallyu.auth.google.v1';

/** The identity behind "Explore the demo". Stable so its activity survives a re-launch. */
const DEMO_USER: AuthUser = { id: 'demo-member', handle: 'you', displayName: 'You', email: 'demo@hallyu.app', emailVerified: true, provider: 'demo' };

/**
 * The account established by "Continue with Google" in this frontend-only build. Deterministic and
 * stable so its activity survives a re-launch — exactly like a returning Google session would.
 */
const GOOGLE_USER: AuthUser = { id: 'google-member', handle: 'you', displayName: 'You', email: 'you@gmail.com', emailVerified: true, provider: 'google' };

const MIN_PASSWORD = 6;

function handleFrom(email?: string, name?: string): string {
  const base = (name ?? email?.split('@')[0] ?? 'member').toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20) || 'member';
  return base;
}

/** Deterministic id: the same email always maps to the same local account. */
function idFor(email: string): string {
  return `local-${handleFrom(email)}`;
}

function displayNameFor(email: string): string {
  const local = email.split('@')[0] ?? 'Member';
  return local.charAt(0).toUpperCase() + local.slice(1);
}

async function readAccount(): Promise<AuthUser | null> {
  try {
    if ((await AsyncStorage.getItem(DEMO_ACCOUNT_KEY)) === '1') return DEMO_USER;
    if ((await AsyncStorage.getItem(GOOGLE_ACCOUNT_KEY)) === '1') return GOOGLE_USER;
    const raw = await AsyncStorage.getItem(ACCOUNT_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

async function writeAccount(user: AuthUser): Promise<void> {
  await AsyncStorage.setItem(ACCOUNT_KEY, JSON.stringify(user)).catch(() => {});
  await AsyncStorage.removeItem(DEMO_ACCOUNT_KEY).catch(() => {});
  await AsyncStorage.removeItem(GOOGLE_ACCOUNT_KEY).catch(() => {});
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [recoveryPending, setRecoveryPending] = useState(false);
  const booted = useRef(false);

  // Boot: a stored account, else the guest flag, else signed out. All local, so this cannot hang —
  // the network timeout dance the server-backed build needed (a session refresh with no fetch
  // timeout could pend forever) has no equivalent here.
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    (async () => {
      try {
        const account = await readAccount();
        if (account) {
          setUser(account);
          markBoot('auth:signedIn');
          setStatus('signedIn');
          return;
        }
        setStatus((await AsyncStorage.getItem(GUEST_KEY)) === '1' ? 'guest' : 'signedOut');
        markBoot('auth:no-session');
      } catch (e) {
        reportError('auth.boot', e);
        markBoot('auth:boot-failed');
        setStatus('signedOut');
      }
    })();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const address = email.trim().toLowerCase();
    if (!address.includes('@')) throw new AuthError('credentials', 'Enter the email address you signed up with.');
    if (password.length < MIN_PASSWORD) throw new AuthError('credentials', 'Your password is at least 6 characters.');
    const stored = await readAccount();
    // Same account on the same device keeps its display name; a new address becomes a new member.
    const next: AuthUser =
      stored && stored.email === address && stored.provider === 'email'
        ? stored
        : { id: idFor(address), email: address, displayName: displayNameFor(address), handle: handleFrom(address), emailVerified: true, provider: 'email' };
    await writeAccount(next);
    await AsyncStorage.removeItem(GUEST_KEY).catch(() => {});
    setUser(next);
    setStatus('signedIn');
    track('auth.signin', { provider: 'email' });
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const address = email.trim().toLowerCase();
    if (!address.includes('@')) throw new AuthError('unknown', 'That email address does not look right.');
    if (password.length < MIN_PASSWORD) throw new AuthError('weak_password', 'Use at least 6 characters.');
    const name = displayName.trim() || displayNameFor(address);
    const next: AuthUser = { id: idFor(address), email: address, displayName: name, handle: handleFrom(address, name), emailVerified: true, provider: 'email' };
    await writeAccount(next);
    await AsyncStorage.removeItem(GUEST_KEY).catch(() => {});
    setUser(next);
    setStatus('signedIn');
    track('auth.signup', { provider: 'email' });
    return 'signedIn' as const;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    // A server-backed build would resolve the OAuth redirect here (see app/auth/callback.tsx) and
    // hand back a verified Google identity. Locally we establish the same account shape, so every
    // downstream screen — settings, provider label, avatar — behaves exactly as it will in prod.
    await AsyncStorage.setItem(GOOGLE_ACCOUNT_KEY, '1').catch(() => {});
    await AsyncStorage.removeItem(GUEST_KEY).catch(() => {});
    await AsyncStorage.removeItem(DEMO_ACCOUNT_KEY).catch(() => {});
    await AsyncStorage.removeItem(ACCOUNT_KEY).catch(() => {});
    setUser(GOOGLE_USER);
    setStatus('signedIn');
    track('auth.signin', { provider: 'google' });
  }, []);

  const signInDemo = useCallback(async () => {
    await AsyncStorage.setItem(DEMO_ACCOUNT_KEY, '1').catch(() => {});
    await AsyncStorage.removeItem(GUEST_KEY).catch(() => {});
    await AsyncStorage.removeItem(GOOGLE_ACCOUNT_KEY).catch(() => {});
    setUser(DEMO_USER);
    setStatus('signedIn');
    track('auth.signin', { provider: 'demo' });
  }, []);

  const sendReset = useCallback(async (email: string) => {
    // No mail transport without a server. Keep the pending address so the UI can explain itself.
    const address = email.trim().toLowerCase();
    if (!address.includes('@')) throw new AuthError('unknown', 'That email address does not look right.');
    setPendingEmail(address);
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (password.length < MIN_PASSWORD) throw new AuthError('weak_password', 'Use at least 6 characters.');
    setRecoveryPending(false);
  }, []);

  const resendVerification = useCallback(async (email: string) => {
    setPendingEmail(email.trim().toLowerCase());
  }, []);

  const continueAsGuest = useCallback(() => {
    AsyncStorage.setItem(GUEST_KEY, '1').catch(() => {});
    AsyncStorage.removeItem(DEMO_ACCOUNT_KEY).catch(() => {});
    AsyncStorage.removeItem(GOOGLE_ACCOUNT_KEY).catch(() => {});
    setUser(null);
    setStatus('guest');
    track('auth.guest');
  }, []);

  const signOut = useCallback(async () => {
    await AsyncStorage.removeItem(GUEST_KEY).catch(() => {});
    await AsyncStorage.removeItem(ACCOUNT_KEY).catch(() => {});
    await AsyncStorage.removeItem(DEMO_ACCOUNT_KEY).catch(() => {});
    await AsyncStorage.removeItem(GOOGLE_ACCOUNT_KEY).catch(() => {});
    setUser(null);
    setRecoveryPending(false);
    setStatus('signedOut');
  }, []);

  const deleteAccount = useCallback(async () => {
    await AsyncStorage.removeItem(ACCOUNT_KEY).catch(() => {});
    await AsyncStorage.removeItem(DEMO_ACCOUNT_KEY).catch(() => {});
    await AsyncStorage.removeItem(GOOGLE_ACCOUNT_KEY).catch(() => {});
    await AsyncStorage.removeItem(GUEST_KEY).catch(() => {});
    setUser(null);
    setStatus('signedOut');
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      pendingEmail,
      recoveryPending,
      demo: true,
      signIn,
      signUp,
      signInWithGoogle,
      signInDemo,
      sendReset,
      updatePassword,
      resendVerification,
      continueAsGuest,
      signOut,
      deleteAccount,
      clearRecovery: () => setRecoveryPending(false),
    }),
    [status, user, pendingEmail, recoveryPending, signIn, signUp, signInWithGoogle, signInDemo, sendReset, updatePassword, resendVerification, continueAsGuest, signOut, deleteAccount],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
