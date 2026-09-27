import React from 'react';
import { StyleSheet } from 'react-native';
import { colors, radius, space } from '../../constants/theme';
import { Fandom } from '../../lib/fandoms';
import { Pressable } from 'react-native';
import { Text } from '../ui/Text';

/**
 * A world tile: flag, name, and how much of that world is on this device. Tinted per world, because
 * recognising your fandoms at a glance is the whole point of having four of them.
 */
export function WorldTile({ world, count, onPress }: { world: Fandom; count: number; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tile, { borderColor: world.tint }]}
      accessibilityRole="button"
      accessibilityLabel={`${world.label}, ${count} title${count === 1 ? '' : 's'} on this device`}
    >
      <Text variant="title" accessibilityElementsHidden>
        {world.flag}
      </Text>
      <Text variant="label" numberOfLines={1}>
        {world.label}
      </Text>
      <Text variant="caption" tone="secondary" numberOfLines={1}>
        {count ? `${count} title${count === 1 ? '' : 's'}` : 'Explore'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { width: 132, height: 92, borderRadius: radius.md, borderWidth: 1, backgroundColor: colors.surface1, padding: space.x3, justifyContent: 'space-between' },
});
