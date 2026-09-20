import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius, sizes, space } from '../../constants/theme';
import { Tap } from './Tap';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accentSoft';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  block?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

const heights: Record<ButtonSize, number> = { sm: 36, md: 44, lg: 52 };
const paddings: Record<ButtonSize, number> = { sm: 12, md: 16, lg: 20 };

export function Button({ label, onPress, variant = 'primary', size = 'md', icon, iconRight, loading, disabled, block, style, accessibilityLabel, testID }: ButtonProps) {
  const bg = variant === 'primary' ? colors.accent : variant === 'danger' ? colors.dangerFill : variant === 'accentSoft' ? colors.accentSoft : variant === 'secondary' ? colors.surface2 : 'transparent';
  const fg = variant === 'primary' || variant === 'danger' ? colors.onAccent : variant === 'accentSoft' ? colors.accentText : colors.textPrimary;
  const border = variant === 'secondary' ? colors.borderStrong : 'transparent';
  const h = heights[size];
  return (
    <Tap
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      testID={testID}
      hitSlop={size === 'sm' ? 6 : 0}
      style={[styles.base, { height: h, minHeight: h, paddingHorizontal: paddings[size], backgroundColor: bg, borderColor: border, borderWidth: variant === 'secondary' ? 1 : 0, alignSelf: block ? 'stretch' : 'flex-start' }, block ? { width: '100%' } : null, style]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color={fg} size="small" />
        ) : (
          <>
            {icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 18} color={fg} style={{ marginRight: 8 }} /> : null}
            <Text variant={size === 'sm' ? 'label' : 'button'} style={{ color: fg }} numberOfLines={1}>
              {label}
            </Text>
            {iconRight ? <Ionicons name={iconRight} size={size === 'sm' ? 16 : 18} color={fg} style={{ marginLeft: 8 }} /> : null}
          </>
        )}
      </View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 0 },
});

export const buttonGap = space.x3;
export const touchTarget = sizes.touch;
