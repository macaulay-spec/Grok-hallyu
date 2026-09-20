import NetInfo from '@react-native-community/netinfo';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, useWindowDimensions } from 'react-native';
import { marginFor, motion, windowClass, WindowClass } from '../constants/theme';
import { useAuth } from './auth';
import * as sel from './selectors';
import { AppState, useStore } from './store';

/** Store + memoised selectors bound to the current state. */
export function useApp() {
  const { state, dispatch, reset, clearPersisted } = useStore();
  const bound = useMemo(() => bind(state), [state]);
  return { state, dispatch, reset, clearPersisted, ...bound };
}

function bind(s: AppState) {
  return {
    me: s.profile,
    getUser: (id: string) => sel.getUser(s, id),
    getUserByHandle: (h: string) => sel.getUserByHandle(s, h),
    getDrama: (id?: string) => sel.getDrama(s, id),
    getActor: (id?: string) => sel.getActor(s, id),
    getPost: (id?: string) => sel.getPost(s, id),
    getCollection: (id?: string) => sel.getCollection(s, id),
    isPostVeiled: (p: Parameters<typeof sel.isPostVeiled>[1]) => sel.isPostVeiled(s, p),
    isCommentVeiled: (c: Parameters<typeof sel.isCommentVeiled>[1], p?: Parameters<typeof sel.isCommentVeiled>[2]) => sel.isCommentVeiled(s, c, p),
    isFollowing: (kind: keyof AppState['follows'], id: string) => s.follows[kind].includes(id),
    watch: (dramaId: string) => s.watchlist[dramaId],
    myReaction: (id: string) => s.reactions[id],
    isSaved: (id: string) => s.saves.includes(id),
    unread: sel.unreadCount(s),
  };
}

/** Requires a member; guests get sent to the auth gate with a reason + return route. */
export function useRequireMember() {
  const auth = useAuth();
  const router = useRouter();
  return useCallback(
    (reason: string, run: () => void) => {
      if (auth.status === 'signedIn') run();
      else router.push({ pathname: '/(auth)/gate', params: { reason } });
    },
    [auth.status, router],
  );
}

export function useNetwork() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sub = NetInfo.addEventListener((st) => setOnline(st.isConnected !== false && st.isInternetReachable !== false));
    return () => sub();
  }, []);
  return online;
}

export function useLayout(): { width: number; height: number; wc: WindowClass; margin: number; isLandscape: boolean; columns: number } {
  const { width, height } = useWindowDimensions();
  const wc = windowClass(width);
  return { width, height, wc, margin: marginFor(width), isLandscape: width > height, columns: wc === 'compact' ? 3 : wc === 'medium' ? 4 : 6 };
}

export function useReduceMotion(pref?: boolean) {
  const [sys, setSys] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setSys).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setSys);
    return () => sub.remove();
  }, []);
  return sys || !!pref;
}

export const haptic = {
  light: () => Platform.OS !== 'web' && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  medium: () => Platform.OS !== 'web' && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
  select: () => Platform.OS !== 'web' && Haptics.selectionAsync().catch(() => {}),
  success: () => Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  error: () => Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
};

export interface Loadable<T> {
  data: T | null;
  loading: boolean;
  /** true only after the skeleton delay elapsed while still loading */
  showSkeleton: boolean;
  error: Error | null;
  reload: () => void;
}

/** Async loader with the 150ms skeleton rule and abort on unmount/deps change. */
export function useLoad<T>(fn: (signal: AbortSignal) => Promise<T>, deps: unknown[], enabled = true): Loadable<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setShowSkeleton(false);
      return;
    }
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setLoading(true);
    setError(null);
    const t = setTimeout(() => !c.signal.aborted && setShowSkeleton(true), motion.skeletonDelay);
    fn(c.signal)
      .then((d) => {
        if (c.signal.aborted) return;
        setData(d);
      })
      .catch((e: unknown) => {
        if (c.signal.aborted) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        clearTimeout(t);
        if (c.signal.aborted) return;
        setLoading(false);
        setShowSkeleton(false);
      });
    return () => {
      clearTimeout(t);
      c.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled]);
  return { data, loading, showSkeleton, error, reload: () => setTick((x) => x + 1) };
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
