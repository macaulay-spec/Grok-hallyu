import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, ViewToken } from 'react-native';

/**
 * Which post's video is allowed to play right now. One per scrolling surface — the list reports
 * viewability, cards read the answer. Without a provider (e.g. a card inside a plain ScrollView)
 * nothing autoplays; the user can still tap to play.
 */
interface Viewport {
  activeId: string | null;
  setActive: (id: string | null) => void;
  /** Screen-level pause (tab blurred, modal open, app backgrounded). */
  paused: boolean;
}

const Ctx = createContext<Viewport | null>(null);

export function FeedViewportProvider({ children, paused = false }: { children: React.ReactNode; paused?: boolean }) {
  const [activeId, setActive] = useState<string | null>(null);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => setForeground(st === 'active'));
    return () => sub.remove();
  }, []);
  const value = useMemo(() => ({ activeId, setActive, paused: paused || !foreground }), [activeId, paused, foreground]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFeedViewport(): Viewport | null {
  return useContext(Ctx);
}

/** Session memory for the speaker button: like X, un-muting one video un-mutes the next. */
let sessionMuted = true;
const muteListeners = new Set<(m: boolean) => void>();
export const feedSound = {
  get muted() {
    return sessionMuted;
  },
  set(muted: boolean) {
    sessionMuted = muted;
    muteListeners.forEach((l) => l(muted));
  },
  subscribe(l: (m: boolean) => void) {
    muteListeners.add(l);
    return () => {
      muteListeners.delete(l);
    };
  },
};

/**
 * FlatList glue: hands the list `viewabilityConfig` + `onViewableItemsChanged`, picks the topmost
 * sufficiently visible video item and makes it the active one. `getVideoId` returns the post id for
 * rows that carry a video, or null for anything else.
 */
export function useViewabilityTracker<T>(getVideoId: (item: T) => string | null) {
  const vp = useFeedViewport();
  const setActive = vp?.setActive;
  const last = useRef<string | null>(null);
  const getter = useRef(getVideoId);
  getter.current = getVideoId;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.map((v) => (v.isViewable ? getter.current(v.item as T) : null)).find((id): id is string => !!id) ?? null;
    if (first !== last.current) {
      last.current = first;
      setActive?.(first);
    }
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 55, minimumViewTime: 120 }).current;
  const reset = useCallback(() => {
    last.current = null;
    setActive?.(null);
  }, [setActive]);
  return { onViewableItemsChanged, viewabilityConfig, reset };
}

type TrackerProps = ReturnType<typeof useViewabilityTracker>;

function FeedAutoplayInner<T>({ getVideoId, children }: { getVideoId: (item: T) => string | null; children: (tracker: TrackerProps) => React.ReactNode }) {
  const tracker = useViewabilityTracker<T>(getVideoId);
  return <>{children(tracker)}</>;
}

/**
 * Drop-in autoplay for any list of posts: wraps children in a viewport provider and hands the list
 * its viewability props. `getVideoId` maps a row to the post id when the row carries a video.
 *
 *   <FeedAutoplay<Post> getVideoId={(p) => (p.video ? p.id : null)}>
 *     {(vp) => <FlatList {...vp} data={posts} … />}
 *   </FeedAutoplay>
 */
export function FeedAutoplay<T>({ getVideoId, paused, children }: { getVideoId: (item: T) => string | null; paused?: boolean; children: (tracker: TrackerProps) => React.ReactNode }) {
  return (
    <FeedViewportProvider paused={paused}>
      <FeedAutoplayInner<T> getVideoId={getVideoId}>{children}</FeedAutoplayInner>
    </FeedViewportProvider>
  );
}
