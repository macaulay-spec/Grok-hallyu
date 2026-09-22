import React, { useRef } from 'react';
import { Animated, Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import { motion } from '../../constants/theme';
import { haptic, useReduceMotion } from '../../lib/hooks';
import { springs } from '../../lib/motion';

interface TapProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** scale on press (default 0.97) */
  scaleTo?: number;
  /** trigger a light haptic on press-in */
  haptics?: boolean;
  children?: React.ReactNode;
}

/**
 * Pressable with physical feedback: a quick 80ms dip to 0.97, then a spring back on release.
 * Reduced motion keeps the opacity change and drops the scale.
 */
export function Tap({ style, scaleTo = 0.97, haptics, onPressIn, onPressOut, children, disabled, ...rest }: TapProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const reduce = useReduceMotion();
  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        if (!reduce) Animated.timing(scale, { toValue: scaleTo, duration: motion.instant, useNativeDriver: true }).start();
        if (haptics) haptic.light();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (!reduce) Animated.spring(scale, { toValue: 1, ...springs.snappy }).start();
        onPressOut?.(e);
      }}
    >
      {({ pressed }) => <Animated.View style={[style, { transform: [{ scale }] }, disabled ? { opacity: 0.5 } : pressed && reduce ? { opacity: 0.8 } : null]}>{children}</Animated.View>}
    </Pressable>
  );
}
