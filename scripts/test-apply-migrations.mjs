#!/usr/bin/env node
// Offline tests for the live migration applier (scripts/ci/apply-migrations.mjs).
//
// This script exists because the applier first reported a clean apply on a database where every
// object already existed. Two separate defects did that, and both are the classic way a harness
// invents a pass:
//
//   1. execFileSync returns stdout only when psql exits 0 — and with ON_ERROR_STOP off psql exits 0
//      even when statements failed — so the errors on stderr were discarded entirely;
//   2. the parser that reads those errors back demanded a column number, which psql prints for some
//      errors and not for DDL, so it matched nothing and reported zero failures.
//
// So the strings below are the real ones, copied out of a PostgreSQL 14 session, and the assertions
// are about *what must not be lost*: an error psql reported may never come back as "none".
import { classifyPsqlOutput, splitStatements } from './ci/apply-migrations.mjs';

let failures = 0;
const check = (name, condition, detail = '') => {
  if (condition) {
    console.log(`  ok   ${name}`);
    return;
  }
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── splitStatements ────────────────────────────────────────────────────────────────────────────
console.log('splitStatements');
{
  const one = splitStatements("create extension if not exists pgcrypto with schema extensions;\n");
  check('a single statement keeps its terminator', one.length === 1 && one[0].endsWith(';'), JSON.stringify(one));

  const two = splitStatements('create table a(i int);\ncreate table b(i int);');
  check('two statements stay two', two.length === 2, JSON.stringify(two));

  const literal = splitStatements("select 'a;b';\nselect 2;");
  check('a semicolon inside a literal does not split', literal.length === 2, JSON.stringify(literal));

  const body = splitStatements(
    'create function f() returns void language plpgsql as $$\nbegin\n  perform 1;\nend;\n$$;\nselect 1;',
  );
  check('a PL/pgSQL body is not shredded', body.length === 2 && body[0].includes('perform 1;'), JSON.stringify(body));

  const tagged = splitStatements('create function g() returns void as $fn$ begin perform 2; end; $fn$;\nselect 1;');
  check('a tagged dollar body is respected', tagged.length === 2, JSON.stringify(tagged));

  const comments = splitStatements('-- a; comment\n/* b; */\ncreate table c(i int);\n-- trailing;');
  check('comments are not statements', comments.length === 1, JSON.stringify(comments));

  const noTerminator = splitStatements('create table d(i int)');
  check('an unterminated final statement is still returned', noTerminator.length === 1, JSON.stringify(noTerminator));
}

// ── classifyPsqlOutput, against real psql output ────────────────────────────────────────────────
console.log('classifyPsqlOutput');
{
  const lineToStatement = new Map([
    // Line 11705–11707 is the multi-line trigger statement of migration 37; psql names 11707, its
    // *last* line, so a map keyed only on a statement's first line would blame the wrong migration.
    [11705, { file: '20260101123700_37_storage_removal_queue.sql', index: 12, sql: 'create trigger profiles_guard_privileges\n  before update on public.profiles\n  for each row execute function public.guard_profile_privileges();' }],
    [11706, { file: '20260101123700_37_storage_removal_queue.sql', index: 12, sql: 'create trigger profiles_guard_privileges\n  before update on public.profiles\n  for each row execute function public.guard_profile_privileges();' }],
    [11707, { file: '20260101123700_37_storage_removal_queue.sql', index: 12, sql: 'create trigger profiles_guard_privileges\n  before update on public.profiles\n  for each row execute function public.guard_profile_privileges();' }],
    [3, { file: '20260101120000_00_foundation.sql', index: 2, sql: 'create extension if not exists citext with schema extensions;' }],
    [7, { file: '20260101123700_37_storage_removal_queue.sql', index: 13, sql: 'create index zz on public.profiles (id);' }],
  ]);

  // Verbatim: psql prints a bare line and no column for DDL, and every SQLSTATE under VERBOSITY verbose.
  const duplicateType = `psql:probe2.sql:3: ERROR:  42710: type "zz_probe" already exists
LOCATION:  DefineEnum, typecmds.c:1178`;
  const duplicateIndex = `psql:probe2.sql:6: ERROR:  42P07: relation "zz_x" already exists
LOCATION:  index_create, index.c:877`;

  const tolerated = classifyPsqlOutput(`${duplicateType}\n${duplicateIndex}`, lineToStatement);
  check('an existing object is tolerated, not failed', tolerated.fatal.length === 0, JSON.stringify(tolerated.fatal));
  check('an existing object is still reported', tolerated.tolerated.length === 2, JSON.stringify(tolerated.tolerated));
  check('nothing is left unclassified', tolerated.unparsed.length === 0, JSON.stringify(tolerated.unparsed));

  // The defect that produced the fiction: no column number, and it must still be found.
  const syntaxError = `psql:/tmp/driver.sql:11707: ERROR:  42601: syntax error at or near "create"
LINE 2: create extension if not exists citext with schema extensions
        ^
LOCATION:  scanner_yyerror, scan.l:1176`;
  const broken = classifyPsqlOutput(syntaxError, lineToStatement);
  check(
    'a syntax error with no column number is fatal',
    broken.fatal.length === 1 && broken.fatal[0].code === '42601',
    JSON.stringify(broken),
  );
  check(
    'a fatal error is attributed to the migration statement psql pointed at',
    broken.fatal[0]?.file === '20260101123700_37_storage_removal_queue.sql' && broken.fatal[0]?.index === 12,
    JSON.stringify(broken.fatal[0]),
  );

  // Every error that is NOT "already exists" must fail the run. Permission, return-type change,
  // missing schema, broken body — none of these are survivable.
  for (const [code, message] of [
    ['42501', 'permission denied for schema public'],
    ['42P13', 'cannot change return type of existing function'],
    ['3F000', 'schema "extensions" does not exist'],
    ['42883', 'operator does not exist: text[] & text[]'],
    ['42P01', 'relation "public.no_such_table" does not exist'],
  ]) {
    const result = classifyPsqlOutput(`psql:driver.sql:7: ERROR:  ${code}: ${message}`, lineToStatement);
    check(`${code} fails the run`, result.fatal.length === 1 && result.tolerated.length === 0, JSON.stringify(result));
  }

  // A FATAL is never survivable whatever its code.
  const fatalConnection = classifyPsqlOutput(
    'psql:driver.sql:2: FATAL:  57P03: the database system is starting up',
    lineToStatement,
  );
  check('a FATAL connection error fails the run', fatalConnection.fatal.length === 1, JSON.stringify(fatalConnection));

  // An error in a shape the parser cannot read must be surfaced as unparsed, never swallowed —
  // this is what stops "psql complained, the report said nothing was wrong".
  const unrecognised = classifyPsqlOutput(
    'ERROR:  something went wrong and there is no psql prefix on this line',
    lineToStatement,
  );
  check('an unreadable error line is surfaced, not dropped', unrecognised.unparsed.length === 1, JSON.stringify(unrecognised));
  check('an unreadable error line is not counted as tolerated', unrecognised.tolerated.length === 0, JSON.stringify(unrecognised));

  // A clean run must stay clean — otherwise the guard above would fire on every success.
  const clean = classifyPsqlOutput('CREATE TABLE\nCREATE INDEX\nNOTICE:  done\n', lineToStatement);
  check(
    'a clean psql run reports nothing at all',
    clean.fatal.length + clean.tolerated.length + clean.unparsed.length === 0,
    JSON.stringify(clean),
  );
}

if (failures) {
  console.error(`\napply-migrations: ${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log('\napply-migrations: every assertion holds.');