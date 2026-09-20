import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export type AuthStatus = 'loading' | 'signedOut' | 'guest' | 'signedIn';
export type AuthProviderName = 'email' | 'google' | 'demo';

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
  isDemo: boolean;
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
const DEMO_KEY = 'hallyu.auth.demo';
const GUEST_KEY = 'hallyu.auth.guest';

const DEMO_USER: AuthUser = { id: 'me', displayName: 'Mina Park', handle: 'minapark', avatarUrl: 'https://i.pravatar.cc/240?img=47', provider: 'demo', emailVerified: true };

function handleFrom(email?: string, name?: string): string {
  const base = (name ?? email?.split('@')[0] ?? 'member').toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20) || 'member';
  return base;
}

function fromSession(s: Session): AuthUser {
  const u = s.user;
  const meta = (u.user_metadata ?? {}) as Record<string, string | undefined>;
  const displayName = meta.display_name ?? meta.full_name ?? meta.name ?? u.email?.split('@')[0] ?? 'Member';
  return {
    id: u.id,
    email: u.email ?? undefined,
    displayName,
    handle: meta.handle ?? handleFrom(u.email ?? undefined, displayName),
    avatarUrl: meta.avatar_url ?? meta.picture,
    provider: u.app_metadata?.provider === 'google' ? 'google' : 'email',
    emailVerified: !!u.email_confirmed_at,
  };
}

function normalise(e: unknown): AuthError {
  if (e instanceof AuthError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.toLowerCase();
  if (m.includes('network') || m.includes('fetch') || m.includes('failed to connect') || m.includes('timeout')) return new AuthError('network', 'We can’t reach Hallyu right now. Check your connection and try again.');
  if (m.includes('invalid login') || m.includes('invalid credentials') || m.includes('invalid email or password')) return new AuthError('credentials', 'That email and password don’t match. Try again or reset your password.');
  if (m.includes('already registered') || m.includes('already exists')) return new AuthError('exists', 'There’s already an account with this email. Sign in instead.');
  if (m.includes('not confirmed')) return new AuthError('unverified', 'Verify your email first — we sent you a link.');
  if (m.includes('password') && (m.includes('weak') || m.includes('at least'))) return new AuthError('weak_password', 'Use at least 8 characters, with a number or symbol.');
  if (m.includes('rate limit') || m.includes('too many')) return new AuthError('rate_limit', 'Too many attempts. Wait a minute and try again.');
  return new AuthError('unknown', msg || 'Something went wrong. Please try again.');
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [recoveryPending, setRecoveryPending] = useState(false);
  const isDemo = user?.provider === 'demo';
  const booted = useRef(false);

  // Boot: demo flag → guest flag → Supabase session
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    (async () => {
      try {
        if ((await AsyncStorage.getItem(DEMO_KEY)) === '1') {
          setUser(DEMO_USER);
          setStatus('signedIn');
          return;
        }
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          setUser(fromSession(data.session));
          setStatus('signedIn');
          return;
        }
        setStatus((await AsyncStorage.getItem(GUEST_KEY)) === '1' ? 'guest' : 'signedOut');
      } catch {
        setStatus('signedOut');
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryPending(true);
      if (session) {
        setUser(fromSession(session));
        setStatus('signedIn');
      } else if (event === 'SIGNED_OUT') {
        setUser((u) => (u?.provider === 'demo' ? u : null));
        setStatus((s) => (s === 'signedIn' && user?.provider === 'demo' ? s : 'signedOut'));
      }
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep links: email verification / password recovery / OAuth return
  useEffect(() => {
    const handle = async (url: string | null) => {
      if (!url || !url.includes('auth')) return;
      await applyAuthUrl(url);
    };
    Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, []);

  const applyAuthUrl = async (url: string) => {
    try {
      const parsed = Linking.parse(url);
      const fragment = url.includes('#') ? Object.fromEntries(new URLSearchParams(url.split('#')[1])) : {};
      const params = { ...(parsed.queryParams ?? {}), ...fragment } as Record<string, string>;
      if (params.type === 'recovery') setRecoveryPending(true);
      if (params.access_token && params.refresh_token) {
        await supabase.auth.setSession({ access_token: params.access_token, refresh_token: params.refresh_token });
      } else if (params.code) {
        await supabase.auth.exchangeCodeForSession(params.code);
      }
    } catch {
      /* ignore malformed links */
    }
  };

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      await AsyncStorage.removeItem(GUEST_KEY);
    } catch (e) {
      throw normalise(e);
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: displayName.trim(), handle: handleFrom(email, displayName) }, emailRedirectTo: Linking.createURL('/auth/callback') },
      });
      if (error) throw error;
      if (data.session) return 'signedIn' as const;
      setPendingEmail(email.trim());
      return 'verify' as const;
    } catch (e) {
      throw normalise(e);
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      const redirectTo = Linking.createURL('/auth/callback');
      const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
      if (error) throw error;
      if (!data.url) throw new AuthError('unknown', 'Google sign-in is not available right now.');
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === 'success' && result.url) await applyAuthUrl(result.url);
      else if (result.type === 'cancel' || result.type === 'dismiss') throw new AuthError('cancelled', 'Google sign-in was cancelled.');
    } catch (e) {
      throw normalise(e);
    }
  }, []);

  const signInDemo = useCallback(async () => {
    await AsyncStorage.setItem(DEMO_KEY, '1');
    await AsyncStorage.removeItem(GUEST_KEY);
    setUser(DEMO_USER);
    setStatus('signedIn');
  }, []);

  const sendReset = useCallback(async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: Linking.createURL('/auth/callback') });
      if (error) throw error;
    } catch (e) {
      throw normalise(e);
    }
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setRecoveryPending(false);
    } catch (e) {
      throw normalise(e);
    }
  }, []);

  const resendVerification = useCallback(async (email: string) => {
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: Linking.createURL('/auth/callback') } });
      if (error) throw error;
    } catch (e) {
      throw normalise(e);
    }
  }, []);

  const continueAsGuest = useCallback(() => {
    AsyncStorage.setItem(GUEST_KEY, '1').catch(() => {});
    setStatus('guest');
  }, []);

  const signOut = useCallback(async () => {
    await AsyncStorage.multiRemove([DEMO_KEY, GUEST_KEY]);
    setUser(null);
    setStatus('signedOut');
    try {
      await supabase.auth.signOut();
    } catch {
      /* offline sign-out still clears local session */
    }
  }, []);

  const deleteAccount = useCallback(async () => {
    // The real deletion runs server-side (Edge Function `delete-account`); the client only requests it and signs out.
    try {
      if (user && user.provider !== 'demo') await supabase.functions.invoke('delete-account').catch(() => {});
    } finally {
      await signOut();
    }
  }, [user, signOut]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      pendingEmail,
      recoveryPending,
      isDemo,
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
    [status, user, pendingEmail, recoveryPending, isDemo, signIn, signUp, signInWithGoogle, signInDemo, sendReset, updatePassword, resendVerification, continueAsGuest, signOut, deleteAccount],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
