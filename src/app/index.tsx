import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';

const WORDMARK = 'HALLYU'.split('');

/**
 * Cinematic cold-open: the magenta wave mark draws in, the HALLYU letters
 * stagger-fade with a light sweep, tagline rises — all while auth resolves.
 */
export default function Index() {
  const { session, profile, loading } = useAuth();

  // Glow pulse behind the wordmark
  const glow = useSharedValue(0.35);
  useEffect(() => {
    glow.value = withRepeat(
      withSequence(
        withTiming(0.75, { duration: 1400 }),
        withTiming(0.35, { duration: 1400 })
      ),
      -1,
      true
    );
  }, [glow]);
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));

  // Light sweep across the wordmark
  const sweep = useSharedValue(-260);
  useEffect(() => {
    sweep.value = withDelay(650, withTiming(260, { duration: 900 }));
  }, [sweep]);
  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sweep.value }],
  }));

  useEffect(() => {
    if (loading) return;

    const timer = setTimeout(() => {
      if (!session) {
        router.replace('/(auth)/welcome');
      } else if (!profile || !profile.username) {
        // No profile yet, or onboarding not finished (username is set only in onboarding)
        router.replace('/(onboarding)/dramas');
      } else {
        router.replace('/(tabs)');
      }
    }, 2100); // let the intro breathe

    return () => clearTimeout(timer);
  }, [session, profile, loading]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0A0A0A', '#1A0510', '#0A0A0A']}
        style={StyleSheet.absoluteFill}
      />

      {/* Pulsing accent glow */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.glowWrap, glowStyle]}
      >
        <View style={[styles.glowRing, { width: 240, height: 240, opacity: 0.5 }]} />
        <View style={[styles.glowRing, { width: 340, height: 340, opacity: 0.28 }]} />
        <View style={[styles.glowRing, { width: 440, height: 440, opacity: 0.14 }]} />
      </Animated.View>

      <View style={styles.content}>
        {/* Wave mark */}
        <Animated.View entering={FadeIn.delay(150).springify()} style={styles.logoMark}>
          <View style={styles.wave} />
        </Animated.View>

        {/* Wordmark with per-letter stagger + light sweep */}
        <View style={styles.wordmarkWrap}>
          <View style={styles.wordmark}>
            {WORDMARK.map((letter, i) => (
              <Animated.Text
                key={i}
                entering={FadeInDown.delay(350 + i * 85).springify().damping(14)}
                style={[styles.letter, typographyLetter]}
              >
                {letter}
              </Animated.Text>
            ))}
          </View>
          <Animated.View style={[StyleSheet.absoluteFill, styles.sweepMask]}>
            <Animated.View style={[StyleSheet.absoluteFill, sweepStyle]}>
              <LinearGradient
                colors={['transparent', 'rgba(225,29,72,0.28)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </Animated.View>
        </View>

        <Animated.View entering={FadeInUp.delay(1150).duration(700)}>
          <Text variant="caption" color={colors.textSecondary} style={styles.tagline}>
            K-DRAMA. YOUR WORLD.
          </Text>
        </Animated.View>
      </View>

      {/* Pulsing loading dots */}
      <View style={styles.dots}>
        {[0, 1, 2].map((i) => (
          <LoadingDot key={i} delay={i * 220} />
        ))}
      </View>
    </View>
  );
}

function LoadingDot({ delay }: { delay: number }) {
  const opacity = useSharedValue(0.25);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withDelay(delay, withTiming(1, { duration: 420 })),
        withTiming(0.25, { duration: 420 })
      ),
      -1,
      false
    );
  }, [opacity, delay]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.dot, style]} />;
}

const typographyLetter = {
  fontSize: 40,
  lineHeight: 48,
  fontWeight: '700' as const,
  letterSpacing: 6,
  color: colors.textPrimary,
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing: {
    position: 'absolute',
    borderRadius: 9999,
    backgroundColor: colors.accentGlow,
  },
  content: {
    alignItems: 'center',
  },
  logoMark: {
    width: 72,
    height: 48,
    marginBottom: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wave: {
    width: 64,
    height: 28,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: colors.accent,
    borderBottomWidth: 0,
    transform: [{ scaleX: 1.2 }],
  },
  wordmarkWrap: {
    marginBottom: spacing.sm,
  },
  wordmark: {
    flexDirection: 'row',
  },
  letter: {
    textShadowColor: colors.accentGlow,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  sweepMask: {
    overflow: 'hidden',
  },
  tagline: {
    letterSpacing: 3,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  dots: {
    position: 'absolute',
    bottom: 84,
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
});
