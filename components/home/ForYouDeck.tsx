import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Poster } from '../ui/Poster';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { space } from '../../constants/theme';
import { haptic, useApp, useLayout, useReduceMotion, useRequireMember } from '../../lib/hooks';
import { Drama } from '../../lib/model';

export interface DeckEntry {
  drama: Drama;
  reason?: string;
}

interface ForYouDeckProps {
  items: DeckEntry[];
  style?: StyleProp<ViewStyle>;
}

const DEPTH = 3;
const EXIT_MS = 260;

/**
 * Spec 4.5E — the For You deck. Swipe right → saved to your watchlist, left → not for me.
 * Three cards deep, each offset 8px and scaled 4%; the top card flies out with --ease-exit.
 */
export function ForYouDeck({ items, style }: ForYouDeckProps) {
  const { width, margin } = useLayout();
  const { dispatch } = useApp();
  const require = useRequireMember();
  const toast = useToast();
  const reduce = useReduceMotion();
  const [index, setIndex] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const cardW = Math.min(width - margin * 2, 420);

  const visible = useMemo(() => items.slice(index, index + DEPTH), [items, index]);
  const topRef = useRef<DeckEntry | undefined>(undefined);
  topRef.current = visible[0];

  useEffect(() => {
    x.setValue(0);
  }, [index, x]);

  const decide = (dir: 1 | -1, drama: Drama) => {
    if (dir === 1) {
      require('save to your watchlist', () => {
        haptic.light();
        dispatch({ type: 'watch', dramaId: drama.id, status: 'watching' });
        toast.show({ message: `${drama.title} saved to your watchlist`, icon: 'checkmark-circle', tone: 'success' });
      });
    } else {
      haptic.select();
    }
    if (reduce) {
      setIndex((i) => i + 1);
      return;
    }
    Animated.timing(x, { toValue: dir * cardW * 1.15, duration: EXIT_MS, easing: Easing.bezier(0.7, 0, 0.84, 0), useNativeDriver: true }).start(() => {
      setIndex((i) => i + 1);
    });
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
      onPanResponderMove: (_e, g) => x.setValue(g.dx),
      onPanResponderRelease: (_e, g) => {
        const top = topRef.current;
        if (!top) return;
        if (g.dx > 110) decide(1, top.drama);
        else if (g.dx < -110) decide(-1, top.drama);
        else Animated.spring(x, { toValue: 0, useNativeDriver: true, friction: 6, tension: 180 }).start();
      },
      onPanResponderTerminate: () => x.setValue(0),
    }),
  ).current;

  if (!items.length) return null;

  if (index >= items.length) {
    return (
      <View style={[styles.exhausted, style]}>
        <Text variant="bodySmall" tone="secondary">
          You’ve been through today’s deck — Explore has more.
        </Text>
      </View>
    );
  }

  return (
    <View style={style}>
      {visible
        .map((entry, depth) => {
          const isTop = depth === 0;
          const transform = isTop
            ? [{ translateX: x }, { rotate: x.interpolate({ inputRange: [-cardW, cardW], outputRange: ['-8deg', '8deg'] }) }]
            : [{ translateY: depth * 8 }, { scale: 1 - depth * 0.04 }];
          return (
            <Animated.View
              key={entry.drama.id}
              pointerEvents={isTop ? 'auto' : 'none'}
              {...(isTop ? pan.panHandlers : {})}
              style={[(isTop ? styles.cardHost : styles.cardBehind), { width: cardW, alignSelf: 'center', transform, opacity: depth === DEPTH - 1 ? 0.6 : 1 }]}
            >
              <Poster drama={entry.drama} width={cardW} />
              {isTop ? (
                <View style={styles.under}>
                  {entry.reason ? (
                    <Text variant="body" tone="secondary" numberOfLines={2}>
                      {entry.reason}
                    </Text>
                  ) : null}
                  <View style={styles.actions}>
                    <Button label="Not for me" variant="ghost" size="sm" onPress={() => decide(-1, entry.drama)} style={{ flex: 1 }} />
                    <Button label="Save" size="sm" onPress={() => decide(1, entry.drama)} style={{ flex: 1 }} />
                  </View>
                </View>
              ) : null}
            </Animated.View>
          );
        })
        .reverse()}
    </View>
  );
}

const styles = StyleSheet.create({
  cardHost: {},
  cardBehind: { position: 'absolute', top: 0 },
  under: { gap: space.x3, paddingTop: space.x3 },
  actions: { flexDirection: 'row', gap: space.x2 },
  exhausted: { alignItems: 'center', paddingVertical: space.x6 },
});
