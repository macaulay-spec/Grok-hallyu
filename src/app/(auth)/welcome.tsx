import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';

const { height } = Dimensions.get('window');

export default function WelcomeScreen() {
  return (
    <View style={styles.container}>
      {/* Cinematic background – replace with a real drama still later */}
      <View style={styles.hero}>
        <LinearGradient
          colors={['transparent', 'rgba(10,10,10,0.4)', colors.background]}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <SafeAreaView style={styles.content}>
        <View style={styles.top}>
          <Text variant="caption" color={colors.accent} style={styles.eyebrow}>
            WELCOME TO
          </Text>
          <Text variant="display" style={styles.title}>
            Hallyu
          </Text>
          <Text
            variant="body"
            color={colors.textSecondary}
            style={styles.subtitle}
          >
            The cinematic social home for people who live inside K-dramas.
          </Text>
        </View>

        <View style={styles.actions}>
          <Button
            title="Create account"
            onPress={() => router.push('/(auth)/signup')}
            fullWidth
            size="lg"
          />
          <Button
            title="I already have an account"
            onPress={() => router.push('/(auth)/login')}
            variant="ghost"
            fullWidth
            style={{ marginTop: spacing.md }}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  hero: {
    height: height * 0.55,
    backgroundColor: '#1A0510',
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing['2xl'],
    justifyContent: 'space-between',
    paddingBottom: spacing['3xl'],
  },
  top: {
    marginTop: -spacing['4xl'],
  },
  eyebrow: {
    letterSpacing: 2,
    marginBottom: spacing.sm,
  },
  title: {
    marginBottom: spacing.md,
  },
  subtitle: {
    maxWidth: 300,
    lineHeight: 24,
  },
  actions: {
    width: '100%',
  },
});
