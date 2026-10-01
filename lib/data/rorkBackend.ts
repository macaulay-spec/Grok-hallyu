/**
 * Hallyu cloud adapter — the real `Backend`, speaking to the app's own Rork cloud
 * (Cloudflare Worker + Durable Object database, `functions/`).
 *
 * Identity & security: requests carry `Authorization: Bearer <Rork Auth token>`; the platform
 * verifies the JWT and stamps X-Rork-User-Id server-side — the client can never forge an
 * identity. Guests (no token) keep the demo behaviour: optimistic local state is the state of
 * record, and pulls seed the store from demoBackend fixtures first, then merge live rows on top.
 */
import { RORK_FUNCTIONS_URL } from '../../constants/keys';
import { currentAccessToken } from '../auth';
import { Collection, Comment, Notification, Post, ReactionKind, User } from '../model';
import { dispatchLocal, getState, GUEST_ID, MePayload, Mutation } from '../store';
import { Backend, BackendError, PullOptions, PullScope } from './backend';
import { demoBackend } from './demoBackend';

/** True when the cloud backend is configured for this build. */
export const rorkBackendAvailable = !!RORK_FUNCTIONS_URL;

interface Json {
  [k: string]: unknown;
}

async function api(path: string, init?: { method?: string; body?: Json }): Promise<Response> {
  const token = currentAccessToken();
  if (!token) throw new BackendError('Sign in to sync', false);
  let res: Response;
  try {
    res = await fetch(`${RORK_FUNCTIONS_URL}${path}`, {
      method: init?.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new BackendError('No connection', true);
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const payload = (await res.json()) as Json;
      if (typeof payload.error === 'string') message = payload.error;
    } catch {
      /* non-JSON error */
    }
    throw new BackendError(message, res.status >= 500, res.status);
  }
  return res;
}

async function apiJson<T extends Json>(path: string, init?: { method?: string; body?: Json }): Promise<T> {
  const res = await api(path, init);
  return (await res.json()) as T;
}

const asPosts = (rows: unknown): (Post & { myReaction?: string | null; saved?: boolean })[] =>
  Array.isArray(rows) ? (rows as (Post & { myReaction?: string | null; saved?: boolean })[]) : [];
const asUsers = (rows: unknown): Partial<User>[] => (Array.isArray(rows) ? (rows as Partial<User>[]) : []);

/** Merge a feed response and sync the per-post viewer flags (saved / my reaction). */
function mergeFeed(payload: Json): void {
  const posts = asPosts(payload.posts);
  if (posts.length) {
    dispatchLocal({ type: 'mergePosts', posts });
    const reactions: Record<string, ReactionKind | null> = {};
    const saved: Record<string, boolean> = {};
    for (const p of posts) {
      if (p.myReaction !== undefined) reactions[p.id] = (p.myReaction as ReactionKind | null) ?? null;
      if (typeof p.saved === 'boolean') saved[p.id] = p.saved;
    }
    dispatchLocal({ type: 'viewerSync', reactions, saved });
  }
  const users = asUsers(payload.users);
  if (users.length) dispatchLocal({ type: 'mergeUsers', users });
}

/** Prefs the server stores; reduceMotion/trueBlack stay device-only (sync.plan filters them too). */
const SERVER_PREF_KEYS = ['protection', 'autoplay', 'oneTapReactions', 'mutedWords', 'personalization', 'language', 'guidelinesAccepted', 'dataSaver', 'termsVersion', 'notifications'];

function pickServerPrefs(patch: Json): Json {
  const out: Json = {};
  for (const key of SERVER_PREF_KEYS) if (patch[key] !== undefined) out[key] = patch[key];
  return out;
}

function stripLocalMedia(post: Post): Post {
  return {
    ...post,
    images: post.images?.filter((img): img is string => typeof img === 'string' && /^https?:/.test(img)),
    video: post.video && /^https?:/.test(post.video.url ?? '') ? post.video : undefined,
  };
}

function isServerAction(type: Mutation['action']['type']): boolean {
  return [
    'addPost', 'editPost', 'deletePost', 'addComment', 'deleteComment', 'react', 'save', 'follow', 'dramaNotify',
    'watch', 'progress', 'note', 'profile', 'prefs', 'onboarding', 'block', 'muteUser', 'muteDrama', 'report',
    'readNotifications', 'upsertCollection', 'deleteCollection', 'collectionItem',
  ].includes(type);
}

export const rorkBackend: Backend = {
  name: 'hallyu-cloud',
  network: true,

  async push(mutation: Mutation): Promise<void> {
    if (!currentAccessToken() || !isServerAction(mutation.action.type)) return;
    const a = mutation.action;
    switch (a.type) {
      case 'addPost':
        await api('/posts', { method: 'POST', body: { post: stripLocalMedia(a.post) as unknown as Json } });
        return;
      case 'editPost':
        await api(`/posts/${encodeURIComponent(a.id)}`, { method: 'POST', body: { patch: a.patch as unknown as Json } });
        return;
      case 'deletePost':
        await api(`/posts/${encodeURIComponent(a.id)}`, { method: 'DELETE' });
        return;
      case 'addComment':
        await api(`/posts/${encodeURIComponent(a.comment.postId)}/comments`, { method: 'POST', body: { comment: a.comment as unknown as Json } });
        return;
      case 'deleteComment':
        await api(`/comments/${encodeURIComponent(a.id)}`, { method: 'DELETE' });
        return;
      case 'react':
        await api('/react', { method: 'POST', body: { targetId: a.targetId, kind: a.kind, isComment: !!a.isComment } });
        return;
      case 'save':
        await api('/save', { method: 'POST', body: { postId: a.postId, on: a.on ?? true } });
        return;
      case 'follow':
        await api('/follow', { method: 'POST', body: { kind: a.kind, id: a.id, on: a.on ?? true } });
        return;
      case 'dramaNotify':
        await api('/dramaNotify', { method: 'POST', body: { dramaId: a.id, on: a.on } });
        return;
      case 'watch':
        await api('/watchlist', { method: 'POST', body: { dramaId: a.dramaId, status: a.status ?? null, season: a.season } });
        return;
      case 'progress':
        await api('/watchlist', {
          method: 'POST',
          body: { dramaId: a.dramaId, status: a.total && a.episode >= a.total ? 'completed' : 'watching', season: a.season, currentEpisode: Math.max(0, a.episode) },
        });
        return;
      case 'note':
        await api('/watchlist', { method: 'POST', body: { dramaId: a.dramaId, status: 'watching', note: a.note } });
        return;
      case 'profile': {
        const patch: Json = {};
        for (const key of ['displayName', 'handle', 'avatarUrl', 'bio', 'isPrivate', 'fandoms', 'favoriteGenres', 'favoriteDramaIds']) {
          if ((a.patch as Json)[key] !== undefined) patch[key] = (a.patch as Json)[key];
        }
        if (Object.keys(patch).length) await api('/me', { method: 'POST', body: { patch } });
        return;
      }
      case 'prefs': {
        const patch = pickServerPrefs(a.patch as Json);
        if (Object.keys(patch).length) await api('/prefs', { method: 'POST', body: { patch } });
        return;
      }
      case 'onboarding':
        await api('/onboarding', { method: 'POST', body: { patch: a.patch as unknown as Json } });
        return;
      case 'block':
        await api('/block', { method: 'POST', body: { userId: a.userId, on: a.on } });
        return;
      case 'muteUser':
        await api('/mute', { method: 'POST', body: { kind: 'user', id: a.userId, on: a.on } });
        return;
      case 'muteDrama':
        await api('/mute', { method: 'POST', body: { kind: 'drama', id: a.dramaId, on: a.on } });
        return;
      case 'report':
        await api('/report', { method: 'POST', body: { id: a.id, targetType: a.targetType, reason: a.reason, detail: a.detail } });
        return;
      case 'readNotifications':
        await api('/read-notifications', { method: 'POST', body: { group: a.group, id: a.id } });
        return;
      case 'upsertCollection': {
        const { id, title, description, visibility } = a.collection;
        await api('/collections', { method: 'POST', body: { collection: { id, title, description, visibility } as unknown as Json } });
        for (const item of a.collection.items) await api(`/collections/${encodeURIComponent(id)}/items`, { method: 'POST', body: { dramaId: item.dramaId, on: true, note: item.note } });
        return;
      }
      case 'deleteCollection':
        await api(`/collections/${encodeURIComponent(a.id)}`, { method: 'DELETE' });
        return;
      case 'collectionItem':
        await api(`/collections/${encodeURIComponent(a.collectionId)}/items`, { method: 'POST', body: { dramaId: a.dramaId, on: a.on, note: a.note } });
        return;
    }
  },

  async pull(scope: PullScope, opts?: PullOptions): Promise<void> {
    // Local fixtures first (idempotent per identity) so the UI is never empty, then live rows.
    await demoBackend.pull(scope, opts);
    if (!currentAccessToken()) return;

    if (scope === 'me') {
      const { me } = await apiJson<{ me: MePayload | null }>('/me');
      if (me) dispatchLocal({ type: 'me', payload: me });
      return;
    }
    if (scope === 'home' || scope === 'feed:forYou') {
      mergeFeed(await apiJson<Json>('/home'));
      return;
    }
    if (scope === 'feed:following') {
      mergeFeed(await apiJson<Json>('/feed/following'));
      return;
    }
    if (scope === 'trending') {
      mergeFeed(await apiJson<Json>('/trending'));
      return;
    }
    if (scope === 'activity') {
      const { notifications } = await apiJson<{ notifications?: Notification[] }>('/activity');
      if (notifications?.length) dispatchLocal({ type: 'mergeNotifications', notifications, append: !opts?.more });
      return;
    }
    if (scope === 'shorts') {
      mergeFeed(await apiJson<Json>('/shorts'));
      return;
    }
    if (scope === 'saved') {
      mergeFeed(await apiJson<Json>('/saved'));
      return;
    }
    if (scope === 'collections') {
      const { collections } = await apiJson<{ collections?: Collection[] }>('/collections');
      if (collections?.length) dispatchLocal({ type: 'mergeCollections', collections });
      return;
    }
    if (scope.startsWith('collection:')) {
      const { collection } = await apiJson<{ collection?: Collection }>(`/collection/${encodeURIComponent(scope.slice('collection:'.length))}`);
      if (collection) dispatchLocal({ type: 'mergeCollections', collections: [collection] });
      return;
    }
    if (scope.startsWith('drama:')) {
      const dramaId = scope.slice('drama:'.length).split(':')[0] ?? '';
      if (dramaId) mergeFeed(await apiJson<Json>(`/drama/${encodeURIComponent(dramaId)}`));
      return;
    }
    if (scope.startsWith('post:')) {
      const postId = scope.slice('post:'.length);
      const { post, comments } = await apiJson<{ post?: Post; comments?: Comment[] }>(`/post/${encodeURIComponent(postId)}`);
      if (post) {
        dispatchLocal({ type: 'mergePosts', posts: [post] });
        if (Array.isArray(comments)) dispatchLocal({ type: 'mergeComments', postId: post.id, comments });
      }
      return;
    }
    if (scope.startsWith('user:')) {
      const { profile, posts } = await apiJson<{ profile?: User; posts?: Post[] }>(`/user/${encodeURIComponent(scope.slice('user:'.length).replace(/^@/, ''))}`);
      if (profile) {
        dispatchLocal({ type: 'mergeUsers', users: [profile] });
        if (posts?.length) mergeFeed({ posts });
      }
      return;
    }
    if (scope.startsWith('search:')) {
      const q = scope.slice('search:'.length);
      mergeFeed(await apiJson<Json>(`/search?q=${encodeURIComponent(q)}`));
      return;
    }
    // Unknown scope: nothing to fetch from the server.
    void getState;
    void GUEST_ID;
  },
};
