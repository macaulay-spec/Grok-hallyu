#!/usr/bin/env node
// Hallyu CI — the throwaway device-test account, in three modes:
//
//   create    make a fresh confirmed member through the admin API (never through the UI), assert the
//             database trigger created its profile row, and export the credentials to the job so the
//             emulator flow can sign in. Values are masked before they touch the log.
//   verify    after the device flow: prove the device actually talked to the backend as that member —
//             the `auth.signin` analytics event the app sent through the authenticated `record_event`
//             RPC must exist, owned by this user id.
//   cleanup   delete the account (idempotent).
//
// The password is generated here, used only for the two commands that need it, and never printed.
//
// Env: SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
//      HALLYU_TEST_EMAIL / HALLYU_TEST_PASSWORD / HALLYU_TEST_USER_ID (verify + cleanup modes)

import { appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const mode = process.argv[2] ?? '';

if (!URL || !SERVICE_KEY) {
  console.error(`::error title=Configuration failure::test-account ${mode} needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY`);
  process.exit(1);
}

const admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
function randomPassword(length = 28) {
  const bytes = randomBytes(length);
  return [...bytes].map((b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join('');
}

const exportToJob = (entries) => {
  for (const [key, value] of Object.entries(entries)) {
    console.log(`::add-mask::${value}`);
    if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `${key}=${value}\n`);
  }
};

if (mode === 'create') {
  const stamp = Date.now().toString(36);
  const email = `hallyu.boot.${stamp}.${randomBytes(3).toString('hex')}@example.invalid`;
  const password = randomPassword();
  const handle = `boot${stamp}`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { handle, full_name: 'Boot Verification' },
  });
  if (error || !data?.user) {
    console.error(`::error::could not create the device-test member: ${error?.message ?? 'no user returned'}`);
    process.exit(1);
  }

  // The on_auth_user_created trigger must have made the profile — a fresh account is not a broken one.
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, handle')
    .eq('id', data.user.id)
    .maybeSingle();
  if (profileError || !profile) {
    console.error(`::error::the new member has no profile row (trigger failed): ${profileError?.message ?? 'missing'}`);
    process.exit(1);
  }

  exportToJob({ HALLYU_TEST_EMAIL: email, HALLYU_TEST_PASSWORD: password, HALLYU_TEST_USER_ID: data.user.id });
  console.log(`device-test member created: ${email} (handle ${profile.handle}); credentials masked and exported to the job.`);
  process.exit(0);
}

const email = process.env.HALLYU_TEST_EMAIL || '';
const userId = process.env.HALLYU_TEST_USER_ID || '';

if (mode === 'verify') {
  if (!userId) {
    console.error('::error::verify needs HALLYU_TEST_USER_ID (run create first)');
    process.exit(1);
  }

  // Give the analytics sink a moment: the RPC fires right after sign-in, fire-and-forget.
  let found = null;
  for (let attempt = 0; attempt < 10 && !found; attempt += 1) {
    const { data, error } = await admin
      .from('analytics_events')
      .select('id, name, created_at')
      .eq('user_id', userId)
      .eq('name', 'auth.signin')
      .limit(1);
    if (error) {
      console.error(`::error::analytics lookup failed: ${error.message}`);
      process.exit(1);
    }
    found = data?.[0] ?? null;
    if (!found) await new Promise((r) => setTimeout(r, 3000));
  }

  if (!found) {
    console.error('::error title=Backend proof missing::the device signed in but no `auth.signin` event reached the backend for this member — the on-device session did not complete an authenticated RPC.');
    process.exit(1);
  }
  console.log(`device → backend proof: auth.signin recorded for this member at ${found.created_at} (event ${found.id}).`);
  process.exit(0);
}

if (mode === 'cleanup') {
  if (!userId) {
    console.error('::error::cleanup needs HALLYU_TEST_USER_ID');
    process.exit(1);
  }
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error && !/not found|does not exist/i.test(error.message)) {
    console.error(`::error::could not remove the device-test member ${email}: ${error.message}`);
    process.exit(1);
  }
  console.log(`device-test member removed${email ? ` (${email})` : ''}.`);
  process.exit(0);
}

console.error(`unknown mode "${mode}" — use create | verify | cleanup`);
process.exit(1);
