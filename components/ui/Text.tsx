import React from 'react';
import { Text as RNText, TextProps as RNTextProps, StyleSheet } from 'react-native';
import { colors, type, TypeVariant } from '../../constants/theme';

export type TextTone = 'primary' | 'secondary' | 'tertiary' | 'disabled' | 'accent' | 'warm' | 'danger' | 'success' | 'onAccent' | 'onMedia' | 'info';

const toneColor: Record<TextTone, string> = {
  primary: colors.textPrimary,
  secondary: colors.textSecondary,
  tertiary: colors.textTertiary,
  disabled: colors.textDisabled,
  accent: colors.accentText,
  warm: colors.warm,
  danger: colors.danger,
  success: colors.success,
  onAccent: colors.onAccent,
  onMedia: colors.onMedia,
  info: colors.info,
};

export interface TextProps extends RNTextProps {
  variant?: TypeVariant;
  tone?: TextTone;
  align?: 'left' | 'center' | 'right';
  numeric?: boolean; // tabular figures
}

export function Text({ variant = 'body', tone, align, numeric, style, ...rest }: TextProps) {
  return (
    <RNText
      {...rest}
      maxFontSizeMultiplier={rest.maxFontSizeMultiplier ?? (variant.startsWith('display') || variant === 'headline' ? 1.3 : 2)}
      style={[type[variant], tone ? { color: toneColor[tone] } : null, align ? { textAlign: align } : null, numeric ? styles.numeric : null, style]}
    />
  );
}

const styles = StyleSheet.create({ numeric: { fontVariant: ['tabular-nums'] } });
