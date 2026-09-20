import { useEffect, useRef } from 'react';
import { Animated, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useReduceMotion } from './hooks';

/**
 * Motion primitives shared by the whole app.
 * Springs are used for anything the finger drives (presses, sheets, bars); timings for state changes.
 * Every consumer must fall back to fades when `useReduceMotion()` is true.
 */
export const springs = {
  /** press release, chips, reaction glyphs */
  snappy: { damping: 18, stiffness: 320, mass: 0.6, useNativeDriver: true } as const,
  /** sheets, bars, cards settling */
  gentle: { damping: 22, stiffness: 240, mass: 0.9, useNativeDriver: true } as const,
  /** hero poster / celebratory */
  bouncy: { damping: 12, stiffness: 200, mass: 0.8, useNativeDriver: true } as const,
};

/** Convert a hex colour to rgba with the given alpha — used for poster-lit washes and tints. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full.slice(0, 6), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}

/** Lift a dark tone towards light by `amount` (0–1) — gives a poster tone a readable "glow" variant. */
export function lift(hex: string, amount: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.slice(0, 6), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Animated scroll position for parallax heroes and collapsing bars (native driver, 16ms throttle). */
export function useScrollY() {
  const scrollY = useRef(new Animated.Value(0)).current;
  const onScroll = useRef(Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })).current;
  return { scrollY, onScroll };
}

/**
 * Interpolations for a hero that collapses into a top bar.
 * `fadeAt` is the scroll offset at which the bar becomes solid and the title appears.
 */
export function heroInterpolations(scrollY: Animated.Value, heroHeight: number, fadeAt = heroHeight - 120) {
  const clampedFade = Math.max(40, fadeAt);
  return {
    /** hero image moves at half speed and stretches on overscroll */
    parallax: scrollY.interpolate({ inputRange: [-heroHeight, 0, heroHeight], outputRange: [-heroHeight / 2, 0, heroHeight * 0.5], extrapolate: 'clamp' }),
    stretch: scrollY.interpolate({ inputRange: [-heroHeight, 0], outputRange: [2, 1], extrapolateRight: 'clamp' }),
    heroFade: scrollY.interpolate({ inputRange: [0, clampedFade], outputRange: [1, 0.35], extrapolate: 'clamp' }),
    /** the bar background and its title */
    barOpacity: scrollY.interpolate({ inputRange: [clampedFade - 40, clampedFade], outputRange: [0, 1], extrapolate: 'clamp' }),
    titleOpacity: scrollY.interpolate({ inputRange: [clampedFade - 10, clampedFade + 30], outputRange: [0, 1], extrapolate: 'clamp' }),
    titleRise: scrollY.interpolate({ inputRange: [clampedFade - 10, clampedFade + 30], outputRange: [8, 0], extrapolate: 'clamp' }),
  };
}

export type ScrollHandler = (e: NativeSyntheticEvent<NativeScrollEvent>) => void;

/**
 * Arrival animation for hero content: rises 14px and settles with a spring, staggered by `delay` ms.
 * Returns an animated style. Reduced motion → static (opacity 1, no transform).
 */
export function useArrive(delay = 0, enabled = true) {
  const reduce = useReduceMotion();
  const a = useRef(new Animated.Value(reduce || !enabled ? 1 : 0)).current;
  useEffect(() => {
    if (reduce || !enabled) {
      a.setValue(1);
      return;
    }
    a.setValue(0);
    Animated.spring(a, { toValue: 1, delay, ...springs.gentle }).start();
  }, [a, delay, enabled, reduce]);
  return {
    opacity: a,
    transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }, { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
  };
}
