#!/usr/bin/env node
// Calls every public function once against the local database, so PL/pgSQL bodies are compiled and
// planned — which is the only offline way to catch the bugs a SQL parser cannot see (a function
// body is just a string to a parser: an `end if;` closing a `begin … exception` block, an ON CONFLICT
// column colliding with a plpgsql variable, an aliased INSERT's table name used in its DO UPDATE
// clause, a CASE yielding text assigned to an enum column, an RLS policy cycle).
//
// Each function is called with its declared defaults, or NULL where it has none, so a call may
// legitimately fail on a validation branch (authentication required, no such member, …). Errors in
// two classes are treated as database faults and fail this script:
//
//   compile / plan errors  — the body does not compile, or the statement cannot be planned
//   missing objects        — the relation, column or function the body names does not exist
//
// Argument validation is expected and only counted.
//
// Usage: node scripts/localdb/surface.mjs
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DB = process.env.HALLYU_LOCAL_DB ?? 'hallyu';
const SCRATCH = path.join(os.tmpdir(), 'hallyu-db');
mkdirSync(SCRATCH, { recursive: true });
// psql reports NOTICE on stderr, so both streams are captured and parsed together.
const psql = (args, input = '') => {
  const result = spawnSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=0', ...args], {
    input,
    encoding: 'utf8',
    cwd: SCRATCH,
    env: { ...process.env },
    maxBuffer: 64 * 1024 * 1024,
  });
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
};

const inventory = psql(
  ['-t', '-A', '-d', DB, '-c', `
    select p.proname || '|' || pg_get_function_arguments(p.oid)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.proname not like '\\_%'
       and p.proname <> 'set_updated_at'
       and p.proname <> 'genre_search_text'
       and p.prorettype <> 'trigger'::regtype
       and not exists (
         select 1 from pg_depend d
          where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
       )
     order by p.proname, pg_get_function_arguments(p.oid);`],
  '',
);

/** Split `a integer DEFAULT 3, b text, c uuid[] DEFAULT NULL::uuid[]` into named arguments. */
const parseArgs = (argText) => {
  const args = [];
  let depth = 0;
  let current = '';
  for (const ch of argText) {
    if ('(['.includes(ch)) depth += 1;
    if (')]'.includes(ch)) depth -= 1;
    if (ch === ',' && depth === 0) {
      args.push(current);
      current = '';
    } else current += ch;
  }
  if (current.trim()) args.push(current);
  return args.map((raw) => {
    const text = raw.trim();
    const eq = text.indexOf(' DEFAULT ');
    return { name: text.slice(0, text.indexOf(' ') === -1 ? undefined : text.indexOf(' ')), literal: eq === -1 ? 'null' : text.slice(eq + 9).trim() };
  });
};

const calls = inventory
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)
  .map((row) => {
    const bar = row.indexOf('|');
    const name = row.slice(0, bar);
    const args = parseArgs(row.slice(bar + 1));
    return args.length ? `${name}(${args.map((a) => `${a.name} => ${a.literal}`).join(', ')})` : `${name}()`;
  });

// Overloaded functions need their argument types to disambiguate; cast the first argument.
const blocks = calls.map((call) => `do $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform public.${call};
  raise notice 'SURFACE OK :: ${call.replace(/'/g, "''")}';
exception when others then
  raise notice 'SURFACE ERR :: ${call.replace(/'/g, "''")} :: %', sqlerrm;
end $$;`);

const output = psql(['-d', DB, '-f', '-'], blocks.join('\n'));

const SCHEMA_BUG = [
  /syntax error/i,
  /return type/i,
  /invalid reference to FROM-clause entry/i,
  /ambiguous/i,
  /is of type .* but expression is of type/i,
  /PL\/pgSQL function .* (line|at)/i,
  /missing FROM-clause entry/i,
  /column .* does not exist/i,
  /relation .* does not exist/i,
  /function .* does not exist/i,
  /query has no destination for result data/i,
  /operator does not exist/i,
  /no function matches/i,
  /more than one row/i,
  /infinite recursion detected/i,
  /has no field/i,
  /record .* is not assigned yet/i,
];

let ran = 0;
let rejected = 0;
const bugs = [];
for (const line of output.split('\n')) {
  const m = /NOTICE:\s+SURFACE (OK|ERR) :: (.*?)(?: :: (.*))?$/.exec(line);
  if (!m) continue;
  const [, kind, call, message] = m;
  if (kind === 'OK') {
    ran += 1;
    continue;
  }
  if (message && SCHEMA_BUG.some((pattern) => pattern.test(message))) bugs.push({ call, message });
  else rejected += 1;
}

for (const bug of bugs) console.log(`✗ ${bug.call}\n    ${bug.message}`);
console.log(
  `\n${calls.length} call(s): ${ran} ran clean, ${rejected} rejected their arguments as expected, ${bugs.length} failed to compile or plan.`,
);
process.exit(bugs.length === 0 ? 0 : 1);
