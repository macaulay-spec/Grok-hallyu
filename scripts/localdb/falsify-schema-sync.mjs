// Falsification harness for scripts/verify-schema-sync.mjs — NOT part of the app or the migrations.
//
// Three mock PostgREST servers: in-sync, drifting, and one that raises (PostgREST answers 500 when a
// function raises). The script's verdict has to match the ground truth each mock encodes, otherwise
// the drift report is fiction in either direction.
//
// Usage: node scripts/localdb/falsify-schema-sync.mjs
import { spawn } from 'node:child_process';
import http from 'node:http';

const run = (env) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/verify-schema-sync.mjs', process.cwd()], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code) => resolve({ code, out }));
  });

const withServer = async (handler, fn) => {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

const j = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => resolve(b));
  });

let failures = 0;
const expect = (name, condition, detail = '') => {
  console.log(`${condition ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures += 1;
};

console.log('SCHEMA-SYNC FALSIFICATION');
console.log('=========================');

// ── Case 1: the project has every function ────────────────────────────────────────────────────
await withServer(
  (req, res) => {
    readBody(req).then((body) => {
      // A real function refuses a null argument. An empty body means the parser stopped keying the
      // arguments by name: PostgREST would answer PGRST202 for everything, which is the bug that
      // once made this report the whole API missing on a healthy project.
      const keys = Object.keys(JSON.parse(body || '{}'));
      if (keys.length === 0 && body !== '{}') {
        return j(res, 404, { code: 'PGRST202', message: 'Could not find the function public.probe()' });
      }
      return j(res, 400, { code: '23502', message: 'null value in column "x" violates not-null constraint' });
    });
  },
  async (url) => {
    const { code, out } = await run({ SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: 'test-key' });
    const line = /present: (\d+) · missing: (\d+) · unreachable: (\d+)/.exec(out);
    expect(
      'an in-sync project passes with every function present',
      code === 0 && line && Number(line[2]) === 0 && Number(line[3]) === 0,
      (out.match(/present:.*/) ?? [''])[0],
    );
  },
);

// ── Case 2: the project is missing two functions ──────────────────────────────────────────────
await withServer(
  (req, res) => {
    readBody(req).then(() => {
      if (req.url.includes('/feed_page') || req.url.includes('/genres_search_text')) {
        return j(res, 404, { code: 'PGRST202', message: `Could not find the function public.x(${req.url})` });
      }
      return j(res, 400, { code: '23502', message: 'null value in column "x" violates not-null constraint' });
    });
  },
  async (url) => {
    const { code, out } = await run({ SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: 'test-key' });
    expect(
      'drift is reported by name and fails the check',
      code === 1 && out.includes('feed_page') && out.includes('genres_search_text'),
      (out.match(/present:.*/) ?? [''])[0],
    );
  },
);

// ── Case 3: a function that raises proves it exists ───────────────────────────────────────────
await withServer(
  (req, res) => {
    readBody(req).then(() => {
      if (req.url.includes('/catalog_begin_run')) {
        return j(res, 500, { message: 'catalog provider <NULL> is not active' });
      }
      return j(res, 400, { code: '23502', message: 'null value in column "x" violates not-null constraint' });
    });
  },
  async (url) => {
    const { code, out } = await run({ SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: 'test-key' });
    const line = /present: (\d+) · missing: (\d+) · unreachable: (\d+)/.exec(out);
    expect(
      'a function that raised counts as present, not unreachable and not missing',
      code === 0 && line && Number(line[3]) === 0,
      (out.match(/present:.*/) ?? [''])[0],
    );
  },
);

console.log('');
if (failures > 0) {
  console.log(`FALSIFICATION FAILED: ${failures} case(s)`);
  process.exit(1);
}
console.log('FALSIFICATION PASSED: the drift report tells present, missing and unreachable apart.');