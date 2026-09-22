import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, motion, space } from '../../constants/theme';
import { useReduceMotion } from '../../lib/hooks';
import { Drama } from '../../lib/model';
import { Poster } from '../ui/Poster';

interface Props {
  /** Pool to draw from — what's trending, with art. More than `tiles` lets the wall keep changing. */
  dramas: Drama[];
  tiles: number;
  tileWidth: number;
  height: number | `${number}%`;
  style?: StyleProp<ViewStyle>;
  /** Seconds between poster swaps (one tile at a time). */
  swapEvery?: number;
}

const SCRIM_BANDS = 10;

/**
 * The wall behind the first screen: real posters at full brightness, breathing. The whole grid
 * drifts very slowly (a Ken Burns you feel rather than see) and every few seconds one tile
 * cross-fades to another trending title, so the screen is alive and never the same twice. A soft
 * band scrim at the bottom keeps the headline legible without dimming the art. Reduced motion →
 * a still, equally bright wall. Decorative: hidden from screen readers.
 */
export function LivingWall({ dramas, tiles, tileWidth, height, style, swapEvery = 3.4 }: Props) {
  const reduce = useReduceMotion();
  const pool = useMemo(() => {
    const seen = new Set<string>();
    return dramas.filter((d) => (d.posterUrl || d.posterLocal) && !seen.has(d.id) && seen.add(d.id));
  }, [dramas]);
  const [slots, setSlots] = useState<number[]>(() => Array.from({ length: tiles }, (_, i) => i));
  const [incoming, setIncoming] = useState<Record<number, number>>({});
  const fades = useRef(Array.from({ length: tiles }, () => new Animated.Value(1))).current;
  const cursor = useRef(tiles);
  const drift = useRef(new Animated.Value(0)).current;

  // Slow drift of the whole grid.
  useEffect(() => {
    if (reduce) {
      drift.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 16_000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 16_000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, drift]);

  // One tile at a time cross-fades to the next title in the pool.
  useEffect(() => {
    if (reduce || pool.length <= tiles) return;
    let alive = true;
    let busy = new Set<number>();
    const tick = () => {
      if (!alive) return;
      let t = Math.floor(Math.random() * tiles);
      if (busy.has(t)) t = (t + 1) % tiles;
      if (busy.has(t)) return;
      busy.add(t);
      const n = cursor.current % pool.length;
      cursor.current += 1;
      setIncoming((m) => ({ ...m, [t]: n }));
      Animated.timing(fades[t]!, { toValue: 0, duration: motion.slow + 300, easing: Easing.bezier(0.2, 0, 0, 1), useNativeDriver: true }).start(({ finished }) => {
        busy.delete(t);
        if (!finished || !alive) return;
        setSlots((s) => {
          const c = [...s];
          c[t] = n;
          return c;
        });
        setIncoming((m) => {
          const c = { ...m };
          delete c[t];
          return c;
        });
        fades[t]!.setValue(1);
      });
    };
    const id = setInterval(tick, swapEvery * 1000);
    return () => {
      alive = false;
      busy = new Set();
      clearInterval(id);
    };
  }, [pool.length, reduce, tiles, swapEvery, fades]);

  if (!pool.length) return null;
  const at = (i: number) => pool[i % pool.length]!;

  return (
    <View style={[styles.wall, { height }, style]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View
        style={[
          styles.grid,
          {
            transform: [{ translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -22] }) }, { scale: drift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] }) }],
          },
        ]}
      >
        {slots.map((slot, i) => (
          <View key={i} style={{ width: tileWidth, marginTop: i % 2 ? 28 : 0 }}>
            {incoming[i] !== undefined ? <Poster drama={at(incoming[i]!)} width={tileWidth} style={StyleSheet.absoluteFill} /> : null}
            <Animated.View style={{ opacity: fades[i] }}>
              <Poster drama={at(slot)} width={tileWidth} />
            </Animated.View>
          </View>
        ))}
      </Animated.View>
      {/* soft bottom fade into the canvas (banded — no gradient dependency, and it reads as a scrim, not a wash) */}
      <View style={styles.scrim}>
        {Array.from({ length: SCRIM_BANDS }).map((_, i) => (
          <View key={i} style={{ flex: 1, backgroundColor: colors.canvas, opacity: Math.pow((i + 1) / SCRIM_BANDS, 1.6) }} />
        ))}
      </View>
      <View style={styles.tint} />
    </View>
  );
}

const styles = StyleSheet.create({
  wall: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.x2, paddingHorizontal: space.margin, paddingTop: 24 },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%', flexDirection: 'column' },
  // a whisper of black over the art so white type stays readable near the top; never blue, never heavy
  tint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,10,10,0.14)' },
});
