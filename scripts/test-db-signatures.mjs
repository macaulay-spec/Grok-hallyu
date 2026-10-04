#!/usr/bin/env node
// Hallyu backend — signature and probe classification tests.
//
// The live suite asks "does the project implement this function?", and PostgREST answers that by
// resolving a call against the function's *declared parameter list*. Get the probe wrong and the
// answer is a wall of false failures: the connected run of 2026-10-04 reported all 73 RPCs missing
// on a project that has them, purely because the probe sent a parameter no overload declares.
//
// These assertions are offline and about the two pieces that decide that answer — the parser that
// reads the migrations and the classifier that reads the response — so the mistake cannot come back
// unnoticed.
//
// Exit: 0 = all assertions hold.

import path from 'node:path';
import process from 'node:process';
import { classifyRpcProbe, expectedFunctions, namedArgs, nullArgsBody } from './lib/db-signatures.mjs';

const MIGRATIONS = path.resolve('supabase/migrations');
const failures = [];

const check = (name, condition, detail = '') => {
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

console.log('HALLYU SIGNATURE / PROBE CHECKS');
console.log('================================');

const expected = expectedFunctions(MIGRATIONS);
check('the migrations yield a function map', expected.size > 100, `${expected.size} functions`);

// ── The parameters the probe must send ─────────────────────────────────────────────────────────

check(
  'a multi-argument function keeps its declared parameter names',
  JSON.stringify(namedArgs(expected.get('feed_page').argText)) ===
    JSON.stringify(['p_scope', 'p_world', 'p_title_id', 'p_limit', 'p_cursor', 'p_community_id']),
  JSON.stringify(namedArgs(expected.get('feed_page').argText)),
);

check(
  'every declared parameter is probed as null',
  JSON.parse(nullArgsBody(expected.get('queue_media_removal').argText)).p_reason === null,
);

check('a function with no parameters is probed with an empty body', nullArgsBody(expected.get('get_bootstrap').argText) === '{}');

check(
  'a type with a comma in it is not split (numeric(10, 2))',
  !namedArgs('p_amount numeric(10, 2), p_note text').includes('2'),
  JSON.stringify(namedArgs('p_amount numeric(10, 2), p_note text')),
);

check('trigger handlers are excluded — PostgREST never exposes them', !expected.has('profiles_guard_privileges'));

// The last CREATE of a name wins, because migrations replace earlier definitions.
const purgeSignature = expected.get('purge_deleted_accounts');
check('the final definition of a redefined function is the one parsed', purgeSignature?.file?.startsWith('20260101123700'), purgeSignature?.file);

// ── What a probe answer means ─────────────────────────────────────────────────────────────────

// Falsification: a validation error from a null argument is proof the function EXISTS.
check(
  'a validation error proves the function is present',
  classifyRpcProbe({ code: '23502', message: 'null value in column "target_id" of relation "moderation_actions" violates not-null constraint', status: 400 }) === 'present',
);

// …and only a resolution failure means it is missing.
check(
  'PGRST202 means missing',
  classifyRpcProbe({ code: 'PGRST202', message: 'Could not find the function public.feed_page(p_scope, p_limit)', status: 404 }) === 'missing',
);
check(
  'an undefined-function message means missing',
  classifyRpcProbe({ code: '42883', message: 'function public.notify_at_for(unknown, unknown) does not exist', status: 400 }) === 'missing',
);
// …while a broken body that happens to share the code does not: these are the live project's
// symptoms, and every one of them came from a function that exists.
check(
  'a missing operator inside the body still means the function is present',
  classifyRpcProbe({ code: '42883', message: 'operator does not exist: text[] & text[]', status: 400 }) === 'present',
);
check(
  'a missing column inside the body still means the function is present',
  classifyRpcProbe({ code: '42703', message: 'column "external_id" does not exist', status: 400 }) === 'present',
);

// A gateway that is down is neither present nor missing — reporting it as either is a lie.
check(
  'a 5xx is unreachable, not missing',
  classifyRpcProbe({ message: 'Internal Server Error', status: 503 }) === 'unreachable',
);
check(
  'a transport failure is unreachable',
  classifyRpcProbe({ message: 'fetch failed', status: 0 }) === 'unreachable',
);

console.log('');
if (failures.length > 0) {
  console.log('FAILURES');
  for (const failure of failures) console.log(`  ✗ ${failure}`);
  console.log('\nOVERALL STATUS: FAIL');
  process.exit(1);
}

console.log('OVERALL STATUS: PASS');