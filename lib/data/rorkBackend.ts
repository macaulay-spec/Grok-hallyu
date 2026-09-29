/**
 * Rork cloud backend — the real `Backend`.
 *
 * Implements the same seam as demoBackend (lib/data/backend.ts): `push` persists one
 * mutation to the Cloudflare Worker + Durable Object (functions/hallyu.ts), `pull`
 * refreshes a screen scope from the server and merges it into the local store. Writes
 * leave the device; reads are seeded by demoBackend's fixtures first so a fresh
 * install still opens onto a lived-in world, then real server content merges on top.
 *
 * Identity: the app's local account id rides as the `X-Hallyu-Account` header. Guests
 * are read-only: their pushes resolve locally (the optimistic state is the truth for
 * them) so the outbox never fights a 401.
 */
import { dispatchLocal, GUEST_ID, getState, Mutation } from '../store';
import { BackendError, Backend, PullOptions, PullScope } from './backend';
import { demoBackend } from './demoBackend';
import { Comment, Post, User } from '../model';

const envUrl = (v: string | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t.replace(/\/$/, '') : undefined;
};

const BASE = envUrl(process.env.EXPO_PUBLIC_RORK_FUNCTIONS_URL);

/** True when a cloud backend URL is configured for this build. */
export const rorkBackendAvailable = !!BASE;

interface Json {
  [k: string]: unknown;
}

async function api<T extends Json>(path: string, init?: { method?: string; body?: Json; accountId?: string | null }): Promise<T> {
  if (!BASE) throw new BackendError('Cloud backend is not configured', false);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init?.accountId) headers['X-Hallyu-Account'] = init.accountId;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { method: init?.method ?? 'GET', headers, body: init?.body ? JSON.stringify(init.body) : undefined });
  } catch {
    throw new BackendError('No connection', true);
  }
  let payload: Json = {};
  try {
    payload = (await res.json()) as Json;
  } catch {
    /* non-JSON error page — fall through to the status check */
  }
  if (!res.ok) {
    const message = typeof payload.error === 'string' ? payload.error : `Request failed (${res.status})`;
    throw new BackendError(message, res.status >= 500, res.status);
  }
  return payload as T;
}

const accountId = (): string | null => {
  const id = getState().profile.id;
  return id && id !== GUEST_ID ? id : null;
};

const asPosts = (rows: unknown): Post[] => (Array.isArray(rows) ? (rows as Post[]) : []);
const asUsers = (rows: unknown): Partial<User>[] => (Array.isArray(rows) ? (rows as Partial<User>[]) : []);
const asComments = (rows: unknown): Comment[] => (Array.isArray(rows) ? (rows as Comment[]) : []);

async function mergeFeed(payload: Json): Promise<void> {
  const posts = asPosts(payload.posts);
  if (posts.length) dispatchLocal({ type: 'mergePosts', posts });
  const users = asUsers(payload.users);
  if (users.length) dispatchLocal({ type: 'mergeUsers', users });
}

/** Map a pull scope onto the server endpoint that answers it. */
async function pullScope(scope: string, opts: PullOptions | undefined, id: string | null): Promise<void> {
  const more = !!opts?.more;
  if (scope === 'me') {
    const { profile } = await api<{ profile: Partial<User> | null }>('/me', { accountId: id });
    if (profile && profile.id === id) dispatchLocal({ type: 'profile', patch: profile });
    return;
  }
  if (scope === 'home' || scope === 'feed:forYou') {
    await mergeFeed(await api('/home', { accountId: id }));
    return;
  }
  if (scope === 'feed:following') {
    await mergeFeed(await api('/feed/following', { accountId: id }));
    return;
  }
  if (scope === 'activity') {
    const { notifications } = await api<{ notifications?: unknown[] }>('/activity', { accountId: id });
    if (Array.isArray(notifications) && notifications.length) dispatchLocal({ type: 'mergeNotifications', notifications: notifications as never[], append: !more });
    return;
  }
  if (scope === 'shorts') {
    await mergeFeed(await api('/shorts', { accountId: id }));
    return;
  }
  if (scope === 'saved') {
    await mergeFeed(await api('/saved', { accountId: id }));
    return;
  }
  if (scope === 'trending') {
    await mergeFeed(await api('/trending', { accountId: id }));
    return;
  }
  if (scope === 'collections') {
    const { collections } = await api<{ collections?: unknown[] }>('/collections', { accountId: id });
    if (Array.isArray(collections) && collections.length) dispatchLocal({ type: 'mergeCollections', collections: collections as never[] });
    return;
  }
  if (scope.startsWith('collection:')) {
    const { collection } = await api<{ collection?: unknown }>(`/collection/${encodeURIComponent(scope.slice('collection:'.length))}`, { accountId: id });
    if (collection) dispatchLocal({ type: 'mergeCollections', collections: [collection] as never[] });
    return;
  }
  if (scope.startsWith('drama:')) {
    const dramaId = scope.slice('drama:'.length);
    // The hub also wants episode-room conversation; the server answers with everything it has.
    const payload = await api<{ posts?: unknown[] }>(`/drama/${encodeURIComponent(dramaId.split(':')[0])}`, { accountId: id });
    const posts = asPosts(payload.posts);
    if (posts.length) dispatchLocal({ type: 'mergePosts', posts });
    return;
  }
  if (scope.startsWith('post:')) {
    const { post, comments } = await api<{ post?: unknown; comments?: unknown[] }>(`/post/${encodeURIComponent(scope.slice('post:'.length))}`, { accountId: id });
    if (post) dispatchLocal({ type: 'mergePosts', posts: [post as Post] });
    if (post && Array.isArray(comments)) dispatchLocal({ type: 'mergeComments', postId: (post as Post).id, comments: asComments(comments) });
    return;
  }
  if (scope.startsWith('user:')) {
    const { profile, posts } = await api<{ profile?: unknown; posts?: unknown[] }>(`/user/${encodeURIComponent(scope.slice('user:'.length))}`, { accountId: id });
    if (profile) dispatchLocal({ type: 'mergeUsers', users: [profile as Partial<User>] });
    const feed = asPosts(posts);
    if (feed.length) dispatchLocal({ type: 'mergePosts', posts: feed });
    return;
  }
  if (scope.startsWith('search:')) {
    const q = scope.slice('search:'.length);
    await mergeFeed(await api(`/search?q=${encodeURIComponent(q)}`, { accountId: id }));
    return;
  }
  // Unknown scope: nothing to fetch from the server.
}

/** Device-local / server-irrelevant mutations: accepted without a round trip. */
function isServerRelevant(a: Mutation['action']): boolean {
  return ['addPost', 'editPost', 'deletePost', 'addComment', 'deleteComment', 'react', 'save', 'follow', 'watch', 'progress', 'note', 'profile', 'upsertCollection', 'deleteCollection', 'collectionItem', 'readNotifications'].includes(a.type);
}

export const rorkBackend: Backend = {
  name: 'rork',
  async push(mutation: Mutation): Promise<void> {
    const a = mutation.action;
    const id = accountId();
    // Guests keep the demo behaviour: optimistic state is the state of record.
    if (!id || !isServerRelevant(a)) return;
    switch (a.type) {
      case 'addPost':
        await api('/posts', { method: 'POST', accountId: id, body: { post: a.post as unknown as Json } });
        return;
      case 'editPost':
        await api(`/posts/${encodeURIComponent(a.id)}`, { method: 'POST', accountId: id, body: { patch: a.patch as unknown as Json } });
        return;
      case 'deletePost':
        await api(`/posts/${encodeURIComponent(a.id)}`, { method: 'DELETE', accountId: id });
        return;
      case 'addComment':
        await api(`/posts/${encodeURIComponent(a.comment.postId)}/comments`, { method: 'POST', accountId: id, body: { comment: a.comment as unknown as Json } });
        return;
      case 'deleteComment':
        await api(`/comments/${encodeURIComponent(a.id)}`, { method: 'DELETE', accountId: id });
        return;
      case 'react':
        await api('/react', { method: 'POST', accountId: id, body: { targetId: a.targetId, kind: a.kind, isComment: a.isComment } });
        return;
      case 'save':
        await api('/save', { method: 'POST', accountId: id, body: { postId: a.postId, on: a.on ?? true } });
        return;
      case 'follow':
        await api('/follow', { method: 'POST', accountId: id, body: { kind: a.kind, id: a.id, on: a.on ?? true } });
        return;
      case 'watch':
        await api('/watchlist', { method: 'POST', accountId: id, body: { dramaId: a.dramaId, status: a.status ?? null, season: a.season } });
        return;
      case 'progress':
        await api('/watchlist', { method: 'POST', accountId: id, body: { dramaId: a.dramaId, status: 'watching', season: a.season, currentEpisode: a.episode } });
        return;
      case 'note':
        await api('/watchlist', { method: 'POST', accountId: id, body: { dramaId: a.dramaId, status: 'watching', note: a.note } });
        return;
      case 'profile': {
        const patch: Json = {};
        for (const key of ['displayName', 'handle', 'avatarUrl', 'bio']) {
          if (a.patch[key as keyof typeof a.patch] !== undefined) patch[key] = a.patch[key as keyof typeof a.patch];
        }
        if (Object.keys(patch).length) await api('/me', { method: 'POST', accountId: id, body: { patch } });
        return;
      }
      case 'upsertCollection':
        await api('/collections', { method: 'POST', accountId: id, body: { collection: a.collection as unknown as Json } });
        return;
      case 'deleteCollection':
        await api(`/collections/${encodeURIComponent(a.id)}`, { method: 'DELETE', accountId: id });
        return;
      case 'collectionItem':
        await api(`/collections/${encodeURIComponent(a.collectionId)}/items`, { method: 'POST', accountId: id, body: { dramaId: a.dramaId, on: a.on, note: a.note } });
        return;
      case 'readNotifications':
        await api('/read-notifications', { method: 'POST', accountId: id });
        return;
    }
  },
  async pull(scope: PullScope, opts?: PullOptions): Promise<void> {
    // Local fixtures first (idempotent per identity), then the real server content.
    await demoBackend.pull(scope, opts);
    if (!BASE) return;
    const id = accountId();
    if (scope === 'me' && !id) return;
    await pullScope(scope, opts, id);
  },
};
