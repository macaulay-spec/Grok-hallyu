import React from 'react';
import { View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, IconButton } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';

export default function SettingsScreen() {
  const { signOut } = useAuth();

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/(auth)/welcome');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <IconButton name="arrow-back" onPress={() => router.back()} />
        <Text variant="h3">Settings</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.section}>
        <Text variant="caption" color={colors.textTertiary} style={styles.sectionTitle}>
          ACCOUNT
        </Text>
        <TouchableOpacity style={styles.row} onPress={() => router.push('/edit-profile')}>
          <Text variant="body">Edit profile</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text variant="caption" color={colors.textTertiary} style={styles.sectionTitle}>
          ABOUT
        </Text>
        <View style={styles.row}>
          <Text variant="body">Version</Text>
          <Text variant="body" color={colors.textTertiary}>
            1.0.0
          </Text>
        </View>
      </View>

      <TouchableOpacity style={styles.signOut} onPress={handleSignOut}>
        <Text variant="body" color={colors.error}>
          Sign out
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    paddingHorizontal: spacing['2xl'],
    marginBottom: spacing.sm,
    letterSpacing: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  signOut: {
    marginTop: spacing['3xl'],
    alignItems: 'center',
  },
});
