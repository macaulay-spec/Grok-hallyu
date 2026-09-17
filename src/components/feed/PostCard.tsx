import React from 'react';
import { View, StyleSheet, Image, TouchableOpacity, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text, Avatar, DramaChip } from '@/components/ui';
import { colors, spacing, radius } from '@/constants/theme';
import { PostWithRelations } from '@/types/database';

interface PostCardProps {
  post: PostWithRelations;
  onLike?: () => void;
  onSave?: () => void;
}

export function PostCard({ post, onLike, onSave }: PostCardProps) {
  const timeAgo = getTimeAgo(post.created_at);

  return (
    <View style={styles.card}>
      {/* Header */}
      <Pressable
        style={styles.header}
        onPress={() => router.push(`/profile/${post.user_id}`)}
      >
        <Avatar uri={post.profile?.avatar_url} size={40} />
        <View style={styles.headerText}>
          <Text variant="bodyMedium">
            {post.profile?.display_name ?? 'User'}
          </Text>
          <Text variant="captionSmall" color={colors.textTertiary}>
            {timeAgo}
          </Text>
        </View>
        <TouchableOpacity hitSlop={12}>
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.textTertiary} />
        </TouchableOpacity>
      </Pressable>

      {/* Body */}
      {post.body ? (
        <Text variant="body" style={styles.body}>
          {post.body}
        </Text>
      ) : null}

      {/* Drama tags */}
      {post.dramas?.length > 0 && (
        <View style={styles.tags}>
          {post.dramas.map((d) => (
            <DramaChip
              key={d.id}
              title={d.title}
              onPress={() => router.push(`/drama/${d.id}`)}
            />
          ))}
        </View>
      )}

      {/* Media */}
      {post.media_urls && post.media_urls.length > 0 && (
        <TouchableOpacity
          activeOpacity={0.95}
          onPress={() => router.push(`/post/${post.id}`)}
        >
          <Image
            source={{ uri: post.media_urls[0] }}
            style={styles.media}
            resizeMode="cover"
          />
        </TouchableOpacity>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.action} onPress={onLike}>
          <Ionicons
            name={post.is_liked ? 'heart' : 'heart-outline'}
            size={22}
            color={post.is_liked ? colors.accent : colors.textSecondary}
          />
          <Text variant="caption" color={colors.textSecondary} style={styles.count}>
            {formatCount(post.likes_count)}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.action}
          onPress={() => router.push(`/post/${post.id}`)}
        >
          <Ionicons name="chatbubble-outline" size={20} color={colors.textSecondary} />
          <Text variant="caption" color={colors.textSecondary} style={styles.count}>
            {formatCount(post.comments_count)}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.action} onPress={onSave}>
          <Ionicons
            name={post.is_saved ? 'bookmark' : 'bookmark-outline'}
            size={20}
            color={post.is_saved ? colors.accent : colors.textSecondary}
          />
          <Text variant="caption" color={colors.textSecondary} style={styles.count}>
            {formatCount(post.saves_count)}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing['2xl'],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  headerText: {
    flex: 1,
    marginLeft: spacing.md,
  },
  body: {
    marginBottom: spacing.md,
    lineHeight: 22,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.md,
  },
  media: {
    width: '100%',
    height: 220,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['2xl'],
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  count: {
    marginLeft: spacing.xs,
  },
});
