/**
 * Lovable Cloud Backend Adapter for Hallyu.
 *
 * Implements the `Backend` seam (`lib/data/backend.ts`) against the brand-new Lovable Cloud
 * PostgreSQL schema, Row-Level Security policies, RPCs, and Edge Functions in `lovable-cloud/`.
 *
 * While `LOVABLE_CLOUD_URL` and `LOVABLE_CLOUD_ANON_KEY` in `constants/keys.ts` are empty
 * (unwired), `lovableBackendAvailable` is `false` and the app runs 100% offline-first on
 * `demoBackend`. Once you paste your Lovable Cloud URL and anon key, `lib/data/sync.ts`
 * automatically routes all `pull` and `push` calls through this adapter.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { LOVABLE_CLOUD_ANON_KEY, LOVABLE_CLOUD_URL } from '../../constants/keys';
import { Collection, Comment, Notification, Post, ReactionCounts, SpoilerLevel, User } from '../model';
import { dispatchLocal, getState, GUEST_ID, Mutation } from '../store';
import { Backend, BackendError, PullOptions, PullScope } from './backend';
import { demoBackend } from './demoBackend';

export const lovableBackendAvailable = Boolean(LOVABLE_CLOUD_URL && LOVABLE_CLOUD_ANON_KEY);

let clientInstance: SupabaseClient | null = null;

export function getLovableClient(): SupabaseClient | null {
  if (!lovableBackendAvailable) return null;
  if (!clientInstance) {
    clientInstance = createClient(LOVABLE_CLOUD_URL, LOVABLE_CLOUD_ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return clientInstance;
}

const DEFAULT_REACTIONS: ReactionCounts = {
  loved: 0,
  cried: 0,
  screamed: 0,
  swooned: 0,
  laughed: 0,
  furious: 0,
};

function mapUserRow(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    handle: String(row.handle ?? 'member'),
    displayName: String(row.display_name ?? row.displayName ?? 'Member'),
    avatarUrl: row.avatar_url ? String(row.avatar_url) : undefined,
    bio: String(row.bio ?? ''),
    verified: Boolean(row.verified),
    isPrivate: Boolean(row.is_private),
    fandoms: Array.isArray(row.fandoms) ? (row.fandoms as User['fandoms']) : [],
    favoriteGenres: Array.isArray(row.favorite_genres) ? (row.favorite_genres as string[]) : [],
    favoriteDramaIds: Array.isArray(row.favorite_drama_ids) ? (row.favorite_drama_ids as string[]) : [],
    followers: Number(row.followers ?? 0),
    following: Number(row.following ?? 0),
    joinedAt: String(row.joined_at ?? new Date().toISOString()),
  };
}

function mapPostRow(row: Record<string, unknown>): Post {
  return {
    id: String(row.id),
    authorId: String(row.author_id),
    type: (row.type as Post['type']) ?? 'post',
    title: row.title ? String(row.title) : undefined,
    body: String(row.body ?? ''),
    verdict: row.verdict ? String(row.verdict) : undefined,
    rating: row.rating !== null && row.rating !== undefined ? Number(row.rating) : undefined,
    context: {
      dramaId: row.drama_id ? String(row.drama_id) : undefined,
      secondaryDramaId: row.secondary_drama_id ? String(row.secondary_drama_id) : undefined,
      season: row.season !== null && row.season !== undefined ? Number(row.season) : undefined,
      episode: row.episode !== null && row.episode !== undefined ? Number(row.episode) : undefined,
      actorIds: Array.isArray(row.actor_ids) ? (row.actor_ids as string[]) : undefined,
    },
    spoiler: (row.spoiler as SpoilerLevel) ?? 'none',
    images: Array.isArray(row.images) ? (row.images as string[]) : undefined,
    video: (row.video as Post['video']) ?? undefined,
    hashtags: Array.isArray(row.hashtags) ? (row.hashtags as string[]) : [],
    mentions: Array.isArray(row.mentions) ? (row.mentions as string[]) : [],
    reactions: (row.reactions as ReactionCounts) ?? DEFAULT_REACTIONS,
    commentCount: Number(row.comment_count ?? 0),
    saveCount: Number(row.save_count ?? 0),
    shareCount: 0,
    state: (row.state as Post['state']) ?? 'active',
    createdAt: String(row.created_at ?? new Date().toISOString()),
    editedAt: row.edited_at ? String(row.edited_at) : undefined,
  };
}

function mapCommentRow(row: Record<string, unknown>): Comment {
  return {
    id: String(row.id),
    postId: String(row.post_id),
    authorId: String(row.author_id),
    parentId: row.parent_id ? String(row.parent_id) : undefined,
    replyToUserId: row.reply_to_user_id ? String(row.reply_to_user_id) : undefined,
    body: String(row.body ?? ''),
    spoiler: (row.spoiler as SpoilerLevel) ?? 'none',
    reactions: (row.reactions as ReactionCounts) ?? DEFAULT_REACTIONS,
    state: (row.state as Comment['state']) ?? 'active',
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function mapCollectionRow(row: Record<string, unknown>): Collection {
  const rawItems = Array.isArray(row.collection_items) ? (row.collection_items as Record<string, unknown>[]) : [];
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    title: String(row.title ?? ''),
    description: row.description ? String(row.description) : undefined,
    visibility: row.visibility === 'private' ? 'private' : 'public',
    followerCount: Number(row.follower_count ?? 0),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
    items: rawItems.map((i) => ({
      dramaId: String(i.drama_id),
      note: i.note ? String(i.note) : undefined,
      addedAt: String(i.added_at ?? new Date().toISOString()),
    })),
  };
}

function mapNotificationRow(row: Record<string, unknown>): Notification {
  return {
    id: String(row.id),
    kind: (row.kind as Notification['kind']) ?? 'system',
    group: (row.group as Notification['group']) ?? 'system',
    actorIds: Array.isArray(row.actor_ids) ? (row.actor_ids as string[]) : undefined,
    postId: row.post_id ? String(row.post_id) : undefined,
    commentId: row.comment_id ? String(row.comment_id) : undefined,
    dramaId: row.drama_id ? String(row.drama_id) : undefined,
    episode: row.episode !== null && row.episode !== undefined ? Number(row.episode) : undefined,
    collectionId: row.collection_id ? String(row.collection_id) : undefined,
    title: row.title ? String(row.title) : undefined,
    body: row.body ? String(row.body) : undefined,
    read: Boolean(row.read),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

async function ensureCatalogDramaExists(client: SupabaseClient, dramaId?: string): Promise<void> {
  if (!dramaId) return;
  const drama = getState().importedDramas.find((d) => d.id === dramaId);
  if (!drama) return;
  const format = drama.format ?? 'kdrama';
  const world =
    format === 'kdrama'
      ? 'kdrama'
      : format === 'cdrama'
        ? 'cdrama'
        : format === 'anime'
          ? 'anime'
          : 'hollywood';
  await client.from('dramas').upsert(
    {
      id: drama.id,
      tmdb_id: drama.provider?.id ?? null,
      media_type: drama.mediaType ?? 'tv',
      format,
      world,
      title: drama.title,
      original_title: drama.originalTitle ?? null,
      original_language: drama.originalLanguage ?? null,
      region: drama.region ?? null,
      year: drama.year,
      end_year: drama.endYear ?? null,
      status: drama.status,
      network: drama.network ?? null,
      streaming_on: drama.streamingOn ?? [],
      genres: drama.genres ?? [],
      tags: drama.tags ?? [],
      synopsis: drama.synopsis ?? '',
      poster_url: drama.posterUrl ?? null,
      backdrop_url: drama.backdropUrl ?? null,
      trailer_url: drama.trailerUrl ?? null,
      tone: drama.tone,
      rating: drama.rating ?? null,
      runtime: drama.runtime ?? null,
      episode_count: drama.episodeCount ?? 0,
      seasons: drama.seasons ?? [],
    },
    { onConflict: 'id' },
  );
}

async function mergePostsWithAuthors(client: SupabaseClient, rows: Record<string, unknown>[]): Promise<Post[]> {
  if (!rows.length) return [];
  const posts = rows.map(mapPostRow);
  const authorIds = [...new Set(posts.map((p) => p.authorId))];
  if (authorIds.length) {
    const { data: userRows } = await client.from('profiles').select('*').in('id', authorIds);
    if (userRows?.length) {
      dispatchLocal({
        type: 'mergeUsers',
        users: (userRows as Record<string, unknown>[]).map(mapUserRow),
      });
    }
  }
  dispatchLocal({ type: 'mergePosts', posts });
  return posts;
}

export const lovableBackend: Backend = {
  name: 'lovable-cloud',
  network: true,

  async push(mutation: Mutation): Promise<void> {
    const client = getLovableClient();
    if (!client) return;

    const uid = getState().profile.id;
    if (!uid || uid === GUEST_ID) return;

    const a = mutation.action;
    try {
      switch (a.type) {
        case 'addPost': {
          await ensureCatalogDramaExists(client, a.post.context.dramaId);
          await ensureCatalogDramaExists(client, a.post.context.secondaryDramaId);
          const { error } = await client.from('posts').upsert({
            id: a.post.id,
            author_id: uid,
            type: a.post.type,
            title: a.post.title ?? null,
            body: a.post.body,
            verdict: a.post.verdict ?? null,
            rating: a.post.rating ?? null,
            drama_id: a.post.context.dramaId ?? null,
            secondary_drama_id: a.post.context.secondaryDramaId ?? null,
            season: a.post.context.season ?? null,
            episode: a.post.context.episode ?? null,
            actor_ids: a.post.context.actorIds ?? [],
            spoiler: a.post.spoiler,
            images: a.post.images?.filter((img): img is string => typeof img === 'string') ?? [],
            video: a.post.video ?? null,
            hashtags: a.post.hashtags ?? [],
            mentions: a.post.mentions ?? [],
            state: 'active',
            created_at: a.post.createdAt,
          });
          if (error) throw new BackendError(error.message, true);
          return;
        }
        case 'editPost': {
          const { error } = await client
            .from('posts')
            .update({
              title: a.patch.title,
              body: a.patch.body,
              verdict: a.patch.verdict,
              spoiler: a.patch.spoiler,
              hashtags: a.patch.hashtags,
              edited_at: new Date().toISOString(),
            })
            .eq('id', a.id)
            .eq('author_id', uid);
          if (error) throw new BackendError(error.message, true);
          return;
        }
        case 'deletePost': {
          const { error } = await client
            .from('posts')
            .update({ state: 'deleted' })
            .eq('id', a.id)
            .eq('author_id', uid);
          if (error) throw new BackendError(error.message, true);
          return;
        }
        case 'addComment': {
          const { error } = await client.from('comments').upsert({
            id: a.comment.id,
            post_id: a.comment.postId,
            author_id: uid,
            parent_id: a.comment.parentId ?? null,
            reply_to_user_id: a.comment.replyToUserId ?? null,
            body: a.comment.body,
            spoiler: a.comment.spoiler,
            state: 'active',
            created_at: a.comment.createdAt,
          });
          if (error) throw new BackendError(error.message, true);
          return;
        }
        case 'deleteComment': {
          const { error } = await client
            .from('comments')
            .update({ state: 'deleted' })
            .eq('id', a.id)
            .eq('author_id', uid);
          if (error) throw new BackendError(error.message, true);
          return;
        }
        case 'react': {
          const { error } = await client.rpc('toggle_reaction', {
            p_target_id: a.targetId,
            p_kind: a.kind,
            p_is_comment: Boolean(a.isComment),
          });
          if (error) throw new BackendError(error.message, true);
          return;
        }
        case 'save': {
          const on = a.on ?? true;
          if (on) {
            const { error } = await client
              .from('saved_posts')
              .upsert({ user_id: uid, post_id: a.postId }, { onConflict: 'user_id,post_id' });
            if (error) throw new BackendError(error.message, true);
          } else {
            const { error } = await client
              .from('saved_posts')
              .delete()
              .eq('user_id', uid)
              .eq('post_id', a.postId);
            if (error) throw new BackendError(error.message, true);
          }
          return;
        }
        case 'follow': {
          const on = a.on ?? true;
          if (a.kind === 'users') {
            if (on) {
              await client.from('user_follows').upsert({ follower_id: uid, target_user_id: a.id });
            } else {
              await client.from('user_follows').delete().eq('follower_id', uid).eq('target_user_id', a.id);
            }
          } else if (a.kind === 'dramas') {
            await ensureCatalogDramaExists(client, a.id);
            if (on) {
              await client.from('drama_follows').upsert({ user_id: uid, drama_id: a.id, notify_episodes: true });
            } else {
              await client.from('drama_follows').delete().eq('user_id', uid).eq('drama_id', a.id);
            }
          } else if (a.kind === 'actors') {
            if (on) {
              await client.from('actor_follows').upsert({ user_id: uid, actor_id: a.id });
            } else {
              await client.from('actor_follows').delete().eq('user_id', uid).eq('actor_id', a.id);
            }
          } else if (a.kind === 'collections') {
            if (on) {
              await client.from('collection_follows').upsert({ user_id: uid, collection_id: a.id });
            } else {
              await client.from('collection_follows').delete().eq('user_id', uid).eq('collection_id', a.id);
            }
          }
          return;
        }
        case 'dramaNotify': {
          await ensureCatalogDramaExists(client, a.id);
          await client
            .from('drama_follows')
            .upsert({ user_id: uid, drama_id: a.id, notify_episodes: a.on }, { onConflict: 'user_id,drama_id' });
          return;
        }
        case 'watch': {
          await ensureCatalogDramaExists(client, a.dramaId);
          const { error } = await client.rpc('upsert_watchlist', {
            p_drama_id: a.dramaId,
            p_status: a.status ?? null,
            p_season: a.season ?? 1,
            p_episode: null,
            p_note: null,
            p_clear_status: a.status === null,
          });
          if (error) throw new BackendError(error.message, true);
          return;
        }
        case 'progress': {
          await ensureCatalogDramaExists(client, a.dramaId);
          const { error } = await client.rpc('upsert_watchlist', {
            p_drama_id: a.dramaId,
            p_status: a.total && a.episode >= a.total ? 'completed' : 'watching',
            p_season: a.season,
            p_episode: Math.max(0, a.episode),
            p_note: null,
            p_clear_status: false,
          });
          if (error) throw new BackendError(error.message, true);
          return;
        }
        case 'note': {
          await ensureCatalogDramaExists(client, a.dramaId);
          const { error } = await client.rpc('upsert_watchlist', {
            p_drama_id: a.dramaId,
            p_status: null,
            p_season: null,
            p_episode: null,
            p_note: a.note,
            p_clear_status: false,
          });
          if (error) throw new BackendError(error.message, true);
          return;
        }
        case 'upsertCollection': {
          const { error } = await client.from('collections').upsert({
            id: a.collection.id,
            owner_id: uid,
            title: a.collection.title,
            description: a.collection.description ?? null,
            visibility: a.collection.visibility,
            updated_at: a.collection.updatedAt,
          });
          if (error) throw new BackendError(error.message, true);
          return;
        }
        case 'deleteCollection': {
          const { error } = await client.from('collections').delete().eq('id', a.id).eq('owner_id', uid);
          if (error) throw new BackendError(error.message, true);
          return;
        }
        case 'collectionItem': {
          await ensureCatalogDramaExists(client, a.dramaId);
          if (a.on) {
            await client.from('collection_items').upsert({
              collection_id: a.collectionId,
              drama_id: a.dramaId,
              note: a.note ?? null,
            });
          } else {
            await client
              .from('collection_items')
              .delete()
              .eq('collection_id', a.collectionId)
              .eq('drama_id', a.dramaId);
          }
          return;
        }
        case 'profile': {
          const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
          if (a.patch.displayName !== undefined) patch.display_name = a.patch.displayName;
          if (a.patch.handle !== undefined) patch.handle = a.patch.handle;
          if (a.patch.bio !== undefined) patch.bio = a.patch.bio;
          if (a.patch.avatarUrl !== undefined) patch.avatar_url = a.patch.avatarUrl;
          if (a.patch.isPrivate !== undefined) patch.is_private = a.patch.isPrivate;
          if (a.patch.fandoms !== undefined) patch.fandoms = a.patch.fandoms;
          if (a.patch.favoriteGenres !== undefined) patch.favorite_genres = a.patch.favoriteGenres;
          if (a.patch.favoriteDramaIds !== undefined) patch.favorite_drama_ids = a.patch.favoriteDramaIds;
          const { error } = await client.from('profiles').update(patch).eq('id', uid);
          if (error) throw new BackendError(error.message, true);
          return;
        }
        case 'prefs': {
          const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
          if (a.patch.protection !== undefined) patch.protection = a.patch.protection;
          if (a.patch.autoplay !== undefined) patch.autoplay = a.patch.autoplay;
          if (a.patch.oneTapReactions !== undefined) patch.one_tap_reactions = a.patch.oneTapReactions;
          if (a.patch.mutedWords !== undefined) patch.muted_words = a.patch.mutedWords;
          if (a.patch.personalization !== undefined) patch.personalization = a.patch.personalization;
          if (a.patch.language !== undefined) patch.language = a.patch.language;
          if (a.patch.guidelinesAccepted !== undefined) patch.guidelines_accepted = a.patch.guidelinesAccepted;
          if (a.patch.dataSaver !== undefined) patch.data_saver = a.patch.dataSaver;
          if (a.patch.termsVersion !== undefined) patch.terms_version = a.patch.termsVersion;
          if (a.patch.notifications !== undefined) {
            patch.notify_episodes = a.patch.notifications.episodes;
            patch.notify_social = a.patch.notifications.social;
            patch.notify_highlights = a.patch.notifications.highlights;
            patch.notify_system = a.patch.notifications.system;
            patch.notify_quiet_hours = a.patch.notifications.quietHours;
          }
          await client.from('user_preferences').upsert({ user_id: uid, ...patch });
          return;
        }
        case 'onboarding': {
          const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
          if (a.patch.done !== undefined) patch.onboarding_done = a.patch.done;
          if (a.patch.step !== undefined) patch.onboarding_step = a.patch.step;
          if (a.patch.intent !== undefined) patch.onboarding_intent = a.patch.intent;
          if (a.patch.genres !== undefined) patch.onboarding_genres = a.patch.genres;
          if (a.patch.fandoms !== undefined) patch.onboarding_fandoms = a.patch.fandoms;
          await client.from('user_preferences').upsert({ user_id: uid, ...patch });
          return;
        }
        case 'block': {
          if (a.on) {
            await client.from('user_blocks').upsert({ user_id: uid, blocked_user_id: a.userId });
          } else {
            await client.from('user_blocks').delete().eq('user_id', uid).eq('blocked_user_id', a.userId);
          }
          return;
        }
        case 'muteUser': {
          if (a.on) {
            await client.from('user_mutes').upsert({ user_id: uid, muted_user_id: a.userId });
          } else {
            await client.from('user_mutes').delete().eq('user_id', uid).eq('muted_user_id', a.userId);
          }
          return;
        }
        case 'muteDrama': {
          await ensureCatalogDramaExists(client, a.dramaId);
          if (a.on) {
            await client.from('drama_mutes').upsert({ user_id: uid, drama_id: a.dramaId });
          } else {
            await client.from('drama_mutes').delete().eq('user_id', uid).eq('drama_id', a.dramaId);
          }
          return;
        }
        case 'report': {
          await client.from('reports').insert({
            reporter_id: uid,
            target_id: a.id,
            kind: 'post',
            reason: 'reported',
          });
          return;
        }
        case 'readNotifications': {
          await client.rpc('mark_notifications_read', {
            p_notification_id: a.id ?? null,
            p_group: a.group ?? 'all',
          });
          return;
        }
      }
    } catch (e) {
      if (e instanceof BackendError) throw e;
      throw new BackendError(e instanceof Error ? e.message : 'Network error', true);
    }
  },

  async pull(scope: PullScope, opts?: PullOptions): Promise<void> {
    // Seed local 4-world fixtures first so the UI is never empty, then merge live Lovable Cloud rows on top.
    await demoBackend.pull(scope, opts);

    const client = getLovableClient();
    if (!client) return;

    if (scope === 'me') {
      const { data } = await client.rpc('pull_me_state');
      if (data && data.authenticated && data.profile) {
        dispatchLocal({ type: 'profile', patch: mapUserRow(data.profile) });
      }
      return;
    }

    if (scope === 'home' || scope === 'feed:forYou' || scope === 'trending') {
      const { data } = await client
        .from('posts')
        .select('*')
        .eq('state', 'active')
        .order('created_at', { ascending: false })
        .limit(40);
      if (data?.length) await mergePostsWithAuthors(client, data as Record<string, unknown>[]);
      return;
    }

    if (scope === 'shorts') {
      const { data } = await client
        .from('posts')
        .select('*')
        .eq('state', 'active')
        .eq('type', 'short')
        .order('created_at', { ascending: false })
        .limit(30);
      if (data?.length) await mergePostsWithAuthors(client, data as Record<string, unknown>[]);
      return;
    }

    if (scope === 'activity') {
      const { data } = await client
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (data?.length) {
        dispatchLocal({
          type: 'mergeNotifications',
          notifications: (data as Record<string, unknown>[]).map(mapNotificationRow),
        });
      }
      return;
    }

    if (scope === 'collections') {
      const { data } = await client
        .from('collections')
        .select('*, collection_items(*)')
        .eq('visibility', 'public')
        .order('follower_count', { ascending: false })
        .limit(30);
      if (data?.length) {
        dispatchLocal({
          type: 'mergeCollections',
          collections: (data as Record<string, unknown>[]).map(mapCollectionRow),
        });
      }
      return;
    }

    if (scope.startsWith('collection:')) {
      const colId = scope.slice('collection:'.length);
      const { data } = await client
        .from('collections')
        .select('*, collection_items(*)')
        .eq('id', colId)
        .maybeSingle();
      if (data) {
        dispatchLocal({
          type: 'mergeCollections',
          collections: [mapCollectionRow(data as Record<string, unknown>)],
        });
      }
      return;
    }

    if (scope.startsWith('drama:')) {
      const dramaId = scope.slice('drama:'.length).split(':')[0]!;
      const { data } = await client
        .from('posts')
        .select('*')
        .eq('state', 'active')
        .or(`drama_id.eq.${dramaId},secondary_drama_id.eq.${dramaId}`)
        .order('created_at', { ascending: false })
        .limit(40);
      if (data?.length) await mergePostsWithAuthors(client, data as Record<string, unknown>[]);
      return;
    }

    if (scope.startsWith('post:')) {
      const postId = scope.slice('post:'.length);
      const [{ data: postRow }, { data: commentRows }] = await Promise.all([
        client.from('posts').select('*').eq('id', postId).maybeSingle(),
        client.from('comments').select('*').eq('post_id', postId).order('created_at', { ascending: true }),
      ]);
      if (postRow) await mergePostsWithAuthors(client, [postRow as Record<string, unknown>]);
      if (commentRows?.length) {
        const comments = (commentRows as Record<string, unknown>[]).map(mapCommentRow);
        const authorIds = [...new Set(comments.map((c) => c.authorId))];
        if (authorIds.length) {
          const { data: userRows } = await client.from('profiles').select('*').in('id', authorIds);
          if (userRows?.length) {
            dispatchLocal({
              type: 'mergeUsers',
              users: (userRows as Record<string, unknown>[]).map(mapUserRow),
            });
          }
        }
        dispatchLocal({ type: 'mergeComments', postId, comments });
      }
      return;
    }

    if (scope.startsWith('user:')) {
      const handle = scope.slice('user:'.length).replace(/^@/, '').toLowerCase();
      const { data: userRow } = await client
        .from('profiles')
        .select('*')
        .ilike('handle', handle)
        .maybeSingle();
      if (userRow) {
        const user = mapUserRow(userRow as Record<string, unknown>);
        dispatchLocal({ type: 'mergeUsers', users: [user] });
        const { data: postRows } = await client
          .from('posts')
          .select('*')
          .eq('author_id', user.id)
          .eq('state', 'active')
          .order('created_at', { ascending: false })
          .limit(30);
        if (postRows?.length) await mergePostsWithAuthors(client, postRows as Record<string, unknown>[]);
      }
      return;
    }
  },
};
