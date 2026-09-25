import { useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Text } from '../components/ui/Text';
import { colors, motion } from '../constants/theme';
import { useAuth } from '../lib/auth';
import { useStore } from '../lib/store';

/**
 * Splash → route gate.
 * Splash is the mark on canvas, no text, ≤ 1.2s when cached. It ends when auth + store are ready.
 * If readiness takes longer than 2.5s, auto-bailout to welcome so the app never freezes.
 */
const AUTO_BAILOUT_MS = 2500;

export default function Index() {
  const auth = useAuth();
  const router = useRouter();
  const { state } = useStore();
  const ready = auth.status !== 'loading' && state.hydrated;
  const fade = useRef(new Animated.Value(0)).current;
  const hasNavigated = useRef(false);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    Animated.timing(fade, { toValue: 1, duration: motion.long, useNativeDriver: true }).start();
  }, [fade]);

  // Navigate reliably once ready
  useEffect(() => {
    if (!ready || hasNavigated.current) return;
    hasNavigated.current = true;

    if (auth.status === 'signedOut') {
      router.replace('/(auth)/welcome');
    } else if (auth.status === 'signedIn' && !state.onboarding.done) {
      router.replace('/(onboarding)/genres');
    } else {
      router.replace('/(tabs)');
    }
  }, [ready, auth.status, state.onboarding.done, router]);

  // Auto-bailout failsafe: if readiness never arrives within 2.5s, force navigation to welcome
  useEffect(() => {
    if (ready || hasNavigated.current) return;
    const t = setTimeout(() => {
      if (!hasNavigated.current) {
        hasNavigated.current = true;
        void auth.signOut().catch(() => {});
        router.replace('/(auth)/welcome');
      }
    }, AUTO_BAILOUT_MS);
    return () => clearTimeout(t);
  }, [ready, auth, router]);

  const bailOut = () => {
    if (hasNavigated.current) return;
    hasNavigated.current = true;
    void auth.signOut().catch(() => {});
    router.replace('/(auth)/welcome');
  };

  return (
    <View style={styles.root} accessibilityLabel="Hallyu is starting">
      <Animated.View style={{ opacity: fade, alignItems: 'center' }}>
        <Image source={require('../assets/branding/splash-mark.png')} style={{ width: 160, height: 160 }} contentFit="contain" />
      </Animated.View>
      <Pressable onPress={bailOut} hitSlop={16} style={styles.stuck} accessibilityRole="button" accessibilityLabel="Continue">
        <Text variant="caption" tone="secondary">
          Tap if not redirected automatically
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
