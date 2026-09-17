import React, { useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';

/**
 * Entry point – decides where the user should go.
 * Shows a refined cinematic splash while checking auth state.
 */
export default function Index() {
  const { session, profile, loading } = useAuth();

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
    }, 1400); // cinematic pause

    return () => clearTimeout(timer);
  }, [session, profile, loading]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0A0A0A', '#1A0510', '#0A0A0A']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>
        {/* Logo mark */}
        <View style={styles.logoMark}>
          <View style={styles.wave} />
        </View>
        <Text variant="h1" style={styles.title}>
          Hallyu
        </Text>
        <Text variant="caption" color={colors.textSecondary} style={styles.tagline}>
          K-DRAMA. YOUR WORLD.
        </Text>
      </View>
      <ActivityIndicator
        color={colors.accent}
        style={styles.loader}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
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
  title: {
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  tagline: {
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  loader: {
    position: 'absolute',
    bottom: 80,
  },
});
