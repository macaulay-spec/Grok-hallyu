/**
 * Authentication — device-local only.
 *
 * There is no auth server in this build: an "account" is a profile stored in AsyncStorage on this
 * device (sign-up creates it, sign-in opens it, sign-out closes it) and a guest has no account at
 * all. Nothing is transmitted anywhere — no session, token or password leaves the phone. A real
 * credential service (email delivery, verification links, password reset, cross-device sessions)
 * belongs to a later backend phase; the flows that would need one report that honestly instead of
 * pretending an email was sent or a password was checked.
 *
 * Screens depend only on the AuthValue contract below, which this local implementation keeps intact.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { reportError, track } from './analytics';
import { markBoot } from './boot';

export type AuthStatus = 'loading' | 'signedOut' | 'guest' | 'signedIn';

/** How this account was established. */
export type AuthProviderName = 'email';

export interface AuthUser {
  id: string;
  email?: string;
  displayName: string;
  handle: string;
  avatarUrl?: string;
  emailVerified: boolean;
  provider: AuthProviderName;
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
  recoveryPending: boolean;
  /** 'verify' is reserved for a future email-verification flow; the local build always signs in. */
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<'signedIn' | 'verify'>;
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

const MIN_PASSWORD = 6;

/** Honest message for the flows that need an email service this build does not have. */
const NO_MAIL = 'Email isn’t sent from this build — accounts live on this device only.';

function handleFrom(email?: string, name?: string): string {
  const base =
    (name ?? email?.split('@')[0] ?? 'member')
      .toLowerCase()
      .replace(/[^a-z0-9_.]/g, '')
      .slice(0, 20) || 'member';
  return base;
}

/** Deterministic id for the device-local account: the same email always maps to the same account. */
function idFor(email: string): string {
  return `local-${handleFrom(email)}`;
}

function displayNameFor(email: string): string {
  const local = email.split('@')[0] ?? 'Member';
  return local.charAt(0).toUpperCase() + local.slice(1);
}

async function readLocalAccount(): Promise<AuthUser | null> {
  try {
    const raw = await AsyncStorage.getItem(ACCOUNT_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

async function writeLocalAccount(user: AuthUser): Promise<void> {
  await AsyncStorage.setItem(ACCOUNT_KEY, JSON.stringify(user)).catch(() => {});
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [recoveryPending, setRecoveryPending] = useState(false);
  const booted = useRef(false);

  // Boot. The local account resolves straight from storage — no network, no timeout needed.
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    (async () => {
      try {
        const local = await readLocalAccount();
        if (local) {
          setUser(local);
          setStatus('signedIn');
          markBoot('auth:local-account');
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
    // The same account on the same device keeps its display name.
    const stored = await readLocalAccount();
    const next: AuthUser =
      stored && stored.email === address && stored.provider === 'email'
        ? stored
        : { id: idFor(address), email: address, displayName: displayNameFor(address), handle: handleFrom(address), emailVerified: true, provider: 'email' };
    await writeLocalAccount(next);
    await AsyncStorage.removeItem(GUEST_KEY).catch(() => {});
    setUser(next);
    setStatus('signedIn');
    track('auth.signin', { provider: next.provider });
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const address = email.trim().toLowerCase();
    if (!address.includes('@')) throw new AuthError('unknown', 'That email address does not look right.');
    if (password.length < MIN_PASSWORD) throw new AuthError('weak_password', 'Use at least 6 characters.');
    const name = displayName.trim() || displayNameFor(address);
    const next: AuthUser = { id: idFor(address), email: address, displayName: name, handle: handleFrom(address, name), emailVerified: true, provider: 'email' };
    await writeLocalAccount(next);
    await AsyncStorage.removeItem(GUEST_KEY).catch(() => {});
    setUser(next);
    setStatus('signedIn');
    track('auth.signup', { provider: 'email' });
    return 'signedIn' as const;
  }, []);

  const sendReset = useCallback(async (email: string) => {
    const address = email.trim().toLowerCase();
    if (!address.includes('@')) throw new AuthError('unknown', 'That email address does not look right.');
    // No mail service exists here — say so instead of pretending a link was sent.
    throw new AuthError('unknown', NO_MAIL);
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (password.length < MIN_PASSWORD) throw new AuthError('weak_password', 'Use at least 6 characters.');
    throw new AuthError('unknown', 'Password changes aren’t available yet — this account is stored on this device only.');
  }, []);

  const resendVerification = useCallback(async (email: string) => {
    if (!email.includes('@')) throw new AuthError('unknown', 'That email address does not look right.');
    throw new AuthError('unknown', NO_MAIL);
  }, []);

  const continueAsGuest = useCallback(() => {
    AsyncStorage.setItem(GUEST_KEY, '1').catch(() => {});
    setUser(null);
    setStatus('guest');
    track('auth.guest');
  }, []);

  const signOut = useCallback(async () => {
    await AsyncStorage.removeItem(GUEST_KEY).catch(() => {});
    await AsyncStorage.removeItem(ACCOUNT_KEY).catch(() => {});
    setUser(null);
    setRecoveryPending(false);
    setStatus('signedOut');
  }, []);

  const deleteAccount = useCallback(async () => {
    // No server holds anything: deleting means wiping this device's copy of the account.
    await AsyncStorage.removeItem(ACCOUNT_KEY).catch(() => {});
    await AsyncStorage.removeItem(GUEST_KEY).catch(() => {});
    setUser(null);
    setStatus('signedOut');
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      recoveryPending,
      signIn,
      signUp,
      sendReset,
      updatePassword,
      resendVerification,
      continueAsGuest,
      signOut,
      deleteAccount,
      clearRecovery: () => setRecoveryPending(false),
    }),
    [status, user, recoveryPending, signIn, signUp, sendReset, updatePassword, resendVerification, continueAsGuest, signOut, deleteAccount],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
