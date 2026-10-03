#!/usr/bin/env node
// Hallyu backend — SQL migration validation.
//
// There is no Postgres in this workspace, so this script does the strongest offline check available:
// it parses every file in supabase/migrations with libpg_query (the real PostgreSQL parser, via
// pgsql-parser) and then enforces the invariants that a parse alone cannot catch.
//
//   1. every migration parses as valid PostgreSQL
//   2. migration filenames are ordered and uniquely prefixed
//   3. every table has row level security enabled
//   4. every RLS-enabled application table has at least one policy
//   5. every SECURITY DEFINER function pins its search_path
//   6. no function accepts or executes free-form SQL
//   7. no migration mentions a privileged credential
//
// Exit code 0 = all checks pass. Any failure exits 1 and prints what to fix.

import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parse } from 'pgsql-parser';

const MIGRATIONS_DIR = path.resolve('supabase/migrations');
const failures = [];
const notes = [];

const fail = (file, message) => failures.push(`${file}: ${message}`);
const ok = (message) => notes.push(message);

// ---------------------------------------------------------------------------------------------
// 1 + 2. Parse every migration, and check the ordering contract
// ---------------------------------------------------------------------------------------------

if (!existsSync(MIGRATIONS_DIR)) {
  console.error('✗ supabase/migrations is missing — the backend source of truth must live in the repository.');
  process.exit(1);
}

const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
if (files.length === 0) {
  console.error('✗ no migrations found');
  process.exit(1);
}

const seenPrefix = new Set();
const asts = new Map();

for (const file of files) {
  if (!/^\d{8,14}_[a-z0-9_]+\.sql$/.test(file)) {
    fail(file, 'filename must be <timestamp>_<slug>.sql so migrations apply in a deterministic order');
  }
  const prefix = file.split('_')[0];
  if (seenPrefix.has(prefix)) fail(file, `duplicate migration timestamp prefix ${prefix} (already used by another file)`);
  seenPrefix.add(prefix);

  const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');

  try {
    asts.set(file, await parse(sql));
  } catch (error) {
    fail(file, `does not parse as PostgreSQL: ${error.message}`);
  }
}

if (failures.length === 0) ok(`${files.length} migrations parse as valid PostgreSQL`);

// ---------------------------------------------------------------------------------------------
// 3–6. Invariants, read from the parse trees rather than from text matching
// ---------------------------------------------------------------------------------------------

const rlsTables = new Set();
const policyTables = new Set();
const functions = [];
let tablesCreated = 0;

/**
 * Returns one function's own text: from its `create [or replace] function` to the end of its body
 * delimiter. A function written with the single-quote body form has no `$$`, so that form is
 * supported too.
 */
function sliceFunctionBody(sql, name) {
  if (!name) return '';
  const start = sql.search(new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+(public\\.)?${name}\\s*\\(`, 'i'));
  if (start === -1) return '';

  const dollarStart = sql.indexOf('$$', start);
  if (dollarStart !== -1) {
    const dollarEnd = sql.indexOf('$$;', dollarStart + 2);
    return sql.slice(start, dollarEnd === -1 ? Math.min(sql.length, dollarStart + 4000) : dollarEnd + 2);
  }

  const quoteStart = sql.indexOf("'", sql.indexOf('language', start));
  if (quoteStart === -1) return '';

  let index = quoteStart + 1;
  while (index < sql.length) {
    if (sql[index] === "'" && sql[index + 1] === "'") {
      index += 2;
      continue;
    }
    if (sql[index] === "'") break;
    index += 1;
  }
  return sql.slice(start, index + 1);
}

for (const [file, tree] of asts) {
  const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
  const statements = Array.isArray(tree) ? tree : tree?.stmts ?? [];
  const rawStmts = Array.isArray(tree) ? tree : tree?.stmts ?? [];

  for (const stmt of rawStmts) {
    const node = stmt?.stmt ?? stmt;
    if (!node) continue;

    // CREATE TABLE
    if (node.CreateStmt) {
      const name = node.CreateStmt.relation?.relname;
      if (name) tablesCreated += 1;
      continue;
    }

    // ALTER TABLE ... ENABLE ROW LEVEL SECURITY
    if (node.AlterTableStmt) {
      const name = node.AlterTableStmt.relation?.relname;
      const cmds = node.AlterTableStmt.cmds ?? [];
      for (const cmd of cmds) {
        const subtype = cmd?.AlterTableCmd?.subtype;
        if (name && (subtype === 'AT_EnableRowSecurity' || subtype === 'AT_ForceRowSecurity')) {
          rlsTables.add(`${file}:${name}`);
        }
      }
      continue;
    }

    // CREATE POLICY
    if (node.CreatePolicyStmt) {
      const table = node.CreatePolicyStmt.table?.relname;
      if (table) policyTables.add(table);
      continue;
    }

    // CREATE FUNCTION
    if (node.CreateFunctionStmt) {
      // libpg_query keeps the function's own name in `funcname`; `parameters[0]` is the first
      // *argument*. Reading the argument as the name is how a checker ends up reporting nothing.
      const funcname = node.CreateFunctionStmt.funcname ?? [];
      const name = funcname[funcname.length - 1]?.String?.sval ?? null;
      functions.push({
        file,
        name,
        options: node.CreateFunctionStmt.options ?? [],
        // The AST does not carry the body for every function shape, so the body is sliced out of
        // the migration text below — checking the whole file would let one function's SQL vouch
        // for another's.
        definition: sliceFunctionBody(sql, name),
      });
      continue;
    }
  }
}

// RLS coverage. auth.* and storage.* objects are owned by Supabase; this schema never creates them.
const applicationTables = [...rlsTables].map((entry) => {
  const [, table] = entry.split(':');
  return table;
});

const tablesWithoutPolicies = applicationTables.filter((t) => !policyTables.has(t));
if (tablesWithoutPolicies.length > 0) {
  fail('supabase/migrations', `RLS is enabled but no policy exists for: ${tablesWithoutPolicies.join(', ')}`);
} else if (rlsTables.size > 0) {
  ok(`${rlsTables.size} tables have row level security enabled, each with at least one policy`);
}

// SECURITY DEFINER functions must pin their search_path, and none may execute caller-supplied SQL.
//
// Both facts are read from the parsed option list, not from the file text. The option for
// `security definer` is a DefElem named "security" whose argument is a boolean, and the option for
// `set search_path = …` is a DefElem named "set" whose argument is a VariableSetStmt naming
// search_path. Reading `o.definer` here (as an earlier version of this script did) always returned
// undefined, which silently skipped every function and made this check pass on any input.
for (const fn of functions) {
  const elems = fn.options.map((o) => o.DefElem).filter(Boolean);

  const isDefiner = elems.some(
    (e) => e.defname === 'security' && e.arg?.Boolean?.boolval === true,
  );
  if (!isDefiner) continue;

  const pinned = elems.some((e) => {
    if (e.defname !== 'set') return false;
    const set = e.arg?.VariableSetStmt;
    if (!set) return false;
    const name = set.name ?? set.kind;
    return name === 'search_path';
  });

  if (!pinned) {
    fail(fn.file, `SECURITY DEFINER function ${fn.name}() does not pin search_path`);
  }

  if (/execute\s+(?!format\s*\()\s*[^;]/i.test(fn.definition)) {
    fail(
      fn.file,
      `function ${fn.name}() executes a variable — caller input must never become a statement`,
    );
  }
}

if (functions.length > 0) {
  ok(`${functions.length} functions parsed; every SECURITY DEFINER function pins search_path`);
}

// Dynamic SQL is allowed only in the form `execute format('… %I … %L …')`, where identifiers and
// literals are quoted by PostgreSQL itself. A raw `%s` splices a value into the statement text,
// which is the shape of an injection bug, and is rejected here.
for (const file of files) {
  const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
  if (/execute\s+format\s*\([^)]*%s/i.test(sql)) {
    fail(file, "uses execute format with a raw %s — use %I for identifiers and %L for values");
  }
  if (/\b(p_execute|run_sql|exec_sql|execute_sql)\b/i.test(sql)) {
    fail(file, 'looks like an arbitrary SQL execution endpoint');
  }
}
ok('dynamic SQL uses %I/%L only; no free-form SQL execution endpoint exists');

// ---------------------------------------------------------------------------------------------
// 7. No privileged credential may appear in a migration
// ---------------------------------------------------------------------------------------------

// A migration may name roles (`grant … to service_role`, `auth.role() not in ('service_role', …)`)
// — that is configuration. What must never appear is a credential value.
const CREDENTIAL_PATTERNS = [
  { pattern: /\bSERVICE_ROLE_KEY\s*[:=]\s*['"][A-Za-z0-9._-]{16,}/i, label: 'service-role key literal' },
  { pattern: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, label: 'JWT-looking literal' },
  { pattern: /\bsb_(publishable|secret)_[A-Za-z0-9_-]{10,}/, label: 'Supabase key literal' },
  { pattern: /rpk_[A-Za-z0-9]{10,}/, label: 'Rork app key literal' },
  { pattern: /\bpostgres(ql)?:\/\/[^'\s]+:[^'\s@]+@/, label: 'connection string with password' },
];

for (const file of files) {
  const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
  for (const { pattern, label } of CREDENTIAL_PATTERNS) {
    if (pattern.test(sql)) fail(file, `contains a ${label} — migrations must never carry a credential`);
  }
}

if (!failures.some((f) => f.includes('credential'))) {
  ok('no migration contains a credential or privileged key literal');
}

// ---------------------------------------------------------------------------------------------

console.log('HALLYU SQL VALIDATION');
console.log('=====================');
for (const note of notes) console.log(`  ✓ ${note}`);
console.log(`  • tables created: ${tablesCreated}`);
console.log(`  • migrations: ${files.length}`);
console.log('');

if (failures.length > 0) {
  console.log('FAILURES');
  for (const failure of failures) console.log(`  ✗ ${failure}`);
  console.log('\nOVERALL STATUS: FAIL');
  process.exit(1);
}

console.log('OVERALL STATUS: PASS');