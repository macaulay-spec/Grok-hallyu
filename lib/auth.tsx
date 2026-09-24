import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';
import { track, reportError } from './analytics';

WebBrowser.maybeCompleteAuthSession();

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

/**
 * Map an OAuth error returned on the deep-link callback (Google → Supabase → app) to a
 * user-facing message. Provider-side failures (e.g. `invalid_client`) previously vanished into a
 * silent catch, so the sign-in button appeared to do nothing. We now surface a clear message.
 */
function oauthMessage(code: string, description: string): string {
  const c = code.toLowerCase();
  if (c === 'access_denied') return 'Google sign-in was cancelled.';
  if (c === 'invalid_client' || c === 'unauthorized_client') {
    return 'Google sign-in is not configured correctly on the server. Please use email sign-in.';
  }
  if (c === 'redirect_uri_mismatch') {
    return 'Google sign-in is not configured correctly on the server. Please use email sign-in.';
  }
  return description || 'Google sign-in could not be completed. Please try again or use email sign-in.';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [recoveryPending, setRecoveryPending] = useState(false);
  const booted = useRef(false);

  // Boot: guest flag → Supabase session
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    (async () => {
      try {
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
        setUser(null);
        setStatus('signedOut');
      }
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep links: email verification / password recovery / OAuth return
  useEffect(() => {
    const handle = async (url: string | null) => {
      if (!url || !url.includes('auth')) return;
      try {
        await applyAuthUrl(url);
      } catch (e) {
        reportError('auth.deepLink', e);
      }
    };
    Linking.getInitialURL().then(handle).catch((e) => reportError('auth.initialUrl', e));
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, []);

  const applyAuthUrl = async (url: string) => {
    const parsed = Linking.parse(url);
    const fragment = url.includes('#') ? Object.fromEntries(new URLSearchParams(url.split('#')[1])) : {};
    const params = { ...(parsed.queryParams ?? {}), ...fragment } as Record<string, string>;
    // OAuth failures come back as ?error=...&error_description=... — surface them instead of
    // silently doing nothing (a silent catch here is what hid the invalid_client failure).
    if (params.error) {
      const desc = params.error_description ?? params.error;
      reportError('auth.oauth', new Error(`${params.error}: ${desc}`));
      throw new AuthError('unknown', oauthMessage(params.error, desc));
    }
    if (params.type === 'recovery') setRecoveryPending(true);
    if (params.access_token && params.refresh_token) {
      await supabase.auth.setSession({ access_token: params.access_token, refresh_token: params.refresh_token });
    } else if (params.code) {
      await supabase.auth.exchangeCodeForSession(params.code);
    }
  };

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      await AsyncStorage.removeItem(GUEST_KEY);
      track('auth.signin', { provider: 'email' });
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
    track('auth.guest');
  }, []);

  const signOut = useCallback(async () => {
    await AsyncStorage.removeItem(GUEST_KEY);
    setUser(null);
    setStatus('signedOut');
    try {
      await supabase.auth.signOut();
    } catch {
      /* offline sign-out still clears local session */
    }
  }, []);

  const deleteAccount = useCallback(async () => {
    // The real deletion runs server-side (Edge Function `delete-account`). If it fails we surface it
    // and keep the session so the member can retry — we never report a deletion that didn't happen.
    if (user) {
      const { error } = await supabase.functions.invoke('delete-account');
      if (error) throw new AuthError('unknown', error.message || 'Deletion failed — try again, or email privacy@hallyu.app.');
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
