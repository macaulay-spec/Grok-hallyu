import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, sizes, space } from '../../constants/theme';
import { IconButton } from './IconButton';
import { Text } from './Text';

interface TopBarProps {
  title?: string;
  subtitle?: string;
  /** 'stack' shows a back chevron; 'modal' shows a close; 'root' nothing */
  mode?: 'stack' | 'modal' | 'root';
  onBack?: () => void;
  right?: React.ReactNode;
  left?: React.ReactNode;
  transparent?: boolean; // over media (hero)
  center?: React.ReactNode; // custom center (e.g. wordmark)
  style?: StyleProp<ViewStyle>;
  large?: boolean; // titleLarge
  safeTop?: boolean;
  /** collapsing-hero support: the bar background fades in and the title rises in as the hero scrolls away */
  backgroundOpacity?: Animated.Value | Animated.AnimatedInterpolation<number>;
  titleOpacity?: Animated.Value | Animated.AnimatedInterpolation<number>;
  titleRise?: Animated.Value | Animated.AnimatedInterpolation<number>;
}

export function TopBar({ title, subtitle, mode = 'stack', onBack, right, left, transparent, center, style, large, safeTop = true, backgroundOpacity, titleOpacity, titleRise }: TopBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const back = () => {
    if (onBack) return onBack();
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };
  return (
    <View style={[styles.wrap, { paddingTop: safeTop ? insets.top : 0 }, transparent ? styles.transparent : null, style]}>
      {backgroundOpacity ? <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.canvas, opacity: backgroundOpacity }]} /> : null}
      <View style={styles.bar}>
        <View style={styles.side}>
          {left ?? (mode === 'stack' ? <IconButton icon="chevron-back" label="Back" onPress={back} tone={transparent ? 'onMedia' : 'default'} filled={transparent} /> : mode === 'modal' ? <IconButton icon="close" label="Close" onPress={back} tone={transparent ? 'onMedia' : 'default'} filled={transparent} /> : null)}
        </View>
        <View style={styles.center} pointerEvents="box-none">
          {center ??
            (title ? (
              <Animated.View style={[{ alignItems: mode === 'root' && !left ? 'flex-start' : 'center', flex: 1 }, titleOpacity ? { opacity: titleOpacity } : null, titleRise ? { transform: [{ translateY: titleRise }] } : null]}>
                <Text variant={large ? 'headline' : 'title'} numberOfLines={1} style={transparent ? { color: colors.onMedia } : null}>
                  {title}
                </Text>
                {subtitle ? (
                  <Text variant="caption" tone="secondary" numberOfLines={1}>
                    {subtitle}
                  </Text>
                ) : null}
              </Animated.View>
            ) : null)}
        </View>
        <View style={[styles.side, { justifyContent: 'flex-end' }]}>{right}</View>
      </View>
    </View>
  );
}

/** The wordmark for Home's top bar: "Hallyu" + the Signal. */
export function Wordmark({ size = 24 }: { size?: number }) {
  return (
    <View style={styles.wordmark} accessibilityRole="header" accessibilityLabel="Hallyu">
      <Text style={{ fontFamily: 'Pretendard-ExtraBold', fontSize: size, lineHeight: size + 6, letterSpacing: -size * 0.03, color: colors.textPrimary }}>Hallyu</Text>
      <View style={{ width: size * 0.28, height: size * 0.28, borderRadius: size, backgroundColor: colors.accent, marginLeft: 2, marginTop: size * 0.42 }} />
    </View>
  );
}

/**
 * Live indicator (spec 3.2): pulsing crimson dot + how many shows air today. Sits on Home's
 * top bar; tapping opens the schedule.
 */
export function LiveIndicator({ count, onPress }: { count: number; onPress?: () => void }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!count) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [count, pulse]);
  if (!count) return null;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`${count} shows airing today. Open the schedule.`}
      style={styles.livePill}
    >
      <View style={styles.liveHost}>
        <Animated.View style={[styles.liveHalo, { opacity: pulse, transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.6] }) }] }]} />
        <View style={styles.liveDot} />
      </View>
      <Text variant="label" tone="accent" numeric>
        {count}
      </Text>
    </Pressable>
  );
}

export function SignalDot({ size = 8, pulse, style }: { size?: number; pulse?: boolean; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.live }, pulse ? { shadowColor: colors.live, shadowOpacity: 0.8, shadowRadius: 6 } : null, style]} />;
}

export function HeaderIcon({ name, color = colors.textSecondary }: { name: keyof typeof Ionicons.glyphMap; color?: string }) {
  return <Ionicons name={name} size={18} color={color} />;
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.canvas },
  transparent: { backgroundColor: 'transparent', position: 'absolute', left: 0, right: 0, top: 0, zIndex: 10 },
  bar: { height: sizes.topBar, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.x1 },
  side: { minWidth: sizes.touch, flexDirection: 'row', alignItems: 'center' },
  center: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.x2 },
  wordmark: { flexDirection: 'row', alignItems: 'flex-start' },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingLeft: 10, paddingRight: 12, borderRadius: radius.full, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder },
  liveHost: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  liveHalo: { position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: colors.accentGlow },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accentGlow },
});
