// Local stand-in for `deno check supabase/functions/**`: type-checks the Edge Functions against the
// real Deno type declarations using the TypeScript compiler the repo already depends on.
//
// CI runs `deno check` (authoritative). This script exists so the same errors surface on a laptop or
// in a sandbox where the Deno binary cannot be downloaded. It downloads the matching `lib.deno.*.d.ts`
// set from the Deno source tag (cached under node_modules/.cache) and runs tsc over the functions.
//
//   node scripts/check-edge-functions.mjs
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DENO_TAG = process.env.DENO_TAG || 'v2.5.4';
const cache = join(root, 'node_modules', '.cache', `deno-dts-${DENO_TAG}`);
const tsLib = join(root, 'node_modules', 'typescript', 'lib');

if (!existsSync(join(tsLib, 'lib.deno.ns.d.ts'))) {
  mkdirSync(cache, { recursive: true });
  const tarball = join(cache, 'deno.tar.gz');
  if (!existsSync(tarball)) {
    const url = `https://codeload.github.com/denoland/deno/tar.gz/refs/tags/${DENO_TAG}`;
    console.log(`fetching Deno ${DENO_TAG} type declarations…`);
    execFileSync('curl', ['-fsSL', '--retry', '3', '-o', tarball, url], { stdio: 'inherit' });
  }
  const strip = `${DENO_TAG.replace(/^v/, 'deno-')}/cli/tsc/dts`;
  execFileSync('tar', ['-xzf', tarball, '-C', cache, '--wildcards', `${strip}/*`], { stdio: 'inherit' });
  for (const f of readdirSync(join(cache, strip))) {
    if (f.startsWith('lib.deno')) writeFileSync(join(tsLib, f), readFileSync(join(cache, strip, f)));
  }
}

const libs = readdirSync(tsLib)
  .filter((f) => f.startsWith('lib.deno'))
  .map((f) => join(tsLib, f));
libs.unshift(join(tsLib, 'lib.esnext.full.d.ts'));

const cfg = {
  compilerOptions: {
    strict: true,
    target: 'esnext',
    module: 'esnext',
    moduleResolution: 'bundler',
    lib: [],
    types: [],
    noEmit: true,
    skipLibCheck: true,
    allowImportingTsExtensions: true,
    baseUrl: root,
    paths: { 'npm:@supabase/supabase-js@2': ['node_modules/@supabase/supabase-js'] },
  },
  files: libs,
  include: [join(root, 'supabase', 'functions', '**', '*.ts')],
};

const cfgPath = join(root, 'node_modules', '.cache', 'tsconfig.edge.json');
mkdirSync(dirname(cfgPath), { recursive: true });
writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const out = (() => {
  try {
    return execFileSync(process.execPath, [tsc, '-p', cfgPath], { encoding: 'utf8' });
  } catch (e) {
    process.stdout.write(e.stdout ?? '');
    process.stderr.write(e.stderr ?? '');
    console.error('\nEdge Function type-check FAILED.');
    process.exit(1);
  }
})();
if (out.trim()) process.stdout.write(out);
const n = readdirSync(join(root, 'supabase', 'functions')).filter((d) => !d.startsWith('_') && !d.includes('.')).length;
console.log(`Edge Function type-check passed (${n} functions, Deno ${DENO_TAG} declarations).`);
