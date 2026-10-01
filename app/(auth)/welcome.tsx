import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppleButton } from '../../components/ui/AppleButton';
import { GoogleButton } from '../../components/ui/GoogleButton';
import { Text } from '../../components/ui/Text';
import { toast } from '../../components/ui/Toast';
import { LivingWall } from '../../components/onboarding/LivingWall';
import { Wordmark } from '../../components/ui/TopBar';
import { colors, motion, space } from '../../constants/theme';
import { AuthError, useAuth } from '../../lib/auth';
import { useLayout, useLoad } from '../../lib/hooks';
import { catalog } from '../../lib/catalog';
import { adoptDramas } from '../../lib/catalogSync';
import { allDramas, useSlice } from '../../lib/store';

/**
 * Welcome — the promise, then the doors.
 *
 * The mark leads, the promise is set in the display serif, and the choices arrive as a short stack:
 * Google, then Apple, then a quiet guest link. "Look around first" is a text link, not a third
 * button — it should never compete with the two ways in. The background is a quiet poster mosaic
 * under a scrim: cinematic, never a gradient.
 */
export default function Welcome() {
  const router = useRouter();
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useLayout();
  const [googleBusy, setGoogleBusy] = useState(false);
  const [appleBusy, setAppleBusy] = useState(false);
  const rise = useRef(new Animated.Value(24)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(rise, { toValue: 0, duration: motion.slow, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: motion.slow, useNativeDriver: true }),
    ]).start();
  }, [rise, fade]);

  /** One entry helper: spin the tapped door, land home on success, toast on real failures. */
  const enter = (door: () => Promise<void>, setBusy: (busy: boolean) => void) => async () => {
    setBusy(true);
    try {
      await door();
      router.replace('/');
    } catch (e) {
      const err = e as AuthError;
      if (err.code !== 'cancelled') toast.show({ message: err.message || 'Sign-in failed — try again.', tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  // The demo door: a pre-populated local member, so the feed, threads, watchlist and spoiler
  // machinery are all usable on first launch with no server behind them.
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
          <GoogleButton label="Continue with Google" size="lg" onPress={enter(auth.signInWithGoogle, setGoogleBusy)} loading={googleBusy} disabled={googleBusy} />
          <AppleButton label="Continue with Apple" size="lg" onPress={enter(auth.signInWithApple, setAppleBusy)} loading={appleBusy} disabled={appleBusy} />
        </View>

        <View style={styles.guestRow}>
          <Pressable
            onPress={() => {
              auth.continueAsGuest();
              router.replace('/(tabs)');
            }}
            accessibilityRole="button"
            accessibilityLabel="Browse as a guest"
            hitSlop={10}
            style={styles.guestLink}
          >
            <Text variant="bodySmall" tone="secondary">
              Look around first
            </Text>
            <Ionicons name="arrow-forward" size={14} color={colors.textSecondary} />
          </Pressable>
        </View>

        <Text variant="caption" tone="tertiary" align="center" style={{ marginTop: space.x4 }}>
          Free with Google or Apple — your watchlist, posts and reactions live in the cloud.
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
  guestRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: space.x2, marginTop: space.x4 },
  guestLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10 },
  tmdb: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: space.x2 },
});
