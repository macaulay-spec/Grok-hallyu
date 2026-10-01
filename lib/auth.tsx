/**
 * Hallyu authentication — three doors into one cloud identity:
 *
 *   • Email: email + password against the app's own cloud (`/auth/*` in functions/). Passwords are
 *     PBKDF2-hashed server-side; sessions are HMAC-signed tokens; password reset works via a
 *     recovery key shown once at signup (no email infrastructure needed).
 *   • OAuth: Rork Auth (Google/Apple, PKCE + deep-link callback). Tokens live in SecureStore. The
 *     platform verifies the JWT server-side and stamps X-Rork-User-Id — clients cannot forge it.
 *   • Demo/guest: local modes so the full app works with zero credentials.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { reportError, track } from './analytics';
import { markBoot } from './boot';
import { RORK_APP_KEY, RORK_AUTH_URL, RORK_SCHEME, RORK_FUNCTIONS_URL, rorkAuthAvailable, rorkBackendAvailable } from '../constants/keys';

WebBrowser.maybeCompleteAuthSession();

export type AuthStatus = 'loading' | 'signedOut' | 'guest' | 'signedIn';

/** How this account was established. 'demo' is the shared, pre-populated device account. */
export type AuthProviderName = 'email' | 'google' | 'apple' | 'demo';

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
  code: 'network' | 'credentials' | 'exists' | 'unverified' | 'weak_password' | 'rate_limit' | 'unavailable' | 'cancelled' | 'unknown';
  constructor(code: AuthError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

interface AuthValue {
  status: AuthStatus;
  user: AuthUser | null;
  /** true while an OAuth browser session is in flight */
  isSigningIn: boolean;
  /** true while the build runs without the cloud backend */
  demo: boolean;
  /** true when this build has no Rork Auth configuration (sign-in buttons explain themselves) */
  oauthReady: boolean;
  error: string | null;
  clearError: () => void;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  /** Returns the one-time recovery key — the screen MUST show it for the user to save. */
  signUp: (email: string, password: string, displayName: string) => Promise<string>;
  signIn: (email: string, password: string) => Promise<void>;
  recoverPassword: (email: string, recoveryKey: string, newPassword: string) => Promise<void>;
  signInDemo: () => Promise<void>;
  continueAsGuest: () => void;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

type Json = Record<string, unknown>;

const Ctx = createContext<AuthValue | null>(null);
const GUEST_KEY = 'hallyu.auth.guest';
const DEMO_ACCOUNT_KEY = 'hallyu.auth.demo.v1';
const AT_KEY = 'hallyu.auth.accessToken';
const RT_KEY = 'hallyu.auth.refreshToken';
const USER_KEY = 'hallyu.auth.user.v2';

const DEMO_USER: AuthUser = { id: 'demo-member', handle: 'you', displayName: 'You', email: 'demo@hallyu.app', emailVerified: true, provider: 'demo' };

function handleFrom(email?: string, name?: string): string {
  const base = (name ?? email?.split('@')[0] ?? 'member').toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20) || 'member';
  return base;
}

function displayNameFor(email?: string, name?: string): string {
  const source = (name ?? email?.split('@')[0] ?? 'Member').trim();
  return source.charAt(0).toUpperCase() + source.slice(1);
}

/** Decode (not verify — the server verifies) the JWT payload for user info + expiry. */
function userFromToken(token: string): AuthUser | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64)) as { sub?: string; email?: string; name?: string; picture?: string; exp?: number };
    if (!payload.sub || (payload.exp && payload.exp * 1000 < Date.now())) return null;
    return {
      id: payload.sub,
      email: payload.email,
      displayName: displayNameFor(payload.email, payload.name),
      handle: handleFrom(payload.email, payload.name),
      avatarUrl: typeof payload.picture === 'string' ? payload.picture : undefined,
      emailVerified: true,
      provider: 'google',
    };
  } catch {
    return null;
  }
}

// PKCE (RFC 7636) — the auth code is useless to an interceptor without the verifier.
function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The live access token for backend calls (lib/data/rorkBackend.ts). */
let tokenCache: { access?: string; refresh?: string } = {};

export function currentAccessToken(): string | null {
  return tokenCache.access ?? null;
}

async function authPost<T>(path: string, body: Json): Promise<T> {
  const res = await fetch(`${RORK_AUTH_URL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const payload = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!res.ok) throw new AuthError('credentials', payload.error ?? payload.message ?? `Sign-in failed (${res.status})`);
  return payload;
}

/** POST to the app's own cloud auth; maps status codes onto AuthError codes. */
async function cloudPost<T extends Json>(path: string, body: Json): Promise<T> {
  if (!rorkBackendAvailable) throw new AuthError('unavailable', 'The cloud backend isn’t configured in this build.');
  let res: Response;
  try {
    res = await fetch(`${RORK_FUNCTIONS_URL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new AuthError('network', 'Could not reach the cloud — check your connection.');
  }
  const payload = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    const message = payload.error ?? `That didn’t work (${res.status})`;
    const code: AuthError['code'] = res.status === 409 ? 'exists' : res.status === 429 ? 'rate_limit' : res.status === 400 ? 'weak_password' : 'credentials';
    throw new AuthError(code, message);
  }
  return payload;
}

function callbackFrom(url: string | null): { code: string } | null {
  if (!url || !url.startsWith(RORK_SCHEME)) return null;
  const params = new URL(url).searchParams;
  const code = params.get('code');
  return code ? { code } : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isSigningIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const booted = useRef(false);
  const verifierRef = useRef<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const persistTokens = useCallback(async (access: string, refresh?: string) => {
    tokenCache = { access, refresh: refresh ?? tokenCache.refresh };
    await SecureStore.setItemAsync(AT_KEY, access).catch(() => {});
    if (refresh) await SecureStore.setItemAsync(RT_KEY, refresh).catch(() => {});
  }, []);

  const refresh = useCallback(async (): Promise<AuthUser | null> => {
    const rt = tokenCache.refresh ?? (await SecureStore.getItemAsync(RT_KEY).catch(() => null));
    if (!rt || !rorkAuthAvailable) return null;
    try {
      const out = await authPost<{ access_token: string }>('/oauth/refresh', { app_key: RORK_APP_KEY, refresh_token: rt });
      await persistTokens(out.access_token);
      const next = userFromToken(out.access_token);
      if (next) setUser(next);
      return next;
    } catch {
      tokenCache = {};
      await SecureStore.deleteItemAsync(AT_KEY).catch(() => {});
      await SecureStore.deleteItemAsync(RT_KEY).catch(() => {});
      return null;
    }
  }, [persistTokens]);

  // Boot: restore the session from SecureStore (refreshing an expired token).
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    (async () => {
      try {
        if ((await AsyncStorage.getItem(GUEST_KEY)) === '1') {
          setStatus('guest');
          markBoot('auth:guest');
          return;
        }
        if ((await AsyncStorage.getItem(DEMO_ACCOUNT_KEY)) === '1') {
          setUser(DEMO_USER);
          setStatus('signedIn');
          markBoot('auth:demo');
          return;
        }
        const at = await SecureStore.getItemAsync(AT_KEY).catch(() => null);
        const restored = at ? userFromToken(at) : null;
        if (restored) {
          tokenCache = { access: at ?? undefined };
          setUser(restored);
          setStatus('signedIn');
          markBoot('auth:restored');
          return;
        }
        // Email session: the token is opaque (server HMAC), so validate it against the cloud and
        // refresh the profile snapshot while we're at it. Offline: trust the stored snapshot.
        const storedUser = at ? await SecureStore.getItemAsync(USER_KEY).catch(() => null) : null;
        if (at && storedUser) {
          const fallback = JSON.parse(storedUser) as AuthUser;
          if (rorkBackendAvailable) {
            const res = await fetch(`${RORK_FUNCTIONS_URL}/auth/session`, { headers: { Authorization: `Bearer ${at}` } }).catch(() => null);
            if (res?.ok) {
              const { user: fresh } = (await res.json()) as { user?: { id: string; email?: string; displayName: string; handle: string } };
              const next: AuthUser = fresh
                ? { id: fresh.id, email: fresh.email ?? fallback.email, displayName: fresh.displayName, handle: fresh.handle, emailVerified: true, provider: 'email' }
                : fallback;
              tokenCache = { access: at };
              await SecureStore.setItemAsync(USER_KEY, JSON.stringify(next)).catch(() => {});
              setUser(next);
              setStatus('signedIn');
              markBoot('auth:email');
              return;
            }
            // Expired/revoked session: clear it and land on the sign-in screen.
            tokenCache = {};
            await SecureStore.deleteItemAsync(AT_KEY).catch(() => {});
            await SecureStore.deleteItemAsync(USER_KEY).catch(() => {});
            setStatus('signedOut');
            markBoot('auth:email-expired');
            return;
          }
          tokenCache = { access: at };
          setUser(fallback);
          setStatus('signedIn');
          markBoot('auth:email-offline');
          return;
        }
        const viaRefresh = await refresh();
        if (viaRefresh) {
          setStatus('signedIn');
          markBoot('auth:refreshed');
          return;
        }
        setStatus('signedOut');
        markBoot('auth:signedOut');
      } catch (e) {
        reportError('auth.boot', e);
        markBoot('auth:boot-failed');
        setStatus('signedOut');
      }
    })();
  }, [refresh]);

  const exchange = useCallback(
    async (code: string, code_verifier: string): Promise<boolean> => {
      const out = await authPost<{ access_token: string; refresh_token?: string }>('/oauth/token', { app_key: RORK_APP_KEY, code, code_verifier });
      await persistTokens(out.access_token, out.refresh_token);
      const next = userFromToken(out.access_token);
      if (!next) return false;
      await AsyncStorage.removeItem(GUEST_KEY).catch(() => {});
      setUser(next);
      setStatus('signedIn');
      return true;
    },
    [persistTokens],
  );

  const signInWithProvider = useCallback(
    async (provider: 'google' | 'apple') => {
      if (!rorkAuthAvailable) throw new AuthError('unavailable', 'Sign-in isn’t configured in this build.');
      setSigningIn(true);
      setError(null);
      const verifier = generateCodeVerifier();
      verifierRef.current = verifier;
      try {
        const initiate = await authPost<{ auth_url: string }>('/oauth/initiate', {
          app_key: RORK_APP_KEY,
          provider,
          code_challenge: await generateCodeChallenge(verifier),
          target: 'rn',
          env: Platform.OS === 'web' ? 'preview' : 'native',
        });
        const result = await WebBrowser.openAuthSessionAsync(initiate.auth_url, `${RORK_SCHEME}://auth/callback`);
        if (result.type !== 'success' || !result.url) throw new AuthError('cancelled', 'Sign-in was cancelled.');
        const cb = callbackFrom(result.url);
        if (!cb) throw new AuthError('unknown', 'The sign-in response was incomplete — try again.');
        const ok = await exchange(cb.code, verifier);
        if (!ok) throw new AuthError('unknown', 'Could not read the sign-in result — try again.');
        track('auth.signin', { provider });
      } catch (e) {
        if (e instanceof AuthError) {
          if (e.code !== 'cancelled') setError(e.message);
          throw e;
        }
        reportError('auth.oauth', e, { provider });
        const message = 'Could not reach sign-in — check your connection.';
        setError(message);
        throw new AuthError('network', message);
      } finally {
        verifierRef.current = null;
        setSigningIn(false);
      }
    },
    [exchange],
  );

  // Deep links (warm/cold start): complete a pending exchange when the browser hands back the code.
  useEffect(() => {
    const handle = (url: string | null) => {
      const cb = callbackFrom(url);
      const verifier = verifierRef.current;
      if (cb && verifier) void exchange(cb.code, verifier).catch((e) => reportError('auth.deeplink', e));
    };
    const sub = Linking.addEventListener('url', (event) => handle(event.url));
    void Linking.getInitialURL().then(handle);
    return () => sub.remove();
  }, [exchange]);

  const signInWithGoogle = useCallback(() => signInWithProvider('google'), [signInWithProvider]);
  const signInWithApple = useCallback(() => signInWithProvider('apple'), [signInWithProvider]);

  const adoptSession = useCallback(async (token: string, next: AuthUser) => {
    tokenCache = { access: token };
    await SecureStore.setItemAsync(AT_KEY, token).catch(() => {});
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(next)).catch(() => {});
    await AsyncStorage.removeItem(GUEST_KEY).catch(() => {});
    await AsyncStorage.removeItem(DEMO_ACCOUNT_KEY).catch(() => {});
    setUser(next);
    setStatus('signedIn');
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, displayName: string): Promise<string> => {
      const address = email.trim().toLowerCase();
      if (!address.includes('@')) throw new AuthError('credentials', 'That email address does not look right.');
      if (password.length < 8) throw new AuthError('weak_password', 'Use at least 8 characters for your password.');
      setError(null);
      const out = await cloudPost<{ token: string; user: { id: string; email?: string; displayName: string; handle: string }; recovery_code: string }>('/auth/signup', {
        email: address,
        password,
        displayName: displayName.trim(),
      });
      await adoptSession(out.token, { id: out.user.id, email: out.user.email ?? address, displayName: out.user.displayName, handle: out.user.handle, emailVerified: true, provider: 'email' });
      track('auth.signup', { provider: 'email' });
      return out.recovery_code;
    },
    [adoptSession],
  );

  const signIn = useCallback(
    async (email: string, password: string): Promise<void> => {
      const address = email.trim().toLowerCase();
      if (!address.includes('@')) throw new AuthError('credentials', 'Enter the email address you signed up with.');
      setError(null);
      const out = await cloudPost<{ token: string; user: { id: string; email?: string; displayName: string; handle: string } }>('/auth/signin', { email: address, password });
      await adoptSession(out.token, { id: out.user.id, email: out.user.email ?? address, displayName: out.user.displayName, handle: out.user.handle, emailVerified: true, provider: 'email' });
      track('auth.signin', { provider: 'email' });
    },
    [adoptSession],
  );

  const recoverPassword = useCallback(
    async (email: string, recoveryKey: string, newPassword: string): Promise<void> => {
      const address = email.trim().toLowerCase();
      setError(null);
      const out = await cloudPost<{ token: string; user: { id: string; email?: string; displayName: string; handle: string } }>('/auth/recover', {
        email: address,
        code: recoveryKey.trim(),
        newPassword,
      });
      await adoptSession(out.token, { id: out.user.id, email: out.user.email ?? address, displayName: out.user.displayName, handle: out.user.handle, emailVerified: true, provider: 'email' });
      track('auth.signin', { provider: 'email-recovery' });
    },
    [adoptSession],
  );

  const signInDemo = useCallback(async () => {
    await AsyncStorage.setItem(DEMO_ACCOUNT_KEY, '1').catch(() => {});
    await AsyncStorage.removeItem(GUEST_KEY).catch(() => {});
    setUser(DEMO_USER);
    setStatus('signedIn');
    track('auth.signin', { provider: 'demo' });
  }, []);

  const continueAsGuest = useCallback(() => {
    AsyncStorage.setItem(GUEST_KEY, '1').catch(() => {});
    AsyncStorage.removeItem(DEMO_ACCOUNT_KEY).catch(() => {});
    setUser(null);
    setStatus('guest');
    track('auth.guest');
  }, []);

  const signOut = useCallback(async () => {
    // Revoke the server session for email accounts (OAuth tokens simply expire). Fire-and-forget.
    if (user?.provider === 'email' && tokenCache.access) {
      void fetch(`${RORK_FUNCTIONS_URL}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${tokenCache.access}` } }).catch(() => {});
    }
    tokenCache = {};
    await SecureStore.deleteItemAsync(AT_KEY).catch(() => {});
    await SecureStore.deleteItemAsync(RT_KEY).catch(() => {});
    await SecureStore.deleteItemAsync(USER_KEY).catch(() => {});
    await AsyncStorage.removeItem(GUEST_KEY).catch(() => {});
    await AsyncStorage.removeItem(DEMO_ACCOUNT_KEY).catch(() => {});
    setUser(null);
    setStatus('signedOut');
  }, [user]);

  const deleteAccount = useCallback(async () => {
    const token = currentAccessToken();
    if (token && rorkBackendAvailable) {
      // The server purges every row the user owns (posts, comments, reactions, follows, saves,
      // watchlist, collections, notifications, events, account, profile) — a hard, GDPR-style wipe.
      await fetch(`${RORK_FUNCTIONS_URL}/account`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    }
    await signOut();
  }, [signOut]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      isSigningIn,
      demo: !rorkBackendAvailable,
      oauthReady: rorkAuthAvailable,
      error,
      clearError,
      signInWithGoogle,
      signInWithApple,
      signUp,
      signIn,
      recoverPassword,
      signInDemo,
      continueAsGuest,
      signOut,
      deleteAccount,
    }),
    [status, user, isSigningIn, error, clearError, signInWithGoogle, signInWithApple, signUp, signIn, recoverPassword, signInDemo, continueAsGuest, signOut, deleteAccount],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
