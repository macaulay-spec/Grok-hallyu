/**
 * Pure decisions about a Rork sign-in pass.
 *
 * Rork issues a pass that is valid for one hour and expects the app to renew it quietly with
 * `POST /oauth/refresh` (app key + refresh token → a new pass). Nothing here talks to the network or
 * to storage: the hot path in lib/auth.tsx asks these functions *when* to renew, and
 * scripts/verify-session-renewal.mjs pins the behaviour so "the app kept its session for an hour and
 * then lost every write" can never come back silently.
 *
 * Deliberately dependency-free (no Node `Buffer`, no React Native globals) so the same file runs in
 * the app bundle and under plain `node` in the regression test.
 */

export interface Passes {
  /** The current access pass, if the device holds one. */
  access?: string;
  /** The long-lived refresh token that can mint a new pass. */
  refresh?: string;
}

/** Renew this long before the pass actually expires, so a slow refresh cannot lose the race. */
export const RENEW_MARGIN_MS = 60_000;

const B64_REV: Record<string, number> = {};
{
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  for (let i = 0; i < alphabet.length; i++) B64_REV[alphabet[i]!] = i;
  B64_REV['+'] = 62;
  B64_REV['/'] = 63;
}

function b64UrlToBytes(input: string): Uint8Array {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of input) {
    const v = B64_REV[ch];
    if (v === undefined) continue; // padding / whitespace
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

function decodeBase64Url(input: string): string {
  const bytes = b64UrlToBytes(input);
  let out = '';
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
}

/**
 * When a pass stops being accepted, in epoch ms.
 * A pass with no `exp` claim does not expire on its own (the server still decides); a pass that
 * cannot be decoded at all is treated as expired rather than trusted.
 */
export function expiryOf(token: string | undefined | null): number {
  if (!token) return 0;
  try {
    const payload = token.split('.')[1];
    if (!payload) return 0;
    const json = JSON.parse(decodeBase64Url(payload)) as { exp?: number };
    return typeof json.exp === 'number' && json.exp > 0 ? json.exp * 1000 : Number.POSITIVE_INFINITY;
  } catch {
    return 0;
  }
}

/** True when the cached pass is still comfortably valid (no renewal needed for this request). */
export function passIsFresh(access: string | undefined, expiresAt: number, now = Date.now(), margin = RENEW_MARGIN_MS): boolean {
  return !!access && expiresAt - now > margin;
}

/**
 * Can a renewal be attempted at all? Only with a refresh token: without one the session is over and
 * the caller must report that instead of pretending a stale pass still works.
 */
export function canRenew(passes: Passes): boolean {
  return !!passes.refresh;
}
