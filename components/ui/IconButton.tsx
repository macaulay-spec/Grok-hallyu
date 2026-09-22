import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius, sizes } from '../../constants/theme';
import { Tap } from './Tap';
import { Text } from './Text';

interface IconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  label: string; // accessibility label (required)
  size?: number; // icon size
  tone?: 'default' | 'accent' | 'onMedia' | 'secondary' | 'danger';
  filled?: boolean; // surface background
  badge?: number | boolean;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}

/** 48dp touch target, 24dp glyph by default. */
export function IconButton({ icon, onPress, label, size = 24, tone = 'default', filled, badge, style, disabled }: IconButtonProps) {
  const color = tone === 'accent' ? colors.accentText : tone === 'onMedia' ? colors.onMedia : tone === 'secondary' ? colors.textSecondary : tone === 'danger' ? colors.danger : colors.textPrimary;
  return (
    <Tap onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} scaleTo={0.92} style={[styles.base, filled ? styles.filled : null, tone === 'onMedia' && filled ? styles.onMediaFill : null, style]}>
      <Ionicons name={icon} size={size} color={color} />
      {badge ? (
        <View style={[styles.badge, typeof badge === 'number' ? styles.badgeCount : null]}>
          {typeof badge === 'number' ? (
            <Text variant="caption" style={styles.badgeText} numeric>
              {badge > 99 ? '99+' : badge}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Tap>
  );
}

const styles = StyleSheet.create({
  base: { width: sizes.touch, height: sizes.touch, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full },
  filled: { backgroundColor: colors.surface2 },
  onMediaFill: { backgroundColor: 'rgba(0,0,0,0.45)' },
  badge: { position: 'absolute', top: 8, right: 8, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.canvas },
  badgeCount: { width: undefined, height: 18, minWidth: 18, paddingHorizontal: 4, borderRadius: 9, top: 4, right: 4, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.onAccent, fontSize: 10, lineHeight: 12 },
});
