import { Redirect, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Text } from '../components/ui/Text';
import { colors, motion } from '../constants/theme';
import { useAuth } from '../lib/auth';
import { useStore } from '../lib/store';

/**
 * Splash → route gate.
 * Splash is the mark on canvas, no text, ≤ 1.2s when cached. It ends when auth + store are ready.
 * If readiness never arrives (hung auth call, wedged hydration) the tap-to-continue escape hatch
 * below guarantees a way forward — the splash is never a dead end.
 */
const STUCK_MS = 5000;

export default function Index() {
  const auth = useAuth();
  const router = useRouter();
  const { state } = useStore();
  const ready = auth.status !== 'loading' && state.hydrated;
  const fade = useRef(new Animated.Value(0)).current;
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    Animated.timing(fade, { toValue: 1, duration: motion.long, useNativeDriver: true }).start();
  }, [fade]);

  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setStuck(true), STUCK_MS);
    return () => clearTimeout(t);
  }, [ready]);

  // Escape hatch: force the signed-out path and navigate. Safe — the auth subscription still
  // promotes a session that lands later, and welcome offers sign-in again.
  const bailOut = () => {
    void auth.signOut().catch(() => {});
    router.replace('/(auth)/welcome');
  };

  if (ready) {
    if (auth.status === 'signedOut') return <Redirect href="/(auth)/welcome" />;
    if (auth.status === 'signedIn' && !state.onboarding.done) return <Redirect href="/(onboarding)/genres" />;
    return <Redirect href="/(tabs)" />;
  }

  return (
    <View style={styles.root} accessibilityLabel="Hallyu is starting">
      <Animated.View style={{ opacity: fade, alignItems: 'center' }}>
        <Image source={require('../assets/branding/splash-mark.png')} style={{ width: 160, height: 160 }} contentFit="contain" />
      </Animated.View>
      {stuck && (
        <Pressable onPress={bailOut} hitSlop={12} style={styles.stuck} accessibilityRole="button" accessibilityLabel="Taking longer than usual. Tap to continue.">
          <Text variant="caption" tone="tertiary">
            Taking longer than usual — tap to continue
          </Text>
        </Pressable>
      )}
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
