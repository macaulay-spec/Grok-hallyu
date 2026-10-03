#!/usr/bin/env node
// Hallyu — repository secret scan.
//
// Fails when a credential is committed. Runs offline in `npm run check` and in CI, so a leaked key
// is caught before it reaches a build rather than after.

import process from 'node:process';
import { scanRepository } from './lib/secret-scan.mjs';

const { offenders, filesScanned } = await scanRepository();

console.log('HALLYU SECRET SCAN');
console.log('===================');
console.log(`  • files scanned: ${filesScanned}`);
console.log('  • allowed: the public read-only TMDB catalog token in constants/keys.ts (by value)');
console.log('');

if (offenders.length > 0) {
  console.log('FAILURES');
  for (const offender of offenders) {
    console.log(`  ✗ ${offender.kind} found in ${offender.file}`);
  }
  console.log('');
  console.log('OVERALL STATUS: FAIL — remove the credential, rotate it, and commit only placeholders.');
  process.exit(1);
}

console.log('OVERALL STATUS: PASS');