import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, space } from '../../constants/theme';
import { Text } from './Text';

interface SectionHeaderProps {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
  live?: boolean;
}

/** Editorial section header: optional overline eyebrow, title, "See all" chevron. */
export function SectionHeader({ title, eyebrow, subtitle, actionLabel, onAction, style, live }: SectionHeaderProps) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={{ flex: 1 }}>
        {eyebrow ? (
          <View style={styles.eyebrowRow}>
            {live ? <View style={styles.live} /> : null}
            <Text variant="overline">{eyebrow}</Text>
          </View>
        ) : null}
        <Text variant="titleLarge" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySmall" tone="secondary" style={{ marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {onAction ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button" accessibilityLabel={actionLabel ?? `See all ${title}`} style={styles.action}>
          <Text variant="label" tone="secondary">
            {actionLabel ?? 'See all'}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Divider({ inset = 0, style }: { inset?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, { marginLeft: inset }, style]} />;
}

export function ProgressBar({ value, max, height = 3, color = colors.accent, style }: { value: number; max: number; height?: number; color?: string; style?: StyleProp<ViewStyle> }) {
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <View style={[{ height, backgroundColor: colors.surface3, borderRadius: height / 2, overflow: 'hidden' }, style]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max, now: value }}>
      <View style={{ width: `${pct * 100}%`, height, backgroundColor: color }} />
    </View>
  );
}

export function Row({ children, style, gap = space.x3, align = 'center' }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number; align?: 'center' | 'flex-start' | 'flex-end' }) {
  return <View style={[{ flexDirection: 'row', alignItems: align, gap }, style]}>{children}</View>;
}

export function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kv}>
      <Text variant="caption" tone="tertiary">
        {label}
      </Text>
      <Text variant="bodySmall">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: space.margin, marginBottom: space.x3 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  live: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.live },
  action: { flexDirection: 'row', alignItems: 'center', paddingBottom: 4 },
  divider: { height: 1, backgroundColor: colors.borderSubtle },
  kv: { gap: 2 },
});
