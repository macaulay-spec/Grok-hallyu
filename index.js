// Boot entry — mirrors expo-router/entry but guarantees a VISIBLE failure in release builds.
// If anything throws while the router bundle evaluates or the root registers, a plain error
// screen renders instead of a silent, permanent splash (the "frozen at the icon" bug: the
// error was swallowed, React never mounted, and nothing ever appeared).
// This file must only import and register the root — no app components here.
//
// lib/textEncoding comes FIRST of all: Hermes has no TextEncoder/TextDecoder, and bundled deps
// (fast-png/iobuffer in the cold-boot chain, Supabase's realtime/auth clients) touch them at
// module-evaluation time. Without the globals installed first, requiring app/_layout.tsx threw
// "Property 'TextDecoder' doesn't exist", which then surfaced as "Cannot read property
// 'ErrorBoundary' of undefined". See lib/textEncoding.ts.
//
// lib/crash comes next — before @expo/metro-runtime and before the router is required — so the
// global ErrorUtils trap is installed before ANY app/route module evaluates. expo-router loads
// route modules lazily, AFTER this entry returns, so without this a module-init throw in the very
// first route load could escape the trap and take the process down silently. app/_layout.tsx keeps
// its own `import '../lib/crash'`; installGlobalErrorTrap is idempotent (first call wins).
import './lib/textEncoding';
import './lib/crash';
import '@expo/metro-runtime';
import { markBoot, resetBootTrail } from './lib/boot';

resetBootTrail();
markBoot('entry:bundle-eval-start');

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { App } = require('expo-router/build/qualified-entry');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { renderRootComponent } = require('expo-router/build/renderRootComponent');
  markBoot('entry:router-loaded');
  renderRootComponent(App);
  markBoot('entry:root-registered');
} catch (e) {
  // Bundle-evaluation failure: show the actual error on screen instead of freezing.
  const { registerRootComponent } = require('expo');
  const { Text, View } = require('react-native');
  const message = e && e.message ? `${e.name || 'Error'}: ${e.message}` : String(e);
  markBoot(`entry:FAILED ${message.slice(0, 100)}`);

  function BootError() {
    return (
      <View style={{ flex: 1, backgroundColor: '#0A0A0A', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: '#F4F4F5', fontSize: 15, lineHeight: 22, textAlign: 'center' }}>
          {'Hallyu failed to start.\n\n' + message}
        </Text>
      </View>
    );
  }
  registerRootComponent(BootError);
}
