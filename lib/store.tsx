import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { uid } from './format';
import {
  Actor,
  Collection,
  Comment,
  Draft,
  Drama,
  Notification,
  NotificationGroup,
  Post,
  ReactionCounts,
  ReactionKind,
  SpoilerProtection,
  User,
  WatchStatus,
  WatchlistItem,
} from './model';
import * as seed from './seed';

const STORAGE_KEY = 'hallyu.state.v3';
const SEED_VERSION = 3;

export type Intent = 'discuss' | 'track' | 'discover' | 'reactions' | 'people' | 'actors';

export interface Prefs {
  protection: SpoilerProtection;
  autoplay: 'always' | 'wifi' | 'never';
  oneTapReactions: boolean;
  mutedWords: string[];
  trueBlack: boolean;
  personalization: boolean;
  reduceMotion: boolean;
  notifications: { episodes: boolean; social: boolean; highlights: boolean; system: boolean; quietHours: boolean };
  language: 'en' | 'ko';
  guidelinesAccepted: boolean;
  dataSaver: boolean;
}

export interface AppState {
  hydrated: boolean;
  seedVersion: number;
  onboarding: { done: boolean; step: number; intent?: Intent; genres: string[] };
  prefs: Prefs;
  profile: User;
  follows: { users: string[]; dramas: string[]; actors: string[]; collections: string[] };
  dramaNotify: Record<string, boolean>;
  watchlist: Record<string, WatchlistItem>;
  reactions: Record<string, ReactionKind>;
  saves: string[];
  revealed: Record<string, true>;
  posts: Post[];
  comments: Comment[];
  collections: Collection[];
  notifications: Notification[];
  drafts: Draft[];
  blockedUsers: string[];
  mutedUsers: string[];
  mutedDramas: string[];
  reported: string[];
  recentSearches: string[];
  importedDramas: Drama[];
  importedActors: Actor[];
  lastSeenActivity: string;
}

const defaultPrefs: Prefs = {
  protection: 'balanced',
  autoplay: 'wifi',
  oneTapReactions: true,
  mutedWords: [],
  trueBlack: false,
  personalization: true,
  reduceMotion: false,
  notifications: { episodes: true, social: true, highlights: true, system: true, quietHours: false },
  guidelinesAccepted: false,
  dataSaver: false,
  language: 'en',
};

function initialState(): AppState {
  return {
    hydrated: false,
    seedVersion: SEED_VERSION,
    onboarding: { done: true, step: 0, intent: 'discuss', genres: ['Romance', 'Slice of life', 'Fantasy'] },
    prefs: defaultPrefs,
    profile: seed.USERS[0]!,
    follows: { users: [...seed.FOLLOWED_USERS], dramas: [...seed.FOLLOWED_DRAMAS], actors: [...seed.FOLLOWED_ACTORS], collections: [...seed.FOLLOWED_COLLECTIONS] },
    dramaNotify: { 'a-love-other-than-yours': true, 'made-in-korea': true },
    watchlist: Object.fromEntries(seed.WATCHLIST.map((w) => [w.dramaId, w])),
    reactions: { ...seed.MY_REACTIONS },
    saves: [...seed.SAVED_POSTS],
    revealed: {},
    posts: seed.POSTS,
    comments: seed.COMMENTS,
    collections: seed.COLLECTIONS,
    notifications: seed.NOTIFICATIONS,
    drafts: [],
    blockedUsers: [],
    mutedUsers: [],
    mutedDramas: [],
    reported: [],
    recentSearches: ['Kim Tae-ri', 'enemies to lovers'],
    importedDramas: [],
    importedActors: [],
    lastSeenActivity: new Date(0).toISOString(),
  };
}

/** A brand-new member (after sign-up) starts empty: this is what the first-run states are designed for. */
export function freshMemberState(profile: User): AppState {
  return {
    ...initialState(),
    hydrated: true,
    onboarding: { done: false, step: 0, genres: [] },
    profile,
    follows: { users: [], dramas: [], actors: [], collections: [] },
    dramaNotify: {},
    watchlist: {},
    reactions: {},
    saves: [],
    notifications: seed.NOTIFICATIONS.filter((n) => n.group === 'system'),
    recentSearches: [],
  };
}

export const GUEST_ID = 'guest';

/** Guests browse the public world with no personal layer: nothing followed, nothing tracked, nothing unread. */
export function guestState(): AppState {
  return {
    ...freshMemberState({ id: GUEST_ID, handle: 'guest', displayName: 'Guest', favoriteGenres: [], favoriteDramaIds: [], followers: 0, following: 0, joinedAt: new Date().toISOString() }),
    onboarding: { done: true, step: 0, genres: [] },
    notifications: [],
  };
}

/** The demo member's rich, seeded world. */
export function demoState(): AppState {
  return { ...initialState(), hydrated: true };
}

type Action =
  | { type: 'hydrate'; state: Partial<AppState> }
  | { type: 'replace'; state: AppState }
  | { type: 'onboarding'; patch: Partial<AppState['onboarding']> }
  | { type: 'prefs'; patch: Partial<Prefs> }
  | { type: 'profile'; patch: Partial<User> }
  | { type: 'follow'; kind: keyof AppState['follows']; id: string; on?: boolean }
  | { type: 'dramaNotify'; id: string; on: boolean }
  | { type: 'watch'; dramaId: string; status: WatchStatus | null; season?: number }
  | { type: 'progress'; dramaId: string; season: number; episode: number; total: number }
  | { type: 'note'; dramaId: string; note: string }
  | { type: 'react'; targetId: string; kind: ReactionKind | null; isComment?: boolean }
  | { type: 'save'; postId: string }
  | { type: 'reveal'; id: string }
  | { type: 'addPost'; post: Post }
  | { type: 'editPost'; id: string; patch: Partial<Post> }
  | { type: 'deletePost'; id: string }
  | { type: 'addComment'; comment: Comment }
  | { type: 'deleteComment'; id: string }
  | { type: 'upsertCollection'; collection: Collection }
  | { type: 'deleteCollection'; id: string }
  | { type: 'collectionItem'; collectionId: string; dramaId: string; on: boolean; note?: string }
  | { type: 'readNotifications'; group?: NotificationGroup | 'all'; id?: string }
  | { type: 'draft'; draft: Draft }
  | { type: 'deleteDraft'; id: string }
  | { type: 'block'; userId: string; on: boolean }
  | { type: 'muteUser'; userId: string; on: boolean }
  | { type: 'muteDrama'; dramaId: string; on: boolean }
  | { type: 'report'; id: string }
  | { type: 'recentSearch'; q?: string; clear?: boolean }
  | { type: 'import'; dramas?: Drama[]; actors?: Actor[] }
  | { type: 'seenActivity' };

function toggle(list: string[], id: string, on?: boolean): string[] {
  const has = list.includes(id);
  const want = on ?? !has;
  if (want && !has) return [...list, id];
  if (!want && has) return list.filter((x) => x !== id);
  return list;
}

function bump(counts: ReactionCounts, kind: ReactionKind, delta: number): ReactionCounts {
  return { ...counts, [kind]: Math.max(0, counts[kind] + delta) };
}

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'hydrate':
      return { ...s, ...a.state, hydrated: true };
    case 'replace':
      return { ...a.state, hydrated: true };
    case 'onboarding':
      return { ...s, onboarding: { ...s.onboarding, ...a.patch } };
    case 'prefs':
      return { ...s, prefs: { ...s.prefs, ...a.patch } };
    case 'profile':
      return { ...s, profile: { ...s.profile, ...a.patch } };
    case 'follow':
      return { ...s, follows: { ...s.follows, [a.kind]: toggle(s.follows[a.kind], a.id, a.on) } };
    case 'dramaNotify':
      return { ...s, dramaNotify: { ...s.dramaNotify, [a.id]: a.on } };
    case 'watch': {
      const nowIso = new Date().toISOString();
      const next = { ...s.watchlist };
      if (a.status === null) {
        delete next[a.dramaId];
        return { ...s, watchlist: next };
      }
      const prev = next[a.dramaId];
      const drama = allDramas(s).find((d) => d.id === a.dramaId);
      const season = a.season ?? prev?.season ?? 1;
      const total = drama?.seasons.find((x) => x.number === season)?.episodeCount ?? drama?.episodeCount ?? 0;
      next[a.dramaId] = {
        dramaId: a.dramaId,
        season,
        currentEpisode: a.status === 'completed' ? total : a.status === 'want' ? 0 : prev?.currentEpisode ?? 0,
        note: prev?.note,
        addedAt: prev?.addedAt ?? nowIso,
        updatedAt: nowIso,
        completedAt: a.status === 'completed' ? nowIso : undefined,
        status: a.status,
      };
      return { ...s, watchlist: next, follows: { ...s.follows, dramas: toggle(s.follows.dramas, a.dramaId, true) } };
    }
    case 'progress': {
      const nowIso = new Date().toISOString();
      const prev = s.watchlist[a.dramaId];
      const episode = Math.max(0, Math.min(a.total, a.episode));
      const completed = a.total > 0 && episode >= a.total;
      const item: WatchlistItem = {
        dramaId: a.dramaId,
        season: a.season,
        currentEpisode: episode,
        note: prev?.note,
        addedAt: prev?.addedAt ?? nowIso,
        updatedAt: nowIso,
        status: completed ? 'completed' : 'watching',
        completedAt: completed ? nowIso : undefined,
      };
      return { ...s, watchlist: { ...s.watchlist, [a.dramaId]: item }, follows: { ...s.follows, dramas: toggle(s.follows.dramas, a.dramaId, true) } };
    }
    case 'note': {
      const prev = s.watchlist[a.dramaId];
      if (!prev) return s;
      return { ...s, watchlist: { ...s.watchlist, [a.dramaId]: { ...prev, note: a.note, updatedAt: new Date().toISOString() } } };
    }
    case 'react': {
      const prevKind = s.reactions[a.targetId];
      const reactions = { ...s.reactions };
      if (a.kind) reactions[a.targetId] = a.kind;
      else delete reactions[a.targetId];
      const apply = <T extends { id: string; reactions: ReactionCounts }>(items: T[]): T[] =>
        items.map((it) => {
          if (it.id !== a.targetId) return it;
          let c = it.reactions;
          if (prevKind) c = bump(c, prevKind, -1);
          if (a.kind) c = bump(c, a.kind, 1);
          return { ...it, reactions: c };
        });
      return { ...s, reactions, posts: a.isComment ? s.posts : apply(s.posts), comments: a.isComment ? apply(s.comments) : s.comments };
    }
    case 'save': {
      const on = !s.saves.includes(a.postId);
      return {
        ...s,
        saves: toggle(s.saves, a.postId),
        posts: s.posts.map((p) => (p.id === a.postId ? { ...p, saveCount: Math.max(0, p.saveCount + (on ? 1 : -1)) } : p)),
      };
    }
    case 'reveal':
      return { ...s, revealed: { ...s.revealed, [a.id]: true } };
    case 'addPost':
      return { ...s, posts: [a.post, ...s.posts] };
    case 'editPost':
      return { ...s, posts: s.posts.map((p) => (p.id === a.id ? { ...p, ...a.patch, editedAt: new Date().toISOString() } : p)) };
    case 'deletePost':
      return { ...s, posts: s.posts.map((p) => (p.id === a.id ? { ...p, state: 'deleted' } : p)) };
    case 'addComment':
      return {
        ...s,
        comments: [...s.comments, a.comment],
        posts: s.posts.map((p) => (p.id === a.comment.postId ? { ...p, commentCount: p.commentCount + 1 } : p)),
      };
    case 'deleteComment': {
      const c = s.comments.find((x) => x.id === a.id);
      return {
        ...s,
        comments: s.comments.map((x) => (x.id === a.id ? { ...x, state: 'deleted' } : x)),
        posts: c ? s.posts.map((p) => (p.id === c.postId ? { ...p, commentCount: Math.max(0, p.commentCount - 1) } : p)) : s.posts,
      };
    }
    case 'upsertCollection': {
      const exists = s.collections.some((c) => c.id === a.collection.id);
      return { ...s, collections: exists ? s.collections.map((c) => (c.id === a.collection.id ? a.collection : c)) : [a.collection, ...s.collections] };
    }
    case 'deleteCollection':
      return { ...s, collections: s.collections.filter((c) => c.id !== a.id) };
    case 'collectionItem':
      return {
        ...s,
        collections: s.collections.map((c) => {
          if (c.id !== a.collectionId) return c;
          const has = c.items.some((i) => i.dramaId === a.dramaId);
          const items = a.on
            ? has
              ? c.items.map((i) => (i.dramaId === a.dramaId ? { ...i, note: a.note ?? i.note } : i))
              : [...c.items, { dramaId: a.dramaId, note: a.note, addedAt: new Date().toISOString() }]
            : c.items.filter((i) => i.dramaId !== a.dramaId);
          return { ...c, items, updatedAt: new Date().toISOString() };
        }),
      };
    case 'readNotifications':
      return {
        ...s,
        notifications: s.notifications.map((n) => (a.id ? (n.id === a.id ? { ...n, read: true } : n) : !a.group || a.group === 'all' || n.group === a.group ? { ...n, read: true } : n)),
      };
    case 'draft': {
      const exists = s.drafts.some((d) => d.id === a.draft.id);
      return { ...s, drafts: exists ? s.drafts.map((d) => (d.id === a.draft.id ? a.draft : d)) : [a.draft, ...s.drafts] };
    }
    case 'deleteDraft':
      return { ...s, drafts: s.drafts.filter((d) => d.id !== a.id) };
    case 'block':
      return { ...s, blockedUsers: toggle(s.blockedUsers, a.userId, a.on), follows: { ...s.follows, users: a.on ? s.follows.users.filter((u) => u !== a.userId) : s.follows.users } };
    case 'muteUser':
      return { ...s, mutedUsers: toggle(s.mutedUsers, a.userId, a.on) };
    case 'muteDrama':
      return { ...s, mutedDramas: toggle(s.mutedDramas, a.dramaId, a.on) };
    case 'report':
      return { ...s, reported: toggle(s.reported, a.id, true) };
    case 'recentSearch':
      if (a.clear) return { ...s, recentSearches: [] };
      if (!a.q) return s;
      return { ...s, recentSearches: [a.q, ...s.recentSearches.filter((x) => x !== a.q)].slice(0, 8) };
    case 'import': {
      const dramas = a.dramas ? [...s.importedDramas.filter((d) => !a.dramas!.some((n) => n.id === d.id)), ...a.dramas] : s.importedDramas;
      const actors = a.actors ? [...s.importedActors.filter((d) => !a.actors!.some((n) => n.id === d.id)), ...a.actors] : s.importedActors;
      return { ...s, importedDramas: dramas, importedActors: actors };
    }
    case 'seenActivity':
      return { ...s, lastSeenActivity: new Date().toISOString() };
    default:
      return s;
  }
}

export function allDramas(s: Pick<AppState, 'importedDramas'>): Drama[] {
  return s.importedDramas.length ? [...seed.DRAMAS, ...s.importedDramas] : seed.DRAMAS;
}
export function allActors(s: Pick<AppState, 'importedActors'>): Actor[] {
  return s.importedActors.length ? [...seed.ACTORS, ...s.importedActors] : seed.ACTORS;
}

interface StoreValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  /** Replace the whole persisted state (used by auth on sign-up / sign-out) */
  reset: (next: AppState) => void;
  clearPersisted: () => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

const PERSISTED_KEYS: (keyof AppState)[] = [
  'seedVersion',
  'onboarding',
  'prefs',
  'profile',
  'follows',
  'dramaNotify',
  'watchlist',
  'reactions',
  'saves',
  'revealed',
  'posts',
  'comments',
  'collections',
  'notifications',
  'drafts',
  'blockedUsers',
  'mutedUsers',
  'mutedDramas',
  'reported',
  'recentSearches',
  'importedDramas',
  'importedActors',
  'lastSeenActivity',
];

/** Posts with local `require()` images cannot be serialised; keep seed posts by reference and only persist user-made content. */
function serialise(s: AppState): string {
  const seedPostIds = new Set(seed.POSTS.map((p) => p.id));
  const out: Record<string, unknown> = {};
  for (const k of PERSISTED_KEYS) out[k] = s[k];
  out.posts = s.posts.filter((p) => !seedPostIds.has(p.id) || p.state === 'deleted' || p.editedAt).map((p) => ({ ...p, images: p.images?.filter((i) => typeof i === 'string') }));
  out.postCounters = Object.fromEntries(s.posts.filter((p) => seedPostIds.has(p.id)).map((p) => [p.id, { reactions: p.reactions, commentCount: p.commentCount, saveCount: p.saveCount }]));
  const seedCommentIds = new Set(seed.COMMENTS.map((c) => c.id));
  out.comments = s.comments.filter((c) => !seedCommentIds.has(c.id) || c.state === 'deleted');
  out.commentCounters = Object.fromEntries(s.comments.filter((c) => seedCommentIds.has(c.id)).map((c) => [c.id, c.reactions]));
  return JSON.stringify(out);
}

function deserialise(raw: string): Partial<AppState> | null {
  try {
    const data = JSON.parse(raw) as Record<string, any>;
    if (data.seedVersion !== SEED_VERSION) return null;
    const userPosts = (data.posts ?? []) as Post[];
    const counters = (data.postCounters ?? {}) as Record<string, Partial<Post>>;
    const deleted = new Set(userPosts.filter((p) => p.state === 'deleted').map((p) => p.id));
    const edited = new Map(userPosts.filter((p) => p.editedAt).map((p) => [p.id, p]));
    const seedPosts = seed.POSTS.map((p) => ({ ...p, ...(counters[p.id] ?? {}), ...(edited.get(p.id) ? { body: edited.get(p.id)!.body, title: edited.get(p.id)!.title, editedAt: edited.get(p.id)!.editedAt, spoiler: edited.get(p.id)!.spoiler } : {}), ...(deleted.has(p.id) ? { state: 'deleted' as const } : {}) }));
    const fresh = userPosts.filter((p) => !seed.POSTS.some((sp) => sp.id === p.id));
    const posts = [...fresh, ...seedPosts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const userComments = (data.comments ?? []) as Comment[];
    const cCounters = (data.commentCounters ?? {}) as Record<string, ReactionCounts>;
    const deletedC = new Set(userComments.filter((c) => c.state === 'deleted').map((c) => c.id));
    const comments = [...seed.COMMENTS.map((c) => ({ ...c, reactions: cCounters[c.id] ?? c.reactions, ...(deletedC.has(c.id) ? { state: 'deleted' as const } : {}) })), ...userComments.filter((c) => !seed.COMMENTS.some((sc) => sc.id === c.id))];
    const { postCounters: _pc, commentCounters: _cc, ...rest } = data;
    return { ...rest, posts, comments } as Partial<AppState>;
  } catch {
    return null;
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipPersist = useRef(true);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!alive) return;
        const parsed = raw ? deserialise(raw) : null;
        dispatch({ type: 'hydrate', state: parsed ?? {} });
      })
      .catch(() => dispatch({ type: 'hydrate', state: {} }))
      .finally(() => {
        skipPersist.current = false;
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!state.hydrated || skipPersist.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEY, serialise(state)).catch(() => {});
    }, 400);
  }, [state]);

  const reset = useCallback((next: AppState) => dispatch({ type: 'replace', state: next }), []);
  const clearPersisted = useCallback(() => AsyncStorage.removeItem(STORAGE_KEY), []);

  const value = useMemo(() => ({ state, dispatch, reset, clearPersisted }), [state, reset, clearPersisted]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useStore must be used inside StoreProvider');
  return v;
}

/** Convenience: a fresh Post skeleton authored by me. */
export function newPost(authorId: string, partial: Partial<Post> & Pick<Post, 'type' | 'body'>): Post {
  return {
    id: uid('p'),
    authorId,
    createdAt: new Date().toISOString(),
    spoiler: 'none',
    context: {},
    hashtags: [],
    mentions: [],
    reactions: { loved: 0, cried: 0, screamed: 0, swooned: 0, laughed: 0, furious: 0 },
    commentCount: 0,
    saveCount: 0,
    shareCount: 0,
    ...partial,
  };
}

export { initialState, reducer };
