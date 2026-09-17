import React from 'react';
import { Text as RNText, TextProps as RNTextProps } from 'react-native';
import { colors, typography } from '@/constants/theme';

type Variant = keyof typeof typography;

interface TextProps extends RNTextProps {
  variant?: Variant;
  color?: string;
  children: React.ReactNode;
}

export function Text({
  variant = 'body',
  color = colors.textPrimary,
  style,
  children,
  ...props
}: TextProps) {
  return (
    <RNText
      style={[
        typography[variant],
        { color },
        style,
      ]}
      {...props}
    >
      {children}
    </RNText>
  );
}
