/**
 * Native Google Sign-In for Expo/React Native.
 *
 * The Firebase JS SDK's signInWithPopup is a WEB API — on Android it always fails with
 * auth/operation-not-supported-in-this-environment. The correct native flow is:
 *
 *   1. Open Google's OAuth consent page in a secure Custom Tab (expo-auth-session/startAsync),
 *      requesting an id_token for the app's ANDROID OAuth client (package com.hallyu.app +
 *      signing SHA-1 — see constants/keys.ts for how to create it).
 *   2. Google redirects back to the app scheme (hallyu://auth/callback) with the id_token.
 *   3. Verify the token's nonce/audience locally, then hand it to Firebase:
 *      signInWithCredential(auth, GoogleAuthProvider.credential(idToken)) — the caller does this
 *      (lib/auth.tsx), which makes the FIREBASE UID the canonical Hallyu identity.
 *
 * Web keeps the SDK popup flow (handled in lib/auth.tsx).
 */
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { GOOGLE_ANDROID_CLIENT_ID, GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from '../constants/keys';
import { FIREBASE_OAUTH_WEB_CLIENT_ID } from './firebase';

// Required on native: finishes any half-completed auth session when the app cold-starts from the
// OAuth redirect. Synchronous API — safe no-op when nothing is pending.
if (Platform.OS !== 'web') {
  try {
    WebBrowser.maybeCompleteAuthSession();
  } catch {}
}

/** Pull OAuth response params out of a redirect URL (Google's implicit flow returns a fragment). */
function parseRedirectParams(url: string): URLSearchParams {
  const hi = url.indexOf('#');
  const qi = url.indexOf('?');
  if (hi >= 0) return new URLSearchParams(url.slice(hi + 1));
  if (qi >= 0) return new URLSearchParams(url.slice(qi + 1));
  return new URLSearchParams();
}

export class GoogleAuthError extends Error {
  code: 'not_configured' | 'cancelled' | 'no_token' | 'nonce_mismatch' | 'audience_mismatch' | 'unknown';
  constructor(code: GoogleAuthError['code'], message: string) {
    super(message);
    this.code = code;
    this.name = 'GoogleAuthError';
  }
}

/** The OAuth client id for this platform, or null when Google sign-in is not configured yet. */
export function googleClientId(): string | null {
  if (Platform.OS === 'android') return GOOGLE_ANDROID_CLIENT_ID ?? null;
  if (Platform.OS === 'ios') return GOOGLE_IOS_CLIENT_ID ?? null;
  return GOOGLE_WEB_CLIENT_ID ?? null;
}

export function googleAuthConfigured(): boolean {
  return !!googleClientId();
}

function base64UrlDecode(input: string): string {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  // expo-crypto has no base64 decoder; RN's atob may be absent — decode manually (JWT payloads
  // are small JSON objects).
  const CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Int16Array(128).fill(-1);
  for (let i = 0; i < 64; i++) lookup[CH.charCodeAt(i)] = i;
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = lookup[clean.charCodeAt(i)]!;
    const c1 = lookup[clean.charCodeAt(i + 1)]!;
    const c2 = i + 2 < clean.length ? lookup[clean.charCodeAt(i + 2)]! : 0;
    const c3 = i + 3 < clean.length ? lookup[clean.charCodeAt(i + 3)]! : 0;
    out.push((c0 << 2) | (c1 >> 4));
    if (i + 2 < clean.length) out.push(((c1 & 15) << 4) | (c2 >> 2));
    if (i + 3 < clean.length) out.push(((c2 & 3) << 6) | c3);
  }
  // UTF-8 decode
  let s = '';
  for (let i = 0; i < out.length; i++) {
    const b = out[i]!;
    if (b < 0x80) s += String.fromCharCode(b);
    else if (b >= 0xe0 && i + 2 < out.length) {
      s += String.fromCharCode(((b & 0x0f) << 12) | ((out[++i]! & 0x3f) << 6) | (out[++i]! & 0x3f));
    } else if (i + 1 < out.length) {
      s += String.fromCharCode(((b & 0x1f) << 6) | (out[++i]! & 0x3f));
    }
  }
  return s;
}

/** Parse + sanity-check a Google id_token JWT (payload only — Firebase verifies the signature). */
export function parseIdToken(idToken: string): { aud?: string; nonce?: string; email?: string; sub?: string } {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new GoogleAuthError('no_token', 'Google returned a malformed identity token.');
  try {
    return JSON.parse(base64UrlDecode(parts[1]!)) as { aud?: string; nonce?: string; email?: string; sub?: string };
  } catch {
    throw new GoogleAuthError('no_token', 'Google returned an unreadable identity token.');
  }
}

/**
 * Run the native Google consent flow and return a verified id_token for Firebase credential
 * exchange. Throws GoogleAuthError with an actionable code on every failure path.
 */
export async function fetchGoogleIdToken(): Promise<string> {
  if (Platform.OS === 'web') {
    throw new GoogleAuthError('unknown', 'Web uses the Firebase popup flow.');
  }
  const clientId = googleClientId();
  if (!clientId) {
    throw new GoogleAuthError(
      'not_configured',
      'Google sign-in is not configured in this build yet. Set EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID (Google Cloud Console → OAuth client → Android, package com.hallyu.app + SHA-1) — email sign-in works meanwhile.',
    );
  }

  const nonceRaw = await Crypto.getRandomBytesAsync(16);
  const nonce = Array.from(nonceRaw, (b) => b.toString(16).padStart(2, '0')).join('');
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'hallyu', path: 'auth/callback' });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'id_token',
    scope: 'openid email profile',
    nonce,
    // Ask for a fresh consent each time so account switching works.
    prompt: 'select_account',
  });
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  // expo-auth-session v5 has no startAsync — drive the secure Custom Tab directly and resolve the
  // redirect ourselves (WebBrowser handles the app-scheme callback on Android/iOS).
  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
  if (
    result.type === WebBrowser.WebBrowserResultType.CANCEL ||
    result.type === WebBrowser.WebBrowserResultType.DISMISS
  ) {
    throw new GoogleAuthError('cancelled', 'Google sign-in was cancelled.');
  }
  if (result.type !== 'success' || !result.url) {
    throw new GoogleAuthError('unknown', `Google sign-in failed (${result.type}).`);
  }
  const resultParams = parseRedirectParams(result.url);
  const err = resultParams.get('error');
  if (err) {
    throw new GoogleAuthError(
      err === 'access_denied' ? 'cancelled' : 'unknown',
      resultParams.get('error_description') ?? `Google sign-in failed (${err}).`,
    );
  }
  const idToken = resultParams.get('id_token');
  if (!idToken) throw new GoogleAuthError('no_token', 'Google did not return an identity token.');

  const claims = parseIdToken(String(idToken));
  if (claims.nonce !== nonce) {
    throw new GoogleAuthError('nonce_mismatch', 'Google sign-in could not be verified (nonce mismatch). Try again.');
  }
  // Audience must be THIS app's client (or the project's web client when Google issues it for the
  // identity-provider chain). Anything else is a token minted for a different app.
  const allowedAudiences = [clientId, GOOGLE_WEB_CLIENT_ID, FIREBASE_OAUTH_WEB_CLIENT_ID].filter(Boolean) as string[];
  if (claims.aud && !allowedAudiences.includes(claims.aud)) {
    throw new GoogleAuthError('audience_mismatch', 'Google sign-in returned a token for a different app (audience mismatch).');
  }
  return String(idToken);
}
