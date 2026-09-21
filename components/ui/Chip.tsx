import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius, space } from '../../constants/theme';
import { Tap } from './Tap';
import { Text } from './Text';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  size?: 'sm' | 'md';
  tone?: 'default' | 'accent' | 'warm' | 'live';
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/** Filter / selection chip. Selected = accent soft fill + accent text; never a gradient. */
export function Chip({ label, selected, onPress, icon, size = 'md', tone = 'default', style, accessibilityLabel }: ChipProps) {
  const h = size === 'sm' ? 28 : 36;
  const isAccent = selected || tone === 'accent';
  const bg = isAccent ? colors.accentSoft : tone === 'warm' ? colors.warmSoft : colors.surface2;
  const fg = isAccent ? colors.accentText : tone === 'warm' ? colors.warm : tone === 'live' ? colors.textPrimary : colors.textSecondary;
  const body = (
    <View style={[styles.chip, { height: h, paddingHorizontal: size === 'sm' ? 10 : 14, backgroundColor: bg, borderColor: selected ? colors.accent : 'transparent' }, style]}>
      {tone === 'live' ? <View style={styles.dot} /> : null}
      {icon ? <Ionicons name={icon} size={size === 'sm' ? 12 : 14} color={fg} style={{ marginRight: 6 }} /> : null}
      <Text variant={size === 'sm' ? 'caption' : 'label'} style={{ color: fg }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!selected }} accessibilityLabel={accessibilityLabel ?? label} hitSlop={{ top: size === 'sm' ? 10 : 6, bottom: size === 'sm' ? 10 : 6, left: 2, right: 2 }}>
      {body}
    </Tap>
  );
}

export function ChipRow({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.full, borderWidth: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.x2 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.live, marginRight: 8 },
});
