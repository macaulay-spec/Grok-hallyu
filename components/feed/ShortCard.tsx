import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { FlatList, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { aspect, colors, radius, space } from '../../constants/theme';
import { compact } from '../../lib/format';
import { useApp } from '../../lib/hooks';
import { Post } from '../../lib/model';
import { reactionTotal } from '../../lib/selectors';
import { Avatar } from '../ui/Avatar';
import { Poster } from '../ui/Poster';
import { Tap } from '../ui/Tap';
import { Text } from '../ui/Text';

interface ShortCardProps {
  post: Post;
  width?: number;
  style?: StyleProp<ViewStyle>;
}

/** 9:16 tile: drama poster as the cover, duration, caption, author. Tap → Shorts viewer at this item. */
export function ShortCard({ post, width = 132, style }: ShortCardProps) {
  const router = useRouter();
  const { getUser, getDrama, isPostVeiled } = useApp();
  const author = getUser(post.authorId);
  const drama = getDrama(post.context.dramaId);
  const veiled = isPostVeiled(post);
  const height = Math.round(width / aspect.short);
  const d = post.video?.duration ?? 0;
  return (
    <Tap onPress={() => router.push({ pathname: '/shorts', params: { id: post.id } })} accessibilityRole="button" accessibilityLabel={`Short by ${author?.displayName}: ${post.body}`} style={[{ width }, style]}>
      <View style={[styles.tile, { width, height, backgroundColor: drama?.tone ?? colors.surface2 }]}>
        {drama ? <Poster drama={drama} width={width} rounded={0} style={{ height, opacity: veiled ? 0.25 : 0.9 }} /> : null}
        <View style={styles.scrim} />
        {veiled ? (
          <View style={styles.veil}>
            <Ionicons name="eye-off-outline" size={20} color={colors.textPrimary} />
            <Text variant="caption" align="center" style={{ color: colors.textPrimary }}>
              Spoiler
            </Text>
          </View>
        ) : null}
        <View style={styles.play}>
          <Ionicons name="play" size={14} color={colors.onMedia} />
          <Text variant="caption" style={{ color: colors.onMedia }} numeric>
            {d}s
          </Text>
        </View>
        <View style={styles.bottom}>
          <Text variant="label" numberOfLines={2} style={{ color: colors.onMedia }}>
            {post.body}
          </Text>
          <View style={styles.authorRow}>
            <Avatar uri={author?.avatarUrl} name={author?.displayName ?? '?'} size={18} />
            <Text variant="caption" style={{ color: colors.onMedia, flex: 1 }} numberOfLines={1}>
              {author?.displayName}
            </Text>
            <Ionicons name="heart" size={11} color={colors.onMedia} />
            <Text variant="caption" style={{ color: colors.onMedia }} numeric>
              {compact(reactionTotal(post))}
            </Text>
          </View>
        </View>
      </View>
    </Tap>
  );
}

export function ShortsRail({ posts, width = 132 }: { posts: Post[]; width?: number }) {
  return <FlatList horizontal data={posts} keyExtractor={(p) => p.id} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.margin, gap: space.x2 }} renderItem={({ item }) => <ShortCard post={item} width={width} />} />;
}

/** Profile grid tile (3 columns, square-ish 9:16 crop, no caption). */
export function ShortTile({ post }: { post: Post }) {
  const router = useRouter();
  const { getDrama, isPostVeiled } = useApp();
  const drama = getDrama(post.context.dramaId);
  const veiled = isPostVeiled(post);
  return (
    <Tap onPress={() => router.push({ pathname: '/shorts', params: { id: post.id } })} accessibilityRole="button" accessibilityLabel={`Short: ${post.body}`} style={{ flex: 1, aspectRatio: 3 / 4, backgroundColor: drama?.tone ?? colors.surface2, overflow: 'hidden' }}>
      {drama ? <Poster drama={drama} width={200} rounded={0} style={{ width: '100%', height: '100%', opacity: veiled ? 0.25 : 0.9 }} /> : null}
      <View style={styles.play}>
        <Ionicons name="play" size={12} color={colors.onMedia} />
        <Text variant="caption" style={{ color: colors.onMedia }} numeric>
          {compact(reactionTotal(post))}
        </Text>
      </View>
      {veiled ? (
        <View style={styles.veil}>
          <Ionicons name="eye-off-outline" size={18} color={colors.textPrimary} />
        </View>
      ) : null}
    </Tap>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: radius.md, overflow: 'hidden', justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  veil: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 4 },
  play: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 6, height: 20, borderRadius: 10 },
  bottom: { padding: space.x2, gap: 6 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
});
