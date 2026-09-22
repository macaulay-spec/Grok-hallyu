import React, { useEffect, useRef } from 'react';
import { Animated, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius as R, space } from '../../constants/theme';

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  circle?: boolean;
}

/** Shimmer-free skeleton: a slow opacity breath (1.6s) — calmer on OLED and reduced-motion friendly. */
export function Skeleton({ width = '100%', height = 16, radius = R.sm, style, circle }: SkeletonProps) {
  const a = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(a, { toValue: 0.55, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [a]);
  return <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ width, height, borderRadius: circle ? 999 : radius, backgroundColor: colors.skeleton, opacity: a }, style]} />;
}

export function SkeletonLines({ lines = 3, widths }: { lines?: number; widths?: (number | `${number}%`)[] }) {
  return (
    <View style={{ gap: space.x2 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={14} width={widths?.[i] ?? (i === lines - 1 ? '60%' : '100%')} />
      ))}
    </View>
  );
}

export function PostSkeleton() {
  return (
    <View style={styles.post}>
      <View style={styles.row}>
        <Skeleton circle width={40} height={40} />
        <View style={{ flex: 1, gap: 6 }}>
          <Skeleton width="45%" height={14} />
          <Skeleton width="30%" height={12} />
        </View>
      </View>
      <SkeletonLines lines={3} />
      <View style={styles.row}>
        <Skeleton width={72} height={28} radius={14} />
        <Skeleton width={72} height={28} radius={14} />
      </View>
    </View>
  );
}

export function PosterRowSkeleton({ count = 4, width = 104 }: { count?: number; width?: number }) {
  return (
    <View style={[styles.row, { paddingHorizontal: space.margin }]}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ gap: 8 }}>
          <Skeleton width={width} height={width * 1.5} radius={R.sm} />
          <Skeleton width={width * 0.8} height={12} />
        </View>
      ))}
    </View>
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <View style={{ gap: space.x4, padding: space.margin }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.row}>
          <Skeleton circle width={44} height={44} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width="60%" height={14} />
            <Skeleton width="40%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  post: { padding: space.margin, gap: space.x3, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.x3 },
});
