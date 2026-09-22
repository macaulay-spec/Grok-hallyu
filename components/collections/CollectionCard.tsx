import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius, space } from '../../constants/theme';
import { compact } from '../../lib/format';
import { useApp } from '../../lib/hooks';
import { Collection } from '../../lib/model';
import { Avatar } from '../ui/Avatar';
import { Poster } from '../ui/Poster';
import { Tap } from '../ui/Tap';
import { Text } from '../ui/Text';

interface CollectionCardProps {
  collection: Collection;
  style?: StyleProp<ViewStyle>;
  layout?: 'card' | 'row';
  showOwner?: boolean;
}

/** Collection = fanned poster stack + title + count + owner. */
export function CollectionCard({ collection, style, layout = 'card', showOwner = true }: CollectionCardProps) {
  const router = useRouter();
  const { getDrama, getUser } = useApp();
  const posters = collection.items.slice(0, 3).map((i) => getDrama(i.dramaId)).filter(Boolean);
  const owner = getUser(collection.ownerId);
  const go = () => router.push(`/collection/${collection.id}`);
  const stack = (w: number) => (
    <View style={{ width: w + 24, height: Math.round(w * 1.5) + 8 }}>
      {posters.map((d, i) => (
        <Poster key={d!.id} drama={d!} width={w} style={{ position: 'absolute', left: i * 12, top: (2 - i) * 4, borderWidth: 1, borderColor: colors.canvas }} />
      ))}
      {posters.length === 0 ? <View style={{ width: w, height: w * 1.5, borderRadius: radius.sm, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="albums-outline" size={22} color={colors.textTertiary} /></View> : null}
    </View>
  );
  if (layout === 'row') {
    return (
      <Tap onPress={go} accessibilityRole="button" accessibilityLabel={`${collection.title}, ${collection.items.length} dramas`} style={[styles.row, style]}>
        {stack(40)}
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Text variant="titleSmall" numberOfLines={1} style={{ flexShrink: 1 }}>
              {collection.title}
            </Text>
            {collection.visibility === 'private' ? <Ionicons name="lock-closed" size={12} color={colors.textTertiary} /> : null}
          </View>
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {collection.items.length} {collection.items.length === 1 ? 'drama' : 'dramas'}
            {showOwner && owner ? ` · by ${owner.displayName}` : ''}
            {collection.followerCount ? ` · ${compact(collection.followerCount)} followers` : ''}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </Tap>
    );
  }
  return (
    <Tap onPress={go} accessibilityRole="button" accessibilityLabel={`${collection.title}, ${collection.items.length} dramas`} style={[styles.card, style]}>
      {stack(72)}
      <View style={{ gap: 2, marginTop: space.x2 }}>
        <View style={styles.titleRow}>
          <Text variant="titleSmall" numberOfLines={2} style={{ flexShrink: 1 }}>
            {collection.title}
          </Text>
          {collection.visibility === 'private' ? <Ionicons name="lock-closed" size={12} color={colors.textTertiary} /> : null}
        </View>
        <Text variant="caption" tone="tertiary" numberOfLines={1}>
          {collection.items.length} {collection.items.length === 1 ? 'drama' : 'dramas'}
          {collection.followerCount ? ` · ${compact(collection.followerCount)}` : ''}
        </Text>
        {showOwner && owner ? (
          <View style={styles.owner}>
            <Avatar uri={owner.avatarUrl} name={owner.displayName} size={16} />
            <Text variant="caption" tone="secondary" numberOfLines={1}>
              {owner.displayName}
            </Text>
          </View>
        ) : null}
      </View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  card: { width: 160, backgroundColor: colors.surface1, borderRadius: radius.lg, padding: space.x3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.x3, paddingVertical: space.x2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  owner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
});
