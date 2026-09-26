/**
 * Runtime polyfills that MUST be evaluated before any firebase/* module loads.
 *
 * Why this file exists (proven by the CI release-APK emulator gate, run 36236967205):
 * Android's Hermes engine ships NO global TextDecoder/TextEncoder, and @firebase/firestore
 * constructs `new TextDecoder('utf-8')` while initializing its Platform singleton — the module
 * throws `ReferenceError: Property 'TextDecoder' doesn't exist` at import time, the whole route
 * graph dies, and the app never mounts (release-only: Chrome/dev has TextDecoder natively).
 * react-native-url-polyfill (URL/URLSearchParams, needed by firebase auth action links) lives
 * here too so a single idempotent import covers the boot graph.
 *
 * Import order rules:
 *  - index.js imports this right after the crash trap, before the router entry — that covers
 *    every lazily-evaluated route module;
 *  - lib/firebase.ts, lib/auth.tsx, lib/data/firebaseBackend.ts and lib/media.ts ALSO import it
 *    as their FIRST import, because each of them pulls 'firebase/*' modules directly and Metro
 *    evaluates imports in declaration order (defence in depth for any other entry point).
 *
 * Side-effect only, idempotent, safe on web (guards skip when the globals already exist).
 */
// Implementation choice — verified by byte-level tests, do NOT swap casually:
//  - `text-encoding-polyfill` crashes on Hermes with "Decoder not present. Did you forget to
//    include encoding-indexes.js first?" (it only loads its index tables under Node; CI run
//    36237673311 proved this fails the release boot);
//  - `fastestsmallesttextencoderdecoder` returns corrupted output when constructed the way
//    Firestore does it — `new TextDecoder('utf-8')` (label-ctor bug, byte-verified locally);
//  - `@zxing/text-encoding` is a complete WHATWG implementation: label ctor, byteOffset views
//    (protobuf decoding) and multibyte roundtrips all verified before adoption.
import 'react-native-url-polyfill/auto';
import { TextDecoder as PolyfillTextDecoder, TextEncoder as PolyfillTextEncoder } from '@zxing/text-encoding';

const g = globalThis as {
  TextDecoder?: unknown;
  TextEncoder?: unknown;
};

if (typeof g.TextDecoder === 'undefined') {
  g.TextDecoder = PolyfillTextDecoder;
}
if (typeof g.TextEncoder === 'undefined') {
  g.TextEncoder = PolyfillTextEncoder;
}
