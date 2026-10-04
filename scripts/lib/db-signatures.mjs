// The function signatures the migrations declare, and the arguments a presence probe must send.
//
// PostgREST resolves a call by *name and parameter list*: `rpc('feed_page', { __probe__: true })`
// answers PGRST202 "Could not find the function public.feed_page(p__probe__)" whether or not the
// function exists, because no overload takes a parameter called `__probe__`. That makes the obvious
// probe useless — it reports every RPC as missing. Sending the parameters the migration actually
// declared (null, so nothing is written) resolves the function when it exists and returns PGRST202
// when it does not, which is the difference between "the project is missing it" and "the project is
// fine".
//
// Both the live suite and the drift check need this, so it lives here rather than twice.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** `create [or replace] function public.foo(a integer default 1, b text)` → { name, argText }. */
export function* declaredFunctions(migrationsDir) {
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
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

/** Splits `a integer, b text default 'x', c numeric(10, 2)` on its top-level commas only. */
export const splitTopLevel = (text) => {
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

/** The declared parameter names, in order. */
export const namedArgs = (argText) =>
  splitTopLevel(argText)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      const space = raw.search(/\s/);
      return (space === -1 ? raw : raw.slice(0, space)).replace(/"/g, '');
    });

/**
 * The body a presence probe posts: every declared parameter, null. The names resolve the function;
 * a null argument is refused by any writer before it touches a row.
 */
export const nullArgsBody = (argText) => {
  const args = namedArgs(argText);
  return JSON.stringify(Object.fromEntries(args.map((name) => [name, null])));
};

/**
 * name → { file, argText } for the *last* definition of each function. Migrations replace earlier
 * definitions, so the last CREATE of a name is the one that survives `supabase db push`.
 */
export const expectedFunctions = (migrationsDir) => {
  const expected = new Map();
  for (const fn of declaredFunctions(migrationsDir)) expected.set(fn.name, fn);
  return expected;
};

/**
 * What a probe of an RPC actually proved.
 *
 * `present`    the project resolved the function; whatever it said about the null arguments is its
 *              own business and says nothing about whether it exists.
 * `missing`    PGRST202 / "Could not find the function" — with the *declared* parameter names, that
 *              answer means the project does not implement the function.
 * `unreachable` the project could not be asked at all (gateway, 5xx, timeout). That is neither
 *              present nor missing, and counting it as either is how a suite lies to you.
 */
export const classifyRpcProbe = ({ code = null, message = '', status = 0 } = {}) => {
  // "function public.x(...) does not exist" is an undefined function; "operator does not exist" and
  // "column ... does not exist" are a broken *body*, which proves the function is there. Both arrive
  // as 42883 on some deployments, so the message decides, not the code alone.
  const undefinedFunction =
    /could not find the function/i.test(message) ||
    /function\s+[a-z0-9_."]+\s*\(.*\)\s*does not exist/i.test(message);

  if (code === 'PGRST202' || undefinedFunction) return 'missing';

  // A status of 500 is not by itself "unreachable": PostgREST answers 500 when a function *raises*,
  // and a function that raised was found, resolved and executed. That is evidence it exists. Only a
  // transport failure — the request never got an answer at all — says the project could not be asked.
  const transportFailure = /fetch failed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|socket hang up|terminated/i.test(message);
  if (transportFailure || (status >= 500 && !message.trim())) return 'unreachable';

  return 'present';
};