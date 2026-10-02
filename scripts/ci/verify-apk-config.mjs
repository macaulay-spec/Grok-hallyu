#!/usr/bin/env node
/**
 * Post-build verification: read the config back out of the artefact that will be installed.
 *
 * The build environment is not evidence — the bundle inside the APK is. This step opens
 * `assets/index.android.bundle` (Hermes bytecode keeps its string table readable), confirms the app
 * ships the one live backend, and refuses any privileged key or retired host. That is what turns
 * "the workflow is green" into "the APK can actually connect".
 *
 * Usage: node scripts/ci/verify-apk-config.mjs [path/to/app-release.apk | path/to/bundle.js]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { CLOUD, OBSOLETE, fail, heading, info, pass, summary } from './lib/checks.mjs';

const target = process.argv[2] ?? 'android/app/build/outputs/apk/release/app-release.apk';
const problems = [];

function problem(message) {
  problems.push(message);
  fail(message);
}

heading(`APK configuration — ${target}`);

if (!fs.existsSync(target)) {
  problem(`The artefact does not exist: ${target}`);
  finish();
}

let bundle;
try {
  bundle = /\.(js|bundle|hbc)$/.test(target)
    ? fs.readFileSync(target)
    : execFileSync('unzip', ['-p', target, 'assets/index.android.bundle'], { maxBuffer: 512 * 1024 * 1024 });
} catch (e) {
  problem(`Could not read assets/index.android.bundle from the artefact (${e.message}). The app would white-screen on launch.`);
  finish();
}

info(`JS bundle: ${(bundle.length / 1024 / 1024).toFixed(2)} MB`);
// Hermes stores ASCII strings as bytes and everything else as UTF-16: normalise both so a match is
// never missed because of the encoding.
const text = `${bundle.toString('latin1')}\n${bundle.toString('utf16le')}`;

/** Required: without these the installed app cannot reach its backend. */
const REQUIRED = [
  [CLOUD.supabaseUrl, 'the Rork-managed Supabase URL'],
  [CLOUD.rorkAuthUrl, 'the Rork Auth URL'],
  [CLOUD.rorkProjectId, 'the Rork project id (OAuth deep-link scheme)'],
  ['rpk_', 'a Rork app key'],
  ['storage/v1/object/', 'the Storage upload path (video/image posting)'],
  ['api.themoviedb.org', 'the TMDB catalog host'],
];

for (const [needle, what] of REQUIRED) {
  if (text.includes(needle)) pass(`embedded: ${what}`);
  else problem(`missing from the bundle: ${what} (“${needle}”)`);
}

/**
 * Forbidden: a privileged key in a client bundle, or a backend that is no longer Hallyu's.
 * The patterns require a *key-shaped value* (`sb_secret_` + body): the bare words “service_role”
 * legitimately appear in supabase-js, in this project's own credential guard, and in this script —
 * matching them would make the check cry wolf. Real service-role JWTs are caught by decoding every
 * JWT in the bundle below.
 */
const FORBIDDEN = [
  [/sb_secret_[A-Za-z0-9_-]{8,}/, 'a Supabase secret key (sb_secret_…)'],
  [/sbp_[A-Za-z0-9_-]{8,}/, 'a Supabase personal access token (sbp_…)'],
  ...OBSOLETE.hosts.map((h) => [h.re, h.label]),
];

for (const [pattern, what] of FORBIDDEN) {
  if (pattern.test(text)) problem(`the bundle contains ${what}.`);
}
if (!FORBIDDEN.some(([pattern]) => pattern.test(text))) {
  pass('no privileged credential and no retired backend host inside the bundle');
}

// Every JWT-shaped string in the bundle must be the read-only catalog token: a Supabase JWT would
// carry a `role` claim (and `ref` for a project key), which must never be baked into an app.
const jwtClaims = [...new Set(text.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g) ?? [])]
  .map((jwt) => {
    try {
      return JSON.parse(Buffer.from(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    } catch {
      return null;
    }
  })
  .filter(Boolean);
const privilegedClaims = jwtClaims.filter((c) => c.role === 'service_role' || c.role === 'authenticated' || c.ref);
if (privilegedClaims.length) problem(`the bundle carries ${privilegedClaims.length} Supabase JWT(s) with role/project claims.`);
else pass(`embedded JWTs: ${jwtClaims.length} (read-only catalog credential only).`);

finish();

function finish() {
  summary([
    '### APK configuration verification',
    '',
    problems.length
      ? `**FAILED** — ${problems.length} problem(s); the APK does not target the live backend correctly.`
      : `**PASSED** — the APK ships \`${CLOUD.supabaseUrl}\`, \`${CLOUD.rorkAuthUrl}\`, project \`${CLOUD.rorkProjectId}\` and no privileged key.`,
  ]);
  if (problems.length) {
    console.log(`\n${problems.length} problem(s) — this APK must not be published.`);
    process.exit(1);
  }
  console.log('\nThe embedded configuration matches the live Rork backend.');
  process.exit(0);
}
