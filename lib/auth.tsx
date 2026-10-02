/**
 * Hallyu authentication — Rork Auth (Google/Apple, PKCE + deep-link callback) is the single door
 * into the cloud identity; guests browse the public world without credentials.
 *
 * The JWT lives in SecureStore. lib/supabase attaches it to every cloud request, and server-side
 * Row Level Security (`user_id()` = the JWT `sub`) authorizes each row — the client cannot forge
 * an identity. The Postgres `profiles` row is the social identity (handle, avatar, counts) and is
 * synced at sign-in; account deletion runs the `delete_account()` database RPC (a hard wipe).
 *
 * OAuth plumbing follows the Rork Auth contract exactly: on web (the Rork preview iframe) the
 * sign-in popup completes on Rork's callback page and postMessages the code back; on native the
 * browser session redirects to `rork-<project>://auth/callback`. Every fetch carries a hard
 * timeout — a stalled network must surface as an error, never a spinner that never stops.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState as RNAppState, Platform } from 'react-native';
import { RORK_APP_KEY, RORK_AUTH_URL, RORK_SCHEME, rorkAuthAvailable } from '../constants/keys';
import { reportError, track } from './analytics';
import { markBoot } from './boot';
import { setAccessTokenProvider, supabase } from './supabase';
import { canRenew, expiryOf, passIsFresh } from './session';

WebBrowser.maybeCompleteAuthSession();

export type AuthStatus = 'loading' | 'signedOut' | 'guest' | 'signedIn';

export type AuthProviderName = 'google' | 'apple';

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
  code: 'network' | 'credentials' | 'exists' | 'weak_password' | 'rate_limit' | 'unavailable' | 'cancelled' | 'unknown';
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
  /** true when this build has Rork Auth configuration (sign-in buttons explain themselves) */
  oauthReady: boolean;
  error: string | null;
  clearError: () => void;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  continueAsGuest: () => void;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

type Json = Record<string, unknown>;

const Ctx = createContext<AuthValue | null>(null);
const GUEST_KEY = 'hallyu.auth.guest';
const AT_KEY = 'hallyu.auth.accessToken';
const RT_KEY = 'hallyu.auth.refreshToken';
const USER_KEY = 'hallyu.auth.user.v2';

function handleFrom(email?: string, name?: string): string {
  const base = (name ?? email?.split('@')[0] ?? 'member').toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20) || 'member';
  return base;
}

function displayNameFor(email?: string, name?: string): string {
  const source = (name ?? email?.split('@')[0] ?? 'Member').trim();
  return source.charAt(0).toUpperCase() + source.slice(1);
}

// ---------------------------------------------------------------------------------------------
// base64url — Hermes-safe (no atob/btoa/crypto.subtle on device)
// ---------------------------------------------------------------------------------------------
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_REV: Record<string, number> = Object.fromEntries([...B64URL].map((c, i) => [c, i]));

function bytesToB64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b = bytes[i] ?? 0;
    const c = bytes[i + 1];
    const d = bytes[i + 2];
    out += B64URL[b >> 2];
    out += B64URL[((b & 3) << 4) | ((c ?? 0) >> 4)];
    if (c === undefined) break;
    out += B64URL[((c & 15) << 2) | ((d ?? 0) >> 6)];
    if (d === undefined) break;
    out += B64URL[d & 63];
  }
  return out;
}

function b64UrlToBytes(s: string): Uint8Array {
  const clean = s.replace(/-/g, '-').replace(/_/g, '_'); // already url-safe
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    const v = B64_REV[ch];
    if (v === undefined) continue;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

/** Decode (not verify — the server verifies) the JWT payload for user info + expiry. */
function userFromToken(token: string): AuthUser | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64UrlToBytes(parts[1]))) as {
      sub?: string;
      email?: string;
      name?: string;
      picture?: string;
      exp?: number;
    };
    if (!payload.sub || (payload.exp && payload.exp * 1000 < Date.now())) return null;
    return {
      id: payload.sub,
      email: payload.email,
      displayName: displayNameFor(payload.email, payload.name),
      handle: handleFrom(payload.email, payload.name),
      avatarUrl: typeof payload.picture === 'string' ? payload.picture : undefined,
      emailVerified: true,
      provider: payload.email && payload.email.includes('privaterelay.appleid.com') ? 'apple' : 'google',
    };
  } catch {
    return null;
  }
}

// PKCE (RFC 7636) — the auth code is useless to an interceptor without the verifier.
function generateCodeVerifier(): string {
  return bytesToB64Url(new Uint8Array(Crypto.getRandomBytes(32)));
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const hex = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.HEX });
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytesToB64Url(bytes);
}

/**
 * The live access token for backend calls (lib/supabase.ts, lib/data/supabaseBackend.ts).
 *
 * A Rork sign-in pass is valid for one hour; Rork expects the app to renew it quietly, and
 * `POST /oauth/refresh` swaps the long-lived refresh token for a new pass. Renewal therefore has
 * to happen while the app runs, not only at boot: an expired pass still *looks* like a session
 * (the id decodes, the cache is non-empty) but every cloud request is rejected, which shows up as
 * "nothing saves" and empty screens. Everything that talks to the cloud goes through
 * {@link freshAccessToken}, which renews ahead of expiry, single-flight, and only ever gives up
 * when the refresh token itself is refused.
 */
let tokenCache: { access?: string; refresh?: string } = {};
/** Epoch ms at which `tokenCache.access` stops being accepted (from the JWT's `exp`). */
let tokenExpiresAt = 0;
let renewing: Promise<string | null> | null = null;
let sessionLost: (() => void) | null = null;

/** A synchronous peek. Means "this device thinks it is signed in", never "the pass is valid". */
export function currentAccessToken(): string | null {
  return tokenCache.access ?? null;
}

/** True when a signed-in session exists on this device (valid, stale or renewable). */
export function hasCloudSession(): boolean {
  return !!(tokenCache.access || tokenCache.refresh);
}

export function setSessionLostHandler(handler: (() => void) | null): void {
  sessionLost = handler;
}

/**
 * The token to put on a cloud request. Renews the pass when it is missing, expired, or about to
 * expire; concurrent callers share one refresh. Resolves `null` only when there is no session at
 * all (guest / signed out) — a *failed* renewal throws so the caller can tell network from refusal
 * instead of dropping the work silently.
 */
export function freshAccessToken(): Promise<string | null> {
  const cached = tokenCache.access;
  if (passIsFresh(cached, tokenExpiresAt)) return Promise.resolve(cached!);
  if (!hasCloudSession()) return Promise.resolve(null);
  if (!renewing) renewing = renewPass().finally(() => (renewing = null));
  return renewing;
}

/** Swap the refresh token for a new one-hour pass (single-flight; see freshAccessToken). */
async function renewPass(): Promise<string | null> {
  const rt = tokenCache.refresh ?? (await SecureStore.getItemAsync(RT_KEY).catch(() => null));
  if (!canRenew({ refresh: rt ?? undefined }) || !rorkAuthAvailable) {
    // The pass expired and there is nothing to renew it with: the session is over. (Guests have
    // neither token and are untouched.) Clear the dead pass so the UI stops claiming a session.
    if (tokenCache.access) {
      tokenCache = {};
      tokenExpiresAt = 0;
      await SecureStore.deleteItemAsync(AT_KEY).catch(() => {});
      sessionLost?.();
    }
    return null;
  }
  try {
    const out = await authPost<{ access_token: string }>('/oauth/refresh', { app_key: RORK_APP_KEY, refresh_token: rt });
    await persistToken(out.access_token);
    return out.access_token;
  } catch (e) {
    // "credentials" means Rork refused the refresh token: the session is genuinely over, so drop
    // it and tell the UI. Anything else (offline, timeout, 5xx) keeps the session — the pass is
    // still renewable and a retry will succeed.
    if (e instanceof AuthError && e.code === 'credentials') {
      tokenCache = {};
      tokenExpiresAt = 0;
      await SecureStore.deleteItemAsync(AT_KEY).catch(() => {});
      await SecureStore.deleteItemAsync(RT_KEY).catch(() => {});
      sessionLost?.();
    }
    throw e;
  }
}

/** Store a fresh pass together with its expiry (SecureStore + the request cache). */
async function persistToken(access: string, refresh?: string): Promise<void> {
  tokenCache = { access, refresh: refresh ?? tokenCache.refresh };
  tokenExpiresAt = expiryOf(access);
  await SecureStore.setItemAsync(AT_KEY, access).catch(() => {});
  if (refresh) await SecureStore.setItemAsync(RT_KEY, refresh).catch(() => {});
}

// Feed the cloud client live tokens (lib/supabase attaches one to every request).
setAccessTokenProvider(freshAccessToken);

async function authPost<T>(path: string, body: Json): Promise<T> {
  // Hard timeout: a stalled network must surface as an error, never hang the spinner forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${RORK_AUTH_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
    if (!res.ok) throw new AuthError('credentials', payload.error ?? payload.message ?? `Sign-in failed (${res.status})`);
    return payload;
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw new AuthError('network', 'Could not reach sign-in — check your connection.');
  } finally {
    clearTimeout(timer);
  }
}

/** Upsert the Postgres profile row — the social identity (handle uniqueness retried with a suffix). */
async function ensureProfile(user: AuthUser): Promise<void> {
  const base = { id: user.id, display_name: user.displayName, avatar_url: user.avatarUrl ?? null, email: user.email ?? null };
  const attempt = async (handle: string) =>
    supabase.from('profiles').upsert({ ...base, handle }, { onConflict: 'id' }).select('id').single();
  let result = await attempt(user.handle);
  if (result.error?.code === '23505') {
    result = await attempt(`${user.handle}-${Math.random().toString(36).slice(2, 6)}`);
  }
  if (result.error) reportError('auth.ensureProfile', result.error);
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
    await persistToken(access, refresh);
  }, []);

  /**
   * Boot-time (and manual) renewal. Uses the shared {@link freshAccessToken}, so a renewal that
   * fails because the network is down leaves the session intact for a retry instead of signing the
   * member out; only a refused refresh token ends the session.
   */
  const refresh = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const access = await freshAccessToken();
      if (!access) return null;
      const next = userFromToken(access);
      if (next) setUser(next);
      return next;
    } catch {
      return null;
    }
  }, []);

  // A refused refresh token ends the session for good: reflect it in the UI immediately.
  useEffect(() => {
    setSessionLostHandler(() => {
      setUser(null);
      setStatus('signedOut');
      reportError('auth.session-expired', new Error('Rork refused the refresh token'));
    });
    return () => setSessionLostHandler(null);
  }, []);

  // On foreground, renew a pass that aged while the app was in the background, so the first tap is
  // never the thing that discovers the session went stale.
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (st) => {
      if (st !== 'active' || !hasCloudSession()) return;
      void freshAccessToken().catch(() => {});
    });
    return () => sub.remove();
  }, []);

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
        const at = await SecureStore.getItemAsync(AT_KEY).catch(() => null);
        const restored = at ? userFromToken(at) : null;
        if (restored && at) {
          // Cache the pass *with* its expiry and the refresh token: renewal later in the session
          // must not have to re-read the keychain, and freshness checks need `exp`.
          const rt = await SecureStore.getItemAsync(RT_KEY).catch(() => null);
          tokenCache = { access: at, refresh: rt ?? undefined };
          tokenExpiresAt = expiryOf(at);
          setUser(restored);
          setStatus('signedIn');
          void ensureProfile(restored);
          markBoot('auth:restored');
          return;
        }
        const viaRefresh = await refresh();
        if (viaRefresh) {
          void ensureProfile(viaRefresh);
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
      void ensureProfile(next);
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

        let code: string | undefined;
        if (Platform.OS === 'web') {
          // Web preview: a popup completes OAuth on Rork's callback page, which postMessages the
          // code back to this window. Without this listener the session never resolves and the
          // button spins forever — the exact bug this branch fixes.
          code = await new Promise<string>((resolve, reject) => {
            const popup = window.open(initiate.auth_url, '_blank', 'width=500,height=650');
            let settled = false;
            const finish = (fn: () => void) => {
              if (settled) return;
              settled = true;
              window.removeEventListener('message', onMessage);
              clearInterval(poll);
              fn();
            };
            const onMessage = (event: MessageEvent) => {
              if (event.data?.type !== 'rork_auth_callback') return;
              const got = typeof event.data.code === 'string' ? (event.data.code as string) : null;
              finish(() => (got ? resolve(got) : reject(new AuthError('unknown', 'The sign-in response was incomplete — try again.'))));
            };
            const poll = setInterval(() => {
              if (popup?.closed) finish(() => reject(new AuthError('cancelled', 'Sign-in was cancelled.')));
            }, 500);
            window.addEventListener('message', onMessage);
          });
        } else {
          const result = await WebBrowser.openAuthSessionAsync(initiate.auth_url, `${RORK_SCHEME}://auth/callback`);
          if (result.type !== 'success' || !result.url) throw new AuthError('cancelled', 'Sign-in was cancelled.');
          code = callbackFrom(result.url)?.code;
        }
        if (!code) throw new AuthError('unknown', 'The sign-in response was incomplete — try again.');
        const ok = await exchange(code, verifier);
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

  const continueAsGuest = useCallback(() => {
    AsyncStorage.setItem(GUEST_KEY, '1').catch(() => {});
    setUser(null);
    setStatus('guest');
    track('auth.guest');
  }, []);

  const signOut = useCallback(async () => {
    tokenCache = {};
    await SecureStore.deleteItemAsync(AT_KEY).catch(() => {});
    await SecureStore.deleteItemAsync(RT_KEY).catch(() => {});
    await SecureStore.deleteItemAsync(USER_KEY).catch(() => {});
    await AsyncStorage.removeItem(GUEST_KEY).catch(() => {});
    setUser(null);
    setStatus('signedOut');
  }, []);

  const deleteAccount = useCallback(async () => {
    if (hasCloudSession()) {
      // The database RPC purges every row the account owns (posts, comments, reactions, saves,
      // follows, watchlist, collections, notifications, events, profile) — a hard, GDPR-style wipe.
      const { error } = await supabase.rpc('delete_account');
      if (error) reportError('auth.deleteAccount', error);
    }
    await signOut();
  }, [signOut]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      isSigningIn,
      oauthReady: rorkAuthAvailable,
      error,
      clearError,
      signInWithGoogle,
      signInWithApple,
      continueAsGuest,
      signOut,
      deleteAccount,
    }),
    [status, user, isSigningIn, error, clearError, signInWithGoogle, signInWithApple, continueAsGuest, signOut, deleteAccount],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
