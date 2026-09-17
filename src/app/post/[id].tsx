import React from 'react';
import { View, StyleSheet, ScrollView, Image } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Avatar, IconButton, DramaChip } from '@/components/ui';
import { colors, spacing, radius } from '@/constants/theme';

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <IconButton name="arrow-back" onPress={() => router.back()} />
        <Text variant="h3">Post</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.author}>
          <Avatar size={44} />
          <View style={{ marginLeft: spacing.md }}>
            <Text variant="bodyMedium">kdrama.love</Text>
            <Text variant="captionSmall" color={colors.textTertiary}>
              2h ago
            </Text>
          </View>
        </View>

        <Text variant="body" style={styles.body}>
          Just finished Queen of Tears and I’m not okay 😭 The writing, the chemistry, the ending… 10/10, no notes.
        </Text>

        <View style={styles.tags}>
          <DramaChip title="Queen of Tears" />
        </View>

        <Image
          source={{ uri: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=800' }}
          style={styles.media}
        />

        <View style={styles.stats}>
          <Text variant="caption" color={colors.textSecondary}>
            1.2k likes · 87 comments · 214 saves
          </Text>
        </View>

        <Text variant="h3" style={{ marginTop: spacing['2xl'], marginBottom: spacing.lg }}>
          Comments
        </Text>

        <View style={styles.comment}>
          <Avatar size={36} />
          <View style={styles.commentBody}>
            <Text variant="bodyMedium">seoul.obsessed</Text>
            <Text variant="body" color={colors.textSecondary}>
              The ending scene still haunts me.
            </Text>
          </View>
        </View>
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
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  content: {
    padding: spacing['2xl'],
  },
  author: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  body: {
    lineHeight: 24,
    marginBottom: spacing.md,
  },
  tags: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
  },
  media: {
    width: '100%',
    height: 240,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  stats: {
    marginTop: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  comment: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
  },
  commentBody: {
    flex: 1,
    marginLeft: spacing.md,
  },
});
