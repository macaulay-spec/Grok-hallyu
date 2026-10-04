#!/usr/bin/env node
// Hallyu CI — verify what an APK actually carries (run on the built artifact, not on the source).
//
// WHY: "the workflow set the env" is not evidence the APK points at the right backend. Metro inlines
// EXPO_PUBLIC_* at bundle time, so this reads `assets/index.android.bundle` out of the built APK and
// checks the values that were actually baked in:
//
//   · the configured Supabase URL and anon key ARE in the bundle (a connected build must be connected);
//   · no OTHER Supabase project URL is — catches a stale/old project sneaking in through a cache or a
//     hardcoded leftover;
//   · no local development backend host is — catches a build accidentally pointed at a mock or a
//     local Supabase stack (`localhost:54321`, `127.0.0.1:8000`, the emulator alias `10.0.2.2`).
//     Note: Metro/React Native always embed their own dev-server strings (`localhost:8081`), so the
//     check looks for real local-backend hosts, not the word "localhost" on its own;
//   · no privileged marker is — the service-role key name, the Rork test refresh-token name and the
//     literal `service_role` role string must never appear in a client artifact. (The workflow only
//     maps client-safe values into the build env; this proves it on the artifact.)
//
// Usage:  node scripts/ci/verify-apk-config.mjs <path-to-apk>
// Env:    EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY   required (connected build)
//         EXPO_PUBLIC_RORK_APP_KEY                                  optional (checked only when set)
// Exit:   0 = PASS, 1 = FAIL

import { execFileSync } from 'node:child_process';
import process from 'node:process';

const apk = process.argv[2];
const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const anonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
const rorkKey = (process.env.EXPO_PUBLIC_RORK_APP_KEY ?? '').trim();

const problems = [];
const notes = [];
const fail = (message) => problems.push(message);

if (!apk) {
  console.error('usage: node scripts/ci/verify-apk-config.mjs <path-to-apk>');
  process.exit(1);
}
if (!url || !anonKey) {
  fail('the build environment carries no client-safe backend configuration (EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are empty) — a release APK must be a connected build.');
}

let bundle;
try {
  bundle = execFileSync('unzip', ['-p', apk, 'assets/index.android.bundle'], { maxBuffer: 1024 * 1024 * 512 });
} catch (e) {
  console.error(`could not read assets/index.android.bundle from ${apk}: ${e.message}`);
  process.exit(1);
}
if (bundle.length < 100_000) fail(`the embedded bundle is suspiciously small (${bundle.length} bytes) — the app would not run.`);

// Latin-1 keeps one character per byte, so ASCII substrings match exactly and offsets stay honest.
const text = bundle.toString('latin1');
const has = (s) => text.includes(s);

// ── 1. The configured project is what is baked in ─────────────────────────────────────────────
if (url) {
  if (!has(url)) fail(`the APK does not contain the configured Supabase URL (${url}) — the build is not connected to the expected project.`);
}

const hosts = [...new Set(text.match(/https:\/\/[a-z0-9]{15,30}\.supabase\.co/g) ?? [])];
if (hosts.length > 1) {
  fail(`the APK references more than one Supabase project: ${hosts.join(', ')} — an artifact must ship exactly one backend.`);
} else if (hosts.length === 1 && url && hosts[0] !== url) {
  fail(`the APK points at ${hosts[0]} but the build configured ${url} — stale or wrong project.`);
} else if (hosts.length === 1) {
  notes.push(`supabase host: ${hosts[0]}`);
}

if (anonKey && !has(anonKey)) fail('the configured anon key is not in the APK — authenticated and anon reads would fail at runtime.');

// ── 2. No local development backend host ───────────────────────────────────────────────────────
// The Supabase local stack answers on :54321 (API) and :8000 (Kong); 10.0.2.2 is the emulator's
// alias for the host machine. None of these may ever be the backend of a release artifact.
for (const pattern of ['localhost:54321', '127.0.0.1:54321', 'localhost:8000', '127.0.0.1:8000', '10.0.2.2']) {
  if (has(pattern)) fail(`the APK contains a local development backend host (${pattern}) — release builds must not point at a dev or mock server.`);
}

// ── 3. No privileged credential marker ─────────────────────────────────────────────────────────
for (const marker of ['service_role', 'SUPABASE_SERVICE_ROLE_KEY', 'RORK_TEST_REFRESH_TOKEN']) {
  if (has(marker)) fail(`the APK contains the privileged marker "${marker}" — service-role and verification credentials must never reach a client bundle.`);
}

// ── 4. Optional Rork app key ───────────────────────────────────────────────────────────────────
if (rorkKey) {
  if (!has(rorkKey)) fail('EXPO_PUBLIC_RORK_APP_KEY was configured but is not in the APK — Google/Apple sign-in would be unavailable.');
} else {
  notes.push('EXPO_PUBLIC_RORK_APP_KEY is not configured — email/password auth ships; Google/Apple sign-in is unavailable in this build.');
}

// ── Report ─────────────────────────────────────────────────────────────────────────────────────
console.log('HALLYU APK CONFIGURATION CHECK');
console.log('==============================');
console.log(`apk:    ${apk} (${(bundle.length / 1024 / 1024).toFixed(1)} MiB bundle)`);
console.log(`target: ${url || '(none configured)'}`);
for (const note of notes) console.log(`  · ${note}`);
console.log('');

if (problems.length === 0) {
  console.log('the APK carries exactly the configured client-safe backend values — no dev host, no stale project, no privileged marker.');
  console.log('OVERALL STATUS: PASS');
  process.exit(0);
}

for (const problem of problems) console.log(`  ✗ ${problem}`);
console.log('');
console.log(`OVERALL STATUS: FAIL (${problems.length} problem(s))`);
process.exit(1);
