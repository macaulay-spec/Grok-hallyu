/**
 * Hallyu cloud adapter — the real `Backend`, speaking directly to managed Supabase Postgres
 * (the Rork cloud database) with Row Level Security.
 *
 * Identity & security: every request carries the Rork Auth JWT (attached by lib/supabase); the
 * database authorizes each row server-side via `user_id()` (the JWT `sub`) — the client can
 * never forge an identity. Counters (reaction/save/comment totals) and notifications are kept
 * consistent by database triggers, so optimistic local state and the server converge.
 * Guests (no token) pull real public rows too — there is no mock content anywhere in the app.
 */
import { reportError } from '../analytics';
import { currentAccessToken } from '../auth';
import { Collection, Comment, emptyReactions, Notification, Post, ReactionCounts, ReactionKind, User, WatchlistItem, WatchStatus } from '../model';
import { dispatchLocal, getState, MePayload, Mutation } from '../store';
import { uploadMedia } from '../storage';
import { Backend, BackendError, PullOptions, PullScope } from './backend';
import { supabase } from '../supabase';

const PAGE = 30;
const POST_SELECT = '*, author:profiles!posts_author_id_fkey(*)';
const COMMENT_SELECT = '*, author:profiles!comments_author_id_fkey(*)';
const COLLECTION_SELECT = '*, items:collection_items(*)';

/** Server-stored prefs; reduceMotion/trueBlack stay device-only (sync.plan filters them too). */
const SERVER_PREF_KEYS = ['protection', 'autoplay', 'oneTapReactions', 'mutedWords', 'personalization', 'language', 'guidelinesAccepted', 'dataSaver', 'termsVersion', 'notifications'];

/** One-shot per app launch: purge persisted demo fixtures before the first live pull. */
let purgedDemo = false;

interface Json {
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------------------------
// Row mappers (snake_case rows → store shapes)
// ---------------------------------------------------------------------------------------------
interface ProfileRow {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  fandoms: string[] | null;
  favorite_genres: string[] | null;
  favorite_drama_ids: string[] | null;
  is_private: boolean | null;
  verified: boolean | null;
  follower_count: number | null;
  following_count: number | null;
  created_at: string | null;
}

interface PostRow {
  id: string;
  author_id: string;
  type: Post['type'];
  body: string;
  title: string | null;
  kind: string | null;
  rating: number | null;
  verdict: string | null;
  images: string[] | null;
  video: Post['video'] | null;
  spoiler: string | null;
  context: Post['context'] | null;
  hashtags: string[] | null;
  mentions: string[] | null;
  reaction_counts: Record<string, number> | null;
  comment_count: number | null;
  save_count: number | null;
  share_count: number | null;
  state: string | null;
  created_at: string | null;
  edited_at: string | null;
  author?: ProfileRow | null;
}

interface CommentRow {
  id: string;
  post_id: string;
  author_id: string;
  parent_id: string | null;
  reply_to_user_id: string | null;
  body: string;
  spoiler: string | null;
  reaction_counts: Record<string, number> | null;
  state: string | null;
  created_at: string | null;
  author?: ProfileRow | null;
}

interface CollectionRow {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  visibility: string | null;
  follower_count: number | null;
  updated_at: string | null;
  items?: { drama_id: string; note: string | null; added_at: string | null }[] | null;
}

interface NotificationRow {
  id: string;
  group_name: string | null;
  kind: string;
  actor_ids: string[] | null;
  post_id: string | null;
  comment_id: string | null;
  drama_id: string | null;
  episode: number | null;
  collection_id: string | null;
  title: string | null;
  body: string | null;
  read: boolean | null;
  created_at: string | null;
}

interface WatchRow {
  drama_id: string;
  status: string;
  season: number | null;
  current_episode: number | null;
  note: string | null;
  added_at: string | null;
  updated_at: string | null;
  completed_at: string | null;
}

const userFromRow = (r: ProfileRow): User => ({
  id: r.id,
  handle: r.handle ?? 'member',
  displayName: r.display_name ?? 'Member',
  avatarUrl: r.avatar_url ?? undefined,
  bio: r.bio ?? undefined,
  fandoms: (r.fandoms ?? undefined) as User['fandoms'],
  favoriteGenres: r.favorite_genres ?? [],
  favoriteDramaIds: r.favorite_drama_ids ?? [],
  followers: r.follower_count ?? 0,
  following: r.following_count ?? 0,
  joinedAt: r.created_at ?? new Date().toISOString(),
  verified: r.verified ?? undefined,
  isPrivate: r.is_private ?? undefined,
});

const countsFrom = (json: Record<string, number> | null): ReactionCounts => {
  const counts = emptyReactions();
  if (!json) return counts;
  for (const key of Object.keys(counts) as ReactionKind[]) if (typeof json[key] === 'number') counts[key] = json[key];
  return counts;
};

const postFromRow = (r: PostRow): Post => ({
  id: r.id,
  type: r.type,
  authorId: r.author_id,
  createdAt: r.created_at ?? new Date().toISOString(),
  editedAt: r.edited_at ?? undefined,
  body: r.body,
  title: r.title ?? undefined,
  kind: (r.kind ?? undefined) as Post['kind'],
  rating: r.rating ?? undefined,
  verdict: r.verdict ?? undefined,
  images: r.images?.length ? r.images : undefined,
  video: r.video ?? undefined,
  spoiler: (r.spoiler ?? 'none') as Post['spoiler'],
  context: r.context ?? {},
  hashtags: r.hashtags ?? [],
  mentions: r.mentions ?? [],
  reactions: countsFrom(r.reaction_counts),
  commentCount: r.comment_count ?? 0,
  saveCount: r.save_count ?? 0,
  shareCount: r.share_count ?? 0,
  ...(r.state && r.state !== 'active' ? { state: r.state as Post['state'] } : {}),
});

const commentFromRow = (r: CommentRow): Comment => ({
  id: r.id,
  postId: r.post_id,
  authorId: r.author_id,
  parentId: r.parent_id ?? undefined,
  replyToUserId: r.reply_to_user_id ?? undefined,
  body: r.body,
  createdAt: r.created_at ?? new Date().toISOString(),
  spoiler: (r.spoiler ?? 'none') as Comment['spoiler'],
  reactions: countsFrom(r.reaction_counts),
  ...(r.state && r.state !== 'active' ? { state: r.state as Comment['state'] } : {}),
});

const collectionFromRow = (r: CollectionRow): Collection => ({
  id: r.id,
  ownerId: r.owner_id,
  title: r.title,
  description: r.description ?? undefined,
  visibility: (r.visibility ?? 'public') as Collection['visibility'],
  items: (r.items ?? []).map((i) => ({ dramaId: i.drama_id, note: i.note ?? undefined, addedAt: i.added_at ?? new Date().toISOString() })),
  followerCount: r.follower_count ?? 0,
  updatedAt: r.updated_at ?? new Date().toISOString(),
});

const notificationFromRow = (r: NotificationRow): Notification => ({
  id: r.id,
  group: (r.group_name ?? 'social') as Notification['group'],
  kind: r.kind as Notification['kind'],
  actorIds: r.actor_ids ?? undefined,
  postId: r.post_id ?? undefined,
  commentId: r.comment_id ?? undefined,
  dramaId: r.drama_id ?? undefined,
  episode: r.episode ?? undefined,
  collectionId: r.collection_id ?? undefined,
  title: r.title ?? undefined,
  body: r.body ?? undefined,
  createdAt: r.created_at ?? new Date().toISOString(),
  read: r.read ?? false,
});

const watchFromRow = (r: WatchRow): WatchlistItem => ({
  dramaId: r.drama_id,
  status: r.status as WatchStatus,
  season: r.season ?? 1,
  currentEpisode: r.current_episode ?? 0,
  ...(r.note ? { note: r.note } : {}),
  addedAt: r.added_at ?? new Date().toISOString(),
  updatedAt: r.updated_at ?? new Date().toISOString(),
  ...(r.completed_at ? { completedAt: r.completed_at } : {}),
});

// ---------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------
const PERMANENT_CODES = new Set(['23505', '23503', '23514', '42501', 'PGRST301', 'PGRST302', '42703']);

function toBackendError(e: unknown, fallback: string): BackendError {
  if (e instanceof BackendError) return e;
  const err = e as { message?: string; code?: string; name?: string };
  if (err?.name === 'TypeError' || err?.name === 'AbortError') return new BackendError('No connection', true);
  const permanent = !!err?.code && PERMANENT_CODES.has(err.code);
  return new BackendError(err?.message || fallback, !permanent);
}

/** All supabase-js failures arrive as `{ error }` result tuples; normalise them into BackendError. */
function fail(error: { message?: string; code?: string } | null, fallback: string): void {
  if (!error) return;
  throw toBackendError(error, fallback);
}

// ---------------------------------------------------------------------------------------------
// Feed merging
// ---------------------------------------------------------------------------------------------
/** Merge a feed page and sync the per-post viewer flags (saved / my reaction). */
async function mergeFeed(rows: PostRow[], feedKey?: string, cursor?: string, append?: boolean): Promise<void> {
  const posts = rows.map(postFromRow);
  if (posts.length) {
    dispatchLocal({ type: 'mergePosts', posts });
    const authors = rows.map((r) => r.author).filter((a): a is ProfileRow => !!a).map(userFromRow);
    if (authors.length) dispatchLocal({ type: 'mergeUsers', users: authors });

    const token = currentAccessToken();
    const ids = posts.map((p) => p.id);
    if (token && ids.length) {
      const [reactions, saves] = await Promise.all([
        supabase.from('reactions').select('target_id, kind').in('target_id', ids),
        supabase.from('saves').select('post_id').in('post_id', ids),
      ]);
      fail(reactions.error, 'Could not load reactions');
      fail(saves.error, 'Could not load saves');
      const viewerReactions: Record<string, ReactionKind | null> = {};
      for (const r of reactions.data ?? []) viewerReactions[r.target_id] = r.kind as ReactionKind;
      const saved: Record<string, boolean> = {};
      for (const s of saves.data ?? []) saved[s.post_id] = true;
      dispatchLocal({ type: 'viewerSync', reactions: viewerReactions, saved });
    }
  }
  if (feedKey) {
    dispatchLocal({ type: 'setFeed', key: feedKey, ids: posts.map((p) => p.id), cursor: cursor ? { before: cursor } : undefined, append, exhausted: rows.length < PAGE });
  }
}

/** Fetch a page of posts, newest first, optionally older than the stored cursor. */
async function fetchFeed(feedKey: string | undefined, opts?: PullOptions, where?: (q: ReturnType<typeof selectPosts>) => ReturnType<typeof selectPosts>): Promise<void> {
  let q = selectPosts().limit(PAGE);
  if (opts?.more) {
    const before = getStateFeedCursor(feedKey);
    if (before) q = q.lt('created_at', before);
  }
  if (where) q = where(q);
  const { data, error } = await q;
  fail(error, 'Could not load the feed');
  const rows = (data ?? []) as PostRow[];
  const cursor = rows.length === PAGE ? (rows[rows.length - 1]?.created_at ?? undefined) : undefined;
  await mergeFeed(rows, feedKey, cursor, opts?.more);
}

function selectPosts() {
  return supabase.from('posts').select(POST_SELECT);
}

function getStateFeedCursor(feedKey: string | undefined): string | undefined {
  return (feedKey ? getState().feeds[feedKey]?.cursor?.before : undefined) ?? undefined;
}

// ---------------------------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------------------------
/**
 * Local media (`file://` from the picker/recorder) is uploaded to cloud Storage and replaced with
 * the public URL; anything already remote passes through. Video is not optional: a short without its
 * video is not a short, so a failed video upload rejects the whole mutation (the outbox retries it
 * and the author sees the real reason) instead of quietly publishing a video-less row.
 */
/**
 * Local media (`file://` from the picker/recorder) is uploaded to cloud Storage and replaced with
 * the public URL; anything already remote passes through untouched. Bundled asset ids (numbers) are
 * dropped — they only exist in that one build and cannot be shared.
 *
 * Video is not optional: a short without its video is not a short, so a failed video upload rejects
 * the whole mutation (the outbox retries it and the author sees the real reason) instead of quietly
 * publishing a video-less row, which is what used to happen.
 */
async function uploadLocalImage(uri: string | number | undefined, ownerId: string): Promise<string | undefined> {
  if (typeof uri !== 'string' || !uri) return undefined;
  if (/^https?:\/\//i.test(uri)) return uri;
  return (await uploadMedia(uri, { kind: 'image', ownerId })).url;
}

async function uploadLocalVideo(uri: string, ownerId: string): Promise<string> {
  if (/^https?:\/\//i.test(uri)) return uri;
  return (await uploadMedia(uri, { kind: 'video', ownerId })).url;
}

async function withUploadedMedia(post: Post, ownerId: string): Promise<Post> {
  const images = post.images?.length
    ? ((await Promise.all(post.images.map((img) => uploadLocalImage(img, ownerId)))).filter(Boolean) as string[])
    : undefined;

  let video = post.video;
  if (video?.url) {
    const url = await uploadLocalVideo(video.url, ownerId);
    const poster = typeof video.poster === 'string' ? (await uploadLocalImage(video.poster, ownerId)) ?? video.poster : video.poster;
    video = { ...video, url, poster };
  }

  return { ...post, images, video };
}

function isServerAction(type: Mutation['action']['type']): boolean {
  return [
    'addPost', 'editPost', 'deletePost', 'addComment', 'deleteComment', 'react', 'save', 'follow', 'dramaNotify',
    'watch', 'progress', 'note', 'profile', 'prefs', 'onboarding', 'block', 'muteUser', 'muteDrama', 'report',
    'readNotifications', 'upsertCollection', 'deleteCollection', 'collectionItem',
  ].includes(type);
}

const PROFILE_PATCH_KEYS: Record<string, string> = {
  displayName: 'display_name',
  handle: 'handle',
  avatarUrl: 'avatar_url',
  bio: 'bio',
  isPrivate: 'is_private',
  fandoms: 'fandoms',
  favoriteGenres: 'favorite_genres',
  favoriteDramaIds: 'favorite_drama_ids',
};

function pickServerPrefs(patch: Json): Json {
  const out: Json = {};
  for (const key of SERVER_PREF_KEYS) if (patch[key] !== undefined) out[key] = patch[key];
  return out;
}

export const supabaseBackend: Backend = {
  name: 'hallyu-cloud',
  network: true,

  async push(mutation: Mutation): Promise<void> {
    const me = getState().profile.id;
    if (!currentAccessToken() || !me || me === 'guest' || !isServerAction(mutation.action.type)) return;
    const a = mutation.action;
    try {
      switch (a.type) {
        case 'addPost': {
          const p = await withUploadedMedia(a.post, a.post.authorId || me);
          const { error } = await supabase.from('posts').insert({
            id: p.id,
            author_id: p.authorId,
            type: p.type,
            body: p.body,
            title: p.title ?? null,
            kind: p.kind ?? null,
            rating: p.rating ?? null,
            verdict: p.verdict ?? null,
            images: p.images ?? [],
            video: p.video ?? null,
            spoiler: p.spoiler,
            context: p.context,
            hashtags: p.hashtags,
            mentions: p.mentions,
            created_at: p.createdAt,
          });
          return fail(error, 'Could not publish');
        }
        case 'editPost': {
          const patch = a.patch as unknown as Json;
          const uploaded = await withUploadedMedia(
            { ...(a.patch as unknown as Post), id: a.id, authorId: me, type: 'post', body: '', createdAt: '', spoiler: 'none', context: {}, hashtags: [], mentions: [], reactions: emptyReactions(), commentCount: 0, saveCount: 0, shareCount: 0 },
            me,
          );
          const clean = uploaded;
          const row: Json = { edited_at: new Date().toISOString() };
          for (const key of ['body', 'title', 'kind', 'type', 'spoiler', 'context', 'hashtags', 'mentions', 'rating', 'verdict']) {
            if (patch[key] !== undefined) row[key] = clean[key as keyof Post] ?? null;
          }
          if (patch.images !== undefined) row.images = clean.images ?? [];
          if (patch.video !== undefined) row.video = clean.video ?? null;
          const { error } = await supabase.from('posts').update(row).eq('id', a.id);
          return fail(error, 'Could not save the edit');
        }
        case 'deletePost': {
          const { error } = await supabase.from('posts').update({ state: 'deleted' }).eq('id', a.id);
          return fail(error, 'Could not delete the post');
        }
        case 'addComment': {
          const c = a.comment;
          const { error } = await supabase.from('comments').insert({
            id: c.id,
            post_id: c.postId,
            author_id: c.authorId,
            parent_id: c.parentId ?? null,
            reply_to_user_id: c.replyToUserId ?? null,
            body: c.body,
            spoiler: c.spoiler,
            created_at: c.createdAt,
          });
          return fail(error, 'Could not post the comment');
        }
        case 'deleteComment': {
          const { error } = await supabase.from('comments').update({ state: 'deleted' }).eq('id', a.id);
          return fail(error, 'Could not delete the comment');
        }
        case 'react': {
          const { error } = await supabase.rpc('react', { p_target_id: a.targetId, p_kind: a.kind, p_is_comment: !!a.isComment });
          return fail(error, 'Could not save the reaction');
        }
        case 'save':
          if (a.on === false) {
            const { error } = await supabase.from('saves').delete().eq('post_id', a.postId);
            return fail(error, 'Could not update Saved');
          }
          {
            const { error } = await supabase.from('saves').upsert({ user_id: me, post_id: a.postId }, { onConflict: 'user_id,post_id', ignoreDuplicates: true });
            return fail(error, 'Could not save this post');
          }
        case 'follow':
          if (a.on === false) {
            const { error } = await supabase.from('follows').delete().eq('kind', a.kind).eq('target_id', a.id);
            return fail(error, 'Could not update the follow');
          }
          {
            const { error } = await supabase.from('follows').upsert({ follower_id: me, kind: a.kind, target_id: a.id }, { onConflict: 'follower_id,kind,target_id', ignoreDuplicates: true });
            return fail(error, 'Could not follow');
          }
        case 'dramaNotify':
          if (a.on) {
            const { error } = await supabase.from('drama_notify').upsert({ user_id: me, drama_id: a.id }, { onConflict: 'user_id,drama_id', ignoreDuplicates: true });
            return fail(error, 'Could not update episode alerts');
          }
          {
            const { error } = await supabase.from('drama_notify').delete().eq('drama_id', a.id);
            return fail(error, 'Could not update episode alerts');
          }
        case 'watch':
          if (a.status === null) {
            const { error } = await supabase.from('watchlist').delete().eq('drama_id', a.dramaId);
            return fail(error, 'Could not update the watchlist');
          }
          {
            const { error } = await supabase.from('watchlist').upsert(
              { user_id: me, drama_id: a.dramaId, status: a.status, season: a.season ?? 1 },
              { onConflict: 'user_id,drama_id' },
            );
            return fail(error, 'Could not update the watchlist');
          }
        case 'progress': {
          const { error } = await supabase.from('watchlist').upsert(
            { user_id: me, drama_id: a.dramaId, status: a.total && a.episode >= a.total ? 'completed' : 'watching', season: a.season, current_episode: Math.max(0, a.episode) },
            { onConflict: 'user_id,drama_id' },
          );
          return fail(error, 'Could not update the watchlist');
        }
        case 'note': {
          const { error } = await supabase.from('watchlist').upsert(
            { user_id: me, drama_id: a.dramaId, status: 'watching', note: a.note },
            { onConflict: 'user_id,drama_id' },
          );
          return fail(error, 'Could not save the note');
        }
        case 'profile': {
          const patch = a.patch as unknown as Json;
          const row: Json = {};
          for (const [from, to] of Object.entries(PROFILE_PATCH_KEYS)) if (patch[from] !== undefined) row[to] = patch[from];
          if (!Object.keys(row).length) return;
          const { error } = await supabase.from('profiles').update(row).eq('id', me);
          return fail(error, 'Could not save the profile');
        }
        case 'prefs': {
          const patch = pickServerPrefs(a.patch as unknown as Json);
          if (!Object.keys(patch).length) return;
          const { error } = await supabase.rpc('merge_prefs', { p_data: patch });
          return fail(error, 'Could not save the settings');
        }
        case 'onboarding': {
          const { error } = await supabase.rpc('merge_onboarding', { p_data: a.patch as unknown as Json });
          return fail(error, 'Could not save the setup');
        }
        case 'block':
          if (a.on) {
            const { error } = await supabase.from('blocks').upsert({ user_id: me, blocked_id: a.userId }, { onConflict: 'user_id,blocked_id', ignoreDuplicates: true });
            return fail(error, 'Could not block');
          }
          {
            const { error } = await supabase.from('blocks').delete().eq('blocked_id', a.userId);
            return fail(error, 'Could not unblock');
          }
        case 'muteUser':
        case 'muteDrama': {
          const kind = a.type === 'muteUser' ? 'user' : 'drama';
          const target = a.type === 'muteUser' ? (a as { userId: string }).userId : (a as { dramaId: string }).dramaId;
          if ((a as { on: boolean }).on) {
            const { error } = await supabase.from('mutes').upsert({ user_id: me, kind, target_id: target }, { onConflict: 'user_id,kind,target_id', ignoreDuplicates: true });
            return fail(error, 'Could not mute');
          }
          {
            const { error } = await supabase.from('mutes').delete().eq('kind', kind).eq('target_id', target);
            return fail(error, 'Could not unmute');
          }
        }
        case 'report': {
          const { error } = await supabase.from('reports').insert({
            target_id: a.id,
            target_type: a.targetType ?? 'post',
            reason: a.reason ?? null,
            detail: a.detail ?? null,
          });
          return fail(error, 'Could not send the report');
        }
        case 'readNotifications': {
          let q = supabase.from('notifications').update({ read: true });
          q = a.id ? q.eq('id', a.id) : a.group && a.group !== 'all' ? q.eq('group_name', a.group) : q;
          const { error } = await q;
          return fail(error, 'Could not mark notifications read');
        }
        case 'upsertCollection': {
          const { id, title, description, visibility } = a.collection;
          const { error } = await supabase.from('collections').upsert(
            { id, title, description: description ?? null, visibility, updated_at: new Date().toISOString() },
            { onConflict: 'id' },
          );
          fail(error, 'Could not save the collection');
          for (const item of a.collection.items) {
            const itemError = await supabase.from('collection_items')
              .upsert({ collection_id: id, drama_id: item.dramaId, note: item.note ?? null }, { onConflict: 'collection_id,drama_id' })
              .then((r) => r.error, (e) => e);
            fail(itemError, 'Could not save the collection');
          }
          return;
        }
        case 'deleteCollection': {
          const { error } = await supabase.from('collections').delete().eq('id', a.id);
          return fail(error, 'Could not delete the collection');
        }
        case 'collectionItem':
          if (a.on) {
            const { error } = await supabase.from('collection_items').upsert(
              { collection_id: a.collectionId, drama_id: a.dramaId, note: a.note ?? null },
              { onConflict: 'collection_id,drama_id' },
            );
            return fail(error, 'Could not update the collection');
          }
          {
            const { error } = await supabase.from('collection_items').delete().eq('drama_id', a.dramaId).eq('collection_id', a.collectionId);
            return fail(error, 'Could not update the collection');
          }
      }
    } catch (e) {
      throw toBackendError(e, 'Something went wrong');
    }
  },

  async pull(scope: PullScope, opts?: PullOptions): Promise<void> {
    // Live mode: backend data is the only source of truth. On the first pull of a session,
    // drop any demo-fixture rows that older builds persisted, then pull real rows.
    if (!purgedDemo) {
      purgedDemo = true;
      dispatchLocal({ type: 'purgeDemo' });
    }
    if (!currentAccessToken() && scope !== 'home' && !scope.startsWith('feed:') && scope !== 'trending' && scope !== 'shorts' && !scope.startsWith('drama:') && !scope.startsWith('post:') && !scope.startsWith('user:') && !scope.startsWith('search:') && scope !== 'collections' && !scope.startsWith('collection:')) return;
    const signedIn = !!currentAccessToken();

    try {
      if (scope === 'me') {
        if (!signedIn) return;
        await pullMe();
        return;
      }
      if (scope === 'home' || scope === 'feed:forYou') return void (await fetchFeed('forYou', opts));
      if (scope === 'feed:following') {
        if (!signedIn) return;
        const following = await followedUserIds();
        if (!following.length) {
          dispatchLocal({ type: 'setFeed', key: 'following', ids: [], exhausted: true });
          return;
        }
        await fetchFeed('following', opts, (q) => q.in('author_id', following));
        return;
      }
      if (scope === 'trending') {
        await fetchFeed('trending', opts, (q) => q.order('total_reactions', { ascending: false }).order('created_at', { ascending: false }));
        return;
      }
      if (scope === 'activity') {
        if (!signedIn) return;
        await pullActivity(opts);
        return;
      }
      if (scope === 'shorts') {
        await fetchFeed('shorts', opts, (q) => q.eq('type', 'short').not('video', 'is', null));
        return;
      }
      if (scope === 'saved') {
        if (!signedIn) return;
        await pullSaved(opts);
        return;
      }
      if (scope === 'collections') {
        const { data, error } = await supabase.from('collections').select(COLLECTION_SELECT).order('updated_at', { ascending: false }).limit(50);
        fail(error, 'Could not load collections');
        const rows = (data ?? []) as CollectionRow[];
        if (rows.length) dispatchLocal({ type: 'mergeCollections', collections: rows.map(collectionFromRow) });
        return;
      }
      if (scope.startsWith('collection:')) {
        const id = scope.slice('collection:'.length);
        const { data, error } = await supabase.from('collections').select(COLLECTION_SELECT).eq('id', id).maybeSingle();
        fail(error, 'Could not load the collection');
        if (data) dispatchLocal({ type: 'mergeCollections', collections: [collectionFromRow(data as CollectionRow)] });
        return;
      }
      if (scope.startsWith('drama:')) {
        const dramaId = scope.slice('drama:'.length).split(':')[0] ?? '';
        if (!dramaId) return;
        await fetchFeed(`drama:${dramaId}`, opts, (q) => q.contains('context', { dramaId }));
        return;
      }
      if (scope.startsWith('post:')) {
        const postId = scope.slice('post:'.length);
        const [postRes, commentRes] = await Promise.all([
          selectPosts().eq('id', postId).maybeSingle(),
          supabase.from('comments').select(COMMENT_SELECT).eq('post_id', postId).order('created_at', { ascending: false }).limit(200),
        ]);
        fail(postRes.error, 'Could not load the post');
        fail(commentRes.error, 'Could not load the thread');
        const post = postRes.data as PostRow | null;
        if (post) {
          dispatchLocal({ type: 'mergePosts', posts: [postFromRow(post)] });
          if (post.author) dispatchLocal({ type: 'mergeUsers', users: [userFromRow(post.author)] });
        }
        const comments = ((commentRes.data ?? []) as CommentRow[]).map(commentFromRow);
        if (comments.length) {
          dispatchLocal({ type: 'mergeComments', postId, comments });
          const authors = ((commentRes.data ?? []) as CommentRow[]).map((c) => c.author).filter((a): a is ProfileRow => !!a).map(userFromRow);
          if (authors.length) dispatchLocal({ type: 'mergeUsers', users: authors });
        }
        return;
      }
      if (scope.startsWith('user:')) {
        const handle = scope.slice('user:'.length).replace(/^@/, '');
        const { data, error } = await supabase.from('profiles').select('*').eq('handle', handle).maybeSingle();
        fail(error, 'Could not load the profile');
        const profile = data as ProfileRow | null;
        if (!profile) return;
        dispatchLocal({ type: 'mergeUsers', users: [userFromRow(profile)] });
        await fetchFeed(undefined, undefined, (q) => q.eq('author_id', profile.id));
        return;
      }
      if (scope.startsWith('search:')) {
        const q = scope.slice('search:'.length).trim();
        if (!q) return;
        const safe = q.replace(/[,()%]/g, ' ').trim();
        if (!safe) return;
        const [postsRes, usersRes] = await Promise.all([
          selectPosts().or(`body.ilike.%${safe}%,title.ilike.%${safe}%`).order('created_at', { ascending: false }).limit(PAGE),
          supabase.from('profiles').select('*').or(`handle.ilike.%${safe}%,display_name.ilike.%${safe}%`).limit(20),
        ]);
        fail(postsRes.error, 'Search failed');
        fail(usersRes.error, 'Search failed');
        const rows = (postsRes.data ?? []) as PostRow[];
        await mergeFeed(rows);
        const users = ((usersRes.data ?? []) as ProfileRow[]).map(userFromRow);
        if (users.length) dispatchLocal({ type: 'mergeUsers', users });
        return;
      }
      // Unknown scope: nothing to fetch from the server.
    } catch (e) {
      throw toBackendError(e, 'Could not refresh');
    }
  },
};

// ---------------------------------------------------------------------------------------------
// Account snapshot + helpers
// ---------------------------------------------------------------------------------------------
async function followedUserIds(): Promise<string[]> {
  const { data, error } = await supabase.from('follows').select('target_id').eq('kind', 'users');
  fail(error, 'Could not load follows');
  return ((data ?? []) as { target_id: string }[]).map((r) => r.target_id);
}

/** The whole account snapshot in one round: profile, graph, watchlist, prefs, saves, mutes. */
/**
 * Load one slice of the account snapshot. A single unreachable slice (a table the backend has not
 * provisioned, a policy that denies it) must not blank the whole account: the failure is logged and
 * the rest of the snapshot still lands. The profile and the follow graph are mandatory — without
 * them the app cannot know who is signed in.
 */
async function meSlice<T>(
  table: string,
  run: () => PromiseLike<{ data: T | null; error: { message?: string; code?: string } | null }>,
  required = false,
): Promise<T | null> {
  try {
    const { data, error } = await run();
    if (error) throw toBackendError(error, `Could not load ${table}`);
    return data;
  } catch (e) {
    if (required) throw e;
    reportError(`backend.pullMe.${table}`, e);
    return null;
  }
}

async function pullMe(): Promise<void> {
  const me = getState().profile.id;
  const [profile, followsRows, watchRows, notifyRows, reactionRows, saveRows, collectionRows, blockRows, muteRows, prefsRow] = await Promise.all([
    meSlice<ProfileRow>('profiles', () => supabase.from('profiles').select('*').eq('id', me).maybeSingle(), true),
    meSlice<{ kind: string; target_id: string }[]>('follows', () => supabase.from('follows').select('kind, target_id').eq('follower_id', me), true),
    meSlice<WatchRow[]>('watchlist', () => supabase.from('watchlist').select('*').eq('user_id', me)),
    meSlice<{ drama_id: string }[]>('drama_notify', () => supabase.from('drama_notify').select('drama_id').eq('user_id', me)),
    meSlice<{ target_id: string; kind: string }[]>('reactions', () => supabase.from('reactions').select('target_id, kind').eq('user_id', me)),
    meSlice<{ post_id: string }[]>('saves', () => supabase.from('saves').select('post_id').eq('user_id', me)),
    meSlice<CollectionRow[]>('collections', () => supabase.from('collections').select(COLLECTION_SELECT).eq('owner_id', me).order('updated_at', { ascending: false })),
    meSlice<{ blocked_id: string }[]>('blocks', () => supabase.from('blocks').select('blocked_id').eq('user_id', me)),
    meSlice<{ kind: string; target_id: string }[]>('mutes', () => supabase.from('mutes').select('kind, target_id').eq('user_id', me)),
    meSlice<{ data: Json }>('prefs', () => supabase.from('prefs').select('data').eq('user_id', me).maybeSingle()),
  ]);

  const prefsData = ((prefsRow?.data ?? {}) as Json);
  const onboarding = (prefsData.onboarding ?? undefined) as MePayload['onboarding'];

  const reactions: Record<string, ReactionKind> = {};
  for (const r of reactionRows ?? []) reactions[r.target_id] = r.kind as ReactionKind;

  const watchlist: Record<string, ReturnType<typeof watchFromRow>> = {};
  for (const r of watchRows ?? []) watchlist[r.drama_id] = watchFromRow(r);

  const mutedUsers: string[] = [];
  const mutedDramas: string[] = [];
  for (const m of muteRows ?? []) {
    if (m.kind === 'user') mutedUsers.push(m.target_id);
    else mutedDramas.push(m.target_id);
  }

  const payload: MePayload = {
    ...(profile ? { profile: userFromRow(profile) } : {}),
    ...(Object.keys(prefsData).length
      ? { prefs: Object.fromEntries(Object.entries(prefsData).filter(([k]) => SERVER_PREF_KEYS.includes(k))) as MePayload['prefs'] }
      : {}),
    ...(onboarding ? { onboarding } : {}),
    follows: {
      users: (followsRows ?? []).filter((f) => f.kind === 'users').map((f) => f.target_id),
      dramas: (followsRows ?? []).filter((f) => f.kind === 'dramas').map((f) => f.target_id),
      actors: (followsRows ?? []).filter((f) => f.kind === 'actors').map((f) => f.target_id),
      collections: (followsRows ?? []).filter((f) => f.kind === 'collections').map((f) => f.target_id),
    },
    dramaNotify: (notifyRows ?? []).map((r) => r.drama_id),
    watchlist: watchlist as MePayload['watchlist'],
    reactions,
    saves: (saveRows ?? []).map((r) => r.post_id),
    collections: (collectionRows ?? []).map(collectionFromRow),
    blockedUsers: (blockRows ?? []).map((r) => r.blocked_id),
    mutedUsers,
    mutedDramas,
  };
  dispatchLocal({ type: 'me', payload });
}

async function pullActivity(opts?: PullOptions): Promise<void> {
  let q = supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50);
  if (opts?.more) {
    const before = getState().notifications[getState().notifications.length - 1]?.createdAt;
    if (before) q = q.lt('created_at', before);
  }
  const { data, error } = await q;
  fail(error, 'Could not load activity');
  const notifications = ((data ?? []) as NotificationRow[]).map(notificationFromRow);
  if (notifications.length) dispatchLocal({ type: 'mergeNotifications', notifications, append: !opts?.more });
}

async function pullSaved(opts?: PullOptions): Promise<void> {
  let q = supabase.from('saves').select('post_id, created_at').order('created_at', { ascending: false }).limit(PAGE);
  if (opts?.more) {
    const before = getStateFeedCursor('saved');
    if (before) q = q.lt('created_at', before);
  }
  const { data, error } = await q;
  fail(error, 'Could not load Saved');
  const rows = (data ?? []) as { post_id: string; created_at: string }[];
  if (!rows.length) {
    dispatchLocal({ type: 'setFeed', key: 'saved', ids: [], exhausted: true });
    return;
  }
  const { data: postsData, error: postsError } = await selectPosts().in('id', rows.map((r) => r.post_id));
  fail(postsError, 'Could not load Saved');
  const byId = new Map(((postsData ?? []) as PostRow[]).map((p) => [p.id, p]));
  const ordered = rows.map((r) => byId.get(r.post_id)).filter((p): p is PostRow => !!p);
  await mergeFeed(ordered, 'saved', rows[rows.length - 1]?.created_at, opts?.more);
}
