import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';
import { Text } from '../../components/ui/Text';
import { LivingWall } from '../../components/onboarding/LivingWall';
import { Wordmark } from '../../components/ui/TopBar';
import { useToast } from '../../components/ui/Toast';
import { colors, motion, space } from '../../constants/theme';
import { useAuth } from '../../lib/auth';
import { useLayout, useLoad } from '../../lib/hooks';
import { catalog } from '../../lib/catalog';
import { adoptDramas } from '../../lib/catalogSync';
import { allDramas, useSlice } from '../../lib/store';

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
  const [busy, setBusy] = useState<'google' | null>(null);
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
      if (err.code !== 'cancelled') toast.show({ message: err.message, tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  const importedDramas = useSlice((s) => s.importedDramas);
  const cols = width >= 840 ? 6 : width >= 600 ? 5 : 4;
  const posterW = Math.max(88, Math.floor((width - space.margin * 2 - space.x2 * (cols - 1)) / cols));
  // The wall is what's trending this week (live), so the first screen is the real K-drama world;
  // saved art fills in until it arrives or when offline.
  const live = useLoad(
    async (signal) => {
      const [t, p] = await Promise.all([catalog.trending(signal), catalog.popular(1, signal).catch(() => [] as typeof importedDramas)]);
      return adoptDramas([...t, ...p]);
    },
    [],
    catalog.available,
  );
  // The wall draws from what's trending (plus popular, for variety); saved art fills in until it arrives or offline.
  const mosaic = useMemo(() => {
    const trending = (live.data ?? []).filter((d) => d.posterUrl);
    const all = allDramas({ importedDramas });
    const withArt = all.filter((d) => d.posterUrl || d.posterLocal);
    const seen = new Set(trending.map((d) => d.id));
    return [...trending, ...withArt.filter((d) => !seen.has(d.id))];
  }, [importedDramas, live.data]);
  const tiles = cols * 2;

  return (
    <View style={styles.root}>
      <LivingWall key={tiles} dramas={mosaic} tiles={tiles} tileWidth={posterW} height="56%" />

      <Animated.View style={[styles.content, { paddingBottom: insets.bottom + space.x6, opacity: fade, transform: [{ translateY: rise }] }]}>
        <View style={{ alignSelf: 'flex-start' }}>
          <Wordmark size={40} />
        </View>
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
  content: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: space.x6, maxWidth: 560, width: '100%', alignSelf: 'center' },
  guestRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: space.x2, marginTop: space.x3 },
  tmdb: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: space.x2 },
});
