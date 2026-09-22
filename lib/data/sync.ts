/**
 * Offline-first sync engine.
 *
 * Every user-facing mutation is applied to the local store immediately (the reducer is the
 * optimistic layer) and, via the dispatch middleware, recorded in the persisted outbox. This
 * engine flushes the outbox to the Backend in order, with backoff, whenever the device is online
 * and the app is in the foreground. If the backend rejects a mutation for good, the recorded
 * inverse action rolls the store back and the user gets a toast with Retry; posts and comments
 * instead stay visible with a "Couldn't post · Retry · Discard" strip.
 */
import NetInfo from '@react-native-community/netinfo';
import { useEffect } from 'react';
import { AppState as RNAppState } from 'react-native';
import { toast } from '../../components/ui/Toast';
import { uid } from '../format';
import { Post } from '../model';
import * as sel from '../selectors';
import { Action, AppState, dispatch, dispatchLocal, getState, Mutation, setDispatchMiddleware, useSlice } from '../store';
import { Backend, BackendError, PullScope } from './backend';
import { supabaseBackend } from './supabaseBackend';
import { track } from '../analytics';

let backend: Backend = supabaseBackend;
/** Swap the backend implementation (the Supabase adapter will register itself here; tests inject fakes). */
export function setBackend(b: Backend): void {
  backend = b;
}
export function getBackend(): Backend {
  return backend;
}

const MAX_ATTEMPTS = 6;
const MAX_BACKOFF = 60_000;

// ---------------------------------------------------------------------------------------------
// Connectivity
// ---------------------------------------------------------------------------------------------
let reachable = true;
export function isOnline(_s?: unknown): boolean {
  return reachable;
}

// ---------------------------------------------------------------------------------------------
// Which actions sync, how they are undone, and what a failure is called
// ---------------------------------------------------------------------------------------------
/** Device-only prefs: changing them must not hit the network. */
const LOCAL_PREFS = new Set(['reduceMotion', 'trueBlack']);

function pick<T extends object>(obj: T, keys: string[]): Partial<T> {
  const out: Partial<T> = {};
  for (const k of keys) (out as Record<string, unknown>)[k] = (obj as Record<string, unknown>)[k];
  return out;
}

function postNoun(type: Post['type']): string {
  return type === 'review' ? 'review' : type === 'short' ? 'short' : type === 'discussion' ? 'discussion' : type === 'recommendation' ? 'recommendation' : 'post';
}

function followName(s: AppState, kind: keyof AppState['follows'], id: string): string {
  if (kind === 'dramas') return sel.getDrama(s, id)?.title ?? 'this drama';
  if (kind === 'actors') return sel.getActor(s, id)?.name ?? 'this actor';
  if (kind === 'collections') return sel.getCollection(s, id)?.title ?? 'this collection';
  const u = sel.getUser(s, id);
  return u ? `@${u.handle}` : 'this member';
}

interface Plan {
  undo?: Action;
  label: string;
  /** coalescing key: a newer queued mutation with the same key replaces the older one */
  key?: string;
}

/** null = local-only action, never sent to the backend. */
export function plan(prev: AppState, a: Action): Plan | null {
  switch (a.type) {
    case 'follow': {
      const had = prev.follows[a.kind].includes(a.id);
      const now = a.on ?? !had;
      if (now === had) return null;
      const name = followName(prev, a.kind, a.id);
      return { undo: { type: 'follow', kind: a.kind, id: a.id, on: had }, label: now ? `Couldn’t follow ${name}` : `Couldn’t unfollow ${name}`, key: `follow:${a.kind}:${a.id}` };
    }
    case 'dramaNotify':
      return { undo: { type: 'restoreKey', slice: 'dramaNotify', key: a.id, value: prev.dramaNotify[a.id] }, label: 'Couldn’t update episode alerts', key: `notify:${a.id}` };
    case 'watch':
    case 'progress':
    case 'note': {
      const title = sel.getDrama(prev, a.dramaId)?.title ?? 'this drama';
      return { undo: { type: 'restoreKey', slice: 'watchlist', key: a.dramaId, value: prev.watchlist[a.dramaId] }, label: `Couldn’t update ${title} in your watchlist`, key: `watch:${a.dramaId}` };
    }
    case 'react': {
      const prevKind = prev.reactions[a.targetId] ?? null;
      if (prevKind === a.kind) return null;
      return { undo: { type: 'react', targetId: a.targetId, kind: prevKind, isComment: a.isComment }, label: 'Couldn’t save your reaction', key: `react:${a.targetId}` };
    }
    case 'save': {
      const had = prev.saves.includes(a.postId);
      return { undo: { type: 'save', postId: a.postId }, label: had ? 'Couldn’t remove from Saved' : 'Couldn’t save this post', key: `save:${a.postId}` };
    }
    case 'addPost':
      return { undo: { type: 'removePost', id: a.post.id }, label: `Couldn’t publish your ${postNoun(a.post.type)}` };
    case 'editPost': {
      const p = prev.posts.find((x) => x.id === a.id);
      return { undo: p ? { type: 'editPost', id: a.id, patch: pick(p, Object.keys(a.patch)) } : undefined, label: 'Couldn’t save your edit' };
    }
    case 'deletePost':
      return { undo: { type: 'postState', id: a.id, state: prev.posts.find((x) => x.id === a.id)?.state ?? 'active' }, label: 'Couldn’t delete the post' };
    case 'addComment':
      return { undo: { type: 'removeComment', id: a.comment.id }, label: 'Couldn’t post your comment' };
    case 'deleteComment':
      return { undo: { type: 'commentState', id: a.id, state: prev.comments.find((x) => x.id === a.id)?.state ?? 'active' }, label: 'Couldn’t delete the comment' };
    case 'upsertCollection': {
      const c = prev.collections.find((x) => x.id === a.collection.id);
      return { undo: c ? { type: 'upsertCollection', collection: c } : { type: 'deleteCollection', id: a.collection.id }, label: `Couldn’t save “${a.collection.title}”`, key: `collection:${a.collection.id}` };
    }
    case 'deleteCollection': {
      const c = prev.collections.find((x) => x.id === a.id);
      return { undo: c ? { type: 'upsertCollection', collection: c } : undefined, label: 'Couldn’t delete the collection' };
    }
    case 'collectionItem': {
      const item = prev.collections.find((x) => x.id === a.collectionId)?.items.find((i) => i.dramaId === a.dramaId);
      return { undo: { type: 'collectionItem', collectionId: a.collectionId, dramaId: a.dramaId, on: !!item, note: item?.note }, label: 'Couldn’t update the collection', key: `citem:${a.collectionId}:${a.dramaId}` };
    }
    case 'profile':
      return { undo: { type: 'profile', patch: pick(prev.profile, Object.keys(a.patch)) }, label: 'Couldn’t save your profile', key: 'profile' };
    case 'prefs': {
      const keys = Object.keys(a.patch).filter((k) => !LOCAL_PREFS.has(k));
      if (!keys.length) return null;
      return { undo: { type: 'prefs', patch: pick(prev.prefs, keys) }, label: 'Couldn’t save your settings', key: `prefs:${keys.sort().join(',')}` };
    }
    case 'onboarding':
      return { label: 'Couldn’t save your setup', key: 'onboarding' };
    case 'block':
      return { undo: { ...a, on: !a.on }, label: a.on ? 'Couldn’t block this member' : 'Couldn’t unblock this member', key: `block:${a.userId}` };
    case 'muteUser':
      return { undo: { ...a, on: !a.on }, label: a.on ? 'Couldn’t mute this member' : 'Couldn’t unmute this member', key: `muteUser:${a.userId}` };
    case 'muteDrama':
      return { undo: { ...a, on: !a.on }, label: a.on ? 'Couldn’t mute this drama' : 'Couldn’t unmute this drama', key: `muteDrama:${a.dramaId}` };
    case 'report':
      return { label: 'Couldn’t send your report' };
    case 'readNotifications':
      return { label: '', key: 'readNotifications' }; // silent: nobody needs a toast for read receipts
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Enqueue (dispatch middleware)
// ---------------------------------------------------------------------------------------------
const keys = new Map<string, string>(); // mutation id → coalescing key

function middleware(prev: AppState, a: Action): void {
  const p = plan(prev, a);
  if (!p) return;
  let undo = p.undo;
  if (p.key) {
    // Replace an older, still-queued mutation for the same target; keep the *original* undo so a
    // rollback lands on the state before the whole burst of taps.
    const older = getState().outbox.find((m) => m.status === 'queued' && keys.get(m.id) === p.key);
    if (older) {
      undo = older.undo ?? undo;
      dispatchLocal({ type: 'outbox.remove', id: older.id });
      keys.delete(older.id);
    }
  }
  const m: Mutation = { id: uid('m'), action: a, undo, createdAt: new Date().toISOString(), attempts: 0, status: 'queued', label: p.label };
  if (p.key) keys.set(m.id, p.key);
  dispatchLocal({ type: 'outbox.add', mutation: m });
  if (a.type === 'addPost') dispatchLocal({ type: 'postState', id: a.post.id, state: 'pending' });
  if (a.type === 'addComment') dispatchLocal({ type: 'commentState', id: a.comment.id, state: 'pending' });
  kick();
}

// ---------------------------------------------------------------------------------------------
// Flush loop
// ---------------------------------------------------------------------------------------------
let flushing: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let backoff = 0;

function schedule(ms: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, ms);
}

/** Ask the engine to flush soon (idempotent). */
export function kick(): void {
  if (flushing || timer) return;
  schedule(0);
}

function onAccepted(m: Mutation) {
  if (m.action.type === 'addPost') dispatchLocal({ type: 'postState', id: m.action.post.id, state: 'active' });
  if (m.action.type === 'addComment') dispatchLocal({ type: 'commentState', id: m.action.comment.id, state: 'active' });
}

function onGaveUp(m: Mutation, error: string) {
  const a = m.action;
  track('sync.failed', { type: a.type, attempts: m.attempts, error });
  if (a.type === 'addPost' || a.type === 'addComment') {
    // Keep the content on screen with a retry strip instead of silently vanishing.
    dispatchLocal({ type: 'outbox.update', id: m.id, patch: { status: 'failed', error } });
    if (a.type === 'addPost') dispatchLocal({ type: 'postState', id: a.post.id, state: 'failed' });
    else dispatchLocal({ type: 'commentState', id: a.comment.id, state: 'failed' });
    return;
  }
  dispatchLocal({ type: 'outbox.remove', id: m.id });
  keys.delete(m.id);
  if (m.undo) dispatchLocal(m.undo);
  if (m.label) toast.show({ message: m.label, tone: 'danger', icon: 'cloud-offline-outline', actionLabel: 'Retry', onAction: () => dispatch(a), duration: 6000 });
}

/** Send queued mutations in order. Resolves when the queue is drained, blocked (offline) or waiting on backoff. */
export function flush(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    for (;;) {
      const s = getState();
      if (!s.hydrated || !isOnline(s)) return;
      const m = s.outbox.find((x) => x.status === 'queued');
      if (!m) {
        backoff = 0;
        return;
      }
      dispatchLocal({ type: 'outbox.update', id: m.id, patch: { status: 'sending' } });
      try {
        await backend.push(m);
        dispatchLocal({ type: 'outbox.remove', id: m.id });
        keys.delete(m.id);
        onAccepted(m);
        backoff = 0;
      } catch (e) {
        const err = e as Partial<BackendError>;
        const retryable = err instanceof BackendError ? err.retryable : true;
        const message = err.message ?? 'Something went wrong';
        const attempts = m.attempts + 1;
        if (!retryable || attempts >= MAX_ATTEMPTS) {
          onGaveUp({ ...m, attempts }, message);
          continue;
        }
        dispatchLocal({ type: 'outbox.update', id: m.id, patch: { status: 'queued', attempts, error: message } });
        if (!isOnline()) return; // wait for connectivity instead of burning retries
        backoff = Math.min(MAX_BACKOFF, backoff ? backoff * 2 : 1000);
        schedule(backoff);
        return;
      }
    }
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

// ---------------------------------------------------------------------------------------------
// User controls
// ---------------------------------------------------------------------------------------------
export function retryMutation(id: string): void {
  const m = getState().outbox.find((x) => x.id === id);
  if (!m) return;
  dispatchLocal({ type: 'outbox.update', id, patch: { status: 'queued', attempts: 0, error: undefined } });
  if (m.action.type === 'addPost') dispatchLocal({ type: 'postState', id: m.action.post.id, state: 'pending' });
  if (m.action.type === 'addComment') dispatchLocal({ type: 'commentState', id: m.action.comment.id, state: 'pending' });
  backoff = 0;
  kick();
}

export function discardMutation(id: string): void {
  const m = getState().outbox.find((x) => x.id === id);
  if (!m) return;
  dispatchLocal({ type: 'outbox.remove', id });
  keys.delete(id);
  if (m.undo) dispatchLocal(m.undo);
}

export function retryAllFailed(): void {
  for (const m of getState().outbox) if (m.status === 'failed') retryMutation(m.id);
}

export function discardAllFailed(): void {
  for (const m of getState().outbox) if (m.status === 'failed') discardMutation(m.id);
}

/** The outbox entry behind a piece of content (to drive the pending/failed strip). */
export function mutationFor(s: Pick<AppState, 'outbox'>, target: { postId?: string; commentId?: string }): Mutation | undefined {
  return s.outbox.find((m) => (target.postId && m.action.type === 'addPost' && m.action.post.id === target.postId) || (target.commentId && m.action.type === 'addComment' && m.action.comment.id === target.commentId));
}

/** Pull-to-refresh: push anything pending, then re-pull the screen's scope. */
export async function refresh(scope: PullScope): Promise<{ ok: boolean }> {
  const started = Date.now();
  await flush().catch(() => {});
  let ok = true;
  try {
    await backend.pull(scope);
  } catch {
    ok = false;
  }
  const wait = 350 - (Date.now() - started);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  return { ok };
}

/** "Load more" for paged feeds: fetches the next page with the stored cursor. */
export async function refreshMore(scope: PullScope): Promise<{ ok: boolean }> {
  try {
    await backend.pull(scope, { more: true });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** How fresh a pulled scope is (0 = never). */
export function feedAge(s: AppState, key: string): number {
  const f = s.feeds[key];
  if (!f) return Infinity;
  return Date.now() - new Date(f.fetchedAt).getTime();
}

/**
 * Pull a scope when the screen opens if the cache is older than `staleMs`. Fire-and-forget:
 * the screen renders the cache immediately and fills in when data lands.
 */
export function useRemote(scope: PullScope, staleMs = 60_000, enabled = true): void {
  const hydrated = useSlice((s) => s.hydrated);
  useEffect(() => {
    if (!hydrated || !enabled || !isOnline()) return;
    const age = feedAge(getState(), feedKeyFor(scope));
    if (age > staleMs) backend.pull(scope).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, scope, enabled]);
}

/** Map a pull scope onto the store cache key whose freshness it represents. */
function feedKeyFor(scope: PullScope): string {
  switch (scope) {
    case 'home':
    case 'feed:forYou':
      return 'forYou';
    case 'feed:following':
      return 'following';
    case 'shorts':
      return 'shorts';
    case 'activity':
      return 'activity';
    default:
      return scope;
  }
}

// ---------------------------------------------------------------------------------------------
// React bindings
// ---------------------------------------------------------------------------------------------
const EMPTY = { queued: 0, failed: 0, sending: false };
export function useSyncStatus(): { queued: number; failed: number; sending: boolean } {
  return useSlice(
    (s) => {
      if (!s.outbox.length) return EMPTY;
      return { queued: s.outbox.filter((m) => m.status !== 'failed').length, failed: s.outbox.filter((m) => m.status === 'failed').length, sending: s.outbox.some((m) => m.status === 'sending') };
    },
    (a, b) => a.queued === b.queued && a.failed === b.failed && a.sending === b.sending,
  );
}

/** Route mutating dispatches through the outbox. Returns an uninstaller. */
export function installSync(): () => void {
  setDispatchMiddleware(middleware);
  return () => setDispatchMiddleware(null);
}

/** Mount once at the root. Installs the middleware and the connectivity / foreground triggers. */
export function SyncProvider(): null {
  const hydrated = useSlice((s) => s.hydrated);
  const authed = useSlice((s) => s.profile.id !== 'guest' && s.profile.id !== 'local');

  useEffect(() => installSync(), []);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((st) => {
      const next = st.isConnected !== false && st.isInternetReachable !== false;
      const cameBack = next && !reachable;
      reachable = next;
      if (cameBack) {
        backoff = 0;
        kick();
      }
    });
    const sub = RNAppState.addEventListener('change', (st) => {
      if (st === 'active') kick();
    });
    return () => {
      unsub();
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    // A crash mid-send leaves 'sending' entries behind; they are simply queued again.
    for (const m of getState().outbox) if (m.status === 'sending') dispatchLocal({ type: 'outbox.update', id: m.id, patch: { status: 'queued' } });
    kick();
  }, [hydrated]);

  // First open (and on sign-in): warm the caches. Failures are silent — the screens still render
  // whatever is persisted, and pull-to-refresh retries.
  useEffect(() => {
    if (!hydrated) return;
    void backend.pull('home').catch(() => {});
    void backend.pull('activity').catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, authed]);

  // reconnect → flush
  useEffect(() => {
    if (reachable) kick();
  }, [reachable ? 1 : 0]);

  return null;
}
