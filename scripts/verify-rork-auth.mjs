#!/usr/bin/env node
// Hallyu — Rork Auth verification (the optional leg, isolated from the backend suite).
//
// WHY THIS IS SEPARATE: the Rork OAuth token exchange is only relevant to Google/Apple sign-in.
// Email/password authentication — the normal Hallyu path — is covered end-to-end by
// scripts/verify-backend.mjs and the `connected` job. Keeping the Rork check in its own script and
// its own CI job means a missing or expired Rork test token can never masquerade as a broken
// backend, while a *configured* Rork token that fails is still red, loudly.
//
// What it proves: a real Rork refresh token is exchanged for an access token at
// `${RORK_AUTH_URL}/oauth/refresh`, and that token is accepted by PostgREST on this project (an
// authenticated read through RLS). Nothing is mocked; the token is a human-minted credential and
// is never printed.
//
// Environment (CI supplies from repository secrets; all values are masked):
//   SUPABASE_URL                 (or EXPO_PUBLIC_SUPABASE_URL)          required
//   SUPABASE_ANON_KEY            (or EXPO_PUBLIC_SUPABASE_ANON_KEY)     required
//   RORK_APP_KEY                 (or EXPO_PUBLIC_RORK_APP_KEY)          required
//   RORK_TEST_REFRESH_TOKEN                                             required
//   RORK_AUTH_URL                (or EXPO_PUBLIC_RORK_AUTH_URL)         optional (default api.rork.com)
//
// Exit codes: 0 = PASS, 1 = FAIL, 2 = NOT CONFIGURED (no Rork credentials in this environment)

import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const RORK_APP_KEY = process.env.RORK_APP_KEY || process.env.EXPO_PUBLIC_RORK_APP_KEY || '';
const RORK_AUTH_URL = process.env.RORK_AUTH_URL || process.env.EXPO_PUBLIC_RORK_AUTH_URL || 'https://api.rork.com';
const RORK_TEST_REFRESH_TOKEN = process.env.RORK_TEST_REFRESH_TOKEN || '';

const log = (line = '') => console.log(line);

if (!SUPABASE_URL || !ANON_KEY || !RORK_APP_KEY || !RORK_TEST_REFRESH_TOKEN) {
  log('HALLYU RORK AUTH VERIFICATION');
  log('============================');
  log('');
  log('  Rork Auth                 NOT CONFIGURED');
  log('');
  log('Missing (set as GitHub Secrets, never in code):');
  if (!SUPABASE_URL) log('  - EXPO_PUBLIC_SUPABASE_URL');
  if (!ANON_KEY) log('  - EXPO_PUBLIC_SUPABASE_ANON_KEY');
  if (!RORK_APP_KEY) log('  - EXPO_PUBLIC_RORK_APP_KEY');
  if (!RORK_TEST_REFRESH_TOKEN) log('  - RORK_TEST_REFRESH_TOKEN');
  log('');
  log('============================');
  log('OVERALL STATUS: NOT CONFIGURED');
  process.exit(2);
}

let failed = 0;
const check = async (name, fn) => {
  try {
    const detail = await fn();
    log(`  ok  ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (error) {
    failed += 1;
    log(`  ✗  ${name} — ${error?.message ?? String(error)}`);
  }
};

log('HALLYU RORK AUTH VERIFICATION');
log('============================');
log(`target: ${SUPABASE_URL}`);
log(`issuer: ${RORK_AUTH_URL}`);
log('');

let accessToken = null;

await check('Rork refresh token exchanges for an access token', async () => {
  const response = await fetch(`${RORK_AUTH_URL}/oauth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_key: RORK_APP_KEY, refresh_token: RORK_TEST_REFRESH_TOKEN }),
  });
  if (!response.ok) throw new Error(`Rork refresh returned HTTP ${response.status}`);
  const payload = await response.json();
  accessToken = payload?.access_token;
  if (typeof accessToken !== 'string' || accessToken.length < 20) throw new Error('no access token in the response');
  const [, body] = accessToken.split('.');
  if (!body) throw new Error('the access token is not a JWT');
  const claims = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  if (!claims.sub) throw new Error('the access token carries no subject');
  return 'token minted, subject present';
});

if (accessToken) {
  await check('The Rork-minted token is accepted by PostgREST', async () => {
    const client = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      accessToken: async () => accessToken,
    });
    const { error } = await client.from('profiles').select('id').limit(1);
    if (error) throw new Error(`PostgREST rejected the token: ${error.message}`);
    return 'authenticated read succeeded';
  });
}

log('');
log('============================');
if (failed === 0) {
  log('OVERALL STATUS: PASS');
  process.exit(0);
}
log(`OVERALL STATUS: FAIL (${failed} check(s))`);
process.exit(1);
