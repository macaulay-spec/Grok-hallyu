import React, { useRef } from 'react';
import { Animated, Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import { motion } from '../../constants/theme';
import { haptic } from '../../lib/hooks';

interface TapProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** scale on press (default 0.98) */
  scaleTo?: number;
  /** trigger a light haptic on press-in */
  haptics?: boolean;
  children?: React.ReactNode;
}

/** Pressable with the standard press scale (0.98 / 80ms) and optional haptic. */
export function Tap({ style, scaleTo = 0.98, haptics, onPressIn, onPressOut, children, disabled, ...rest }: TapProps) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        Animated.timing(scale, { toValue: scaleTo, duration: motion.instant, useNativeDriver: true }).start();
        if (haptics) haptic.light();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        Animated.timing(scale, { toValue: 1, duration: motion.short, useNativeDriver: true }).start();
        onPressOut?.(e);
      }}
    >
      <Animated.View style={[style, { transform: [{ scale }] }, disabled ? { opacity: 0.5 } : null]}>{children}</Animated.View>
    </Pressable>
  );
}
