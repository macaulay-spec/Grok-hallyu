/**
 * Feed, comment, profile and notification reads — the backend side of the read cache.
 *
 * The store (lib/store.tsx) stays the cache every screen renders from; lib/sync.ts adopts these
 * server results into it on sign-in and when screens pull to refresh. All reads are session-scoped
 * (RLS answers for the member) except `feed_page`/`comment_page`, which the database also exposes
 * anonymously for public content.
 */
import type { Comment, Notification, Post, PostType, SpoilerLevel, User } from '../model';
import { getBackendAccessToken, supabase } from './client';

function db() {
  if (!supabase) throw new Error('no backend configured');
  return supabase;
}

function sessionDb() {
  if (!supabase || !getBackendAccessToken()) throw new Error('a backend session is required');
  return supabase;
}

// ── Server rows → client shapes ───────────────────────────────────────────────────────────────

interface ServerPost {
  id: string;
  author_id: string;
  type: PostType;
  title: string | null;
  body: string;
  kind: Post['kind'] | null;
  rating: number | string | null;
  verdict: string | null;
  spoiler: SpoilerLevel;
  state: string;
  world: string | null;
  title_id: string | null;
  secondary_title_id: string | null;
  community_id: string | null;
  season: number | null;
  episode: number | null;
  hashtags: string[] | null;
  mentions: string[] | null;
  loved_count: number;
  cried_count: number;
  screamed_count: number;
  swooned_count: number;
  laughed_count: number;
  furious_count: number;
  comment_count: number;
  save_count: number;
  share_count: number;
  created_at: string;
  edited_at: string | null;
}

interface ServerComment {
  id: string;
  post_id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  spoiler: SpoilerLevel;
  state: string;
  loved_count?: number;
  cried_count?: number;
  screamed_count?: number;
  swooned_count?: number;
  laughed_count?: number;
  furious_count?: number;
  created_at: string;
}

/** `titles.id` uuid → the client catalog id the app navigates with. */
export async function resolveDramaClientIds(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const uuids = [...new Set(ids.filter(Boolean))];
  if (!uuids.length || !supabase) return out;
  const { data, error } = await supabase.from('titles').select('id, external_id, media_type').in('id', uuids);
  if (error || !data) return out;
  for (const row of data as { id: string; external_id: string; media_type: 'tv' | 'movie' }[]) {
    out.set(row.id, row.media_type === 'movie' ? `tmdb-movie-${row.external_id}` : `tmdb-${row.external_id}`);
  }
  return out;
}

/** `people.id` uuid → the client actor id (`tmdb-<external>`). */
export async function resolveActorClientIds(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const uuids = [...new Set(ids.filter(Boolean))];
  if (!uuids.length || !supabase) return out;
  const { data, error } = await supabase.from('people').select('id, external_id').in('id', uuids);
  if (error || !data) return out;
  for (const row of data as { id: string; external_id: string }[]) out.set(row.id, `tmdb-${row.external_id}`);
  return out;
}

function toPost(row: ServerPost, dramaIds: Map<string, string>): Post {
  return {
    id: row.id,
    type: row.type,
    authorId: row.author_id,
    createdAt: row.created_at,
    editedAt: row.edited_at ?? undefined,
    body: row.body,
    title: row.title ?? undefined,
    kind: row.kind ?? undefined,
    rating: row.rating == null ? undefined : Number(row.rating),
    verdict: row.verdict ?? undefined,
    spoiler: row.spoiler,
    context: {
      dramaId: row.title_id ? dramaIds.get(row.title_id) : undefined,
      secondaryDramaId: row.secondary_title_id ? dramaIds.get(row.secondary_title_id) : undefined,
      communityId: row.community_id ?? undefined,
      season: row.season ?? undefined,
      episode: row.episode ?? undefined,
    },
    hashtags: row.hashtags ?? [],
    mentions: row.mentions ?? [],
    reactions: {
      loved: row.loved_count ?? 0,
      cried: row.cried_count ?? 0,
      screamed: row.screamed_count ?? 0,
      swooned: row.swooned_count ?? 0,
      laughed: row.laughed_count ?? 0,
      furious: row.furious_count ?? 0,
    },
    commentCount: row.comment_count ?? 0,
    saveCount: row.save_count ?? 0,
    shareCount: row.share_count ?? 0,
    state: row.state === 'active' ? undefined : (row.state as Post['state']),
  };
}

function toComment(row: ServerComment): Comment {
  return {
    id: row.id,
    postId: row.post_id,
    authorId: row.author_id,
    parentId: row.parent_id ?? undefined,
    body: row.body,
    createdAt: row.created_at,
    spoiler: row.spoiler,
    reactions: {
      loved: row.loved_count ?? 0,
      cried: row.cried_count ?? 0,
      screamed: row.screamed_count ?? 0,
      swooned: row.swooned_count ?? 0,
      laughed: row.laughed_count ?? 0,
      furious: row.furious_count ?? 0,
    },
    state: row.state === 'active' ? undefined : (row.state as Comment['state']),
  };
}

// ── Feed ──────────────────────────────────────────────────────────────────────────────────────

export type FeedScope = 'latest' | 'following' | 'for_you' | 'title' | 'world';

export interface FeedPage {
  scope: FeedScope;
  items: Post[];
  hasMore: boolean;
  nextCursor: string | null;
}

export async function fetchFeed(
  scope: FeedScope = 'latest',
  options: { world?: string; titleId?: string; communityId?: string; limit?: number; cursor?: string | null } = {},
): Promise<FeedPage> {
  const { data, error } = await db().rpc('feed_page', {
    p_scope: scope,
    p_world: options.world ?? null,
    p_title_id: options.titleId ?? null,
    p_limit: options.limit ?? 20,
    p_cursor: options.cursor ?? null,
    p_community_id: options.communityId ?? null,
  });
  if (error) throw new Error(`feed_page failed: ${error.message}`);
  const payload = (data ?? {}) as { scope?: FeedScope; items?: ServerPost[]; has_more?: boolean; next_cursor?: string | null };
  const items = payload.items ?? [];
  const dramaIds = await resolveDramaClientIds(items.map((p) => p.title_id).filter((x): x is string => Boolean(x)));
  return {
    scope: payload.scope ?? scope,
    items: items.map((p) => toPost(p, dramaIds)),
    hasMore: Boolean(payload.has_more),
    nextCursor: payload.next_cursor ?? null,
  };
}

export async function fetchComments(postId: string, limit = 50, cursor?: string | null): Promise<{ items: Comment[]; hasMore: boolean; nextCursor: string | null }> {
  const { data, error } = await sessionDb().rpc('comment_page', { p_post_id: postId, p_limit: limit, p_cursor: cursor ?? null });
  if (error) throw new Error(`comment_page failed: ${error.message}`);
  const payload = (data ?? {}) as { items?: ServerComment[]; has_more?: boolean; next_cursor?: string | null };
  return { items: (payload.items ?? []).map(toComment), hasMore: Boolean(payload.has_more), nextCursor: payload.next_cursor ?? null };
}

/** Hydrate specific posts by id (e.g. the saved list bootstrap returns). */
export async function fetchPosts(ids: string[]): Promise<Post[]> {
  const uuids = [...new Set(ids.filter(Boolean))];
  if (!uuids.length) return [];
  const { data, error } = await db()
    .from('posts')
    .select('*')
    .in('id', uuids)
    .eq('state', 'active');
  if (error) throw new Error(`post lookup failed: ${error.message}`);
  const rows = (data ?? []) as ServerPost[];
  const dramaIds = await resolveDramaClientIds(rows.map((p) => p.title_id).filter((x): x is string => Boolean(x)));
  return rows.map((p) => toPost(p, dramaIds));
}

// ── Profiles ──────────────────────────────────────────────────────────────────────────────────

/** Public profile rows for the users a page references (RLS: visible profiles only). */
export async function fetchProfiles(ids: string[]): Promise<User[]> {
  const uuids = [...new Set(ids.filter(Boolean))];
  if (!uuids.length) return [];
  const { data, error } = await db()
    .from('profiles')
    .select('id, handle, display_name, bio, worlds, favorite_genres, follower_count, following_count, verified, is_private, created_at')
    .in('id', uuids);
  if (error) throw new Error(`profile lookup failed: ${error.message}`);
  return (data ?? []).map((row) => {
    const r = row as {
      id: string;
      handle: string;
      display_name: string;
      bio: string | null;
      worlds: string[] | null;
      favorite_genres: string[] | null;
      follower_count: number;
      following_count: number;
      verified: boolean;
      is_private: boolean;
      created_at: string;
    };
    return {
      id: r.id,
      handle: r.handle,
      displayName: r.display_name,
      bio: r.bio ?? undefined,
      fandoms: (r.worlds ?? []) as User['fandoms'],
      favoriteGenres: r.favorite_genres ?? [],
      favoriteDramaIds: [],
      followers: r.follower_count ?? 0,
      following: r.following_count ?? 0,
      joinedAt: r.created_at,
      verified: r.verified,
      isPrivate: r.is_private,
    };
  });
}

// ── Notifications ─────────────────────────────────────────────────────────────────────────────

export async function fetchNotifications(limit = 50): Promise<Notification[]> {
  const { data, error } = await sessionDb()
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`notification lookup failed: ${error.message}`);
  const rows = (data ?? []) as {
    id: string;
    kind: Notification['kind'];
    group: Notification['group'];
    actor_ids: string[] | null;
    post_id: string | null;
    comment_id: string | null;
    title_id: string | null;
    community_id: string | null;
    collection_id: string | null;
    episode: number | null;
    title: string | null;
    body: string | null;
    read_at: string | null;
    created_at: string;
  }[];
  const dramaIds = await resolveDramaClientIds(rows.map((r) => r.title_id).filter((x): x is string => Boolean(x)));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    group: r.group,
    actorIds: r.actor_ids ?? [],
    postId: r.post_id ?? undefined,
    commentId: r.comment_id ?? undefined,
    dramaId: r.title_id ? dramaIds.get(r.title_id) : undefined,
    communityId: r.community_id ?? undefined,
    collectionId: r.collection_id ?? undefined,
    episode: r.episode ?? undefined,
    title: r.title ?? undefined,
    body: r.body ?? undefined,
    createdAt: r.created_at,
    read: Boolean(r.read_at),
  }));
}
