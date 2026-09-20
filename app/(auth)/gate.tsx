import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';
import { Text } from '../../components/ui/Text';
import { useToast } from '../../components/ui/Toast';
import { colors, radius, space } from '../../constants/theme';
import { AuthError, useAuth } from '../../lib/auth';

/**
 * Auth gate for guests: a sheet, not a wall. Says what the action needs, offers the three doors,
 * and "Not now" returns to exactly where they were.
 */
export default function Gate() {
  const router = useRouter();
  const auth = useAuth();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));
  return (
    <View style={styles.root}>
      <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Not now" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.x4 }]} accessibilityViewIsModal>
        <View style={styles.handle} />
        <View style={styles.icon}>
          <Ionicons name="person-add-outline" size={22} color={colors.textPrimary} />
        </View>
        <Text variant="titleLarge" style={{ marginTop: space.x3 }}>
          Join Hallyu to {reason ?? 'do this'}
        </Text>
        <Text variant="body" tone="secondary" style={{ marginTop: space.x2 }}>
          Free, takes a minute. You keep everything you’ve browsed as a guest.
        </Text>
        <View style={{ gap: space.x2, marginTop: space.x5 }}>
          <Button label="Continue with Google" icon="logo-google" variant="secondary" block onPress={() => auth.signInWithGoogle().then(() => close()).catch((e: AuthError) => e.code !== 'cancelled' && toast.show({ message: e.message, tone: 'danger' }))} />
          <Button label="Continue with email" icon="mail-outline" block onPress={() => router.replace('/(auth)/sign-up')} />
          <Button label="I already have an account" variant="ghost" onPress={() => router.replace('/(auth)/sign-in')} />
          <Button label="Not now" variant="ghost" onPress={close} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface2, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.x6, paddingTop: space.x2 },
  handle: { width: 32, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: 'center', marginBottom: space.x4 },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
});
