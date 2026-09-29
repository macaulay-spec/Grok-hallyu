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
  /**
   * 'editorial' (default) — overline + large title, for the one or two things a screen leads with.
   * 'quiet' — a single small title line, for supporting rails so they never compete with the lead.
   */
  weight?: 'editorial' | 'quiet';
}

/** Editorial section header: optional overline eyebrow, title, "See all" chevron. */
export function SectionHeader({ title, eyebrow, subtitle, actionLabel, onAction, style, live, weight = 'editorial' }: SectionHeaderProps) {
  const quiet = weight === 'quiet';
  return (
    <View style={[styles.wrap, quiet && styles.wrapQuiet, style]}>
      <View style={{ flex: 1 }}>
        {eyebrow && !quiet ? (
          <View style={styles.eyebrowRow}>
            {live ? <View style={styles.live} /> : null}
            <Text variant="overline">{eyebrow}</Text>
          </View>
        ) : null}
        <View style={styles.titleRow}>
          {quiet && live ? <View style={styles.live} /> : null}
          <Text variant={quiet ? 'titleSmall' : 'titleLarge'} accessibilityRole="header" maxFontSizeMultiplier={1.6}>
            {title}
          </Text>
          {quiet && eyebrow ? (
            <Text variant="caption" tone="tertiary">
              · {eyebrow}
            </Text>
          ) : null}
        </View>
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

/** 2px progress bar (spec 3.4): crimson fill on a surface-1 track. */
export function ProgressBar({ value, max, height = 2, color = colors.accent, style }: { value: number; max: number; height?: number; color?: string; style?: StyleProp<ViewStyle> }) {
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <View style={[{ height, backgroundColor: colors.surface1, borderRadius: height / 2, overflow: 'hidden' }, style]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max, now: value }}>
      <View style={{ width: `${pct * 100}%`, height, backgroundColor: color }} />
    </View>
  );
}

/**
 * Watched ring (spec 3.4): a 32dp crimson arc that fills with watch progress. Pure views —
 * two half-circle masks rotated by progress, so no SVG dependency. Sits on a dark puck so it
 * reads on any artwork.
 */
export function WatchRing({ progress, size = 32, thickness = 2.5, color = colors.accent, style }: { progress: number; size?: number; thickness?: number; color?: string; style?: StyleProp<ViewStyle> }) {
  const p = Math.min(1, Math.max(0, progress));
  const half = size / 2;
  const ringBase = { width: size, height: size, borderRadius: half, borderWidth: thickness, borderColor: 'transparent' } as const;
  const rightRotation = `${-180 + Math.min(p, 0.5) * 360}deg`;
  const leftRotation = `${180 + Math.max(0, p - 0.5) * 360}deg`;
  return (
    <View style={[{ width: size, height: size, borderRadius: half, backgroundColor: 'rgba(0,0,0,0.55)' }, style]}>
      <View style={{ position: 'absolute', width: size, height: size, borderRadius: half, borderWidth: thickness, borderColor: colors.surface3 }} />
      <View style={{ position: 'absolute', left: half, width: half, height: size, overflow: 'hidden' }}>
        <View style={[ringBase, { borderTopColor: color, borderRightColor: color, transform: [{ rotate: rightRotation }] }]} />
      </View>
      <View style={{ position: 'absolute', left: 0, width: half, height: size, overflow: 'hidden' }}>
        <View style={[ringBase, { borderBottomColor: color, borderLeftColor: color, transform: [{ rotate: leftRotation }] }]} />
      </View>
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
  wrapQuiet: { alignItems: 'center', marginBottom: space.x2 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  live: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.live },
  action: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingLeft: space.x2 },
  divider: { height: 1, backgroundColor: colors.borderSubtle },
  kv: { gap: 2 },
});
