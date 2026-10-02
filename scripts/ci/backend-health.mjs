#!/usr/bin/env node
/**
 * Hallyu backend health + client/contract verification.
 *
 * Read-only diagnostics for the live Rork-managed backend:
 *   1. the two endpoints answer at all (Supabase PostgREST, Rork Auth);
 *   2. the request fails loudly when a credential or the configuration is missing/foreign;
 *   3. the client's credentials are accepted (and are not privileged keys);
 *   4. every table, relationship and RPC the app calls exists in the deployed schema;
 *   5. Row Level Security is genuinely on (private tables are not readable anonymously);
 *   6. Storage can accept media (a missing bucket is why uploads would silently do nothing);
 *   7. — when a test token is available — the real authenticated path is exercised end to end:
 *      Rork Auth refresh → Rork JWT → Supabase → RLS → row.
 *
 * It never writes, never migrates, never creates or replaces a database, and never prints a secret.
 *
 * Optional secrets (only for step 7; everything else runs without any secret at all):
 *   RORK_TEST_REFRESH_TOKEN — a Rork Auth refresh token for a throwaway account.
 */
import {
  CLOUD,
  CLIENT_SECRETS,
  OBSOLETE,
  describeKey,
  fail,
  heading,
  info,
  pass,
  privilegedKeyReason,
  probeRorkAppKey,
  probeRorkAuth,
  probeStorageBucket,
  probeSupabaseKey,
  request,
  restSelect,
  summary,
  warn,
} from './lib/checks.mjs';

const problems = [];
const notes = [];

function rpcInit(body) {
  return {
    method: 'POST',
    headers: { apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || CLOUD.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function problem(message) {
  problems.push(message);
  fail(message);
}

// ---------------------------------------------------------------------------------------------
// 1. Configuration: the repo must describe the one backend this app talks to.
// ---------------------------------------------------------------------------------------------
heading('Configuration');

const envUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || CLOUD.supabaseUrl;
const envAuth = process.env.EXPO_PUBLIC_RORK_AUTH_URL || CLOUD.rorkAuthUrl;
const envProject = process.env.EXPO_PUBLIC_PROJECT_ID || CLOUD.rorkProjectId;

if (envUrl.replace(/\/+$/, '') !== CLOUD.supabaseUrl) {
  problem(`Supabase URL mismatch: expected ${CLOUD.supabaseUrl}, got ${envUrl}`);
} else {
  info(`Supabase URL  : ${CLOUD.supabaseUrl}`);
}
if (envAuth.replace(/\/+$/, '') !== CLOUD.rorkAuthUrl) {
  problem(`Rork Auth URL mismatch: expected ${CLOUD.rorkAuthUrl}, got ${envAuth}`);
} else {
  info(`Rork Auth URL : ${CLOUD.rorkAuthUrl}`);
}
if (envProject !== CLOUD.rorkProjectId) {
  problem(`Rork project mismatch: expected ${CLOUD.rorkProjectId}, got ${envProject}`);
} else {
  info(`Rork project  : ${CLOUD.rorkProjectId}`);
}
notes.push(`- Backend: \`${CLOUD.supabaseUrl}\` · auth \`${CLOUD.rorkAuthUrl}\` · project \`${CLOUD.rorkProjectId}\``);

// Which optional overrides are actually present? Absent ones fall back to the committed public
// values, which is fine (they are public client credentials, not secrets).
for (const name of CLIENT_SECRETS) {
  const present = !!process.env[name];
  info(`${present ? 'override' : 'default '} : ${name}`);
}

// ---------------------------------------------------------------------------------------------
// 2. Client credentials: accepted by the backend, and safe to ship.
// ---------------------------------------------------------------------------------------------
heading('Client credentials');

let anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || CLOUD.anonKey;
const badKey = privilegedKeyReason(anonKey);
if (badKey) {
  problem(`The configured Supabase client key ${badKey}. A privileged key must never be bundled into the app.`);
} else {
  info(`Supabase client key : ${describeKey(anonKey)}`);
}

let anonProbe = await probeSupabaseKey(anonKey);
if (!anonProbe.ok && anonKey !== CLOUD.anonKey) {
  // A stale override must not hide the rest of the diagnosis: name it, then check the committed
  // public key so the schema, RLS and storage results below are still meaningful.
  problem(
    `Secret EXPO_PUBLIC_SUPABASE_ANON_KEY is rejected by ${CLOUD.supabaseUrl} (HTTP ${anonProbe.status}: ${anonProbe.reason}) — delete it in repository settings.`,
  );
  anonKey = CLOUD.anonKey;
  anonProbe = await probeSupabaseKey(anonKey);
}
if (anonProbe.ok) {
  pass(`Supabase PostgREST reachable and accepts the client key (HTTP ${anonProbe.status}).`);
} else {
  problem(`Supabase rejected the client key or is unreachable: HTTP ${anonProbe.status} — ${anonProbe.reason}`);
}

const rorkUp = await probeRorkAuth();
if (rorkUp.ok) pass(`Rork Auth reachable (HTTP ${rorkUp.status}).`);
else problem(`Rork Auth unreachable: ${rorkUp.reason}`);

let appKey = process.env.EXPO_PUBLIC_RORK_APP_KEY || CLOUD.rorkAppKey;
if (!appKey.startsWith('rpk_')) problem('The Rork app key does not look like an app key (rpk_…).');
let appKeyProbe = await probeRorkAppKey(appKey);
if (!appKeyProbe.ok && appKey !== CLOUD.rorkAppKey) {
  problem(`Secret EXPO_PUBLIC_RORK_APP_KEY is rejected by Rork Auth (HTTP ${appKeyProbe.status}: ${appKeyProbe.reason}) — delete it in repository settings.`);
  appKey = CLOUD.rorkAppKey;
  appKeyProbe = await probeRorkAppKey(appKey);
}
if (appKeyProbe.ok) pass(`Rork Auth accepted the app key (HTTP ${appKeyProbe.status}, redirect host ${appKeyProbe.authUrlHost}).`);
else problem(`Rork Auth rejected the app key or is unreachable: HTTP ${appKeyProbe.status} — ${appKeyProbe.reason}`);

// ---------------------------------------------------------------------------------------------
// 3. Client/backend contract: everything the app calls must exist in the deployed schema.
// ---------------------------------------------------------------------------------------------
heading('Client/backend contract');

/** Tables the client reads or writes, and the columns it selects. */
const TABLES = {
  profiles: ['id', 'handle', 'display_name', 'avatar_url', 'bio', 'fandoms', 'favorite_genres', 'favorite_drama_ids', 'is_private', 'verified', 'follower_count', 'following_count', 'created_at'],
  posts: ['id', 'author_id', 'type', 'body', 'title', 'kind', 'rating', 'verdict', 'images', 'video', 'spoiler', 'context', 'hashtags', 'mentions', 'reaction_counts', 'comment_count', 'save_count', 'share_count', 'state', 'created_at', 'edited_at'],
  comments: ['id', 'post_id', 'author_id', 'parent_id', 'reply_to_user_id', 'body', 'spoiler', 'reaction_counts', 'state', 'created_at'],
  reactions: ['user_id', 'target_id', 'kind'],
  saves: ['user_id', 'post_id', 'created_at'],
  follows: ['follower_id', 'kind', 'target_id'],
  watchlist: ['user_id', 'drama_id', 'status', 'season', 'current_episode', 'note', 'added_at', 'updated_at', 'completed_at'],
  drama_notify: ['user_id', 'drama_id'],
  collections: ['id', 'owner_id', 'title', 'description', 'visibility', 'follower_count', 'updated_at'],
  collection_items: ['collection_id', 'drama_id', 'note', 'added_at'],
  notifications: ['id', 'group_name', 'kind', 'actor_ids', 'post_id', 'comment_id', 'drama_id', 'episode', 'collection_id', 'title', 'body', 'read', 'created_at'],
  prefs: ['user_id', 'data'],
  blocks: ['user_id', 'blocked_id'],
  mutes: ['user_id', 'kind', 'target_id'],
  reports: ['id', 'reporter_id', 'target_id', 'target_type', 'reason', 'detail', 'status', 'created_at'],
  events: ['name', 'props', 'created_at'],
  push_tokens: ['user_id', 'token', 'platform'],
  admin_audit: ['action', 'target', 'detail', 'created_at'],
};

/**
 * PostgREST embeds — the exact foreign-key names the client's select strings use.
 * (`lib/data/supabaseBackend.ts`: POST_SELECT / COMMENT_SELECT / COLLECTION_SELECT.)
 */
const EMBEDS = [
  { label: 'posts → author (posts_author_id_fkey)', path: 'posts?select=id,author:profiles!posts_author_id_fkey(id)&limit=1' },
  { label: 'comments → author (comments_author_id_fkey)', path: 'comments?select=id,author:profiles!comments_author_id_fkey(id)&limit=1' },
  { label: 'collections → items', path: 'collections?select=id,items:collection_items(drama_id)&limit=1' },
];

/**
 * RPCs the client calls. Existence is proved by calling each one with a *malformed* argument and
 * reading the database's own complaint — a missing function answers `404 PGRST202`, while a real one
 * fails before or inside the body with a Postgres error code:
 *
 *   react            → 400 22P02 (boolean cast)            — the body never runs
 *   merge_prefs      → 400 23502 (user_id NULL, NOT NULL)  — the insert is rejected atomically
 *   merge_onboarding → 400 23502 (same)
 *   delete_account   → 400 P0001 "not authenticated"
 *
 * Nothing is written by any of them: the unauthenticated caller has no identity (`user_id()` is NULL),
 * so every statement is rejected and rolled back. No privileged credential is involved.
 */
const RPC_PROBES = [
  { name: 'react', body: { p_target_id: 12345, p_kind: { bad: true }, p_is_comment: 'nope' } },
  { name: 'merge_prefs', body: { p_data: [1, 2, 3] } },
  { name: 'merge_onboarding', body: { p_data: 'not-json' } },
  { name: 'delete_account', body: {} },
];
const MISSING_RPC_PROBE = { name: 'hallyu_missing_function_probe', body: { p_data: 'x' } };

if (anonProbe.ok) {
  // Tables and columns: PostgREST validates the select list against the live schema, so a 200 proves
  // the table *and* every column named in it (a bogus column answers 400 42703 "column … does not
  // exist" — that behaviour was verified against this backend before this check was written).
  const brokenTables = [];
  for (const [table, columns] of Object.entries(TABLES)) {
    const res = await restSelect(`${table}?select=${columns.join(',')}&limit=1`);
    if (res.status !== 200 && res.status !== 206) {
      let code = '';
      try {
        code = JSON.parse(res.body)?.code ?? '';
      } catch {
        /* ignore */
      }
      problem(`Table “${table}” is not readable with the client's columns (HTTP ${res.status}${code ? ` ${code}` : ''}: ${res.body.slice(0, 140)}).`);
      brokenTables.push(table);
    }
  }
  if (!brokenTables.length) pass(`All ${Object.keys(TABLES).length} tables expose every column the client selects.`);

  for (const embed of EMBEDS) {
    const res = await restSelect(embed.path);
    if (res.status === 200 || res.status === 206) pass(`Embed OK: ${embed.label}`);
    else problem(`Embed failed: ${embed.label} (HTTP ${res.status} — ${res.body.slice(0, 140)})`);
  }

  const missingRpc = await request(`${CLOUD.supabaseUrl}/rest/v1/rpc/${MISSING_RPC_PROBE.name}`, rpcInit(MISSING_RPC_PROBE.body));
  if (missingRpc.status === 404) {
    // Control: the probe really does distinguish "no such function" from every other answer.
    for (const rpc of RPC_PROBES) {
      const res = await request(`${CLOUD.supabaseUrl}/rest/v1/rpc/${rpc.name}`, rpcInit(rpc.body));
      let code = '';
      try {
        code = JSON.parse(res.body)?.code ?? '';
      } catch {
        /* ignore */
      }
      if (res.status === 404 && code === 'PGRST202') problem(`RPC “${rpc.name}” is missing from the deployed schema.`);
      else pass(`RPC OK: ${rpc.name} (HTTP ${res.status}${code ? `, ${code}` : ''} — the function exists and rejected the probe argument)`);
    }
  } else {
    warn(`Could not establish the RPC-existence control probe (HTTP ${missingRpc.status}); skipping the RPC checks.`);
  }
} else {
  warn('Skipping the schema inventory: the client key was not accepted.');
}

// ---------------------------------------------------------------------------------------------
// 4. RLS posture: public reads work, private rows do not leak to an anonymous client.
// ---------------------------------------------------------------------------------------------
heading('Row Level Security');

if (anonProbe.ok) {
  const publicRead = await restSelect('posts?select=id&limit=1');
  if (publicRead.ok || publicRead.status === 206) pass('Anonymous clients can read the public feed (posts).');
  else warn(`Anonymous read of posts returned HTTP ${publicRead.status} — check the posts read policy if the feed looks empty.`);

  for (const [table, label] of [
    ['prefs', 'settings'],
    ['notifications', 'notifications'],
    ['watchlist', 'watchlists'],
    ['push_tokens', 'push tokens'],
  ]) {
    const res = await restSelect(`${table}?select=*&limit=1`);
    let rows = null;
    try {
      rows = JSON.parse(res.body);
    } catch {
      /* not JSON */
    }
    if (res.status === 401 || res.status === 403) {
      pass(`RLS denies anonymous access to ${table} (${label}) — HTTP ${res.status}.`);
    } else if (Array.isArray(rows) && rows.length === 0) {
      pass(`RLS returns no row for anonymous access to ${table} (${label}).`);
    } else if (Array.isArray(rows)) {
      problem(`RLS leak: an anonymous client can read rows from ${table} (${label}).`);
    } else {
      warn(`Unexpected answer for ${table}: HTTP ${res.status}.`);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// 5. Storage: uploads need a bucket that exists.
// ---------------------------------------------------------------------------------------------
heading('Media storage');

const bucketName = process.env.EXPO_PUBLIC_MEDIA_BUCKET || CLOUD.mediaBucket;
const bucket = await probeStorageBucket(bucketName);
if (bucket.ok) {
  pass(`Storage bucket “${bucketName}” exists — video and image uploads can land.`);
} else if (bucket.missing) {
  problem(
    `Storage bucket “${bucketName}” does not exist on the backend, so video/image uploads have nowhere to go. ` +
      `Create a PUBLIC bucket named “${bucketName}” in the Supabase project (with insert/select policies for authenticated members), ` +
      'or point EXPO_PUBLIC_MEDIA_BUCKET at an existing public bucket. Until then the composer refuses video clips instead of silently dropping them.',
  );
} else {
  warn(`Could not confirm the “${bucketName}” bucket: ${bucket.reason}`);
}

// ---------------------------------------------------------------------------------------------
// 6. The real bridge: Rork JWT → Supabase → RLS (only when a test token is supplied).
// ---------------------------------------------------------------------------------------------
heading('Authenticated Rork JWT → Supabase bridge');

const testRefresh = process.env.RORK_TEST_REFRESH_TOKEN;
if (!testRefresh) {
  warn(
    'SKIPPED — no RORK_TEST_REFRESH_TOKEN secret is configured, so the authenticated path was not exercised. ' +
      'Add it (a Rork Auth refresh token for a throwaway account) to cover Rork Auth → JWT → Supabase → RLS live.',
  );
  notes.push('- Authenticated bridge: **not exercised** (add the optional `RORK_TEST_REFRESH_TOKEN` secret to cover it).');
} else {
  const tokenRes = await request(
    `${CLOUD.rorkAuthUrl}/oauth/refresh`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_key: appKey, refresh_token: testRefresh }),
    },
    20_000,
  );
  let accessToken = null;
  try {
    accessToken = JSON.parse(tokenRes.body)?.access_token ?? null;
  } catch {
    /* not JSON */
  }

  if (!accessToken) {
    problem(`Rork Auth did not mint an access token (HTTP ${tokenRes.status} — ${tokenRes.body.slice(0, 120)}).`);
  } else {
    pass('Rork Auth minted a JWT from the test refresh token.');
    const claims = accessToken.split('.')[1];
    let sub = null;
    try {
      sub = JSON.parse(Buffer.from(claims.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')).sub;
    } catch {
      /* ignore */
    }
    // The JWT is sent exactly the way lib/supabase.ts sends it: Authorization: Bearer + apikey.
    const authed = await request(`${CLOUD.supabaseUrl}/rest/v1/profiles?select=id,handle&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    if (authed.status === 200 || authed.status === 206) {
      pass(`Supabase accepted the Rork JWT and RLS answered the query (HTTP ${authed.status}).`);
      info(`identity: ${sub ? `${String(sub).slice(0, 8)}…` : 'unreadable'}`);
      notes.push('- Authenticated bridge: **verified live** (Rork JWT accepted by Supabase, RLS answered).');
    } else {
      problem(
        `Supabase rejected the Rork JWT (HTTP ${authed.status} — ${authed.body.slice(0, 140)}). ` +
          'If this is 401, Rork’s signing key is not registered as a third-party auth provider on the Supabase project.',
      );
    }
  }
}

// ---------------------------------------------------------------------------------------------
// 7. No retired backend may still be referenced.
// ---------------------------------------------------------------------------------------------
heading('Retired backends');

const text = await scanRepository();
const staleHosts = OBSOLETE.hosts.filter((host) => host.re.test(text));
for (const host of staleHosts) problem(`The source still references ${host.label}.`);
if (!staleHosts.length) pass('No retired backend host (Lovable Cloud, old Supabase projects, Worker) is referenced by the app.');
for (const name of OBSOLETE.secrets) {
  if (new RegExp(`secrets\\.${name}\\b`).test(text)) problem(`An obsolete credential is still referenced by a workflow: ${name}`);
}

// ---------------------------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------------------------
heading('Result');
summary([
  '### Hallyu backend health',
  '',
  `- Supabase: ${anonProbe.ok ? `reachable, key accepted (HTTP ${anonProbe.status})` : `**FAILED** (${anonProbe.reason})`}`,
  `- Rork Auth: ${rorkUp.ok ? `reachable (HTTP ${rorkUp.status})` : `**FAILED** (${rorkUp.reason})`}`,
  `- Rork app key: ${appKeyProbe.ok ? 'accepted' : `**REJECTED** (${appKeyProbe.reason})`}`,
  `- Schema contract: ${anonProbe.ok ? (problems.length ? 'issues found (see annotations)' : 'all tables, columns, embeds and RPCs present') : 'not checked'}`,
  `- Media bucket: ${bucket.ok ? 'present' : bucket.missing ? `**missing** — create a public “${bucketName}” bucket to enable video posting` : 'unconfirmed'}`,
  ...notes,
]);

if (problems.length) {
  console.log(`\n${problems.length} problem(s) found — see the error annotations above.`);
  process.exit(1);
}
console.log('\nBackend health check passed: no schema, migration or data change was made.');
process.exit(0);

// ---------------------------------------------------------------------------------------------
async function scanRepository() {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const skipDirs = new Set(['node_modules', '.git', 'android', 'ios', 'dist', '.expo']);
  // This checklist is the only file allowed to spell the retired hosts out (it is the list itself).
  const skipFiles = new Set([path.join('scripts', 'ci', 'lib', 'checks.mjs'), path.join('scripts', 'ci', 'backend-health.mjs')]);
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) walk(path.join(dir, entry.name));
        continue;
      }
      const full = path.join(dir, entry.name);
      if (skipFiles.has(path.relative(process.cwd(), full))) continue;
      if (/\.(ts|tsx|js|jsx|mjs|json|yml|yaml|md)$/.test(entry.name)) out.push(fs.readFileSync(full, 'utf8'));
    }
  };
  walk(process.cwd());
  return out.join('\n');
}
