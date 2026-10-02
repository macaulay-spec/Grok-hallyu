/**
 * Regression test for the "signed in, but nothing saves" bug.
 *
 * Rork passes last one hour (docs.rork.com → "Add accounts and sign-in": "It lasts one hour, and
 * the app quietly gets a new one"). The app used to restore or refresh the pass once at boot and
 * never again: an hour into a session every cloud write was rejected — or worse, dropped as if it
 * had succeeded, because the push path treated "no live token" as "nothing to do".
 *
 * These assertions pin the pure decisions behind the fix (compiled from lib/session.ts, the same
 * file lib/auth.tsx imports at runtime):
 *   - a pass minutes from expiry must be renewed before it is used;
 *   - a pass with plenty of life is used as-is (no refresh storm on every request);
 *   - an expired, unreadable or absent pass is never trusted;
 *   - renewal is only possible while a refresh token exists, and a session with no way to renew is
 *     reported as over instead of being kept alive as a dead pass.
 *
 * Run: node scripts/verify-session-renewal.mjs
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = mkdtempSync(join(tmpdir(), 'hallyu-session-'));
try {
  execSync(`node node_modules/typescript/bin/tsc lib/session.ts --outDir ${out} --module esnext --target es2020 --moduleResolution bundler --skipLibCheck`, { stdio: 'inherit' });
  const { expiryOf, passIsFresh, canRenew, RENEW_MARGIN_MS } = await import(pathToFileURL(join(out, 'session.js')).href);

  let failures = 0;
  const ok = (name, cond) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
    if (!cond) failures++;
  };

  const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const pass = (exp, extra = {}) => `${b64url({ alg: 'HS256' })}.${b64url({ sub: 'usr_test', exp, ...extra })}.sig`;

  const now = 1_800_000_000_000; // fixed clock: tests must not depend on when they run
  const in60s = Math.floor((now + 60_000) / 1000);
  const in30min = Math.floor((now + 30 * 60_000) / 1000);
  const anHourAgo = Math.floor((now - 3_600_000) / 1000);

  // --- expiry decoding -------------------------------------------------------------------
  ok('expiry is read from the JWT payload', expiryOf(pass(in30min)) === in30min * 1000);
  ok('an unreadable pass is treated as expired, never trusted', expiryOf('not-a-jwt') === 0);
  ok('an empty pass is expired', expiryOf(undefined) === 0 && expiryOf(null) === 0);
  ok('a pass without exp does not expire on its own', expiryOf(`${b64url({ alg: 'HS256' })}.${b64url({ sub: 'usr_test' })}.sig`) === Number.POSITIVE_INFINITY);

  // --- the renewal decision --------------------------------------------------------------
  ok('a pass with 30 minutes left is used as-is', passIsFresh(pass(in30min), expiryOf(pass(in30min)), now));
  ok('a pass inside the renewal margin is renewed before use', !passIsFresh(pass(in60s), expiryOf(pass(in60s)), now, RENEW_MARGIN_MS));
  ok('an expired pass is never reused', !passIsFresh(pass(anHourAgo), expiryOf(pass(anHourAgo)), now));
  ok('the renewal margin is at least a minute', RENEW_MARGIN_MS >= 60_000);

  // --- what a session can do --------------------------------------------------------------
  ok('renewal needs a refresh token', canRenew({ access: pass(in60s), refresh: 'rt_1' }) === true);
  ok('a pass with no refresh token cannot be renewed', canRenew({ access: pass(anHourAgo) }) === false);
  ok('no session at all cannot be renewed (guests stay local-only)', canRenew({}) === false);

  // --- the exact sequence this bug was about ----------------------------------------------
  // Sign in at T, pass good for an hour, refresh token stored.
  let passes = { access: pass(Math.floor((now + 3_600_000) / 1000)), refresh: 'rt_1' };
  let expiresAt = expiryOf(passes.access);
  ok('a fresh sign-in serves the first request without renewing', passIsFresh(passes.access, expiresAt, now));
  // An hour later the same request is made again (the app is still open).
  const later = now + 3_600_000 + 1;
  ok('an hour later the same session must renew before its next write', !passIsFresh(passes.access, expiresAt, later) && canRenew(passes));
  // Rork answers the renewal with a new pass; the old refresh token stays valid.
  passes = { ...passes, access: pass(Math.floor((later + 3_600_000) / 1000)) };
  expiresAt = expiryOf(passes.access);
  ok('after renewal the session keeps working', passIsFresh(passes.access, expiresAt, later));
  // The refresh token is refused (revoked/expired): the session is over and must be reported.
  passes = { access: pass(anHourAgo) };
  ok('a session that cannot renew is reported as over, not kept as a dead pass', !canRenew(passes) && !passIsFresh(passes.access, expiryOf(passes.access), now));

  console.log(failures ? `\n${failures} session-renewal check(s) failed` : '\nsession renewal: all checks passed');
  process.exitCode = failures ? 1 : 0;
} finally {
  rmSync(out, { recursive: true, force: true });
}
