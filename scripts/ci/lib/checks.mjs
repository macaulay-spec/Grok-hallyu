import fs from 'node:fs';

/**
 * Shared checks for the Hallyu CI workflows (plain Node ESM — runs on the runner, no build step).
 *
 * Everything here is safe to run against production: reads only, no schema changes, no writes, and
 * no privileged credential ever leaves the Actions secret store. Values are never echoed — only
 * presence, validity and HTTP status.
 */

export const CLOUD = {
  supabaseUrl: 'https://mwgmzncsitgibbkhsktt.supabase.co',
  anonKey: 'sb_publishable_k-MC7g7Wn-jXFtmki2DDGg_LuMOS8la',
  rorkAuthUrl: 'https://api.rork.com',
  rorkProjectId: 'ss819xdajyzsa3znsyi9t',
  rorkAppKey: 'rpk_9zghvnfx64mxp9u8ghn4sbe9pk0a4c3u',
  mediaBucket: 'media',
  tmdbAccessToken:
    'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJmZjAxZjI4ZmM1YzQ3NzkxZTI4MDM4MzQ5NDQ1YmY1OCIsIm5iZiI6MTc4OTAyMDA1Ny43NzksInN1YiI6IjZhYTI0Nzk5OGQ1YWFjZTczMzY2ODJkMyIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.ETon7kqWQjj7jtJJOXyRgAWme9Sh9B7OUrdAI61uuH8',
  tmdbApiKey: 'ff01f28fc5c47791e28038349445bf58',
};

/**
 * Backends this project used to run on. Any of them appearing in a *build* is a regression.
 * These are patterns, not bare words on purpose: supabase-js itself contains `*.supabase.in` in its
 * host allow-list, and matching that would make the check cry wolf.
 */
export const OBSOLETE = {
  hosts: [
    { re: /https?:\/\/[a-z0-9-]+\.supabase\.in\b/i, label: 'a retired Supabase domain (*.supabase.in)' },
    { re: /lovable\.cloud/i, label: 'Lovable Cloud (retired)' },
    { re: /https?:\/\/[a-z0-9-]+\.rork\.app\b/i, label: 'the retired Rork Worker backend' },
    { re: /firebaseio\.com/i, label: 'Firebase (retired)' },
    { re: /psmxekrmoltwabefgqpd/i, label: 'the first (retired) Supabase project' },
    { re: /smijjihlnuushnlkbktm/i, label: 'the Lovable Cloud Supabase project' },
  ],
  /** Secret names from the retired Supabase CLI / Lovable Cloud / Worker pipelines. */
  secrets: [
    'SUPABASE_ACCESS_TOKEN',
    'SUPABASE_DB_PASSWORD',
    'SUPABASE_DBPASSWORD',
    'SUPABASE_PASSWORD',
    'SUPABASE_PAT',
    'SUPABASE_TOKEN',
    'SUPABASE_ACCESS',
    'SUPABASE_ACESSTOKEN',
    'SUPABASE_ACESTOKEN',
    'SUPABASE_ACCESSTOKEN',
    'SUPABASE_API_TOKEN',
    'DATABASE_PASSWORD',
    'DB_PASSWORD',
    'LOVABLE_CLOUD_URL',
    'LOVABLE_CLOUD_ANON_KEY',
    'EXPO_PUBLIC_LOVABLE_CLOUD_URL',
    'EXPO_PUBLIC_LOVABLE_CLOUD_ANON_KEY',
    'EXPO_PUBLIC_HALYU_SUPABASE_URL',
    'EXPO_PUBLIC_HALYU_SUPABASE_ANON_KEY',
    'EXPO_PUBLIC_BACKEND_3_URL',
    'EXPO_PUBLIC_BACKEND_3_ANON_KEY',
    'GOOGLE_CLIENT_SECRET',
    'SMTP_PASS',
  ],
};

/** Client credentials that must exist for a build. Nothing here is privileged. */
export const CLIENT_SECRETS = [
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_RORK_APP_KEY',
  'EXPO_PUBLIC_TMDB_ACCESS_TOKEN',
  'EXPO_PUBLIC_TMDB_API_KEY',
];

// ---------------------------------------------------------------------------------------------
// Output helpers (GitHub annotations when running in Actions, plain text locally)
// ---------------------------------------------------------------------------------------------
const inActions = !!process.env.GITHUB_ACTIONS;

export function info(message) {
  console.log(`  ${message}`);
}
export function pass(message) {
  console.log(inActions ? `::notice::${message}` : `OK: ${message}`);
}
export function warn(message) {
  console.log(inActions ? `::warning::${message}` : `WARNING: ${message}`);
}
export function fail(message) {
  console.log(inActions ? `::error::${message}` : `ERROR: ${message}`);
}
export function heading(title) {
  console.log(`\n=== ${title} ===`);
}

export function summary(lines) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  const block = Array.isArray(lines) ? lines.join('\n') : lines;
  try {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${block}\n`);
  } catch {
    /* the summary is a nicety, never a failure */
  }
}

// ---------------------------------------------------------------------------------------------
// Credential guards
// ---------------------------------------------------------------------------------------------
/**
 * A privileged Supabase key. `sb_secret_…` is the new secret-key format; a legacy service-role JWT
 * carries `"role":"service_role"` in its (base64url) payload — `c2VydmljZV9yb2xl` is that string
 * encoded. Neither may ever be bundled into an app that anyone can decompile.
 */
export function privilegedKeyReason(value) {
  if (!value) return null;
  if (/^sb_secret_/i.test(value)) return 'it is a Supabase secret key (sb_secret_…)';
  if (/service_role/.test(value) || /c2VydmljZV9yb2xl/.test(value)) return 'it carries the service_role claim';
  if (/^sbp_/i.test(value)) return 'it is a Supabase personal access token (sbp_…)';
  return null;
}

export function keyRole(value) {
  const payload = value?.split('.')[1];
  if (!payload) return null;
  try {
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json).role ?? null;
  } catch {
    return null;
  }
}

export function describeKey(value) {
  if (!value) return 'absent';
  const role = keyRole(value);
  const kind = /^sb_publishable_/.test(value) ? 'publishable' : role ? `jwt:${role}` : 'opaque';
  return `present (${kind}, ${value.length} chars)`;
}

// ---------------------------------------------------------------------------------------------
// Network probes
// ---------------------------------------------------------------------------------------------
async function request(url, init = {}, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const body = await res.text().catch(() => '');
    return { status: res.status, ok: res.ok, body };
  } catch (e) {
    return { status: 0, ok: false, body: '', error: e?.message ?? String(e) };
  } finally {
    clearTimeout(timer);
  }
}
export { request };

/** Is the REST gateway up and does it accept this key? The OpenAPI root answers both. */
export async function probeSupabaseKey(key, { url = CLOUD.supabaseUrl } = {}) {
  const res = await request(`${url}/rest/v1/`, { headers: { apikey: key, Accept: 'application/json' } }, 20_000);
  if (res.status === 0) return { ok: false, status: 0, reason: `unreachable (${res.error})` };
  if (res.status === 401 || res.status === 403) return { ok: false, status: res.status, reason: 'the gateway rejected this key' };
  if (!res.ok) return { ok: false, status: res.status, reason: res.body.slice(0, 120) };
  try {
    return { ok: true, status: res.status, spec: JSON.parse(res.body) };
  } catch {
    return { ok: false, status: res.status, reason: 'the gateway did not return the API schema' };
  }
}

/** Rork Auth reachability (any HTTP answer proves DNS + TLS + the service). */
export async function probeRorkAuth({ url = CLOUD.rorkAuthUrl } = {}) {
  const res = await request(`${url}/`, {}, 20_000);
  if (res.status === 0) return { ok: false, status: 0, reason: `unreachable (${res.error})` };
  return { ok: true, status: res.status };
}

/**
 * Does Rork Auth accept this app key? `/oauth/initiate` is the first call the app makes; a bad key
 * is rejected there. No user, session or account is created by asking for an authorization URL.
 */
export async function probeRorkAppKey(appKey, { url = CLOUD.rorkAuthUrl } = {}) {
  const res = await request(
    `${url}/oauth/initiate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_key: appKey,
        provider: 'google',
        code_challenge: 'hallyu-ci-probe-challenge',
        target: 'rn',
        env: 'native',
      }),
    },
    20_000,
  );
  if (res.status === 0) return { ok: false, status: 0, reason: `unreachable (${res.error})` };
  if (res.status === 401 || res.status === 403) return { ok: false, status: res.status, reason: 'the app key was rejected' };
  if (!res.ok) return { ok: false, status: res.status, reason: res.body.slice(0, 160) };
  let body;
  try {
    body = JSON.parse(res.body);
  } catch {
    return { ok: false, status: res.status, reason: 'the response was not JSON' };
  }
  if (!body?.auth_url) return { ok: false, status: res.status, reason: 'no auth_url in the response' };
  return { ok: true, status: res.status, authUrlHost: safeHost(body.auth_url) };
}

export function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return '(unparseable)';
  }
}

/** TMDB: a v4 read token (Bearer) or a v3 key (`?api_key=`). */
export async function probeTmdb({ accessToken, apiKey }) {
  const attempts = [];
  if (accessToken) {
    const res = await request('https://api.themoviedb.org/3/configuration', { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } }, 20_000);
    attempts.push({ mode: 'bearer', status: res.status });
    if (res.ok) return { ok: true, mode: 'bearer', status: res.status };
    if (res.status === 401) return { ok: false, mode: 'bearer', status: 401, reason: 'TMDB rejected the v4 read token' };
    if (res.status === 0) return { ok: false, mode: 'bearer', status: 0, reason: `unreachable (${res.error})` };
  }
  if (apiKey) {
    const res = await request(`https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(apiKey)}`, { headers: { Accept: 'application/json' } }, 20_000);
    attempts.push({ mode: 'key', status: res.status });
    if (res.ok) return { ok: true, mode: 'key', status: res.status };
    if (res.status === 401) return { ok: false, mode: 'key', status: 401, reason: 'TMDB rejected the v3 API key' };
    if (res.status === 0) return { ok: false, mode: 'key', status: 0, reason: `unreachable (${res.error})` };
  }
  return { ok: false, status: attempts.at(-1)?.status ?? 0, reason: 'no usable credential was provided' };
}

/** Storage: a bucket that does not exist cannot accept a single upload. */
export async function probeStorageBucket(bucket = CLOUD.mediaBucket, { url = CLOUD.supabaseUrl, anonKey = CLOUD.anonKey } = {}) {
  const res = await request(`${url}/storage/v1/object/public/${bucket}/.hallyu-ci-probe`, { headers: { apikey: anonKey } }, 15_000);
  if (res.status === 0) return { ok: false, status: 0, reason: `unreachable (${res.error})` };
  if (/bucket not found/i.test(res.body)) return { ok: false, status: res.status, reason: `the “${bucket}” bucket does not exist`, missing: true };
  return { ok: true, status: res.status };
}

/** Read a table with the anon key: used to prove RLS is on and public reads work. */
export async function restSelect(path, { url = CLOUD.supabaseUrl, key = CLOUD.anonKey, timeoutMs = 20_000 } = {}) {
  return request(`${url}/rest/v1/${path}`, { headers: { apikey: key, Accept: 'application/json' } }, timeoutMs);
}
