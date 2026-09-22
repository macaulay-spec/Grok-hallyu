import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useReduceMotion } from '../../lib/hooks';
import { ReactionCounts, ReactionKind, REACTIONS } from '../../lib/model';
import { ReactionGlyph } from './Reactions';

interface Floater {
  id: number;
  kind: ReactionKind;
  x: number;
  progress: Animated.Value;
}

/**
 * Live-room ambience: reaction glyphs drift up from the bottom-right while an episode room is live,
 * weighted by how the room actually feels (the reaction meter). Silent, never more than six at once,
 * and off entirely under reduced motion.
 */
export function LiveReactions({ counts, active, style }: { counts: ReactionCounts; active: boolean; style?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion();
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    if (!active || reduce) return;
    let alive = true;
    const weights = REACTIONS.map((r) => Math.max(1, counts[r.kind]));
    const total = weights.reduce((a, b) => a + b, 0);
    const pick = (): ReactionKind => {
      let n = Math.random() * total;
      for (let i = 0; i < REACTIONS.length; i++) {
        n -= weights[i]!;
        if (n <= 0) return REACTIONS[i]!.kind;
      }
      return 'loved';
    };
    let timer: ReturnType<typeof setTimeout>;
    const spawn = () => {
      if (!alive) return;
      const f: Floater = { id: ++seq.current, kind: pick(), x: Math.random() * 36 - 18, progress: new Animated.Value(0) };
      setFloaters((cur) => [...cur.slice(-5), f]);
      Animated.timing(f.progress, { toValue: 1, duration: 1800, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
        if (alive) setFloaters((cur) => cur.filter((x) => x.id !== f.id));
      });
      timer = setTimeout(spawn, 700 + Math.random() * 900);
    };
    timer = setTimeout(spawn, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [active, reduce, counts]);

  if (!active || reduce) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {floaters.map((f) => (
        <Animated.View
          key={f.id}
          style={{
            position: 'absolute',
            right: 12 + f.x,
            bottom: 0,
            opacity: f.progress.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 0.6, 0] }),
            transform: [
              { translateY: f.progress.interpolate({ inputRange: [0, 1], outputRange: [0, -150] }) },
              { translateX: f.progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, f.x / 2, -f.x] }) },
              { scale: f.progress.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.6, 1.1, 0.9] }) },
            ],
          }}
        >
          <ReactionGlyph kind={f.kind} size={22} active />
        </Animated.View>
      ))}
    </View>
  );
}

/** The Signal, breathing: 1600ms pulse while live; static under reduced motion. */
export function LivePulse({ size = 8, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion();
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(Animated.sequence([Animated.timing(a, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }), Animated.timing(a, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [a, reduce]);
  return (
    <View style={[{ width: size * 3, height: size * 3, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Animated.View style={{ position: 'absolute', width: size * 3, height: size * 3, borderRadius: size * 1.5, backgroundColor: '#E11D48', opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] }), transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#E11D48' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 0, bottom: 0, width: 80, height: 200 },
});
