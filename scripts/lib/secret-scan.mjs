// Repository secret scan — shared by scripts/verify-no-secrets.mjs (offline, in `npm run check`)
// and scripts/verify-backend.mjs (live run).
//
// The rule: a committed credential is a failure. The one documented exception is the TMDB catalog
// token in constants/keys.ts, which is a public, read-only, write-less credential by design (the app
// reads the catalog directly from the client) — it is excluded by *value*, read from that file, not
// by a blanket path exclusion, so anything else shaped like a credential still fails the scan.

import { readdir, readFile } from 'node:fs/promises';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.expo', 'android', 'ios', 'web-build']);
const SCANNED_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|json|yml|yaml|md|sql|sh|toml|env|example)$/i;

export const SECRET_PATTERNS = [
  { name: 'Supabase secret key', pattern: /\bsb_secret_[A-Za-z0-9_-]{10,}/ },
  { name: 'service-role key', pattern: /\bservice_role[A-Za-z0-9_.-]{20,}/ },
  { name: 'Supabase publishable key', pattern: /\bsb_publishable_[A-Za-z0-9_-]{10,}/ },
  { name: 'Rork app key', pattern: /\brpk_[A-Za-z0-9]{20,}/ },
  // A JWT header is short ("eyJhbGciOiJIUzI1NiJ9"), so the segments must be matched generously.
  { name: 'JWT', pattern: /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: 'connection string with a password', pattern: /\bpostgres(ql)?:\/\/[^'"\s]+:[^'"\s@]+@/ },
  { name: 'private key block', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

/** The public catalog credential that is allowed to be in the repository, read from the source. */
export async function knownPublicCredentials() {
  const keys = await readFile('constants/keys.ts', 'utf8');
  const found = [];
  // Quoted literals of any shape, because the catalog token is a JWT and contains dots.
  for (const match of keys.matchAll(/'([^'\s]{20,})'/g)) {
    found.push(match[1]);
  }
  return found;
}

/**
 * Scans the working tree for credentials.
 * @returns {Promise<{offenders: {file: string, kind: string}[], filesScanned: number}>}
 */
export async function scanRepository() {
  const allowed = await knownPublicCredentials();
  const offenders = [];
  let filesScanned = 0;

  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!SCANNED_EXTENSIONS.test(entry.name)) continue;

      filesScanned += 1;
      let content = await readFile(full, 'utf8');
      for (const value of allowed) content = content.split(value).join('<public-catalog-credential>');

      for (const { name, pattern } of SECRET_PATTERNS) {
        if (pattern.test(content)) offenders.push({ file: full, kind: name });
      }
    }
  };

  await walk('.');
  return { offenders, filesScanned };
}