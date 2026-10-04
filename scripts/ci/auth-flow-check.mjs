#!/usr/bin/env node
// Hallyu CI — the on-device authentication gate.
//
// Runs on the emulator runner after scripts/ci/boot-check.sh, against the release APK that was just
// installed. It drives the real UI through ADB (uiautomator bounds + input events — the same taps a
// person makes) and asserts the app's own boot-trail markers:
//
//   1. fresh state (pm clear) → welcome screen renders;
//   2. sign in with a real account created for this run (scripts/ci/test-account.mjs);
//   3. the app reaches the tabs as a signed-in member and the connection gate reports `gate:connected`
//      — an authenticated get_bootstrap() round trip, not a TCP ping;
//   4. force-stop and relaunch → `auth:session-restored` + `gate:connected` + tabs again: the session
//      genuinely persists across an app restart;
//   5. no crash trap, no navigate-before-mount, no FATAL/ANR anywhere in the window.
//
// The workflow then asserts the account's `auth.signin` analytics row on the backend (a second,
// independent proof that the device wrote through an authenticated RPC).
//
// Env: HALLYU_TEST_EMAIL, HALLYU_TEST_PASSWORD  (masked by the workflow)
// Exit: 0 = PASS, 1 = FAIL

import { execFileSync } from 'node:child_process';
import process from 'node:process';

const PKG = 'com.hallyu.app';
const ACTIVITY = `${PKG}/.MainActivity`;
const EMAIL = (process.env.HALLYU_TEST_EMAIL ?? '').trim();
const PASSWORD = process.env.HALLYU_TEST_PASSWORD ?? '';

const BAD_JS = /\[hallyu:crash\]|Attempted to navigate before mounting|index:nav-failed/;
const FATAL = /FATAL EXCEPTION|ANR in/;

if (!EMAIL || !PASSWORD) {
  console.error('::error::auth-flow-check needs HALLYU_TEST_EMAIL and HALLYU_TEST_PASSWORD');
  process.exit(1);
}

// ── adb plumbing ──────────────────────────────────────────────────────────────────────────────
const adb = (args, options = {}) =>
  execFileSync('adb', args, { encoding: 'utf8', timeout: 60_000, maxBuffer: 32 * 1024 * 1024, ...options }).toString();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const note = (message) => console.log(`::notice::[auth-flow] ${message}`);
const fail = (message) => {
  console.log(`::error::[auth-flow] ${message}`);
  process.exitCode = 1;
};

async function waitFor(label, predicate, timeoutMs, pollMs = 1500) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    try {
      last = predicate();
      if (last) return last;
    } catch (e) {
      last = e?.message ?? null;
    }
    await sleep(pollMs);
  }
  fail(`${label} — not seen within ${Math.round(timeoutMs / 1000)}s${last ? ` (last: ${String(last).slice(0, 200)})` : ''}`);
  return null;
}

const logcat = () => {
  try {
    return adb(['logcat', '-d']);
  } catch {
    return '';
  }
};
const trail = () =>
  logcat()
    .split('\n')
    .filter((l) => l.includes('[hallyu:boot]'))
    .map((l) => l.slice(l.indexOf('[hallyu:boot]')))
    .join('\n');
const clearLogcat = () => {
  try {
    adb(['logcat', '-c']);
  } catch {
    /* clearing is best-effort */
  }
};

// ── UI dump plumbing ──────────────────────────────────────────────────────────────────────────
function dumpNodes() {
  adb(['shell', 'uiautomator', 'dump', '/sdcard/hallyu-ui.xml']);
  const xml = adb(['shell', 'cat', '/sdcard/hallyu-ui.xml']);
  const nodes = [];
  for (const match of xml.matchAll(/<node[^>]*>/g)) {
    const tag = match[0];
    const attr = (name) => {
      const m = new RegExp(`${name}="([^"]*)"`).exec(tag);
      return m ? m[1] : '';
    };
    const bounds = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(tag);
    nodes.push({
      text: attr('text'),
      cls: attr('class'),
      desc: attr('content-desc'),
      bounds: bounds ? { x1: +bounds[1], y1: +bounds[2], x2: +bounds[3], y2: +bounds[4] } : null,
    });
  }
  return nodes;
}

const centre = (node) => ({
  x: Math.round((node.bounds.x1 + node.bounds.x2) / 2),
  y: Math.round((node.bounds.y1 + node.bounds.y2) / 2),
});

const tap = (node, label) => {
  const { x, y } = centre(node);
  note(`tap ${label} at ${x},${y}`);
  adb(['shell', 'input', 'tap', String(x), String(y)]);
};

const byText = (nodes, text) => nodes.find((n) => n.text === text) ?? nodes.find((n) => n.text.includes(text)) ?? null;

// ── Phase 1 · clean state → welcome ───────────────────────────────────────────────────────────
note('phase 1: clear app data and cold-start to the welcome screen');
adb(['shell', 'pm', 'clear', PKG]);
clearLogcat();
adb(['shell', 'am', 'start', '-n', ACTIVITY]);

const welcome = await waitFor(
  'welcome screen',
  () => {
    const nodes = dumpNodes();
    const hit = byText(nodes, 'I already have an account');
    if (!hit) throw new Error(`visible: ${nodes.map((n) => n.text).filter(Boolean).slice(0, 8).join(' | ')}`);
    return hit;
  },
  90_000,
);
if (!welcome) process.exit(1);

// ── Phase 2 · sign in through the real form ───────────────────────────────────────────────────
note('phase 2: open sign-in and type the credentials');
tap(welcome, '"I already have an account"');

const fields = await waitFor(
  'sign-in form',
  () => {
    const edits = dumpNodes().filter((n) => n.cls === 'android.widget.EditText');
    if (edits.length < 2) throw new Error(`${edits.length} input(s) visible`);
    return edits;
  },
  45_000,
);
if (!fields) process.exit(1);

const [emailField, passwordField] = fields;
tap(emailField, 'email field');
adb(['shell', 'input', 'text', EMAIL]);
await sleep(600);
tap(passwordField, 'password field');
adb(['shell', 'input', 'text', PASSWORD]);
await sleep(600);

// ── Phase 3 · submit → signed in → connected → tabs ───────────────────────────────────────────
note('phase 3: submit and wait for the signed-in redirect');
clearLogcat();
adb(['shell', 'input', 'keyevent', '66']); // the password field's "go"/enter submits

let toTabs = await waitFor('index:redirect:tabs after sign-in', () => trail().includes('index:redirect:tabs'), 60_000, 2000);
if (!toTabs) {
  // Fallback for soft keyboards that swallow ENTER: dismiss it and tap the button.
  note('ENTER did not submit — dismissing the keyboard and tapping the Sign in button');
  adb(['shell', 'input', 'keyevent', '4']);
  await sleep(800);
  const button = byText(dumpNodes(), 'Sign in');
  if (button) tap(button, '"Sign in"');
  toTabs = await waitFor('index:redirect:tabs after tapping Sign in', () => trail().includes('index:redirect:tabs'), 60_000, 2000);
}
if (!toTabs) {
  console.log(trail());
  process.exit(1);
}

const signInTrail = trail();
if (!signInTrail.includes('gate:connected')) fail('the app reached the tabs but the connection gate never reported connected (no authenticated backend round trip).');
note('signed in — tabs reached with gate:connected');

// ── Phase 4 · restart → the session must persist ──────────────────────────────────────────────
note('phase 4: force-stop, relaunch, and require a restored session');
adb(['shell', 'am', 'force-stop', PKG]);
await sleep(1000);
clearLogcat();
adb(['shell', 'am', 'start', '-n', ACTIVITY]);

const restored = await waitFor('auth:session-restored after restart', () => trail().includes('auth:session-restored'), 60_000, 2000);
if (!restored) {
  console.log(trail());
  process.exit(1);
}
const restartTrail = await waitFor(
  'restart trail: gate:connected + index:redirect:tabs',
  () => {
    const t = trail();
    return t.includes('gate:connected') && t.includes('index:redirect:tabs') ? t : null;
  },
  60_000,
  2000,
);

// ── Phase 5 · no swallowed failures ───────────────────────────────────────────────────────────
const lines = logcat();
if (BAD_JS.test(lines)) fail('a swallowed JS error appeared during the flow ([hallyu:crash] / navigate-before-mount / nav-failed).');
if (FATAL.test(lines)) fail('FATAL EXCEPTION or ANR during the auth flow.');

const ui = dumpNodes();
const tabBar = ['Explore', 'Activity', 'You'].filter((label) => byText(ui, label));
if (tabBar.length === 0) fail('the app never rendered the tab bar — it did not navigate into the signed-in product.');

console.log('');
console.log('=== AUTH FLOW BOOT TRAIL (sign-in) ===');
console.log(signInTrail || '(none)');
console.log('=== AUTH FLOW BOOT TRAIL (restart) ===');
console.log(restartTrail ?? trail() ?? '(none)');
console.log('======================================');

if (process.exitCode === 1) {
  console.log('::error::[auth-flow] AUTH FLOW GATE FAILED');
  process.exit(1);
}

note(`PASSED — signed in as the run's test member, gate:connected, session restored after restart, tabs rendered (${tabBar.join(', ')}).`);
process.exit(0);
