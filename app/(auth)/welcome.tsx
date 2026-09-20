import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';
import { Poster } from '../../components/ui/Poster';
import { Text } from '../../components/ui/Text';
import { Wordmark } from '../../components/ui/TopBar';
import { useToast } from '../../components/ui/Toast';
import { colors, motion, space } from '../../constants/theme';
import { SHOW_DEMO } from '../../constants/keys';
import { useAuth } from '../../lib/auth';
import { useLayout, useLoad } from '../../lib/hooks';
import { catalog } from '../../lib/catalog';
import { adoptDramas } from '../../lib/catalogSync';
import { allDramas, useSlice } from '../../lib/store';

/** Demo-data door: shown in demo builds (EXPO_PUBLIC_SHOW_DEMO=1); otherwise a long-press on the wordmark reveals it. */

/**
 * Welcome: the promise, two doors (Google / email), a quiet sign-in link and "Look around first".
 * Background is a quiet poster mosaic under a scrim — cinematic, not a gradient.
 */
export default function Welcome() {
  const router = useRouter();
  const auth = useAuth();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width } = useLayout();
  const [busy, setBusy] = useState<'google' | 'demo' | null>(null);
  const [demoVisible, setDemoVisible] = useState(SHOW_DEMO);
  const demo = () => {
    setBusy('demo');
    auth
      .signInDemo()
      .then(() => router.replace('/'))
      .finally(() => setBusy(null));
  };
  const rise = useRef(new Animated.Value(24)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(rise, { toValue: 0, duration: motion.slow, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: motion.slow, useNativeDriver: true }),
    ]).start();
  }, [rise, fade]);

  const google = async () => {
    setBusy('google');
    try {
      await auth.signInWithGoogle();
      router.replace('/');
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === 'network') toast.show({ message: err.message, actionLabel: 'Try the demo', onAction: () => auth.signInDemo().then(() => router.replace('/')) });
      else if (err.code !== 'cancelled') toast.show({ message: err.message, tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  const importedDramas = useSlice((s) => s.importedDramas);
  const posterW = Math.max(88, Math.floor((width - space.margin * 2 - space.x2 * 3) / 4));
  // The wall is what's trending this week (live), so the first screen is the real K-drama world;
  // saved art fills in until it arrives or when offline.
  const live = useLoad(async (signal) => adoptDramas(await catalog.trending(signal)), [], catalog.available);
  const mosaic = useMemo(() => {
    const trending = (live.data ?? []).filter((d) => d.posterUrl);
    if (trending.length >= 8) return trending.slice(0, 8);
    const all = allDramas({ importedDramas });
    const withArt = all.filter((d) => d.posterUrl || d.posterLocal);
    const rest = all.filter((d) => !d.posterUrl && !d.posterLocal);
    const seen = new Set(trending.map((d) => d.id));
    return [...trending, ...withArt.filter((d) => !seen.has(d.id)), ...rest].slice(0, 8);
  }, [importedDramas, live.data]);

  return (
    <View style={styles.root}>
      <View style={styles.mosaic} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {mosaic.map((d, i) => (
          <Poster key={d.id} drama={d} width={posterW} style={{ opacity: 0.55, marginTop: i % 2 ? 28 : 0 }} />
        ))}
        <View style={styles.scrim} />
      </View>

      <Animated.View style={[styles.content, { paddingBottom: insets.bottom + space.x6, opacity: fade, transform: [{ translateY: rise }] }]}>
        <Pressable
          onLongPress={() => {
            setDemoVisible(true);
            toast.show({ message: 'Demo data unlocked', icon: 'sparkles-outline' });
          }}
          delayLongPress={900}
          accessibilityLabel="Hallyu"
          style={{ alignSelf: 'flex-start' }}
        >
          <Wordmark size={40} />
        </Pressable>
        <Text variant="displayLarge" style={{ marginTop: space.x6 }}>
          Your dramas.{'\n'}Your people.{'\n'}Your world.
        </Text>
        <Text variant="bodyLarge" tone="secondary" style={{ marginTop: space.x3 }}>
          Where K-drama fans meet — episode by episode, spoiler-safe.
        </Text>

        <View style={{ gap: space.x3, marginTop: space.x8 }}>
          <Button label="Continue with Google" icon="logo-google" variant="secondary" size="lg" block onPress={google} loading={busy === 'google'} />
          <Button label="Continue with email" icon="mail-outline" size="lg" block onPress={() => router.push('/(auth)/sign-up')} />
          <Button label="I already have an account" variant="ghost" size="md" block onPress={() => router.push('/(auth)/sign-in')} />
        </View>

        <View style={styles.guestRow}>
          <Button
            label="Look around first"
            variant="ghost"
            size="sm"
            iconRight="arrow-forward"
            onPress={() => {
              auth.continueAsGuest();
              router.replace('/(tabs)');
            }}
          />
          {demoVisible ? <Button label="Preview with demo data" variant="ghost" size="sm" icon="sparkles-outline" onPress={demo} loading={busy === 'demo'} /> : null}
        </View>

        <Text variant="caption" tone="tertiary" align="center" style={{ marginTop: space.x4 }}>
          By continuing you agree to the Terms and acknowledge the Privacy Policy. Be kind, mark your spoilers.
        </Text>
        <View style={styles.tmdb}>
          <Ionicons name="film-outline" size={12} color={colors.textDisabled} />
          <Text variant="caption" tone="disabled">
            Catalog data by TMDB
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  mosaic: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '52%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.x2,
    paddingHorizontal: space.margin,
    paddingTop: 24,
    overflow: 'hidden',
  },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,10,10,0.55)', borderBottomWidth: 200, borderBottomColor: colors.canvas },
  content: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: space.x6, maxWidth: 560, width: '100%', alignSelf: 'center' },
  guestRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: space.x2, marginTop: space.x3 },
  tmdb: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: space.x2 },
});
