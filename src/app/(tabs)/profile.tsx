import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Text, Avatar, Button, IconButton } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';

export default function ProfileScreen() {
  const { profile, signOut } = useAuth();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text variant="h2">Profile</Text>
        <IconButton
          name="settings-outline"
          onPress={() => router.push('/settings')}
        />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.top}>
          <Avatar uri={profile?.avatar_url} size={88} />
          <Text variant="h2" style={{ marginTop: spacing.lg }}>
            {profile?.display_name ?? 'You'}
          </Text>
          {profile?.bio ? (
            <Text
              variant="body"
              color={colors.textSecondary}
              style={{ marginTop: spacing.sm, textAlign: 'center' }}
            >
              {profile.bio}
            </Text>
          ) : null}
        </View>

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text variant="h3">0</Text>
            <Text variant="caption" color={colors.textTertiary}>
              Posts
            </Text>
          </View>
          <View style={styles.stat}>
            <Text variant="h3">0</Text>
            <Text variant="caption" color={colors.textTertiary}>
              Followers
            </Text>
          </View>
          <View style={styles.stat}>
            <Text variant="h3">0</Text>
            <Text variant="caption" color={colors.textTertiary}>
              Following
            </Text>
          </View>
        </View>

        <Button
          title="Edit profile"
          variant="outline"
          onPress={() => router.push('/edit-profile')}
          fullWidth
          style={{ marginTop: spacing['2xl'] }}
        />

        <TouchableOpacity onPress={signOut} style={styles.signOut}>
          <Text variant="body" color={colors.error}>
            Sign out
          </Text>
        </TouchableOpacity>
      </ScrollView>
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
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.md,
  },
  content: {
    paddingHorizontal: spacing['2xl'],
    paddingBottom: spacing['4xl'],
  },
  top: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: spacing['2xl'],
    paddingVertical: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  stat: {
    alignItems: 'center',
  },
  signOut: {
    marginTop: spacing['3xl'],
    alignItems: 'center',
  },
});
