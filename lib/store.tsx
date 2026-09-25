import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect } from 'react';
import { create } from 'zustand';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import { mergePending, mergePendingMap, mergePendingPrefs, pendingIds, pendingPrefKeys } from './data/pending';
import { markBoot } from './boot';
import { uid } from './format';
import { Actor, Collection, Comment, Draft, Drama, Notification, NotificationGroup, Post, ReactionCounts, ReactionKind, SpoilerProtection, User, WatchStatus, WatchlistItem } from './model';

const STORAGE_KEY = 'hallyu.state.v4';

export type Intent = 'discuss' | 'track' | 'discover' | 'reactions' | 'people' | 'actors';

/** A change the member made locally that still has to reach the backend. */
export interface Mutation {
  id: string;
  /** the action that was applied optimistically */
  action: Action;
  /** the action that reverts it if the backend rejects it for good (undefined = not revertible) */
  undo?: Action;
  createdAt: string;
  attempts: number;
  status: 'queued' | 'sending' | 'failed';
  error?: string;
  /** what the user sees if it fails, e.g. "Couldn't follow Goblin" */
  label: string;
}

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
  /** Version of the Terms/Guidelines the member accepted (Play UGC policy); 0 = not yet. */
  termsVersion: number;
}

/** One remote feed page: server order for a scope, plus its paging cursor. See lib/data. */
export interface FeedPage {
  ids: string[];
  reasons?: Record<string, string>;
  cursor?: { before?: string; score?: number; id?: string };
  exhausted: boolean;
  fetchedAt: string;
}

export interface AppState {
  hydrated: boolean;
  onboarding: { done: boolean; step: number; intent?: Intent; genres: string[] };
  prefs: Prefs;
  profile: User;
  follows: { users: string[]; dramas: string[]; actors: string[]; collections: string[] };
  dramaNotify: Record<string, boolean>;
  watchlist: Record<string, WatchlistItem>;
  reactions: Record<string, ReactionKind>;
  saves: string[];
  revealed: Record<string, true>;
  /** Content pulled from the backend (plus anything locally created and not yet confirmed). */
  posts: Post[];
  comments: Comment[];
  collections: Collection[];
  notifications: Notification[];
  /** Public profile cards seen in feeds/threads (id → User). */
  users: Record<string, User>;
  /** Server-ordered lists by scope key: home feeds, drama tabs, profiles, search… */
  feeds: Record<string, FeedPage>;
  drafts: Draft[];
  blockedUsers: string[];
  mutedUsers: string[];
  mutedDramas: string[];
  reported: string[];
  recentSearches: string[];
  /** Live catalog records (TMDB-backed). This is the drama/actor catalog in full. */
  importedDramas: Drama[];
  importedActors: Actor[];
  lastSeenActivity: string;
  /** Mutations waiting to reach the backend (persisted). See lib/data. */
  outbox: Mutation[];
  /** Device-local, never synced: first-run guides and milestone moments already shown (id → ISO date). */
  seen: Record<string, string>;
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
  termsVersion: 0,
};

/** An anonymous visitor: empty until the public feeds land. */
export function initialState(): AppState {
  return {
    hydrated: false,
    onboarding: { done: false, step: 0, genres: [] },
    prefs: defaultPrefs,
    profile: emptyProfile(),
    follows: { users: [], dramas: [], actors: [], collections: [] },
    dramaNotify: {},
    watchlist: {},
    reactions: {},
    saves: [],
    revealed: {},
    posts: [],
    comments: [],
    collections: [],
    notifications: [],
    users: {},
    feeds: {},
    drafts: [],
    blockedUsers: [],
    mutedUsers: [],
    mutedDramas: [],
    reported: [],
    recentSearches: [],
    importedDramas: [],
    importedActors: [],
    lastSeenActivity: new Date(0).toISOString(),
    outbox: [],
    seen: {},
  };
}

function emptyProfile(): User {
  return { id: 'local', handle: 'you', displayName: 'You', favoriteGenres: [], favoriteDramaIds: [], followers: 0, following: 0, joinedAt: new Date().toISOString() };
}

/** A brand-new member (after sign-up) starts empty: this is what the first-run states are designed for. */
export function freshMemberState(profile: User): AppState {
  return { ...initialState(), hydrated: true, profile, onboarding: { done: false, step: 0, genres: [] } };
}

export const GUEST_ID = 'guest';

/** Guests browse the public world with no personal layer: nothing followed, nothing tracked, nothing unread. */
export function guestState(): AppState {
  return {
    ...freshMemberState({ ...emptyProfile(), id: GUEST_ID, handle: 'guest', displayName: 'Guest' }),
    onboarding: { done: true, step: 0, genres: [] },
  };
}

export type Action =
  | { type: 'hydrate'; state: Partial<AppState> }
  | { type: 'replace'; state: AppState }
  | { type: 'onboarding'; patch: Partial<AppState['onboarding']> }
  | { type: 'seen'; id: string }
  | { type: 'prefs'; patch: Partial<Prefs> }
  | { type: 'profile'; patch: Partial<User> }
  | { type: 'follow'; kind: keyof AppState['follows']; id: string; on?: boolean }
  | { type: 'dramaNotify'; id: string; on: boolean }
  | { type: 'watch'; dramaId: string; status: WatchStatus | null; season?: number }
  | { type: 'progress'; dramaId: string; season: number; episode: number; total: number }
  | { type: 'note'; dramaId: string; note: string }
  | { type: 'react'; targetId: string; kind: ReactionKind | null; isComment?: boolean }
  | { type: 'save'; postId: string; on?: boolean }
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
  | { type: 'report'; id: string; targetType?: 'post' | 'comment' | 'user' | 'drama' | 'collection'; reason?: string; detail?: string }
  | { type: 'recentSearch'; q?: string; clear?: boolean }
  | { type: 'import'; dramas?: Drama[]; actors?: Actor[] }
  | { type: 'seenActivity' }
  | { type: 'outbox.add'; mutation: Mutation }
  | { type: 'outbox.update'; id: string; patch: Partial<Mutation> }
  | { type: 'outbox.remove'; id: string }
  // remote-sync bookkeeping (applied by the sync layer / pull; never enqueued as mutations)
  | { type: 'postState'; id: string; state: NonNullable<Post['state']> }
  | { type: 'removePost'; id: string }
  | { type: 'commentState'; id: string; state: NonNullable<Comment['state']> }
  | { type: 'removeComment'; id: string }
  | { type: 'restoreKey'; slice: 'watchlist' | 'reactions' | 'dramaNotify'; key: string; value?: unknown }
  | { type: 'mergePosts'; posts: Post[] }
  | { type: 'mergeComments'; postId: string; comments: Comment[] }
  | { type: 'mergeUsers'; users: Partial<User>[] }
  | { type: 'mergeNotifications'; notifications: Notification[]; append?: boolean }
  | { type: 'mergeCollections'; collections: Collection[] }
  | { type: 'setFeed'; key: string; ids: string[]; reasons?: Record<string, string>; cursor?: FeedPage['cursor']; append?: boolean; exhausted?: boolean }
  | { type: 'viewerSync'; reactions: Record<string, ReactionKind | null>; saved: Record<string, boolean> }
  | { type: 'me'; payload: MePayload };

/** The `api.me()` snapshot, already mapped to store shapes (see lib/data/supabaseBackend.ts). */
export interface MePayload {
  profile?: Partial<User>;
  prefs?: Partial<Prefs>;
  onboarding?: Partial<AppState['onboarding']>;
  follows?: AppState['follows'];
  dramaNotify?: string[];
  watchlist?: Record<string, WatchlistItem>;
  reactions?: Record<string, ReactionKind>;
  saves?: string[];
  collections?: Collection[];
  blockedUsers?: string[];
  mutedUsers?: string[];
  mutedDramas?: string[];
}

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

const stamp = (x: { createdAt?: string; updatedAt?: string }) => x.createdAt ?? x.updatedAt ?? '';
const byNewest = (a: { createdAt?: string; updatedAt?: string }, b: { createdAt?: string; updatedAt?: string }) => stamp(b).localeCompare(stamp(a));

/** Upsert by id, newest first; used for everything the feeds pull. */
function upsert<T extends { id: string; createdAt?: string; updatedAt?: string }>(prev: T[], next: T[], cap = 400): T[] {
  if (!next.length) return prev;
  const byId = new Map(prev.map((x) => [x.id, x]));
  for (const x of next) byId.set(x.id, { ...(byId.get(x.id) ?? ({} as T)), ...x });
  return [...byId.values()].sort(byNewest).slice(0, cap);
}

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'hydrate':
      return { ...s, ...a.state, hydrated: true };
    case 'outbox.add':
      return { ...s, outbox: [...s.outbox, a.mutation] };
    case 'outbox.update':
      return { ...s, outbox: s.outbox.map((m) => (m.id === a.id ? { ...m, ...a.patch } : m)) };
    case 'outbox.remove':
      return { ...s, outbox: s.outbox.filter((m) => m.id !== a.id) };
    case 'postState':
      return { ...s, posts: s.posts.map((p) => (p.id === a.id ? { ...p, state: a.state } : p)) };
    case 'removePost':
      return { ...s, posts: s.posts.filter((p) => p.id !== a.id) };
    case 'commentState':
      return { ...s, comments: s.comments.map((c) => (c.id === a.id ? { ...c, state: a.state } : c)) };
    case 'removeComment': {
      const c = s.comments.find((x) => x.id === a.id);
      return {
        ...s,
        comments: s.comments.filter((x) => x.id !== a.id),
        posts: c && c.state !== 'deleted' ? s.posts.map((p) => (p.id === c.postId ? { ...p, commentCount: Math.max(0, p.commentCount - 1) } : p)) : s.posts,
      };
    }
    case 'restoreKey': {
      const next = { ...(s[a.slice] as Record<string, unknown>) };
      if (a.value === undefined) delete next[a.key];
      else next[a.key] = a.value;
      return { ...s, [a.slice]: next };
    }
    case 'mergePosts':
      return { ...s, posts: upsert(s.posts, a.posts, 600) };
    case 'mergeComments': {
      // Server pages are authoritative for a thread, but anything I just sent (pending/failed) must survive the merge.
      const mine = s.comments.filter((c) => c.postId === a.postId && (c.state === 'pending' || c.state === 'failed'));
      const others = s.comments.filter((c) => c.postId !== a.postId);
      const merged = new Map<string, Comment>();
      for (const c of [...others, ...a.comments, ...mine]) merged.set(c.id, { ...(merged.get(c.id) ?? {}), ...c } as Comment);
      return { ...s, comments: [...merged.values()].sort(byNewest).slice(0, 1200) };
    }
    case 'mergeUsers': {
      const users = { ...s.users };
      for (const u of a.users) {
        if (!u.id) continue;
        users[u.id] = { ...(users[u.id] ?? { id: u.id, handle: '', displayName: '', favoriteGenres: [], favoriteDramaIds: [], followers: 0, following: 0, joinedAt: new Date().toISOString() }), ...u } as User;
      }
      // keep the map bounded: drop the least-referenced entries
      const MAX = 500;
      const ids = Object.keys(users);
      if (ids.length > MAX) {
        for (const id of ids.slice(0, ids.length - MAX)) delete users[id];
      }
      return { ...s, users };
    }
    case 'mergeNotifications': {
      const merged = a.append ? [...a.notifications, ...s.notifications].filter(uniq).sort(byNewest).slice(0, 150) : a.notifications.slice(0, 150);
      // Read state is monotonic within a session: a stale `activity` pull that still reports a
      // notification as unread must not resurrect it after the member has read it (mirrors the
      // pending-save guard in `viewerSync`/`me`). A brand-new id is unaffected and stays unread.
      const wasRead = new Set(s.notifications.filter((n) => n.read).map((n) => n.id));
      const notifications = wasRead.size ? merged.map((n) => (n.read || wasRead.has(n.id) ? { ...n, read: true } : n)) : merged;
      return { ...s, notifications };
    }
    case 'mergeCollections':
      return { ...s, collections: upsert(s.collections, a.collections, 100) };
    case 'setFeed': {
      const prev = s.feeds[a.key];
      return {
        ...s,
        feeds: {
          ...s.feeds,
          [a.key]: {
            ids: a.append ? [...new Set([...(prev?.ids ?? []), ...a.ids])] : a.ids,
            reasons: { ...(prev?.reasons ?? {}), ...(a.reasons ?? {}) },
            cursor: a.cursor,
            exhausted: a.exhausted ?? false,
            fetchedAt: new Date().toISOString(),
          },
        },
      };
    }
    case 'viewerSync': {
      const pendingReacts = pendingIds(s, 'react');
      const reactions = { ...s.reactions };
      for (const [id, kind] of Object.entries(a.reactions)) {
        if (pendingReacts.has(id)) continue; // don't clobber an optimistic reaction awaiting flush
        if (kind) reactions[id] = kind;
        else delete reactions[id];
      }
      let saves = s.saves;
      const touched = Object.keys(a.saved);
      if (touched.length) {
        const pendingSaves = pendingIds(s, 'save');
        const set = new Set(saves);
        for (const id of touched) {
          if (pendingSaves.has(id)) continue; // don't clobber an optimistic save awaiting flush
          if (a.saved[id]) set.add(id);
          else set.delete(id);
        }
        saves = [...set];
      }
      return { ...s, reactions, saves };
    }
    case 'me': {
      const p = a.payload;
      // Identity guard: a `me` snapshot is only ever produced for the signed-in account. Drop it if it
      // does not belong to the profile currently loaded (a late response from a previous account, or an
      // account snapshot arriving while signed out as guest) so one user's private state can never be
      // applied under another.
      if (s.profile.id === GUEST_ID || (p.profile?.id && p.profile.id !== s.profile.id)) return s;
      return {
        ...s,
        profile: p.profile ? { ...s.profile, ...p.profile } : s.profile,
        prefs: p.prefs ? mergePendingPrefs<Prefs>(p.prefs, s.prefs, pendingPrefKeys(s)) : s.prefs,
        onboarding: p.onboarding ? { ...s.onboarding, ...p.onboarding } : s.onboarding,
        follows: p.follows ?? s.follows,
        dramaNotify: p.dramaNotify ? Object.fromEntries(p.dramaNotify.map((id) => [id, true])) : s.dramaNotify,
        watchlist: p.watchlist ?? s.watchlist,
        reactions: p.reactions ? mergePendingMap(p.reactions, s.reactions, pendingIds(s, 'react')) : s.reactions,
        saves: p.saves ? mergePending(p.saves, s.saves, pendingIds(s, 'save')) : s.saves,
        blockedUsers: p.blockedUsers ?? s.blockedUsers,
        mutedUsers: p.mutedUsers ?? s.mutedUsers,
        mutedDramas: p.mutedDramas ?? s.mutedDramas,
        collections: p.collections ? upsert(p.collections, s.collections.filter((c) => !p.collections!.some((x) => x.id === c.id)), 100) : s.collections,
      };
    }
    case 'replace':
      // Caches that are not account-specific (catalog art, public profiles) survive guest ↔ member switches.
      return {
        ...a.state,
        hydrated: true,
        importedDramas: a.state.importedDramas.length ? a.state.importedDramas : s.importedDramas,
        importedActors: a.state.importedActors.length ? a.state.importedActors : s.importedActors,
        users: { ...s.users, ...a.state.users },
      };
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
        currentEpisode: a.status === 'completed' ? total : a.status === 'want' ? 0 : (prev?.currentEpisode ?? 0),
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
      const had = s.saves.includes(a.postId);
      const on = a.on ?? !had;
      if (on === had) return s;
      return {
        ...s,
        saves: toggle(s.saves, a.postId, on),
        posts: s.posts.map((p) => (p.id === a.postId ? { ...p, saveCount: Math.max(0, p.saveCount + (on ? 1 : -1)) } : p)),
      };
    }
    case 'reveal':
      return { ...s, revealed: { ...s.revealed, [a.id]: true } };
    case 'seen':
      return s.seen[a.id] ? s : { ...s, seen: { ...s.seen, [a.id]: new Date().toISOString() } };
    case 'addPost': {
      // upsert: the backend returns the same client-generated id, so a refetch merges instead of duplicating
      const exists = s.posts.some((p) => p.id === a.post.id);
      return { ...s, posts: exists ? s.posts.map((p) => (p.id === a.post.id ? { ...p, ...a.post } : p)) : [a.post, ...s.posts] };
    }
    case 'editPost':
      return { ...s, posts: s.posts.map((p) => (p.id === a.id ? { ...p, ...a.patch, editedAt: new Date().toISOString() } : p)) };
    case 'deletePost':
      return { ...s, posts: s.posts.map((p) => (p.id === a.id ? { ...p, state: 'deleted' } : p)) };
    case 'addComment': {
      const exists = s.comments.some((c) => c.id === a.comment.id);
      return {
        ...s,
        comments: exists ? s.comments.map((c) => (c.id === a.comment.id ? { ...c, ...a.comment } : c)) : [...s.comments, a.comment],
        posts: exists ? s.posts : s.posts.map((p) => (p.id === a.comment.postId ? { ...p, commentCount: p.commentCount + 1 } : p)),
      };
    }
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
      // A thin list record (no episodes/cast) must never overwrite a rich one already held — it only
      // refreshes the volatile bits (art, rating, status, next air date).
      const mergeDrama = (prev: Drama | undefined, next: Drama): Drama => {
        if (!prev) return next;
        const thin = next.episodes.length === 0 && next.cast.length === 0;
        const rich = prev.episodes.length > 0 || prev.cast.length > 0;
        if (!(thin && rich)) return next;
        return {
          ...prev,
          posterUrl: next.posterUrl ?? prev.posterUrl,
          backdropUrl: next.backdropUrl ?? prev.backdropUrl,
          rating: next.rating ?? prev.rating,
          status: next.status,
          nextEpisodeAt: next.nextEpisodeAt ?? prev.nextEpisodeAt,
          followerCount: Math.max(prev.followerCount, next.followerCount),
          provider: prev.provider ?? next.provider,
        };
      };
      let dramas = s.importedDramas;
      if (a.dramas?.length) {
        const prevById = new Map(s.importedDramas.map((d) => [d.id, d]));
        const incoming = new Map(a.dramas.map((d) => [d.id, mergeDrama(prevById.get(d.id), d)]));
        dramas = [...s.importedDramas.filter((d) => !incoming.has(d.id)), ...incoming.values()];
        // Keep the persisted cache bounded: evict the oldest thin records nobody tracks or follows.
        const MAX = 400;
        if (dramas.length > MAX) {
          const pinned = new Set([...Object.keys(s.watchlist), ...s.follows.dramas, ...s.users[s.profile.id]?.favoriteDramaIds ?? []]);
          const evictable = dramas.filter((d) => !pinned.has(d.id) && d.episodes.length === 0 && d.cast.length === 0);
          const drop = new Set(evictable.slice(0, dramas.length - MAX).map((d) => d.id));
          dramas = dramas.filter((d) => !drop.has(d.id));
        }
      }
      let actors = s.importedActors;
      if (a.actors?.length) {
        const incoming = new Map(a.actors.map((x) => [x.id, x]));
        actors = [...s.importedActors.filter((x) => !incoming.has(x.id)), ...incoming.values()];
      }
      return { ...s, importedDramas: dramas, importedActors: actors };
    }
    case 'seenActivity':
      return { ...s, lastSeenActivity: new Date().toISOString() };
    default:
      return s;
  }
}

const uniq = <T extends { id: string }>(x: T, i: number, all: T[]) => all.findIndex((y) => y.id === x.id) === i;

/**
 * Catalog view: every drama/actor the app knows about comes from TMDB (through `ensure-catalog`
 * on the server, or the client catalog cache). Screens treat these lists as the whole catalog.
 */
export function allDramas(s: Pick<AppState, 'importedDramas'>): Drama[] {
  return s.importedDramas;
}
export function allActors(s: Pick<AppState, 'importedActors'>): Actor[] {
  return s.importedActors;
}

export interface StoreValue {
  state: AppState;
  dispatch: (action: Action) => void;
  /** Replace the whole persisted state (used by auth on sign-up / sign-out) */
  reset: (next: AppState) => void;
  clearPersisted: () => Promise<void>;
}

const PERSISTED_KEYS: (keyof AppState)[] = [
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
  'users',
  'feeds',
  'drafts',
  'blockedUsers',
  'mutedUsers',
  'mutedDramas',
  'reported',
  'recentSearches',
  'importedDramas',
  'importedActors',
  'lastSeenActivity',
  'outbox',
  'seen',
];

function serialise(s: AppState): string {
  const out: Record<string, unknown> = {};
  for (const k of PERSISTED_KEYS) out[k] = s[k];
  // keep the payload small: freshest content only
  out.posts = (s.posts as Post[]).slice(0, 250);
  out.comments = (s.comments as Comment[]).slice(0, 500);
  return JSON.stringify(out);
}

function deserialise(raw: string): Partial<AppState> | null {
  try {
    const data = JSON.parse(raw) as Partial<AppState>;
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * The store lives outside React (zustand) so components can subscribe to exactly the slice they read.
 * `dispatch` runs the reducer and replaces the whole state; persistence is a debounced subscriber.
 */
export const useHallyu = create<AppState>()(() => initialState());

/**
 * Dispatch seam. `dispatch` is what screens call: it applies the action optimistically and hands
 * (prev, action, next) to the installed middleware — the sync layer uses that to enqueue the
 * mutation for the backend. `dispatchLocal` bypasses the middleware for bookkeeping actions.
 */
export type DispatchMiddleware = (prev: AppState, action: Action, next: AppState) => void;
let middleware: DispatchMiddleware | null = null;
export function setDispatchMiddleware(m: DispatchMiddleware | null): void {
  middleware = m;
}
export function dispatch(action: Action): void {
  const prev = useHallyu.getState();
  const next = reducer(prev, action);
  useHallyu.setState(next, true);
  middleware?.(prev, action, next);
}
export function dispatchLocal(action: Action): void {
  useHallyu.setState(reducer(useHallyu.getState(), action), true);
}

export function getState(): AppState {
  return useHallyu.getState();
}

export const reset = (next: AppState): void => dispatch({ type: 'replace', state: next });
export const clearPersisted = (): Promise<void> => AsyncStorage.removeItem(STORAGE_KEY);

/** Subscribe to a derived value; re-renders only when it changes (Object.is, or `shallow` for arrays/objects). */
export function useSlice<T>(selector: (s: AppState) => T, equality?: (a: T, b: T) => boolean): T {
  return useStoreWithEqualityFn(useHallyu, selector, equality);
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let hydrationStarted = false;

function startPersistence() {
  useHallyu.subscribe((s) => {
    if (!s.hydrated) return;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEY, serialise(useHallyu.getState())).catch(() => {});
    }, 400);
  });
}

/** Hydrates once from AsyncStorage and turns on persistence. Renders children immediately (screens gate on `hydrated`). */
export function StoreProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (hydrationStarted) return;
    hydrationStarted = true;

    // Hard failsafe ceiling: AsyncStorage must never hang hydration and freeze the app.
    const failsafe = setTimeout(() => {
      if (!getState().hydrated) {
        markBoot('store:hydrate-failsafe');
        dispatch({ type: 'hydrate', state: {} });
        startPersistence();
      }
    }, 1200);

    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        clearTimeout(failsafe);
        const parsed = raw ? deserialise(raw) : null;
        markBoot('store:hydrated');
        dispatch({ type: 'hydrate', state: parsed ?? {} });
      })
      .catch(() => {
        clearTimeout(failsafe);
        markBoot('store:hydrate-error');
        dispatch({ type: 'hydrate', state: {} });
      })
      .finally(() => {
        clearTimeout(failsafe);
        startPersistence();
      });
  }, []);
  return <>{children}</>;
}

/**
 * Compatibility hook: `state` is the whole store (re-renders on any change) — prefer `useSlice`
 * or the tracked getters in `useApp()` for list items.
 */
export function useStore(): StoreValue {
  const state = useHallyu();
  return { state, dispatch, reset, clearPersisted };
}

/** Convenience: a fresh Post skeleton authored by me (the id is the client-generated UUID the backend keys on). */
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

export { initialState as emptyInitialState };
