#!/usr/bin/env node
/**
 * Which repository secrets exist — NAMES ONLY.
 *
 * `toJSON(secrets)` gives GitHub Actions the configured names with their values replaced by `***`;
 * this script prints the names, classifies them against the current Rork architecture, and lists the
 * leftovers from the retired pipelines (old Supabase project, Lovable Cloud, Rork Worker) so they can
 * be deleted from repository settings. Values are never read, printed, or written anywhere.
 *
 * Never fatal: an inventory is diagnostic, not a gate.
 */
import { CLIENT_SECRETS, OBSOLETE, heading, info, summary, warn } from './lib/checks.mjs';

heading('Repository secret inventory (names only)');

let names = [];
try {
  names = Object.keys(JSON.parse(process.env.SECRETS_JSON || '{}'));
} catch (e) {
  warn(`Could not read the secret inventory (${e.message}). This is informational only.`);
}

if (!names.length) {
  info('No secrets are visible to this job (or the context is unavailable).');
  process.exit(0);
}

const required = ['EXPO_PUBLIC_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_RORK_APP_KEY'];
const optional = ['EXPO_PUBLIC_PROJECT_ID', 'EXPO_PUBLIC_TMDB_ACCESS_TOKEN', 'EXPO_PUBLIC_TMDB_API_KEY', 'RORK_TEST_REFRESH_TOKEN'];
const obsolete = names.filter((n) => OBSOLETE.secrets.includes(n));
const other = names.filter((n) => !required.includes(n) && !optional.includes(n) && !obsolete.includes(n));

info(`configured: ${names.length}`);
for (const name of names) {
  const tag = required.includes(name)
    ? 'required'
    : optional.includes(name)
      ? 'optional/current'
      : obsolete.includes(name)
        ? 'OBSOLETE'
        : 'unclassified';
  console.log(`  [${tag}] ${name}`);
}

if (obsolete.length) {
  warn(
    `Obsolete secrets are still configured and should be deleted in repository settings → Secrets and variables → Actions: ${obsolete.join(', ')}`,
  );
  for (const name of obsolete) console.log(`::warning title=Obsolete secret::${name} belongs to a retired backend and is unused — delete it.`);
}

info(`current client secrets expected by the build: ${CLIENT_SECRETS.join(', ')}`);

summary([
  '### Repository secrets (names only)',
  '',
  ...names.map((n) => `- ${obsolete.includes(n) ? '❌ OBSOLETE — delete' : required.includes(n) ? '✅ required' : optional.includes(n) ? '➖ optional' : '❔ unclassified'} \`${n}\``),
  ...(obsolete.length ? ['', `**${obsolete.length} obsolete secret(s) left over from a retired backend.**`] : []),
  ...(other.length ? ['', `Unclassified (check manually): ${other.join(', ')}`] : []),
]);
