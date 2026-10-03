import { useRouter, useRootNavigationState } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Text } from '../components/ui/Text';
import { colors, motion } from '../constants/theme';
import { lastCrash } from '../lib/crash';
import { bootTrail, markBoot } from '../lib/boot';
import { useAuth } from '../lib/auth';
import { isBackendConfigured, probeBackend, type ConnectionStatus } from '../lib/api/client';
import { useNetwork } from '../lib/hooks';
import { GUEST_ID, useStore } from '../lib/store';

/**
 * Splash → route gate.
 * Splash is the mark on canvas, no text, ≤ 1.2s when cached. It ends when auth + store + the
 * backend connection gate are ready. The gate is the honest one (connection contract §7): when the
 * build has a backend, cold start proves the Rork-hosted path with a real RPC round trip
 * (get_bootstrap for a member, the anonymous probe otherwise) and says the result on screen —
 * it never claims "connected" while serving device data. If readiness never arrives, the failsafe
 * below guarantees a way forward (never a dead splash):
 *  - after 6s the tap switches from "continue" to "diagnostics" — the boot trail and the last
 *    crash are shown on screen, so a stalled release build reports exactly where it stopped;
 *  - the auto-bailout then forces the signed-out path rather than freezing forever.
 */
const AUTO_BAILOUT_MS = 6000;
/** The gate probe must settle inside the bailout window so it can never fight the failsafe. */
const GATE_PROBE_MS = 5000;

/** The one honest line the splash shows about the backend connection. */
function gateLine(conn: ConnectionStatus | null): string {
  if (!isBackendConfigured()) return 'Local mode — no backend configured';
  switch (conn) {
    case null:
    case 'connecting':
      return 'Connecting…';
    case 'connected':
      return '';
    case 'offline':
      return 'You’re offline — showing cached content';
    case 'unavailable':
      return 'Backend unreachable — continuing offline';
    case 'misconfigured':
      return 'Connection misconfigured — continuing in local mode';
  }
}

export default function Index() {
  const auth = useAuth();
  const router = useRouter();
  const { state } = useStore();
  // expo-router requires the root navigator to be registered before ANY router.replace/push —
  // navigating earlier throws "Attempted to navigate before mounting the Root Layout component".
  const navReady = useRootNavigationState()?.key != null;
  const online = useNetwork();
  const accountAligned = auth.status === 'signedIn' ? state.profile.id === auth.user?.id : auth.status === 'guest' ? state.profile.id === GUEST_ID : true;
  const coreReady = auth.status !== 'loading' && state.hydrated && accountAligned;
  // The connection gate: with a backend configured, cold start waits for the bounded probe —
  // never longer than the bailout window — and publishes the true state via BackendHealth.
  const [conn, setConn] = useState<ConnectionStatus | null>(isBackendConfigured() ? null : 'misconfigured');
  const ready = coreReady && conn !== null;
  const fade = useRef(new Animated.Value(0)).current;
  const hasNavigated = useRef(false);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (!coreReady || !isBackendConfigured()) return;
    let cancelled = false;
    markBoot('gate:probe');
    void probeBackend(GATE_PROBE_MS, online).then((s) => {
      if (cancelled) return;
      setConn(s);
      markBoot(`gate:${s}`);
    });
    return () => {
      cancelled = true;
    };
  }, [coreReady, online]);

  useEffect(() => {
    markBoot('index:mounted');
    SplashScreen.hideAsync().catch(() => {});
    Animated.timing(fade, { toValue: 1, duration: motion.long, useNativeDriver: true }).start();
  }, [fade]);

  // Navigate reliably once ready (and only once the root navigator is actually registered)
  useEffect(() => {
    if (!ready || !navReady || hasNavigated.current) return;
    hasNavigated.current = true;

    const dest = auth.status === 'signedOut' ? '/(auth)/welcome' : auth.status === 'signedIn' && !state.onboarding.done ? '/(onboarding)/fandoms' : '/(tabs)';
    markBoot(`index:redirect${auth.status === 'signedOut' || (auth.status === 'signedIn' && !state.onboarding.done) ? '' : ':tabs'} ${dest}`);
    router.replace(dest as never);
  }, [ready, navReady, auth.status, state.onboarding.done, router]);

  // Auto-bailout failsafe: if readiness never arrives, force navigation to welcome
  useEffect(() => {
    if (ready || !navReady || hasNavigated.current) return;
    const t = setTimeout(() => {
      if (!hasNavigated.current) {
        hasNavigated.current = true;
        markBoot('index:auto-bailout');
        void auth.signOut().catch(() => {});
        router.replace('/(auth)/welcome');
      }
    }, AUTO_BAILOUT_MS);
    return () => clearTimeout(t);
  }, [ready, navReady, auth, router]);

  // The tap stays a simple "continue" for normal slow starts; once stuck, it opens diagnostics.
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setStuck(true), AUTO_BAILOUT_MS);
    return () => clearTimeout(t);
  }, [ready]);

  const bailOut = () => {
    if (hasNavigated.current || !navReady) return;
    hasNavigated.current = true;
    void auth.signOut().catch(() => {});
    router.replace('/(auth)/welcome');
  };

  // Diagnostics: show the boot trail and the last uncaught error on screen — this is how a
  // release-only stall becomes reportable without adb or a dev build.
  const showDiagnostics = () => {
    void (async () => {
      const [trail, crash] = await Promise.all([bootTrail(), lastCrash()]);
      const detail = [`BOOT TRAIL:\n${trail}`, crash ? `LAST ERROR:\n${crash.name}: ${crash.message}\n${(crash.stack ?? '').slice(0, 400)}` : 'LAST ERROR: none recorded'].join('\n\n');
      Alert.alert('Startup diagnostics', detail.slice(0, 1800), [
        { text: 'Continue anyway', onPress: bailOut },
        { text: 'Close', style: 'cancel' },
      ]);
    })();
  };

  return (
    <View style={styles.root} accessibilityLabel="Hallyu is starting">
      <Animated.View style={{ opacity: fade, alignItems: 'center' }}>
        <Image source={require('../assets/branding/splash-mark.png')} style={{ width: 160, height: 160 }} contentFit="contain" />
      </Animated.View>
      {gateLine(conn) ? (
        <Text variant="caption" tone="secondary" style={styles.gate}>
          {gateLine(conn)}
        </Text>
      ) : null}
      <Pressable
        onPress={() => (stuck ? showDiagnostics() : bailOut())}
        hitSlop={16}
        style={styles.stuck}
        accessibilityRole="button"
        accessibilityLabel={stuck ? 'Show startup diagnostics' : 'Continue'}
      >
        <Text variant="caption" tone="secondary">
          {stuck ? 'Taking longer than usual — tap for diagnostics' : 'Tap if not redirected automatically'}
        </Text>
      </Pressable>
      <Text variant="caption" tone="tertiary" style={styles.foot}>
        Your dramas. Your people. Your world.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  gate: { position: 'absolute', bottom: 120, paddingHorizontal: 32, textAlign: 'center' },
  stuck: { position: 'absolute', bottom: 84 },
  foot: { position: 'absolute', bottom: 48 },
});
