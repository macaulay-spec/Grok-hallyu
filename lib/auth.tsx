/**
 * Dual-mode authentication for Hallyu:
 *   • Offline/Demo mode (`!lovableBackendAvailable`): device-local accounts in AsyncStorage so
 *     every screen, gate, and deep-link works without credentials.
 *   • Lovable Cloud mode (`lovableBackendAvailable`): authenticates against Lovable Cloud Auth
 *     (`getLovableClient().auth`) and calls the `delete-account` Edge Function on account deletion.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { reportError, track } from './analytics';
import { markBoot } from './boot';
import { getLovableClient, lovableBackendAvailable } from './data/lovableBackend';

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
  /** true while the build runs without a configured Lovable Cloud backend */
  demo: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<'signedIn' | 'verify'>;
  signInWithGoogle: () => Promise<void>;
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

const DEMO_USER: AuthUser = { id: 'demo-member', handle: 'you', displayName: 'You', email: 'demo@hallyu.app', emailVerified: true, provider: 'demo' };
const GOOGLE_USER: AuthUser = { id: 'google-member', handle: 'you', displayName: 'You', email: 'you@gmail.com', emailVerified: true, provider: 'google' };

const MIN_PASSWORD = 6;

function handleFrom(email?: string, name?: string): string {
  const base = (name ?? email?.split('@')[0] ?? 'member').toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20) || 'member';
  return base;
}

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

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    (async () => {
      try {
        const client = getLovableClient();
        if (client) {
          const { data } = await client.auth.getSession();
          const sbUser = data.session?.user;
          if (sbUser) {
            const meta = (sbUser.user_metadata ?? {}) as Record<string, unknown>;
            const next: AuthUser = {
              id: sbUser.id,
              email: sbUser.email,
              displayName: String(meta.display_name ?? meta.full_name ?? displayNameFor(sbUser.email ?? 'member')),
              handle: String(meta.handle ?? handleFrom(sbUser.email, String(meta.display_name ?? ''))),
              avatarUrl: typeof meta.avatar_url === 'string' ? meta.avatar_url : undefined,
              emailVerified: Boolean(sbUser.email_confirmed_at),
              provider: sbUser.app_metadata?.provider === 'google' ? 'google' : 'email',
            };
            setUser(next);
            markBoot('auth:signedIn');
            setStatus('signedIn');
            return;
          }
        }
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

    const client = getLovableClient();
    if (client) {
      const { data, error } = await client.auth.signInWithPassword({ email: address, password });
      if (error || !data.user) throw new AuthError('credentials', error?.message ?? 'Invalid email or password.');
      const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
      const next: AuthUser = {
        id: data.user.id,
        email: data.user.email ?? address,
        displayName: String(meta.display_name ?? displayNameFor(address)),
        handle: String(meta.handle ?? handleFrom(address)),
        avatarUrl: typeof meta.avatar_url === 'string' ? meta.avatar_url : undefined,
        emailVerified: Boolean(data.user.email_confirmed_at),
        provider: 'email',
      };
      await AsyncStorage.removeItem(GUEST_KEY).catch(() => {});
      setUser(next);
      setStatus('signedIn');
      track('auth.signin', { provider: 'email' });
      return;
    }

    const stored = await readAccount();
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
    const handle = handleFrom(address, name);

    const client = getLovableClient();
    if (client) {
      const { data, error } = await client.auth.signUp({
        email: address,
        password,
        options: { data: { display_name: name, handle } },
      });
      if (error) throw new AuthError('unknown', error.message);
      if (data.user && !data.session) {
        setPendingEmail(address);
        return 'verify' as const;
      }
      if (data.user) {
        const next: AuthUser = {
          id: data.user.id,
          email: address,
          displayName: name,
          handle,
          emailVerified: Boolean(data.user.email_confirmed_at),
          provider: 'email',
        };
        await AsyncStorage.removeItem(GUEST_KEY).catch(() => {});
        setUser(next);
        setStatus('signedIn');
        track('auth.signup', { provider: 'email' });
        return 'signedIn' as const;
      }
    }

    const next: AuthUser = { id: idFor(address), email: address, displayName: name, handle, emailVerified: true, provider: 'email' };
    await writeAccount(next);
    await AsyncStorage.removeItem(GUEST_KEY).catch(() => {});
    setUser(next);
    setStatus('signedIn');
    track('auth.signup', { provider: 'email' });
    return 'signedIn' as const;
  }, []);

  const signInWithGoogle = useCallback(async () => {
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
    const address = email.trim().toLowerCase();
    if (!address.includes('@')) throw new AuthError('unknown', 'That email address does not look right.');
    const client = getLovableClient();
    if (client) {
      const { error } = await client.auth.resetPasswordForEmail(address);
      if (error) throw new AuthError('unknown', error.message);
    }
    setPendingEmail(address);
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (password.length < MIN_PASSWORD) throw new AuthError('weak_password', 'Use at least 6 characters.');
    const client = getLovableClient();
    if (client) {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw new AuthError('unknown', error.message);
    }
    setRecoveryPending(false);
  }, []);

  const resendVerification = useCallback(async (email: string) => {
    const address = email.trim().toLowerCase();
    const client = getLovableClient();
    if (client) {
      await client.auth.resend({ type: 'signup', email: address });
    }
    setPendingEmail(address);
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
    const client = getLovableClient();
    if (client) {
      await client.auth.signOut().catch(() => {});
    }
    await AsyncStorage.removeItem(GUEST_KEY).catch(() => {});
    await AsyncStorage.removeItem(ACCOUNT_KEY).catch(() => {});
    await AsyncStorage.removeItem(DEMO_ACCOUNT_KEY).catch(() => {});
    await AsyncStorage.removeItem(GOOGLE_ACCOUNT_KEY).catch(() => {});
    setUser(null);
    setRecoveryPending(false);
    setStatus('signedOut');
  }, []);

  const deleteAccount = useCallback(async () => {
    const client = getLovableClient();
    if (client) {
      await client.functions.invoke('delete-account').catch(() => {});
      await client.auth.signOut().catch(() => {});
    }
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
      demo: !lovableBackendAvailable,
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
