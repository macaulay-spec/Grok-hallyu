#!/usr/bin/env node
/**
 * Resolve and validate the client configuration an APK is about to be built with.
 *
 * The APK ships whatever `EXPO_PUBLIC_*` values exist in the build environment. That is exactly how
 * a *stale* GitHub secret (an old Supabase project's anon key, a revoked TMDB token, a mismatched
 * Rork app key) silently produced an installed app that behaved as if the backend were offline while
 * the repository itself looked healthy.
 *
 * So: every candidate is checked against the live service before it is allowed into the bundle.
 *  - a candidate that is rejected is dropped, the committed public value is used, and the run is
 *    annotated with the exact secret NAME to delete — the build still produces a working app;
 *  - a candidate that is privileged (service-role/secret key) is a hard failure — that key must
 *    never be shipped, and the message says which secret to rotate;
 *  - if nothing valid is left, the build fails — a compiling APK with a dead backend is not success.
 *
 * Resolved values are written to $GITHUB_ENV for the later build steps. Secret *values* are never
 * printed — only names, presence and the backend's verdict.
 */
import fs from 'node:fs';
import {
  CLOUD,
  describeKey,
  fail,
  heading,
  info,
  pass,
  privilegedKeyReason,
  probeRorkAppKey,
  probeRorkAuth,
  probeSupabaseKey,
  probeTmdb,
  summary,
  warn,
} from './lib/checks.mjs';

const problems = [];
const stale = [];
const shipped = {};

function exportEnv(name, value) {
  shipped[name] = value;
  const envFile = process.env.GITHUB_ENV;
  if (envFile) fs.appendFileSync(envFile, `${name}=${value}\n`);
}

/**
 * Drop a candidate value that must not (or cannot) be shipped, keeping the committed public default.
 * Stale values are warnings, not failures: the build still produces a working app, and the run is
 * annotated with the exact secret name to delete. Privileged keys are escalated by the caller.
 */
function reject(name, reason, { rotate = false } = {}) {
  const message = rotate
    ? `Secret ${name} ${reason} and must never be bundled into an app. Remove/rotate it in repository settings.`
    : `Secret ${name} ${reason}. The committed public value will be used instead — delete this secret to silence the warning.`;
  stale.push(message);
  warn(message);
}

// ---------------------------------------------------------------------------------------------
heading('Backend target');
// ---------------------------------------------------------------------------------------------
const supabaseUrl = CLOUD.supabaseUrl;
const rorkAuthUrl = CLOUD.rorkAuthUrl;
const projectId = CLOUD.rorkProjectId;

if (probeHost(supabaseUrl) && probeHost(rorkAuthUrl)) {
  info(`Supabase : ${supabaseUrl}`);
  info(`Rork Auth: ${rorkAuthUrl}`);
  info(`Project  : ${projectId}`);
} else {
  problems.push('The backend URLs are malformed — refusing to build.');
}

// ---------------------------------------------------------------------------------------------
heading('Supabase client key');
// ---------------------------------------------------------------------------------------------
const anonCandidate = process.env.CANDIDATE_SUPABASE_ANON_KEY || '';
const anonName = 'EXPO_PUBLIC_SUPABASE_ANON_KEY';
let anonKey = CLOUD.anonKey;

const anonOverride = privilegedKeyReason(anonCandidate);
if (anonOverride) {
  reject(anonName, anonOverride, { rotate: true });
  problems.push('BUILD STOPPED: a privileged Supabase key was supplied for the client bundle.');
} else if (anonCandidate) {
  const probe = await probeSupabaseKey(anonCandidate);
  if (probe.ok) {
    anonKey = anonCandidate;
    pass(`${anonName}: ${describeKey(anonCandidate)} — accepted by the backend.`);
  } else {
    reject(anonName, `was rejected by ${supabaseUrl} (HTTP ${probe.status}: ${probe.reason})`);
  }
} else {
  info(`${anonName}: not set — using the committed publishable key.`);
}

if (!problems.length) {
  const probe = await probeSupabaseKey(anonKey);
  if (probe.ok) pass(`Building against ${supabaseUrl} with a key the backend accepts (HTTP ${probe.status}).`);
  else problems.push(`No usable Supabase client key: the backend answered HTTP ${probe.status} (${probe.reason}).`);
}
exportEnv('EXPO_PUBLIC_SUPABASE_URL', supabaseUrl);
exportEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY', anonKey);

// ---------------------------------------------------------------------------------------------
heading('Rork Auth app key');
// ---------------------------------------------------------------------------------------------
const appCandidate = process.env.CANDIDATE_RORK_APP_KEY || '';
const appName = 'EXPO_PUBLIC_RORK_APP_KEY';
let appKey = CLOUD.rorkAppKey;

if (appCandidate) {
  if (!appCandidate.startsWith('rpk_')) {
    reject(appName, 'is not a Rork app key (expected an rpk_… value)');
  } else {
    const probe = await probeRorkAppKey(appCandidate);
    if (probe.ok) {
      appKey = appCandidate;
      pass(`${appName}: accepted by Rork Auth (HTTP ${probe.status}, redirect host ${probe.authUrlHost}).`);
    } else {
      reject(appName, `was rejected by Rork Auth (HTTP ${probe.status}: ${probe.reason})`);
    }
  }
} else {
  info(`${appName}: not set — using the committed app key.`);
}

if (!problems.length && !(await probeRorkAppKey(appKey)).ok) {
  problems.push('No usable Rork app key: Rork Auth rejected the committed app key as well. Sign-in would be dead in the APK.');
}
exportEnv('EXPO_PUBLIC_RORK_AUTH_URL', rorkAuthUrl);
exportEnv('EXPO_PUBLIC_RORK_APP_KEY', appKey);
exportEnv('EXPO_PUBLIC_PROJECT_ID', projectId);

// ---------------------------------------------------------------------------------------------
heading('TMDB catalog credentials');
// ---------------------------------------------------------------------------------------------
const tokenCandidate = process.env.CANDIDATE_TMDB_ACCESS_TOKEN || '';
const keyCandidate = process.env.CANDIDATE_TMDB_API_KEY || '';
let tmdbToken = CLOUD.tmdbAccessToken;
let tmdbKey = CLOUD.tmdbApiKey;

if (tokenCandidate || keyCandidate) {
  const probe = await probeTmdb({ accessToken: tokenCandidate, apiKey: keyCandidate });
  if (probe.ok) {
    if (tokenCandidate) tmdbToken = tokenCandidate;
    if (keyCandidate) tmdbKey = keyCandidate;
    pass(`TMDB credentials accepted (mode ${probe.mode}, HTTP ${probe.status}).`);
  } else if (probe.status === 401) {
    if (tokenCandidate) reject('EXPO_PUBLIC_TMDB_ACCESS_TOKEN', `was rejected by TMDB (401)`);
    if (keyCandidate) reject('EXPO_PUBLIC_TMDB_API_KEY', 'was rejected by TMDB (401)');
  } else {
    warn(`TMDB could not be reached (${probe.reason}) — keeping the supplied credentials and continuing.`);
  }
} else {
  info('EXPO_PUBLIC_TMDB_*: not set — using the committed read credentials.');
}

const finalTmdb = await probeTmdb({ accessToken: tmdbToken, apiKey: tmdbKey });
if (finalTmdb.ok) pass(`Catalog discovery will work (TMDB ${finalTmdb.mode}, HTTP ${finalTmdb.status}).`);
else if (finalTmdb.status === 401) problems.push('No usable TMDB credential: every candidate was rejected. The catalog would be empty in the APK.');
else warn(`TMDB could not be verified (${finalTmdb.reason}); the build will continue.`);
exportEnv('EXPO_PUBLIC_TMDB_ACCESS_TOKEN', tmdbToken);
exportEnv('EXPO_PUBLIC_TMDB_API_KEY', tmdbKey);

// ---------------------------------------------------------------------------------------------
heading('Media storage');
// ---------------------------------------------------------------------------------------------
const bucket = process.env.EXPO_PUBLIC_MEDIA_BUCKET || CLOUD.mediaBucket;
exportEnv('EXPO_PUBLIC_MEDIA_BUCKET', bucket);
info(`Bucket: ${bucket} (video and image uploads)`);

// ---------------------------------------------------------------------------------------------
heading('Verdict');
// ---------------------------------------------------------------------------------------------
summary([
  '### Client configuration baked into this APK',
  '',
  `- Supabase: \`${supabaseUrl}\` — key ${stale.some((s) => s.includes(anonName)) ? '**committed default** (supplied secret rejected)' : 'validated'}`,
  `- Rork Auth: \`${rorkAuthUrl}\` — project \`${projectId}\``,
  `- TMDB: ${finalTmdb.ok ? 'validated' : 'unverified'}`,
  `- Media bucket: \`${bucket}\``,
  '',
  ...(stale.length ? ['**Stale or unsafe secrets detected — delete these in repository settings:**', '', ...stale.map((s) => `- ${s}`), ''] : []),
  'No privileged credential is ever exported to the Expo bundle.',
]);

if (problems.length) {
  console.log(`\n${problems.length} blocking problem(s) — the build must not continue.`);
  problems.forEach((p) => fail(p));
  process.exit(1);
}
console.log('\nClient configuration resolved and validated.');
process.exit(0);

function probeHost(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !!parsed.host;
  } catch {
    return false;
  }
}
