import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Avatar, Button, IconButton } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';

export default function OtherProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <IconButton name="arrow-back" onPress={() => router.back()} />
        <Text variant="h3">Profile</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.top}>
          <Avatar size={88} />
          <Text variant="h2" style={{ marginTop: spacing.lg }}>
            User
          </Text>
          <Text variant="body" color={colors.textSecondary} style={{ marginTop: spacing.sm }}>
            K-drama enthusiast
          </Text>
        </View>

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text variant="h3">12</Text>
            <Text variant="caption" color={colors.textTertiary}>
              Posts
            </Text>
          </View>
          <View style={styles.stat}>
            <Text variant="h3">340</Text>
            <Text variant="caption" color={colors.textTertiary}>
              Followers
            </Text>
          </View>
          <View style={styles.stat}>
            <Text variant="h3">89</Text>
            <Text variant="caption" color={colors.textTertiary}>
              Following
            </Text>
          </View>
        </View>

        <Button title="Follow" onPress={() => {}} fullWidth style={{ marginTop: spacing['2xl'] }} />
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  content: {
    paddingHorizontal: spacing['2xl'],
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
});
