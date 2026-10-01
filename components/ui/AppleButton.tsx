import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius, space } from '../../constants/theme';
import { Tap } from './Tap';
import { Text } from './Text';

export type AppleButtonSize = 'md' | 'lg';

interface AppleButtonProps {
  onPress?: () => void;
  label?: string;
  size?: AppleButtonSize;
  loading?: boolean;
  disabled?: boolean;
  block?: boolean;
  style?: StyleProp<ViewStyle>;
}

const heights: Record<AppleButtonSize, number> = { md: 44, lg: 52 };

/**
 * "Continue with Apple" — the second identity door, drawn once.
 *
 * A near-black surface with the Apple mark mirrors GoogleButton's geometry so the two doors read
 * as a matched pair; Apple's guidelines require the mark on black, white or a light tint.
 */
export function AppleButton({ onPress, label = 'Continue with Apple', size = 'lg', loading, disabled, block = true, style }: AppleButtonProps) {
  const h = heights[size];
  return (
    <Tap
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={[styles.base, { height: h, minHeight: h, alignSelf: block ? 'stretch' : 'flex-start' }, block ? { width: '100%' } : null, style]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color={colors.textPrimary} size="small" />
        ) : (
          <>
            <Ionicons name="logo-apple" size={20} color={colors.textPrimary} />
            <Text variant={size === 'lg' ? 'button' : 'label'} style={styles.label} numberOfLines={1}>
              {label}
            </Text>
          </>
        )}
      </View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.x5, backgroundColor: '#0B0B0D', borderWidth: 1, borderColor: colors.borderStrong },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.x3 },
  label: { color: colors.textPrimary },
});
