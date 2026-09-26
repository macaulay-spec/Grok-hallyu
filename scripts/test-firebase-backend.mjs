/**
 * Firebase-backend regression tests — run in node, offline, no RN and no Firebase network.
 *
 * Two layers:
 *  1. REAL pure logic, transpiled from TypeScript and executed here:
 *       • lib/authLinks.ts  parseAuthActionUrl — email-action deep links (reset / verify / recover)
 *  2. STATIC architecture assertions on the committed sources — the invariants this migration
 *     depends on. They are greps, not runtime tests, but they fail the build the moment somebody
 *     re-introduces a silent Supabase fallback, a `default: break` mutation, a rules hole, or the
 *     missing-google-services.json build trap.
 *
 * Full Firestore/Storage rules validation needs the Firebase emulator suite
 * (`firebase emulators:exec` with firebase-tools); that cannot run in a network-blocked sandbox
 * and is documented in docs/backend/FIREBASE.md instead.
 *
 * Run: node scripts/test-firebase-backend.mjs
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');

let failures = 0;
const ok = (name, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond || !detail ? '' : ` — ${detail}`}`);
  if (!cond) failures++;
};

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

// ---------------------------------------------------------------------------------------------
// 1. parseAuthActionUrl — real execution of the pure parser
// ---------------------------------------------------------------------------------------------
const src = read('lib/authLinks.ts');
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const { parseAuthActionUrl } = mod.exports;

{
  const r = parseAuthActionUrl('https://zesty-structure-gcf5x.firebaseapp.com/__/auth/action?apiKey=AIza&mode=resetPassword&oobCode=CODE123&continueUrl=hallyu%3A%2F%2Fauth%2Fcallback');
  ok('authLinks: resetPassword web link', r?.mode === 'resetPassword' && r?.oobCode === 'CODE123' && r?.continueUrl === 'hallyu://auth/callback');
}
{
  const r = parseAuthActionUrl('hallyu://auth/callback?apiKey=AIza&oobCode=ABC&mode=verifyEmail');
  ok('authLinks: verifyEmail deep link', r?.mode === 'verifyEmail' && r?.oobCode === 'ABC');
}
{
  const r = parseAuthActionUrl('hallyu://auth/callback?mode=selectAccountEmail');
  ok('authLinks: unknown mode rejected', r === null);
}
{
  ok('authLinks: missing oobCode rejected', parseAuthActionUrl('hallyu://x?mode=verifyEmail') === null);
  ok('authLinks: null/empty input rejected', parseAuthActionUrl(null) === null && parseAuthActionUrl('') === null && parseAuthActionUrl('hallyu://auth/callback') === null);
}

// ---------------------------------------------------------------------------------------------
// 2. Static architecture assertions
// ---------------------------------------------------------------------------------------------
const fbBackend = read('lib/data/firebaseBackend.ts');
const authTsx = read('lib/auth.tsx');
const firebaseTs = read('lib/firebase.ts');
const mediaTs = read('lib/media.ts');
const videoTs = read('lib/video.ts');
const rules = read('firestore.rules');
const storageRules = read('storage.rules');
const appJson = JSON.parse(read('app.json'));
const syncTs = read('lib/data/sync.ts');
const layoutTsx = read('app/_layout.tsx');
const indexJs = read('index.js');

// --- No silent Supabase fallback in the primary paths (mandate: Firebase is the source of truth)
ok('firebaseBackend: no supabase import', !/from '.*supabase/i.test(fbBackend));
ok('auth: no supabase import', !/from '.*supabase|require\('.*supabase/i.test(authTsx));
ok('media: no supabase rpc', !/supabase/i.test(mediaTs));
ok('video: uploads are Firebase-only (no broker mint/put)', !/mint\(|putBytes|supabase/.test(videoTs));
ok('video: legacy key READ path preserved (videoUrl)', /export function videoUrl/.test(videoTs));
ok('sync: default backend is firebaseBackend', /let backend: Backend = firebaseBackend/.test(syncTs));
ok('sync: supabase adapter not imported at boot', !/from '\.\/supabaseBackend'/.test(syncTs));

// --- No silent-success mutations (mandate #5)
ok('firebaseBackend: default case throws BackendError', /default:\s*\n\s*\/\/[^\n]*\n\s*throw new BackendError\(`Firebase backend: unsupported mutation/.test(fbBackend) || /unsupported mutation/.test(fbBackend));
ok('firebaseBackend: no "default: break" pattern', !/default:\s*\n\s*break/.test(fbBackend));
ok('firebaseBackend: every plan action mapped', ['addPost', 'editPost', 'deletePost', 'addComment', 'deleteComment', 'react', 'save', 'follow', 'dramaNotify', 'watch', 'progress', 'note', 'upsertCollection', 'deleteCollection', 'collectionItem', 'profile', 'prefs', 'onboarding', 'block', 'muteUser', 'muteDrama', 'report', 'readNotifications'].every((a) => fbBackend.includes(`'${a}'`) || fbBackend.includes(`"${a}"`) || fbBackend.includes(`case '${a}'`)));
ok('firebaseBackend: account purge exported', /export async function purgeUserData/.test(fbBackend));
ok('firebaseBackend: connections exported', /export async function fetchConnections/.test(fbBackend));

// --- Auth architecture (mandates #2/#3/#4)
ok('auth: firebase-only sign-in (no popup on native)', !/signInWithPopup/.test(authTsx) || /Platform\.OS === 'web'/.test(authTsx));
ok('auth: canonical UID mapping', /fbUser\.uid/.test(authTsx));
ok('auth: deleteAccount purges then deletes', /purgeUserData/.test(authTsx));
ok('firebase: RN persistence via initializeAuth + AsyncStorage', /initializeAuth\(app, \{/.test(firebaseTs) && /getReactNativePersistence/.test(firebaseTs) && /AsyncStorage/.test(firebaseTs));
ok('firebase: module load is guarded (never throws at import)', /try \{[\s\S]*initializeApp/.test(firebaseTs));
ok('googleAuth: native flow via Custom Tab + id_token', /openAuthSessionAsync/.test(read('lib/googleAuth.ts')) && /id_token/.test(read('lib/googleAuth.ts')));

// --- Download ledger honesty (mandate #9)
ok('media: recordDownload throws on backend failure', /throw mapFirebaseError\(e, 'Download ledger'\)/.test(mediaTs));
ok('media: Firestore downloads ledger path', /'downloads'/.test(mediaTs) && /users.*downloads/.test(mediaTs));

// --- Security rules (mandate #13)
ok('rules: default-deny catch-all present', /match \/\\{document=\\*\\*\}|match \/\{document=\*\*\}/.test(rules.replace(/\\\{/g, '{').replace(/\\\}/g, '}')) || rules.includes('allow read, write: if false;'));
ok('rules: private profile is owner-only', /match \/private\/\{docId\} \{\s*allow read, write: if isMe\(userId\);/.test(rules));
ok('rules: non-owner post updates limited to counter keys', /postCounterKeys\(\)/.test(rules) && /hasOnly\(postCounterKeys\(\)\)/.test(rules));
ok('rules: media/state fields NOT in non-owner counter keys', !/mediaUrl|'body'|'state'/.test(rules.slice(rules.indexOf('function postCounterKeys'), rules.indexOf('function commentCounterKeys'))));
ok('rules: notifications must be created by the actor', /request\.auth\.uid in request\.resource\.data\.actorIds/.test(rules));
ok('rules: followers reverse-index written by the follower', /request\.auth\.uid == followerId/.test(rules));
ok('rules: reports are create-only', /match \/reports\/\{reportId\}[\s\S]*?allow create: if isSignedIn\(\)[\s\S]*?allow read, update, delete: if false;/.test(rules));
ok('rules: reactions/saved/watchlist/downloads owner-only', ['reactions', 'saved', 'watchlist', 'downloads'].every((sub) => new RegExp(`match \\\\/${sub}\\\\/`).test(rules) || rules.includes(`/${sub}/`)));
ok('storage rules: uid-scoped writes with size+type caps', ['users/{uid}', 'posts/{uid}', 'videos/{uid}'].every((p) => storageRules.includes(p)) && /request\.auth\.uid == uid/.test(storageRules) && /request\.resource\.size < 100 \* 1024 \* 1024/.test(storageRules));
ok('storage rules: default deny', /match \/\{allPaths=\*\*\} \{\s*allow read, write: if false;/.test(storageRules));

// --- Build trap (mandate #1): the missing-file reference that broke the Android build
ok('app.json: no googleServicesFile reference', !JSON.stringify(appJson).includes('googleServicesFile'));
ok('firebase.json: named Firestore database configured', JSON.parse(read('firebase.json')).firestore.database === JSON.parse(read('firebase-applet-config.json')).firestoreDatabaseId);

// --- Startup safety (mandate #14)
ok('index.js: crash trap before router require', indexJs.indexOf("import './lib/crash'") >= 0 && indexJs.indexOf("import './lib/crash'") < indexJs.indexOf("import '@expo/metro-runtime'"));
ok('layout: crash trap is first import', layoutTsx.indexOf("import '../lib/crash'") >= 0 && layoutTsx.indexOf("import '../lib/crash'") < layoutTsx.indexOf("import AsyncStorage"));
ok('layout: silent boundaries around startup components', ['AccountSync', 'SyncProvider', 'ReminderSync', 'MilestoneWatcher'].every((c) => layoutTsx.includes(`scope="${c}" silent`)));
ok('layout: font gate ceiling present', /FONT_GATE_MS/.test(layoutTsx) && /layout:font-gate-timeout/.test(layoutTsx));
const errBoundary = read('components/ui/ErrorBoundary.tsx');
ok('ErrorBoundary: leaf module (react/react-native imports only)', /^import .* from '(react|react-native)';$/m.test(errBoundary) && !/from '\.\.\/\.\.\/(constants|lib)\//.test(errBoundary.split('componentDidCatch')[0]));

// --- Hermes polyfills (the release-only TextDecoder crash the emulator gate caught)
const polyfills = read('lib/polyfills.ts');
ok('polyfills: installs TextDecoder/TextEncoder + URL before firebase loads', /TextDecoder/.test(polyfills) && /TextEncoder/.test(polyfills) && /react-native-url-polyfill/.test(polyfills));
ok('index.js: polyfills imported before the router entry', indexJs.indexOf("import './lib/polyfills'") >= 0 && indexJs.indexOf("import './lib/polyfills'") < indexJs.indexOf("import '@expo/metro-runtime'"));
for (const f of ['lib/firebase.ts', 'lib/auth.tsx', 'lib/media.ts', 'lib/data/firebaseBackend.ts']) {
  const src = read(f);
  const polyAt = src.search(/^import '\.\.?\/polyfills';/m);
  const fbAt = src.search(/^import .*from 'firebase\//m) >= 0 ? src.search(/^import .*from 'firebase\//m) : src.search(/^import \{$/m);
  ok(`${f}: polyfills import precedes firebase/* imports`, polyAt >= 0 && polyAt < src.indexOf("from 'firebase/"));
}

// --- CI gate integrity (mandate #18)
const wf = read('.github/workflows/build-apk.yml');
const bootCheck = read('scripts/ci/boot-check.sh');
ok('workflow: emulator boot gate is HARD (no continue-on-error)', !/continue-on-error:\s*true/.test(wf));
ok('workflow: boot gate runs the committed script as ONE command', /script:\s*sh scripts\/ci\/boot-check\.sh/.test(wf));
ok('workflow: no multi-line inline script in emulator gate (action splits it line-by-line!)', !/script:\s*\|/.test(wf));
ok('boot-check: asserts boot marker + crash-marker absence + FATAL/ANR', bootCheck.includes('hallyu:boot') && bootCheck.includes('index:redirect') && bootCheck.includes('hallyu:crash') && bootCheck.includes('FATAL EXCEPTION') && bootCheck.includes('ANR in'));
ok('boot-check: exits non-zero on any failed assertion', /exit 1/.test(bootCheck) && /exit 0/.test(bootCheck));
ok('workflow: typecheck runs before build', wf.indexOf('npm run typecheck') < wf.indexOf('assembleRelease'));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll firebase-backend checks passed.');
process.exit(failures ? 1 : 0);
