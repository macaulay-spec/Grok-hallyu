/**
 * Firebase email-action link parsing — PURE (no Firebase/RN imports) so it is unit-tested by
 * scripts/test-firebase-backend.mjs and safe to call from anywhere in the boot graph.
 *
 * Firebase email action links (verify / reset / recover) look like:
 *   https://<authDomain>/__/auth/action?apiKey=..&oobCode=..&mode=resetPassword&continueUrl=..
 * or, once the interstitial forwards to our continueUrl (handleCodeInApp):
 *   hallyu://auth/callback?apiKey=..&oobCode=..&mode=verifyEmail
 * We accept any URL shape and fish the action params out of the query string.
 */
export type AuthActionMode = 'verifyEmail' | 'resetPassword' | 'recoverEmail' | 'revertSecondFactorAddition' | null;

export interface AuthActionLink {
  mode: AuthActionMode;
  oobCode: string | null;
  apiKey: string | null;
  continueUrl: string | null;
}

const MODES: readonly string[] = ['verifyEmail', 'resetPassword', 'recoverEmail', 'revertSecondFactorAddition'];

export function parseAuthActionUrl(url: string | null | undefined): AuthActionLink | null {
  if (!url) return null;
  let q: string;
  const qi = url.indexOf('?');
  if (qi >= 0) q = url.slice(qi + 1);
  else return null;
  const params = new URLSearchParams(q.replace(/#/g, '&'));
  const mode = params.get('mode');
  const oobCode = params.get('oobCode');
  if (!mode || !oobCode) return null;
  if (!MODES.includes(mode)) return null;
  return {
    mode: mode as AuthActionMode,
    oobCode,
    apiKey: params.get('apiKey'),
    continueUrl: params.get('continueUrl'),
  };
}
