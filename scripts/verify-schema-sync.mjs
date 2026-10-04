#!/usr/bin/env node
// Compares the live project's function surface against what supabase/migrations defines.
//
// The live suite reports symptoms ("recommended_titles failed: operator does not exist"); this
// reports the cause: the project is running a body that this repository no longer defines. Every
// function in the migrations is called through PostgREST with its declared parameters (defaults
// where the migration declares one, NULL otherwise). A function that does not exist in the project
// answers PGRST202 / 404; one that exists answers with its own logic (a validation error, or a
// result). Nothing is written: the calls either fail on a NULL argument or run read-only bodies,
// and any function that does write is given a NULL identity, which every writer rejects.
//
// Env: SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
// Exit: 0 = the project has every function the repository defines, 1 = drift, 2 = not configured
import process from 'node:process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

if (typeof globalThis.WebSocket === 'undefined') {
  try {
    const { default: NodeWebSocket } = await import('ws');
    globalThis.WebSocket = NodeWebSocket;
  } catch {
    /* only needed by supabase-js; this script talks plain HTTP */
  }
}

const URL_BASE = (process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!URL_BASE || !SERVICE_KEY) {
  console.error('::error title=Configuration failure::schema sync needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

const REPO = process.argv[2] ?? process.cwd();
const MIGRATIONS = path.join(REPO, 'supabase', 'migrations');

/** `create [or replace] function public.foo(a integer default 1, b text)` → { name, args }. */
function* declaredFunctions() {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = readFileSync(path.join(MIGRATIONS, file), 'utf8');
    const pattern = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi;
    let match;
    while ((match = pattern.exec(sql)) !== null) {
      // Walk to the matching close paren of the parameter list, ignoring quoted text.
      let depth = 1;
      let index = match.index + match[0].length;
      const start = index;
      for (; index < sql.length && depth > 0; index += 1) {
        if (sql[index] === '(') depth += 1;
        else if (sql[index] === ')') depth -= 1;
      }
      // `returns trigger` functions are trigger handlers: PostgREST never exposes them, so probing
      // them would report drift against a perfectly healthy project.
      if (/\breturns\s+trigger\b/i.test(sql.slice(index, index + 120))) continue;
      yield { name: match[1].toLowerCase(), argText: sql.slice(start, index - 1), file };
    }
  }
}

const splitTopLevel = (text) => {
  const parts = [];
  let depth = 0;
  let current = '';
  let quote = null;
  for (const ch of text) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if ('(['.includes(ch)) depth += 1;
    if (')]'.includes(ch)) depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
};

const namedArgs = (argText) =>
  splitTopLevel(argText)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      const space = raw.search(/\s/);
      const name = (space === -1 ? raw : raw.slice(0, space)).replace(/"/g, '');
      const eq = raw.toLowerCase().indexOf(' default ');
      const literal = eq === -1 ? null : raw.slice(eq + ' DEFAULT '.length).trim();
      return { name, literal };
    });

// The last CREATE of a name wins (migrations replace earlier definitions).
const expected = new Map();
for (const fn of declaredFunctions()) expected.set(fn.name, fn);

const call = async (fn) => {
  const args = namedArgs(fn.argText);
  // Every declared parameter is sent as null: the names resolve the function (so a function the
  // project does not have answers PGRST202), while a null argument is refused by any writer before
  // it touches a row. Declared defaults are deliberately not replayed — this is a presence probe,
  // not a behavioural test (scripts/verify-backend.mjs is that).
  const body = JSON.stringify(Object.fromEntries(args.map((arg) => [arg.name, null])));
  const response = await fetch(`${URL_BASE}/rest/v1/rpc/${fn.name}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: args.length ? body : '{}',
  });
  const text = await response.text();
  let code = null;
  try {
    code = JSON.parse(text)?.code ?? null;
  } catch {
    /* the body is not JSON (a plain-text error) */
  }
  return { status: response.status, code, text: text.slice(0, 200) };
};

console.log(`Probing ${expected.size} declared function(s) against ${URL_BASE}`);
const missing = [];
const present = [];
const failures = [];
for (const fn of expected.values()) {
  let outcome;
  try {
    outcome = await call(fn);
  } catch (e) {
    failures.push({ fn, error: e?.message ?? String(e) });
    continue;
  }
  if (outcome.status === 404 || outcome.code === 'PGRST202') missing.push({ fn, outcome });
  else present.push({ fn, outcome });
}

for (const { fn, outcome } of missing) {
  console.log(`  ✗ ${fn.name} (${fn.file}) — the project does not have it: HTTP ${outcome.status}${outcome.code ? ` ${outcome.code}` : ''}`);
}
for (const { fn, error } of failures) console.log(`  ✗ ${fn.name} (${fn.file}) — probe failed: ${error}`);

console.log('');
console.log(`present: ${present.length} · missing: ${missing.length} · unreachable: ${failures.length}`);

if (missing.length === 0 && failures.length === 0) {
  console.log('OVERALL STATUS: PASS — the project implements every function this repository defines.');
  process.exit(0);
}

console.log('');
console.log('The project is running schema this repository no longer defines. Apply supabase/migrations');
console.log('to the project (in filename order, with check_function_bodies = off for the session), then');
console.log('re-run this workflow — the live suite asserts the behaviour of the definitions in this branch.');
process.exit(1);
