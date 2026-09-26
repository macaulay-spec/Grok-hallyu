import { useRouter, useRootNavigationState } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Text } from '../components/ui/Text';
import { colors, motion } from '../constants/theme';
import { reportError } from '../lib/analytics';
import { lastCrash } from '../lib/crash';
import { bootTrail, markBoot } from '../lib/boot';
import { useAuth } from '../lib/auth';
import { useStore } from '../lib/store';

/**
 * Splash → route gate.
 * Splash is the mark on canvas, no text, ≤ 1.2s when cached. It ends when auth + store are ready.
 * If readiness never arrives, the failsafe below guarantees a way forward (never a dead splash):
 *  - after 6s the tap switches from "continue" to "diagnostics" — the boot trail and the last
 *    crash are shown on screen, so a stalled release build reports exactly where it stopped;
 *  - the auto-bailout then forces the signed-out path rather than freezing forever.
 *
 * Navigation readiness: every router call is gated on useRootNavigationState() AND wrapped in
 * safeReplace — expo-router's assertIsReady throws "Attempted to navigate before mounting the
 * Root Layout component" when a mount-time effect navigates before the container flips ready
 * (observed in release when the whole tree mounts in one Suspense-resumed commit). On failure
 * we clear hasNavigated so the next state change retries instead of stranding the splash.
 */
const AUTO_BAILOUT_MS = 6000;

export default function Index() {
  const auth = useAuth();
  const router = useRouter();
  const rootNav = useRootNavigationState();
  const { state } = useStore();
  const ready = auth.status !== 'loading' && state.hydrated && !!rootNav;
  const fade = useRef(new Animated.Value(0)).current;
  const hasNavigated = useRef(false);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    markBoot('index:mounted');
    // NOTE: no SplashScreen.hideAsync here on purpose. The root layout owns the hide (fires on
    // fonts-settled OR the 1.2s gate timeout, guaranteed). This screen now mounts while the
    // font-gate overlay is still up, so hiding here would cut the branded splash short. The
    // bailout paths below call hideAsync only as a last-resort safety net, after navigating.
    Animated.timing(fade, { toValue: 1, duration: motion.long, useNativeDriver: true }).start();
  }, [fade]);

  /** Navigate only when the router is provably ready; on failure re-arm so the next change retries. */
  const safeReplace = (dest: string): boolean => {
    try {
      router.replace(dest as never);
      return true;
    } catch (e) {
      hasNavigated.current = false;
      markBoot(`index:nav-failed ${dest}`);
      reportError('index.navigate', e);
      return false;
    }
  };

  // Navigate reliably once ready
  useEffect(() => {
    if (!ready || hasNavigated.current) return;
    hasNavigated.current = true;

    const dest = auth.status === 'signedOut' ? '/(auth)/welcome' : auth.status === 'signedIn' && !state.onboarding.done ? '/(onboarding)/genres' : '/(tabs)';
    markBoot(`index:redirect${auth.status === 'signedOut' || (auth.status === 'signedIn' && !state.onboarding.done) ? '' : ':tabs'} ${dest}`);
    safeReplace(dest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, auth.status, state.onboarding.done, router, rootNav]);

  // Auto-bailout failsafe: if readiness never arrives, force navigation to welcome
  useEffect(() => {
    if (ready || hasNavigated.current) return;
    const t = setTimeout(() => {
      if (!hasNavigated.current) {
        hasNavigated.current = true;
        markBoot('index:auto-bailout');
        void auth.signOut().catch(() => {});
        if (safeReplace('/(auth)/welcome')) SplashScreen.hideAsync().catch(() => {});
      }
    }, AUTO_BAILOUT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, auth, router, rootNav]);

  // The tap stays a simple "continue" for normal slow starts; once stuck, it opens diagnostics.
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setStuck(true), AUTO_BAILOUT_MS);
    return () => clearTimeout(t);
  }, [ready]);

  const bailOut = () => {
    if (hasNavigated.current) return;
    hasNavigated.current = true;
    void auth.signOut().catch(() => {});
    if (safeReplace('/(auth)/welcome')) SplashScreen.hideAsync().catch(() => {});
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
  stuck: { position: 'absolute', bottom: 84 },
  foot: { position: 'absolute', bottom: 48 },
});
