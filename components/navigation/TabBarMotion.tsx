import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import { Animated, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useReduceMotion } from '../../lib/hooks';
import { springs } from '../../lib/motion';

type Handler = (e: NativeSyntheticEvent<NativeScrollEvent>) => void;

interface TabBarMotion {
  /** 0 = shown, 1 = hidden */
  hidden: Animated.Value;
  /** attach to the main vertical list of a tab screen */
  onScroll: Handler;
  reveal: () => void;
}

const noop: Handler = () => {};
const Ctx = createContext<TabBarMotion | null>(null);

/**
 * The tab bar slides away while you read (scroll down) and returns the moment you scroll up,
 * reach the top or the end, or switch tabs. Reduced motion pins it.
 */
export function TabBarMotionProvider({ children }: { children: React.ReactNode }) {
  const hidden = useRef(new Animated.Value(0)).current;
  const target = useRef(0);
  const lastY = useRef(0);
  const reduce = useReduceMotion();

  const set = useCallback(
    (to: 0 | 1) => {
      if (target.current === to) return;
      target.current = to;
      Animated.spring(hidden, { toValue: to, ...springs.gentle }).start();
    },
    [hidden],
  );

  const onScroll = useCallback<Handler>(
    (e) => {
      if (reduce) return;
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const y = contentOffset.y;
      const max = contentSize.height - layoutMeasurement.height;
      const dy = y - lastY.current;
      lastY.current = y;
      if (max < 200) return set(0); // nothing to hide behind
      if (y <= 24 || y >= max - 24) return set(0);
      if (dy > 10) set(1);
      else if (dy < -10) set(0);
    },
    [reduce, set],
  );

  const value = useMemo(() => ({ hidden, onScroll, reveal: () => set(0) }), [hidden, onScroll, set]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Safe outside the tabs too: returns a no-op handler so shared components don't need to care. */
export function useTabBarMotion(): TabBarMotion {
  const ctx = useContext(Ctx);
  const fallback = useRef<TabBarMotion | null>(null);
  if (ctx) return ctx;
  if (!fallback.current) fallback.current = { hidden: new Animated.Value(0), onScroll: noop, reveal: () => {} };
  return fallback.current;
}
