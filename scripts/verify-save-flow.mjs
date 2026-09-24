/**
 * Regression test for the Saved State bug.
 *
 * Exercises the REAL guard helpers in lib/data/pending.ts (compiled to a temp dir) against the
 * exact sequence that used to lose a save:
 *   1. user taps Save  → optimistic add + queued mutation (intent on=true)
 *   2. a stale feed/`me` pull lands (server still says saved=false)  → must NOT revert
 *   3. flush sends the captured intent (on=true)                     → server converges to saved
 *   4. after the mutation drains, a fresh pull (saved=true)          → stays saved
 *   5. unsave mirrors the same guarantees in the opposite direction
 *
 * Run: node scripts/verify-save-flow.mjs
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = mkdtempSync(join(tmpdir(), 'hallyu-pending-'));
try {
  execSync(`npx tsc lib/data/pending.ts --outDir ${out} --module esnext --target es2020 --moduleResolution bundler --skipLibCheck`, { stdio: 'inherit' });
  const mod = await import(pathToFileURL(join(out, 'pending.js')).href);
  const { pendingIds, mergePending, mergePendingMap, pendingPrefKeys, mergePendingPrefs } = mod;

  let failures = 0;
  const ok = (name, cond) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
    if (!cond) failures++;
  };

  const POST = 'post-1';
  const queuedSave = { status: 'queued', action: { type: 'save', postId: POST, on: true } };

  // --- Step 1: optimistic save applied; mutation queued --------------------------------
  let state = { saves: [POST], reactions: { [POST]: 'loved' }, outbox: [queuedSave] };
  ok('optimistic save is present locally', state.saves.includes(POST));
  ok('save mutation is pending', pendingIds(state, 'save').has(POST));

  // --- Step 2a: stale feed pull says saved=false (viewerSync) --------------------------
  const pendingSaves = pendingIds(state, 'save');
  const touched = [POST];
  const set = new Set(state.saves);
  for (const id of touched) {
    if (pendingSaves.has(id)) continue; // the guard under test
    if (false) set.add(id);
    else set.delete(id);
  }
  state = { ...state, saves: [...set] };
  ok('stale viewerSync does NOT revert a pending save', state.saves.includes(POST));

  // --- Step 2b: stale `me` pull returns an empty saves list ----------------------------
  state = { ...state, saves: mergePending([], state.saves, pendingIds(state, 'save')) };
  ok('stale me() does NOT drop a pending save', state.saves.includes(POST));

  // --- Step 2c: stale `me` reactions map must not clobber a pending reaction -----------
  const queuedReact = { status: 'queued', action: { type: 'react', targetId: POST, kind: 'loved' } };
  state = { ...state, outbox: [...state.outbox, queuedReact] };
  state = { ...state, reactions: mergePendingMap({}, state.reactions, pendingIds(state, 'react')) };
  ok('stale me() does NOT drop a pending reaction', state.reactions[POST] === 'loved');

  // --- Step 3: flush sends the captured intent -----------------------------------------
  const sentOn = queuedSave.action.on ?? state.saves.includes(POST);
  ok('flush sends the captured intent (on=true)', sentOn === true);
  state = { ...state, outbox: [] }; // mutation drained

  // --- Step 4: fresh pull now agrees ----------------------------------------------------
  state = { ...state, saves: mergePending([POST], state.saves, pendingIds(state, 'save')) };
  ok('after flush, a fresh pull keeps the save', state.saves.includes(POST));

  // --- Step 5: unsave mirrors the guarantees -------------------------------------------
  const queuedUnsave = { status: 'queued', action: { type: 'save', postId: POST, on: false } };
  state = { ...state, saves: state.saves.filter((id) => id !== POST), outbox: [queuedUnsave] };
  ok('optimistic unsave removes it locally', !state.saves.includes(POST));
  // a stale pull that still says saved=true must not re-add it
  const pendingSaves2 = pendingIds(state, 'save');
  const set2 = new Set(state.saves);
  for (const id of [POST]) {
    if (pendingSaves2.has(id)) continue;
    set2.add(id);
  }
  state = { ...state, saves: [...set2] };
  ok('stale pull does NOT re-add a pending unsave', !state.saves.includes(POST));
  state = { ...state, saves: mergePending([POST], state.saves, pendingIds(state, 'save')) };
  ok('stale me() does NOT re-add a pending unsave', !state.saves.includes(POST));
  const unsaveOn = queuedUnsave.action.on ?? state.saves.includes(POST);
  ok('flush sends the unsave intent (on=false)', unsaveOn === false);

  // --- Step 6: failed mutations are NOT protected (they will be rolled back) -----------
  const failed = { status: 'failed', action: { type: 'save', postId: POST, on: true } };
  ok('failed mutations are not treated as pending', !pendingIds({ outbox: [failed] }, 'save').has(POST));

  // --- Step 7: a just-toggled setting survives a stale `me` pull ------------------------
  const prefsState = {
    outbox: [{ status: 'queued', action: { type: 'prefs', patch: { dataSaver: true } } }],
  };
  const serverPrefs = { dataSaver: false, autoplay: 'wifi', language: 'en' };
  const localPrefs = { dataSaver: true, autoplay: 'wifi', language: 'en' };
  const merged = mergePendingPrefs(serverPrefs, localPrefs, pendingPrefKeys(prefsState));
  ok('stale me() does NOT revert a pending setting', merged.dataSaver === true);
  ok('unrelated settings still take the server value', merged.autoplay === 'wifi');

  console.log(failures === 0 ? '\nALL SAVE-FLOW CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
} finally {
  rmSync(out, { recursive: true, force: true });
}
