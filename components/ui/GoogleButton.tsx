import { Image } from 'expo-image';
import React from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius, sizes, space } from '../../constants/theme';
import { Tap } from './Tap';
import { Text } from './Text';

export type GoogleButtonSize = 'md' | 'lg';

interface GoogleButtonProps {
  onPress?: () => void;
  label?: string;
  size?: GoogleButtonSize;
  loading?: boolean;
  disabled?: boolean;
  block?: boolean;
  style?: StyleProp<ViewStyle>;
}

const heights: Record<GoogleButtonSize, number> = { md: 44, lg: 52 };

/**
 * "Continue with Google" — one door, drawn once.
 *
 * A white surface with the four-colour G is the most recognisable sign-in affordance on the
 * platform, and it reads as a first-class door rather than a secondary link. It is deliberately
 * quieter than the crimson primary (email) so the two never compete for the same tap.
 */
export function GoogleButton({ onPress, label = 'Continue with Google', size = 'lg', loading, disabled, block = true, style }: GoogleButtonProps) {
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
          <ActivityIndicator color={colors.canvas} size="small" />
        ) : (
          <>
            <Image source={require('../../assets/branding/google-g.png')} style={styles.mark} contentFit="contain" />
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
  // White surface: the G's colours need a light ground to read correctly on the black canvas.
  base: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.x5, backgroundColor: '#FFFFFF' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.x3 },
  mark: { width: 20, height: 20 },
  label: { color: '#1A1A1A' },
});

export const googleTouchTarget = sizes.touch;
