#!/usr/bin/env node
// Local PostgreSQL harness: applies supabase/migrations to a disposable database the same way the
// live Rork/Supabase project was provisioned (docs/RORK-CLOUD-CONNECTION-REPORT.md §3):
//
//   - Supabase-shaped roles plus auth.* / storage.* / extensions.* stubs are created first;
//   - `check_function_bodies = off` for the runner session (migration 00 defines is_moderator(),
//     a `language sql` function, before profiles exists — the same session note the connection
//     report §3 recorded);
//   - migrations then apply verbatim in strict filename order — no deferrals.
//
// Everything runs through the local `psql` as the OS user that invokes node (role must exist).
// Usage:  node scripts/localdb/apply.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = path.resolve(process.argv[2] ?? process.cwd());
const MIGRATIONS = path.join(REPO, 'supabase', 'migrations');
const SEED = path.join(REPO, 'supabase', 'seed.sql');
// Scratch space for the staged migrations; also the working directory psql runs in, so a relative
// PG* environment (as in CI, where psql talks to a service container) is resolved consistently.
export const SCRATCH = path.join(os.tmpdir(), 'hallyu-db');
const STAGE = path.join(SCRATCH, 'stage');
const DB = process.env.HALLYU_LOCAL_DB ?? 'hallyu';
mkdirSync(SCRATCH, { recursive: true });

const psql = (args, opts = {}) =>
  execFileSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', ...args], {
    encoding: 'utf8',
    env: { ...process.env, PGOPTIONS: '-c check_function_bodies=off' },
    cwd: SCRATCH,
    ...opts,
  });

// ── 1. fresh database ────────────────────────────────────────────────────────────────────────
psql(['-d', 'postgres', '-c', `drop database if exists ${DB}`]);
psql(['-d', 'postgres', '-c', `create database ${DB}`]);
const run = (sql, label) => {
  try {
    psql(['-d', DB], { input: sql });
  } catch (e) {
    console.error(`\n✗ ${label}\n${e.stdout ?? ''}${e.stderr ?? ''}`);
    process.exit(1);
  }
  console.log(`✓ ${label}`);
};

// ── 2. Supabase-shaped stubs ─────────────────────────────────────────────────────────────────
run(
  `
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create or replace function auth.uid() returns uuid
  language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text
  language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
create or replace function auth.jwt() returns jsonb
  language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to public;

create schema if not exists extensions;
create extension if not exists citext with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.buckets, storage.objects to service_role;
grant select, insert, update, delete on storage.objects to authenticated;

grant usage on schema public to anon, authenticated, service_role;

-- Supabase's own defaults: every function and table in \`public\` is granted to the three API roles
-- at creation time. The migrations then narrow that (revoke + explicit grants) for anon and
-- authenticated; service_role keeps the defaults — which is why the live suite can call e.g.
-- trending_titles() with the service-role key although the migration only grants it to anon.
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`,
  'stubs (roles, auth, extensions, storage)',
);

// ── 3. stage migrations ──────────────────────────────────────────────────────────────────
rmSync(STAGE, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });
const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
for (const f of files) {
  writeFileSync(path.join(STAGE, f), readFileSync(path.join(MIGRATIONS, f), 'utf8'));
}
console.log(`staged ${files.length} migrations (strict filename order, no deferrals)`);

// ── 4. apply in filename order ───────────────────────────────────────────────────────────────
for (const f of files) {
  try {
    psql(['-d', DB, '-f', path.join(STAGE, f)]);
  } catch (e) {
    console.error(`\n✗ ${f}\n${e.stdout ?? ''}${e.stderr ?? ''}`);
    process.exit(1);
  }
  console.log(`✓ ${f}`);
}

try {
  psql(['-d', DB, '-f', SEED]);
  console.log('✓ seed.sql');
} catch (e) {
  console.error(`\n✗ seed.sql\n${e.stdout ?? ''}${e.stderr ?? ''}`);
  process.exit(1);
}

// Supabase gives service_role full table access (the suite's admin() client reads and writes);
// the migrations only ever grant it EXECUTE on functions. Added here as a supplement so the repo's
// explicit anon/authenticated grants stay strictly what the harness verifies.
run('grant all on all tables in schema public to service_role;', 'service_role table grants');

console.log('\nAPPLY OK');
