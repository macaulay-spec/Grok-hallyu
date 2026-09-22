import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, motion, space } from '../../constants/theme';
import { haptic, useReduceMotion } from '../../lib/hooks';
import { Text } from './Text';

interface DisclosureProps {
  title: string;
  /** One quiet line under the title — what's inside, so people don't have to open it to know. */
  summary?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Called the first time the section opens (analytics, lazy loads). */
  onFirstOpen?: () => void;
}

/**
 * Progressive disclosure: a calm row that expands into secondary content. The row itself is the
 * whole target (48dp+), the chevron turns, and the content fades/rises in; reduced motion → cut.
 * Content is only mounted while open, so heavy children cost nothing when collapsed.
 */
export function Disclosure({ title, summary, icon, defaultOpen = false, open: controlled, onToggle, children, style, onFirstOpen }: DisclosureProps) {
  const [inner, setInner] = useState(defaultOpen);
  const open = controlled ?? inner;
  const reduce = useReduceMotion();
  const anim = useRef(new Animated.Value(open ? 1 : 0)).current;
  const opened = useRef(open);

  useEffect(() => {
    if (open && !opened.current) {
      opened.current = true;
      onFirstOpen?.();
    }
    if (reduce) {
      anim.setValue(open ? 1 : 0);
      return;
    }
    Animated.timing(anim, { toValue: open ? 1 : 0, duration: open ? motion.medium : motion.short, easing: Easing.bezier(0.2, 0, 0, 1), useNativeDriver: true }).start();
  }, [open, reduce, anim, onFirstOpen]);

  const toggle = () => {
    haptic.select();
    const next = !open;
    if (controlled === undefined) setInner(next);
    onToggle?.(next);
  };

  return (
    <View style={style}>
      <Pressable onPress={toggle} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={title} accessibilityHint={open ? 'Collapses this section' : 'Expands this section'}>
        {icon ? <Ionicons name={icon} size={18} color={colors.textSecondary} /> : null}
        <View style={{ flex: 1, gap: 1 }}>
          <Text variant="titleSmall">{title}</Text>
          {summary ? (
            <Text variant="caption" tone="tertiary" numberOfLines={1}>
              {summary}
            </Text>
          ) : null}
        </View>
        <Animated.View style={{ transform: [{ rotate: anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
          <Ionicons name="chevron-down" size={18} color={colors.textTertiary} />
        </Animated.View>
      </Pressable>
      {open ? <Animated.View style={{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] }}>{children}</Animated.View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    minHeight: 56,
    paddingHorizontal: space.margin,
    paddingVertical: space.x2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  pressed: { backgroundColor: colors.surface1 },
});
