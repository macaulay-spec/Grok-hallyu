#!/usr/bin/env node
// Hallyu backend — type contract drift check.
//
// supabase/types/database.ts is hand-maintained until the project is attached, so nothing would stop
// it from quietly drifting away from the SQL. This script closes that gap: it parses every migration
// with the real PostgreSQL parser, extracts the tables and columns each one creates, extracts the
// tables and columns the TypeScript contract declares, and fails on any difference in either
// direction. It also checks that every enum value in the SQL appears in the type file.
//
// Exit code 0 = the contract matches the migrations.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { parse } from 'pgsql-parser';

const MIGRATIONS_DIR = path.resolve('supabase/migrations');
const TYPES_FILE = path.resolve('supabase/types/database.ts');

const failures = [];
const fail = (message) => failures.push(message);

// ---------------------------------------------------------------------------------------------
// 1. Tables and columns the migrations actually create
// ---------------------------------------------------------------------------------------------

const sqlTables = new Map(); // table -> Set<column>

for (const file of (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort()) {
  const tree = await parse(await readFile(path.join(MIGRATIONS_DIR, file), 'utf8'));
  const stmts = Array.isArray(tree) ? tree : (tree.stmts ?? []);

  for (const raw of stmts) {
    const node = raw?.stmt;
    if (!node?.CreateStmt) continue;

    // `create table … partition of …` parses as a plain CreateStmt with no column list: its columns
    // come from the parent, so it is not an independent table and does not belong in the contract.
    if (node.PartitionStmt) continue;

    const relation = node.CreateStmt.relation;
    if (relation?.schemaname !== 'public') continue; // storage/auth objects belong to Supabase

    const table = relation.relname;
    const entries = node.CreateStmt.tableElts ?? [];
    if (entries.length === 0) continue; // a partition

    const columns = sqlTables.get(table) ?? new Set();

    for (const entry of entries) {
      const def = entry?.ColumnDef;
      // A bare `col type` entry has colname; `constraint …` and `primary key (…)` entries do not.
      if (def?.colname) columns.add(def.colname);
    }

    sqlTables.set(table, columns);
  }

  // Columns added later with `alter table … add column` (the generated tsvector columns) belong to
  // the table too, so the contract must declare them as well.
  for (const raw of stmts) {
    const alter = raw?.stmt?.AlterTableStmt;
    if (!alter?.cmds) continue;

    const table = alter.relation?.relname;
    if (alter.relation?.schemaname !== 'public' || !table) continue;

    for (const cmd of alter.cmds) {
      const def = cmd?.AlterTableCmd?.def?.ColumnDef ?? cmd?.AlterTableCmd?.def;
      if (def?.colname) {
        const columns = sqlTables.get(table) ?? new Set();
        columns.add(def.colname);
        sqlTables.set(table, columns);
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// 2. Tables and columns the TypeScript contract declares
// ---------------------------------------------------------------------------------------------

const types = await readFile(TYPES_FILE, 'utf8');
const tablesBlock = types.slice(types.indexOf('Tables: {'), types.indexOf('Views:'));

const typeTables = new Map();
let currentTable = null;
let inRow = false;
let rowDepth = 0;

for (const line of tablesBlock.split('\n')) {
  const tableMatch = line.match(/^ {6}([a-z_]+): \{$/);
  if (tableMatch) {
    currentTable = tableMatch[1];
    typeTables.set(currentTable, new Set());
    inRow = false;
    continue;
  }

  if (!currentTable) continue;

  if (/^ {8}Row: \{$/.test(line)) {
    inRow = true;
    rowDepth = 0;
    continue;
  }

  // A short table may declare its Row on one line: `Row: { a: string; b: string };`
  const inlineRow = line.match(/^ {8}Row: \{(.+)\};?$/);
  if (inlineRow) {
    for (const columnMatch of inlineRow[1].matchAll(/([a-z_0-9]+)\??:/g)) {
      typeTables.get(currentTable).add(columnMatch[1]);
    }
    inRow = false;
    continue;
  }

  if (inRow) {
    if (/^ {8}\};?$/.test(line)) {
      inRow = false;
      continue;
    }
    const columnMatch = line.match(/^ {10}([a-z_0-9]+)\??:/);
    if (columnMatch) typeTables.get(currentTable).add(columnMatch[1]);
  }
}

// ---------------------------------------------------------------------------------------------
// 3. Compare
// ---------------------------------------------------------------------------------------------

for (const [table, columns] of sqlTables) {
  if (!typeTables.has(table)) {
    fail(`supabase/types/database.ts is missing table "${table}" (created in the migrations)`);
    continue;
  }

  const declared = typeTables.get(table);
  for (const column of columns) {
    if (!declared.has(column)) {
      fail(`supabase/types/database.ts: table "${table}" is missing column "${column}"`);
    }
  }
  for (const column of declared) {
    if (!columns.has(column)) {
      fail(`supabase/types/database.ts: table "${table}" declares column "${column}" that no migration creates`);
    }
  }
}

for (const table of typeTables.keys()) {
  if (!sqlTables.has(table)) {
    fail(`supabase/types/database.ts declares table "${table}" that no migration creates`);
  }
}

// ---------------------------------------------------------------------------------------------
// 4. Enum values
// ---------------------------------------------------------------------------------------------

const migrationsSql = (
  await Promise.all(
    (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFile(path.join(MIGRATIONS_DIR, f), 'utf8')),
  )
).join('\n');

const enumValues = new Map(); // enum -> Set<value>
for (const match of migrationsSql.matchAll(/create type\s+public\.([a-z_]+)\s+as enum\s*\(([^)]*)\)/gi)) {
  const values = match[2]
    .split(',')
    .map((v) => v.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);
  enumValues.set(match[1], new Set(values));
}

for (const [name, values] of enumValues) {
  for (const value of values) {
    const pattern = new RegExp(`['"]${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`);
    if (!pattern.test(types)) {
      fail(`supabase/types/database.ts: enum ${name} is missing value "${value}"`);
    }
  }
}

// ---------------------------------------------------------------------------------------------

console.log('HALLYU TYPE CONTRACT CHECK');
console.log('==========================');
console.log(`  • migrations parsed: ${sqlTables.size} tables in public`);
console.log(`  • contract declares: ${typeTables.size} tables, ${enumValues.size} enums checked`);
console.log('');

if (failures.length > 0) {
  console.log('FAILURES');
  for (const failure of failures) console.log(`  ✗ ${failure}`);
  console.log('\nOVERALL STATUS: FAIL');
  process.exit(1);
}

console.log('OVERALL STATUS: PASS');