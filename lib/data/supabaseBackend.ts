/**
 * The real backend: Supabase (PostgREST over the `api` schema + Storage + Edge Functions).
 *
 * Reads call the `api.*` read RPCs (feed cards come back pre-joined with author, drama and viewer
 * state); writes call the `api.*` functions with the client-generated UUID so replays are idempotent.
 * Mappers below translate the server JSON (docs/backend/08-api-and-rpc-contract.md) into store records.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../supabase';
import { TMDB_IMG } from '../catalog';
import { now } from '../format';
import { Collection, Comment, Drama, Notification, Post, ReactionKind, User, WatchlistItem } from '../model';
import { Action, MePayload, getState, dispatchLocal } from '../store';
import { Backend, BackendError, PullOptions, PullScope } from './backend';
import { uploadVideo, videoUrl } from '../video';


// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

type Json = Record<string, any>;

function mapError(e: { code?: string; message?: string; details?: string }): BackendError {
  const msg = e.message || 'The server refused the request';
  const code = String(e.code ?? '');
  // contract: SQLSTATE P0001 raised via public.fail(status, msg) → PostgREST passes status through `details`/message;
  // we classify by message and by the HTTP status PostgREST produced (stored in code for fetch errors).
  if (/network|fetch failed|Failed to connect|timeout|Abort/i.test(msg)) return new BackendError(msg, true);
  const m = msg.toLowerCase();
  if (m.includes('too many') || m.includes('rate') || m.includes('per day') || m.includes('try again later')) return new BackendError(msg, true, 429);
  if (m.includes('not authorized') || m.includes('jwt') || m.includes('re-authenticate')) return new BackendError(msg, false, 401);
  return new BackendError(msg, false);
}

async function rpc<T = any>(name: string, args?: Json): Promise<T> {
  const { data, error } = await supabase.rpc(name, args as never);
  if (error) throw mapError(error);
  return data as T;
}

/** Storage keys are relative; URLs are assembled from the public bucket. Video keys resolve on the video-storage project. */
function fileUrl(key?: string | null): string | undefined {
  if (!key) return undefined;
  if (key.startsWith('http')) return key;
  if (key.startsWith('video/')) return videoUrl(key);
  return supabase.storage.from('media').getPublicUrl(key).data.publicUrl;
}

async function authed(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/**
 * The account a read is issued for. Every read carries the signed-in account's JWT, so its result
 * belongs to that account. If the account changes while the request is in flight (sign-out, or a
 * switch A→B), the late response must be dropped instead of written into the new account's store —
 * otherwise a previous user's profile/feed/viewer state could surface under another account.
 * `readOwner()` is captured before the `await`; `isOwner(owner)` is re-checked before any write.
 */
function readOwner(): string {
  return getState().profile.id;
}
function isOwner(owner: string): boolean {
  return getState().profile.id === owner;
}

// ---------------------------------------------------------------------------------------------
// Server → store mappers
// ---------------------------------------------------------------------------------------------

interface CardAuthor {
  id: string;
  handle: string;
  displayName: string;
  avatarKey?: string | null;
  verified?: boolean;
}

function authorToUser(a: CardAuthor): Partial<User> & { id: string } {
  return { id: a.id, handle: a.handle ?? '', displayName: a.displayName ?? a.handle ?? 'Member', avatarUrl: fileUrl(a.avatarKey), verified: !!a.verified };
}

/** post_card().drama → the thinnest valid Drama so a hub can open straight away (full record loads via provider). */
function thinDrama(d?: { id: string; title: string; posterPath?: string | null; tmdbId?: number | null } | null): Drama | undefined {
  if (!d?.id) return undefined;
  const tmdbId = d.tmdbId ?? (d.id.startsWith('tmdb-') ? Number(d.id.slice(5)) : undefined);
  return {
    id: d.id,
    title: d.title ?? 'Untitled',
    year: 0,
    status: 'completed',
    genres: [],
    synopsis: '',
    posterUrl: d.posterPath ? `${TMDB_IMG}/w342${d.posterPath}` : undefined,
    backdropUrl: d.posterPath ? `${TMDB_IMG}/w780${d.posterPath}` : undefined,
    tone: '#221d2e',
    episodeCount: 0,
    seasons: [],
    episodes: [],
    cast: [],
    followerCount: 0,
    provider: tmdbId ? { name: 'tmdb', id: tmdbId } : undefined,
  };
}

function mapPost(card: Json): { post: Post; author?: Partial<User> & { id: string }; drama?: Drama; myReaction?: ReactionKind | null; saved?: boolean } {
  const media: Json[] = Array.isArray(card.media) ? card.media : [];
  const images = media.filter((m) => m.kind === 'image').map((m) => fileUrl(m.key) ?? '');
  const video = media.find((m) => m.kind === 'video');
  const post: Post = {
    id: card.id,
    type: card.type,
    authorId: card.author?.id ?? '',
    createdAt: card.createdAt,
    editedAt: card.editedAt ?? undefined,
    body: card.body ?? '',
    title: card.title ?? undefined,
    kind: card.kind ?? undefined,
    rating: card.rating ?? undefined,
    verdict: card.verdict ?? undefined,
    images: images.length ? images : undefined,
    video: video ? { url: fileUrl(video.key) ?? '', key: video.key ?? undefined, poster: fileUrl(video.posterKey), duration: Math.round((video.durationMs ?? 0) / 1000) } : undefined,
    spoiler: card.spoiler ?? 'none',
    context: {
      dramaId: card.context?.dramaId ?? undefined,
      secondaryDramaId: card.context?.secondaryDramaId ?? undefined,
      season: card.context?.season ?? undefined,
      episode: card.context?.episode ?? undefined,
      actorIds: Array.isArray(card.context?.actorIds) && card.context.actorIds.length ? card.context.actorIds : undefined,
    },
    hashtags: card.hashtags ?? [],
    mentions: card.mentions ?? [],
    reactions: card.reactions ?? { loved: 0, cried: 0, screamed: 0, swooned: 0, laughed: 0, furious: 0 },
    commentCount: card.commentCount ?? 0,
    saveCount: card.saveCount ?? 0,
    shareCount: card.shareCount ?? 0,
    state: card.state ?? 'active',
  };
  return { post, author: card.author ? authorToUser(card.author) : undefined, drama: thinDrama(card.drama), myReaction: card.viewer?.reaction ?? null, saved: card.viewer?.saved };
}

/** Ingest a page of post cards: merge posts/authors/dramas, set the feed order, sync viewer flags. */
function ingestCards(key: string | null, cards: Json[], opts: { append?: boolean; exhausted?: boolean; cursor?: unknown; owner?: string } = {}) {
  // Drop a page whose account changed while it was being fetched (see readOwner/isOwner).
  if (opts.owner !== undefined && !isOwner(opts.owner)) return;
  const posts: Post[] = [];
  const users: Partial<User>[] = [];
  const dramas: Drama[] = [];
  const reasons: Record<string, string> = {};
  const reactions: Record<string, ReactionKind | null> = {};
  const saved: Record<string, boolean> = {};
  for (const c of cards) {
    if (!c?.id) continue;
    const m = mapPost(c);
    posts.push(m.post);
    if (m.author) users.push(m.author);
    if (m.drama) dramas.push(m.drama);
    if (c.score !== undefined && c.type === 'discussion') {
      // feed_for_you doesn't send reasons; the server-side reason map arrives via `rail` tags only
    }
    // Only sync viewer flags the server actually reported. A card without a `viewer` object (e.g.
    // an anonymous read) must not be treated as "not saved / no reaction" — that would wipe local
    // optimistic state. `post_card` always emits a viewer, so this is purely defensive.
    if (c.viewer) {
      reactions[m.post.id] = m.myReaction ?? null;
      if (typeof m.saved === 'boolean') saved[m.post.id] = m.saved;
    }
  }
  const last = cards[cards.length - 1];
  dispatchLocal({ type: 'mergePosts', posts });
  if (users.length) dispatchLocal({ type: 'mergeUsers', users });
  if (dramas.length) dispatchLocal({ type: 'import', dramas });
  if (Object.keys(reactions).length || Object.keys(saved).length) dispatchLocal({ type: 'viewerSync', reactions, saved });
  if (key) {
    dispatchLocal({
      type: 'setFeed',
      key,
      ids: cards.map((c) => c?.id).filter(Boolean),
      append: opts.append,
      exhausted: opts.exhausted ?? cards.length === 0,
      cursor: (opts.cursor as never) ?? (last ? { before: last.createdAt, id: last.id, score: last.score ?? undefined } : undefined),
    });
  }
}

function ingestComments(postId: string, rows: Json[], owner?: string) {
  if (owner !== undefined && !isOwner(owner)) return;
  const comments: Comment[] = [];
  const users: Partial<User>[] = [];
  const reactions: Record<string, ReactionKind | null> = {};
  for (const c of rows) {
    if (!c?.id) continue;
    comments.push({
      id: c.id,
      postId: c.postId,
      authorId: c.author?.id ?? '',
      parentId: c.parentId ?? undefined,
      replyToUserId: c.replyToUserId ?? undefined,
      body: c.body ?? '',
      createdAt: c.createdAt,
      spoiler: c.spoiler ?? 'none',
      reactions: c.reactions ?? { loved: 0, cried: 0, screamed: 0, swooned: 0, laughed: 0, furious: 0 },
      state: c.state ?? 'active',
    });
    if (c.author) users.push(authorToUser(c.author));
    reactions[c.id] = c.viewer?.reaction ?? null;
  }
  dispatchLocal({ type: 'mergeComments', postId, comments });
  if (users.length) dispatchLocal({ type: 'mergeUsers', users });
  dispatchLocal({ type: 'viewerSync', reactions, saved: {} });
}

function mapCollection(row: Json, items?: Json[]): Collection {
  return {
    id: row.id,
    ownerId: row.owner_id ?? row.ownerId ?? '',
    title: row.title ?? '',
    description: row.description ?? undefined,
    visibility: row.visibility === 'private' ? 'private' : 'public',
    items: (items ?? (Array.isArray(row.items) ? row.items : [])).map((i) => ({ dramaId: i.drama_id ?? i.dramaId, note: i.note ?? undefined, addedAt: i.added_at ?? i.addedAt ?? row.updated_at ?? now().toISOString() })),
    followerCount: row.follower_count ?? row.followerCount ?? 0,
    updatedAt: row.updated_at ?? row.updatedAt ?? now().toISOString(),
  };
}

// ---------------------------------------------------------------------------------------------
// Pull (reads)
// ---------------------------------------------------------------------------------------------

const statusMap: Record<string, WatchlistItem['status']> = { watching: 'watching', planned: 'want', completed: 'completed', dropped: 'dropped', paused: 'want' };
const statusToServer: Record<WatchlistItem['status'], string> = { watching: 'watching', want: 'planned', completed: 'completed', dropped: 'dropped' };

async function pullMe() {
  const owner = readOwner();
  const me = await rpc<Json | null>('me');
  if (!me || !isOwner(owner)) return;
  const p: MePayload = {};
  const row = me.profile;
  if (row) {
    p.profile = {
      id: row.id,
      handle: row.handle,
      displayName: row.display_name,
      avatarUrl: fileUrl(row.avatar_key),
      bio: row.bio || undefined,
      favoriteGenres: row.favorite_genres ?? [],
      favoriteDramaIds: row.favorite_drama_ids ?? [],
      followers: row.follower_count ?? 0,
      following: row.following_count ?? 0,
      joinedAt: row.created_at,
      verified: !!row.verified,
      isPrivate: !!row.is_private,
    };
    p.prefs = { ...(row.prefs ?? {}), language: row.language ?? 'en', termsVersion: row.terms_version ?? 0 } as never;
    if (row.onboarding && Object.keys(row.onboarding).length) p.onboarding = row.onboarding;
  }
  p.follows = { users: me.follows?.users ?? [], dramas: me.follows?.dramas ?? [], actors: me.follows?.actors ?? [], collections: me.follows?.collections ?? [] };
  p.dramaNotify = me.dramaNotify ?? [];
  const wl: Record<string, WatchlistItem> = {};
  for (const w of me.watchlist ?? []) {
    wl[w.drama_id] = { dramaId: w.drama_id, status: statusMap[w.status] ?? 'want', season: w.season ?? 1, currentEpisode: w.current_episode ?? 0, note: w.note ?? undefined, addedAt: w.added_at, updatedAt: w.updated_at, completedAt: w.completed_at ?? undefined };
  }
  p.watchlist = wl;
  const rx: Record<string, ReactionKind> = {};
  for (const [k, v] of Object.entries<string>(me.reactions ?? {})) {
    const id = k.includes(':') ? k.split(':')[1]! : k;
    if (v) rx[id] = v as ReactionKind;
  }
  p.reactions = rx;
  p.saves = me.saves ?? [];
  p.blockedUsers = me.blocks ?? [];
  p.mutedUsers = (me.mutes ?? []).filter((m: Json) => m.type === 'user').map((m: Json) => m.id);
  p.mutedDramas = (me.mutes ?? []).filter((m: Json) => m.type === 'drama').map((m: Json) => m.id);
  p.collections = (me.collections ?? []).map((c: Json) => mapCollection(c));
  dispatchLocal({ type: 'me', payload: p });
  // keep the users cache warm with my own record (profile_page merges find it)
  if (p.profile?.id) dispatchLocal({ type: 'mergeUsers', users: [p.profile as User] });
}

async function pullHome() {
  const owner = readOwner();
  const [feed, rails] = await Promise.all([
    rpc<Json[]>('feed_for_you', { p_limit: 30 }).catch(() => [] as Json[]),
    rpc<Json | null>('home_rails').catch(() => null),
  ]);
  if (!isOwner(owner)) return;
  ingestCards('forYou', feed, { exhausted: feed.length < 30, owner });
  if (!rails) return;
  // rails: merge trending dramas/posters, prime trending feeds
  const dramas: Drama[] = (rails.trendingDramas ?? []).map((t: Json) => ({
    ...(thinDrama({ id: t.id, title: t.title, posterPath: t.posterPath, tmdbId: t.id?.startsWith('tmdb-') ? Number(t.id.slice(5)) : null }) as Drama),
    followerCount: t.watching ?? 0,
  })).filter((d: Drama) => !!d?.id);
  if (dramas.length) dispatchLocal({ type: 'import', dramas });
  dispatchLocal({ type: 'setFeed', key: 'trendingDramas', ids: (rails.trendingDramas ?? []).map((t: Json) => t.id), exhausted: true });
  ingestCards(null, rails.trendingPosts ?? [], { owner });
  dispatchLocal({ type: 'setFeed', key: 'trendingPosts', ids: (rails.trendingPosts ?? []).map((p: Json) => p.id), exhausted: true });
  ingestCards(null, rails.trendingDiscussions ?? [], { owner });
  dispatchLocal({ type: 'setFeed', key: 'trendingDiscussions', ids: (rails.trendingDiscussions ?? []).map((p: Json) => p.id), exhausted: true });
  // "airing today" needs full drama records for episode titles — screens fall back to catalog TMDB; store thin ones too
  const airing: Drama[] = [];
  for (const e of rails.airingToday ?? []) {
    const d = thinDrama({ id: e.dramaId, title: e.title, posterPath: e.posterPath, tmdbId: e.dramaId?.startsWith('tmdb-') ? Number(e.dramaId.slice(5)) : null });
    if (d) airing.push({ ...d, status: 'airing', nextEpisodeAt: e.airAt });
  }
  if (airing.length) dispatchLocal({ type: 'import', dramas: airing });
  void rails.liveRooms; // live-room wiring lands with the realtime pass
}

async function pullActivity() {
  const owner = readOwner();
  const s = getState();
  if (!(await authed())) return;
  const rows = await rpc<Json[]>('notifications_page', { p_limit: 50 });
  if (!isOwner(owner)) return;
  const notifs: Notification[] = [];
  const users: Partial<User>[] = [];
  for (const n of rows) {
    notifs.push({
      id: n.id,
      group: n.group,
      kind: n.kind,
      actorIds: n.actorIds?.length ? n.actorIds : undefined,
      postId: n.postId ?? undefined,
      commentId: n.commentId ?? undefined,
      dramaId: n.dramaId ?? undefined,
      episode: n.episode ?? undefined,
      collectionId: n.collectionId ?? undefined,
      title: n.title ?? undefined,
      body: n.body ?? undefined,
      createdAt: n.createdAt,
      read: !!n.read,
    });
    for (const a of n.actors ?? []) users.push(authorToUser(a));
  }
  if (users.length) dispatchLocal({ type: 'mergeUsers', users });
  const prev = s.notifications;
  const merged = notifs.concat(prev).filter((x, i, all) => all.findIndex((y) => y.id === x.id) === i).slice(0, 150);
  dispatchLocal({ type: 'mergeNotifications', notifications: merged });
  const last = rows[0];
  if (last) dispatchLocal({ type: 'setFeed', key: 'activity', ids: [], exhausted: rows.length < 50, cursor: { before: last.createdAt } });
}

async function pullCollectionsTab() {
  const { data, error } = await supabase
    .from('collections')
    .select('id, owner_id, title, description, visibility, cover_drama_id, item_count, follower_count, updated_at')
    .eq('visibility', 'public')
    .order('follower_count', { ascending: false })
    .limit(40);
  if (error) throw mapError(error);
  const cols = (data ?? []).map((c) => mapCollection(c, []));
  const owners = [...new Set(cols.map((c) => c.ownerId))];
  if (owners.length) {
    const { data: profs } = await supabase.from('profiles').select('id, handle, display_name, avatar_key, verified').in('id', owners.slice(0, 20));
    if (profs?.length) dispatchLocal({ type: 'mergeUsers', users: profs.map((p: Json) => ({ id: p.id, handle: p.handle, displayName: p.display_name, avatarUrl: fileUrl(p.avatar_key), verified: !!p.verified })) });
  }
  dispatchLocal({ type: 'mergeCollections', collections: cols });
  dispatchLocal({ type: 'setFeed', key: 'collections:community', ids: cols.map((c) => c.id), exhausted: cols.length < 40 });
}

async function pullCollection(id: string) {
  const { data, error } = await supabase.from('collections').select('*').eq('id', id).maybeSingle();
  if (error) throw mapError(error);
  if (!data) return;
  const { data: items } = await supabase.from('collection_items').select('drama_id, note, added_at').eq('collection_id', id).order('added_at');
  dispatchLocal({ type: 'mergeCollections', collections: [mapCollection(data, items ?? [])] });
  const { data: prof } = await supabase.from('profiles').select('id, handle, display_name, avatar_key, verified, bio, favorite_genres, favorite_drama_ids, follower_count, following_count, created_at').eq('id', data.owner_id).maybeSingle();
  if (prof) dispatchLocal({ type: 'mergeUsers', users: [{ id: prof.id, handle: prof.handle, displayName: prof.display_name, avatarUrl: fileUrl(prof.avatar_key), bio: prof.bio || undefined, favoriteGenres: prof.favorite_genres ?? [], favoriteDramaIds: prof.favorite_drama_ids ?? [], followers: prof.follower_count, following: prof.following_count, joinedAt: prof.created_at, verified: !!prof.verified }] });
}

async function pullProfile(handle: string) {
  const owner = readOwner();
  const page = await rpc<Json | null>('profile_page', { p_handle: handle.toLowerCase() });
  if (!page) return;
  const user: Partial<User> & { id: string } = {
    id: page.id,
    handle: page.handle,
    displayName: page.displayName,
    avatarUrl: fileUrl(page.avatarKey),
    bio: page.bio || undefined,
    favoriteGenres: page.favoriteGenres ?? [],
    favoriteDramaIds: page.favoriteDramaIds ?? [],
    followers: page.followers ?? 0,
    following: page.following ?? 0,
    joinedAt: page.joinedAt,
    verified: !!page.verified,
    isPrivate: !!page.isPrivate,
  };
  dispatchLocal({ type: 'mergeUsers', users: [user] });
  dispatchLocal({ type: 'mergeCollections', collections: (page.collections ?? []).map((c: Json) => ({ id: c.id, ownerId: page.id, title: c.title, visibility: c.visibility === 'private' ? ('private' as const) : ('public' as const), items: [], followerCount: c.followerCount ?? 0, updatedAt: now().toISOString() })) });
  const posts = await rpc<Json[]>('user_posts', { p_user_id: page.id, p_limit: 30 }).catch(() => [] as Json[]);
  ingestCards(`user:${page.id}`, posts, { exhausted: posts.length < 30, owner });
}

async function pullPost(id: string) {
  const owner = readOwner();
  const card = await rpc<Json | null>('post_page', { p_id: id });
  if (card) {
    ingestCards(null, [card], { owner });
    // drama hub context may reference a drama this device hasn't seen — ensure-catalog materialises it
    void card;
  }
  const comments = await rpc<Json[]>('comments_page', { p_post_id: id, p_limit: 50 }).catch(() => [] as Json[]);
  ingestComments(id, comments, owner);
}

/**
 * Materialise any saved post that isn't already in the local cache. The Saved screen is driven by
 * `state.saves` (the authoritative id list); without this, a post saved on another device — or one
 * whose card has aged out of the feed cache — would silently vanish from the list.
 */
async function pullSaved() {
  const owner = readOwner();
  const s = getState();
  const missing = s.saves.filter((id) => !s.posts.some((p) => p.id === id));
  if (!missing.length) return;
  const cards = await Promise.all(missing.slice(0, 50).map((id) => rpc<Json | null>('post_page', { p_id: id }).catch(() => null)));
  ingestCards(null, cards.filter((c): c is Json => !!c), { owner });
}

async function pullDrama(scope: string) {
  // drama:<id> or drama:<id>:<tab>
  const owner = readOwner();
  const rest = scope.slice('drama:'.length);
  const [dramaId, tab = 'all'] = rest.split(':');
  const cards = await rpc<Json[]>('drama_posts', { p_drama_id: dramaId, p_tab: tab === 'top' ? 'all' : tab, p_limit: 30 });
  // `top` ordering is applied client-side over the latest window; `latest` keeps server order
  const heat = (c: Json): number => Object.values<number>(c.reactions ?? {}).reduce((x, y) => x + y, 0) + 3 * (c.commentCount ?? 0) + 2 * (c.saveCount ?? 0);
  if (tab !== 'top') ingestCards(`drama:${dramaId}:latest`, cards, { owner });
  if (tab !== 'latest') ingestCards(`drama:${dramaId}:top`, [...cards].sort((a, b) => heat(b) - heat(a)), { owner });
}

async function pullEpisode(scope: string) {
  const owner = readOwner();
  const [, dramaId, season, episode] = scope.split(':');
  const room = await rpc<Json | null>('episode_room', { p_drama_id: dramaId, p_season: Number(season), p_episode: Number(episode) });
  if (!room) return;
  const posts = (room.posts as Json[]) ?? [];
  ingestCards(`episode:${dramaId}:${season}:${episode}`, posts, { owner });
  liveMeters.set(`${dramaId}:${season}:${episode}`, { counts: (room.counts as Record<string, number>) ?? {}, recentPosters: room.recentPosters ?? 0 });
}

/** In-memory live meter for episode rooms (polled by the room screen while it is open). */
export const liveMeters = new Map<string, { counts: Record<string, number>; recentPosters: number }>();

async function pullSearch(q: string) {
  const owner = readOwner();
  const needle = q.trim().toLowerCase();
  if (!needle) return;
  const [posts, people] = await Promise.all([
    rpc<Json[]>('search_posts', { p_q: q, p_limit: 20 }).catch(() => [] as Json[]),
    rpc<Json[]>('search_people', { p_q: q, p_limit: 12 }).catch(() => [] as Json[]),
  ]);
  ingestCards(`search:${needle}`, posts, { owner });
  if (people?.length && isOwner(owner)) {
    dispatchLocal({ type: 'mergeUsers', users: people.map((p) => ({ id: p.id, handle: p.handle, displayName: p.displayName, avatarUrl: fileUrl(p.avatarKey), verified: !!p.verified, followers: p.followers ?? 0 })) });
    dispatchLocal({ type: 'setFeed', key: `searchPeople:${needle}`, ids: people.map((p) => p.id), exhausted: true });
  }
}

async function pull(scope: PullScope, opts?: PullOptions) {
  switch (true) {
    case scope === 'home':
    case scope === 'explore':
      if (scope === 'home') {
        await Promise.all([pullHome(), authed().then((u) => (u ? pullMe() : undefined)).catch(() => {})]);
        await pullFeed('forYou', opts);
      } else await pullHome();
      return;
    case scope === 'me':
      return pullMe();
    case scope === 'activity':
      return pullActivity();
    case scope === 'saved':
      return pullSaved();
    case scope === 'collections':
      return pullCollectionsTab();
    case scope === 'trending':
      return pullHome();
    case scope === 'feed:forYou':
      return pullFeed('forYou', opts);
    case scope === 'feed:following':
      return pullFeed('following', opts);
    case scope === 'shorts':
      return pullFeed('shorts', opts);
    case scope.startsWith('drama:'):
      return pullDrama(scope);
    case scope.startsWith('episode:'):
      return pullEpisode(scope);
    case scope.startsWith('post:'):
      return pullPost(scope.slice(5));
    case scope.startsWith('user:'):
      return pullProfile(scope.slice(5));
    case scope.startsWith('search:'):
      return pullSearch(decodeURIComponent(scope.slice(7)));
    case scope.startsWith('collection:'):
      return pullCollection(scope.slice(11));
    default:
      return; // local-only scopes (profile, drama detail art…) are handled by the TMDB catalog loader
  }
}

async function pullFeed(key: 'forYou' | 'following' | 'shorts', opts?: PullOptions) {
  const owner = readOwner();
  const s = getState();
  const feed = s.feeds[key];
  const append = !!opts?.more;
  if (append && feed?.exhausted) return;
  const cursor = append ? feed?.cursor : undefined;
  if (key === 'forYou') {
    const cards = await rpc<Json[]>('feed_for_you', { p_limit: 20, ...(cursor?.score !== undefined && append ? { p_after_score: cursor.score, p_after_id: cursor.id } : {}) });
    ingestCards('forYou', cards, { append, exhausted: cards.length < 20, owner });
    return;
  }
  if (key === 'following') {
    if (!(await authed())) return;
    const cards = await rpc<Json[]>('feed_following', { p_limit: 20, ...(cursor?.before ? { p_before: cursor.before, p_before_id: cursor.id } : {}) });
    ingestCards('following', cards, { append, exhausted: cards.length < 20, owner });
    return;
  }
  const cards = await rpc<Json[]>('feed_shorts', { p_limit: 12, ...(cursor?.before ? { p_before: cursor.before, p_before_id: cursor.id } : {}) });
  ingestCards('shorts', cards, { append, exhausted: cards.length < 12, owner });
}

// ---------------------------------------------------------------------------------------------
// Push (writes)
// ---------------------------------------------------------------------------------------------

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** base64 → bytes without relying on atob/Buffer (RN runtimes vary). */
function decodeBase64(b64: string): Uint8Array {
  const CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Int16Array(128).fill(-1);
  for (let i = 0; i < 64; i++) lookup[CH.charCodeAt(i)] = i;
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = lookup[clean.charCodeAt(i)]!;
    const c1 = lookup[clean.charCodeAt(i + 1)]!;
    const c2 = i + 2 < clean.length ? lookup[clean.charCodeAt(i + 2)]! : 0;
    const c3 = i + 3 < clean.length ? lookup[clean.charCodeAt(i + 3)]! : 0;
    out[o++] = (c0 << 2) | (c1 >> 4);
    if (o < out.length) out[o++] = ((c1 & 15) << 4) | (c2 >> 2);
    if (o < out.length) out[o++] = ((c2 & 3) << 6) | c3;
  }
  return out;
}
const ulid = () => Array.from({ length: 26 }, () => B32[(Math.random() * 32) | 0]).join('');

/** Upload local image(s) to Storage under the media bucket, returning the server keys. */
async function uploadImages(uris: string[], ownerId: string): Promise<{ key: string; width?: number; height?: number }[]> {
  const out: { key: string; width?: number; height?: number }[] = [];
  for (const uri of uris) {
    if (/^https?:/.test(uri)) {
      out.push({ key: uri });
      continue;
    }
    let file = uri;
    let width: number | undefined;
    let height: number | undefined;
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists || (info.size ?? 0) > 8 * 1024 * 1024) {
        const resized = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1600 } }], { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG });
        file = resized.uri;
        width = resized.width;
        height = resized.height;
      }
    } catch {
      file = uri;
    }
    const isJpg = !/\.(png|webp)$/i.test(file);
    const key = `posts/${ownerId}/${ulid()}.${isJpg ? 'jpg' : file.endsWith('.webp') ? 'webp' : 'png'}`;
    const base64 = await FileSystem.readAsStringAsync(file, { encoding: FileSystem.EncodingType.Base64 });
    const bytes = decodeBase64(base64);
    const { data, error } = await supabase.storage.from('media').upload(key, bytes, { contentType: isJpg ? 'image/jpeg' : file.endsWith('.webp') ? 'image/webp' : 'image/png', upsert: false });
    if (error) throw new BackendError(error.message.includes('duplicate') ? 'That file was already uploaded' : error.message, false);
    out.push({ key, width, height });
  }
  return out;
}

async function uploadAvatar(uri: string, ownerId: string): Promise<string> {
  // Avatars share the 8 MB image bucket limit — downscale first so a gallery pick never fails.
  let file = uri;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && (info.size ?? 0) > 1024 * 1024) {
      const resized = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 512 } }], { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG });
      file = resized.uri;
    }
  } catch {
    // keep the original if probing/resizing fails
  }
  const base64 = await FileSystem.readAsStringAsync(file, { encoding: FileSystem.EncodingType.Base64 });
  const { data, error } = await supabase.storage.from('media').upload(`avatars/${ownerId}/${ulid()}.jpg`, decodeBase64(base64), { contentType: 'image/jpeg', upsert: false });
  if (error) throw new BackendError(error.message, false);
  return data.path;
}

/** Materialise a catalog row (drama/actor) via the edge function before any write that references one. */
const ensured = new Set<string>();
async function ensureCatalog(id: string, kind: 'drama' | 'actor' = 'drama'): Promise<void> {
  if (!id?.startsWith('tmdb-')) return;
  const tmdbId = Number(id.slice(5));
  if (!Number.isFinite(tmdbId) || tmdbId <= 0) return;
  const key = `${kind}:${id}`;
  if (ensured.has(key)) return;
  const cached = kind === 'drama' ? getState().importedDramas.some((d) => d.id === id) : getState().importedActors.some((a) => a.id === id);
  if (cached) {
    ensured.add(key);
    return;
  }
  try {
    const { data, error } = await supabase.functions.invoke('ensure-catalog', { body: { tmdbId, kind } });
    if (error) throw error;
    if (data?.id) {
      ensured.add(key);
      if (kind === 'drama') {
        const d = thinDrama({ id: data.id, title: data.title, tmdbId });
        if (d) dispatchLocal({ type: 'import', dramas: [{ ...d, episodeCount: data.episodeCount ?? 0 }] });
      } else {
        dispatchLocal({ type: 'import', actors: [{ id: data.id, name: data.name ?? 'Actor', knownFor: [], followerCount: 0, provider: { name: 'tmdb', id: tmdbId } }] });
      }
    }
  } catch (e) {
    throw new BackendError(e instanceof Error ? e.message : 'Catalog lookup failed', true);
  }
}

async function pushAddPost(a: Extract<Action, { type: 'addPost' }>) {
  const uidMe = await authed();
  if (!uidMe) throw new BackendError('Sign in to post', false, 401);
  const p = a.post;
  for (const d of [p.context.dramaId, p.context.secondaryDramaId]) if (d) await ensureCatalog(d);
  let media: Json[] = [];
  const localImages = (p.images ?? []).filter((i): i is string => typeof i === 'string' && !/^https?:/.test(i));
  if (localImages.length) {
    const uploaded = await uploadImages(localImages, uidMe);
    media = uploaded.map((u) => ({ key: u.key, kind: 'image', width: u.width, height: u.height }));
  }
  let videoKey: string | undefined;
  if (p.video && !/^https?:/.test(p.video.url)) {
    // Bytes go to the video-storage project (Rork cloud); this DB only ledgers the key.
    const uploaded = await uploadVideo({ uri: p.video.url, duration: p.video.duration, width: p.video.width, height: p.video.height }, p.id);
    videoKey = uploaded.key;
    const posterUri = typeof p.video.poster === 'string' && !/^https?:/.test(p.video.poster) ? p.video.poster : undefined;
    if (!posterUri) throw new BackendError('Video poster could not be uploaded — will retry', true);
    const posters = await uploadImages([posterUri], uidMe).catch(() => [] as { key: string }[]);
    if (!posters[0]?.key) throw new BackendError('Video poster could not be uploaded — will retry', true);
    media = [{ key: uploaded.key, kind: 'video', posterKey: posters[0].key, width: p.video.width, height: p.video.height, durationMs: Math.round(p.video.duration * 1000) }];
  } else if (p.video) {
    videoKey = p.video.url;
    media = [{ key: p.video.url, kind: 'video', durationMs: Math.round(p.video.duration * 1000) }];
  }
  const body = {
    id: p.id,
    type: p.type,
    body: p.body,
    title: p.title,
    kind: p.kind,
    rating: p.rating,
    verdict: p.verdict,
    spoiler: p.spoiler,
    context: { dramaId: p.context.dramaId, secondaryDramaId: p.context.secondaryDramaId, season: p.context.season, episode: p.context.episode, actorIds: p.context.actorIds ?? [] },
    hashtags: p.hashtags,
    mentionIds: p.mentions,
    media,
  };
  await rpc('create_post', { p: body });
  const merged: Post = { ...p, id: p.id, state: 'active' } as Post;
  if (videoKey && merged.video) merged.video = { ...merged.video, key: videoKey };
  dispatchLocal({ type: 'mergePosts', posts: [merged] });
}

async function push(m: Parameters<Backend['push']>[0]) {
  const a = m.action;
  const uidMe = await authed();
  switch (a.type) {
    case 'follow': {
      if (a.kind === 'dramas') await ensureCatalog(a.id, 'drama');
      if (a.kind === 'actors') await ensureCatalog(a.id, 'actor');
      return void (await rpc('set_follow', { p_type: a.kind === 'users' ? 'user' : a.kind === 'dramas' ? 'drama' : a.kind === 'actors' ? 'actor' : 'collection', p_id: a.id, p_on: a.on ?? false }));
    }
    case 'dramaNotify': {
      await ensureCatalog(a.id);
      return void (await rpc('set_drama_notify', { p_drama_id: a.id, p_on: a.on }));
    }
    case 'watch':
    case 'progress':
    case 'note': {
      await ensureCatalog(a.dramaId);
      const item = getState().watchlist[a.dramaId];
      if (!item) return void (await rpc('remove_watchlist', { p_drama_id: a.dramaId }));
      return void (await rpc('upsert_watchlist', { p_drama_id: a.dramaId, p_status: statusToServer[item.status], p_season: item.season, p_episode: item.currentEpisode, p_note: item.note ?? null }));
    }
    case 'react':
      return void (await rpc('set_reaction', { p_type: a.isComment ? 'comment' : 'post', p_id: a.targetId, p_kind: a.kind }));
    case 'save': {
      // Prefer the target captured when the user tapped (survives a stale pull racing the flush);
      // fall back to the live store for mutations replayed from an older persisted outbox.
      const on = a.on ?? getState().saves.includes(a.postId);
      return void (await rpc('set_save', { p_post_id: a.postId, p_on: on }));
    }
    case 'addPost':
      return pushAddPost(a);
    case 'editPost': {
      return void (await rpc('edit_post', { p_id: a.id, p: { body: a.patch.body, title: a.patch.title, spoiler: a.patch.spoiler, hashtags: a.patch.hashtags } }));
    }
    case 'deletePost':
      return void (await rpc('delete_post', { p_id: a.id }));
    case 'addComment': {
      await rpc<Json>('create_comment', { p: { id: a.comment.id, postId: a.comment.postId, parentId: a.comment.parentId ?? null, replyToUserId: a.comment.replyToUserId ?? null, body: a.comment.body, spoiler: a.comment.spoiler ?? 'none' } });
      return;
    }
    case 'deleteComment':
      return void (await rpc('delete_comment', { p_id: a.id }));
    case 'upsertCollection': {
      for (const it of a.collection.items) await ensureCatalog(it.dramaId);
      return void (await rpc('upsert_collection', { p: { id: a.collection.id, title: a.collection.title, description: a.collection.description ?? null, visibility: a.collection.visibility, coverDramaId: a.collection.items[0]?.dramaId ?? null } }));
    }
    case 'deleteCollection':
      return void (await rpc('delete_collection', { p_id: a.id }));
    case 'collectionItem': {
      await ensureCatalog(a.dramaId);
      return void (await rpc('set_collection_item', { p_collection_id: a.collectionId, p_drama_id: a.dramaId, p_on: a.on, p_note: a.note ?? null }));
    }
    case 'profile': {
      if (!uidMe) throw new BackendError('Sign in first', false, 401);
      const patch = a.patch;
      // Self-profile writes go through the authorized RPC (api.update_profile): it restricts the update to
      // the caller's own row and whitelists the writable columns. `api.profiles` is a read-only view for
      // clients, so a direct `.from('profiles').update(...)` is rejected by the database.
      const p: Json = {};
      if (patch.displayName !== undefined) p.display_name = patch.displayName;
      if (patch.bio !== undefined) p.bio = patch.bio ?? '';
      if (patch.favoriteGenres !== undefined) p.favorite_genres = patch.favoriteGenres;
      if (patch.favoriteDramaIds !== undefined) p.favorite_drama_ids = patch.favoriteDramaIds;
      if (patch.isPrivate !== undefined) p.is_private = patch.isPrivate;
      if (Object.keys(p).length) await rpc('update_profile', { p_patch: p });
      if (patch.handle && patch.handle !== getState().profile.handle) {
        try {
          await rpc('claim_handle', { p_handle: patch.handle });
        } catch (e) {
          const err = e as BackendError;
          throw new BackendError(err.message?.toLowerCase().includes('taken') ? 'That handle is taken' : err.message, false);
        }
      }
      if (patch.avatarUrl && !/^https?:/.test(patch.avatarUrl)) {
        const key = await uploadAvatar(patch.avatarUrl, uidMe);
        await rpc('update_profile', { p_patch: { avatar_key: key } });
        dispatchLocal({ type: 'profile', patch: { avatarUrl: fileUrl(key) } });
      }
      return;
    }
    case 'prefs': {
      if (!uidMe) return; // device-only until sign-in; replayed from the persisted store afterwards
      const patch = { ...a.patch } as Json;
      const language = patch.language;
      const terms = patch.termsVersion;
      delete patch.language;
      delete patch.termsVersion;
      // The RPC shallow-merges `prefs`, so no read-modify-write is needed (and no race with a concurrent pull).
      const p: Json = { prefs: patch };
      if (language) p.language = language;
      if (terms !== undefined) p.terms_version = terms;
      await rpc('update_profile', { p_patch: p });
      return;
    }
    case 'onboarding': {
      if (!uidMe) return;
      const s = getState();
      await rpc('update_profile', { p_patch: { onboarding: { done: s.onboarding.done, step: s.onboarding.step, intent: s.onboarding.intent ?? null, genres: s.onboarding.genres } } });
      return;
    }
    case 'block':
      return void (await rpc('set_block', { p_user_id: a.userId, p_on: a.on }));
    case 'muteUser':
      return void (await rpc('set_mute', { p_type: 'user', p_id: a.userId, p_on: a.on }));
    case 'muteDrama':
      return void (await rpc('set_mute', { p_type: 'drama', p_id: a.dramaId, p_on: a.on }));
    case 'report': {
      if (!a.targetType) return; // local-only legacy path (nothing to send)
      return void (await rpc('create_report', { p_type: a.targetType, p_id: a.id, p_reason: a.reason ?? 'other', p_detail: a.detail ?? null }));
    }
    case 'readNotifications': {
      if (a.id) return void (await rpc('mark_notifications_read', { p_ids: [a.id] }));
      if (!a.group || a.group === 'all') return void (await rpc('mark_notifications_read', { p_ids: null }));
      const ids = getState().notifications.filter((n) => n.group === a.group && !n.read).map((n) => n.id);
      if (!ids.length) return;
      return void (await rpc('mark_notifications_read', { p_ids: ids }));
    }
    default:
      return; // local-only action; nothing to send
  }
}

// ---------------------------------------------------------------------------------------------
// Push token registration (fires once when notifications permission is held)
// ---------------------------------------------------------------------------------------------

const PUSH_TOKEN_KEY = 'hallyu.push.token';
export async function registerPushToken(token: string, platform: 'android' | 'ios' = 'android'): Promise<void> {
  const prev = await AsyncStorage.getItem(PUSH_TOKEN_KEY).catch(() => null);
  if (prev === token) return;
  await rpc('register_push_token', { p_token: token, p_platform: platform });
  await AsyncStorage.setItem(PUSH_TOKEN_KEY, token).catch(() => {});
}
export async function unregisterPushToken(token: string): Promise<void> {
  try {
    await rpc('unregister_push_token', { p_token: token });
  } catch {
    /* best effort */
  }
}

/** Real follower/following lists (api.connections_page). */
export async function fetchConnections(handle: string, tab: 'followers' | 'following'): Promise<(Partial<User> & { id: string })[]> {
  const rows = await rpc<Json[]>('connections_page', { p_handle: handle.toLowerCase(), p_tab: tab, p_limit: 60 });
  const users = (rows ?? []).map((p) => ({ id: p.id, handle: p.handle, displayName: p.displayName, avatarUrl: fileUrl(p.avatarKey), verified: !!p.verified, followers: p.followers ?? 0 }));
  if (users.length) dispatchLocal({ type: 'mergeUsers', users });
  return users;
}

/** Live handle autocomplete for @-mentions (search_people), merging hits into the users cache. */
export async function searchPeopleRemote(q: string): Promise<(Partial<User> & { id: string })[]> {
  if (q.length < 1) return [];
  const rows = await rpc<Json[]>('search_people', { p_q: q, p_limit: 8 }).catch(() => [] as Json[]);
  const users = (rows ?? []).map((p) => ({ id: p.id, handle: p.handle, displayName: p.displayName, avatarUrl: fileUrl(p.avatarKey), verified: !!p.verified }));
  if (users.length) dispatchLocal({ type: 'mergeUsers', users });
  return users;
}

export const supabaseBackend: Backend = {
  name: 'supabase',
  push: (m) => push(m),
  pull: (scope, opts) => pull(scope, opts),
};

