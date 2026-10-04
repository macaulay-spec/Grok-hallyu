/**
 * The store ↔ backend bridge.
 *
 * Two directions, both no-ops unless a connected build has a real session:
 *
 *  mirror   every write the app performs as a store action is forwarded to the Hallyu backend
 *           (lib/api/social.ts). The store stays the optimistic cache: a failed write is reported
 *           (lib/analytics.ts) and the member keeps working — the next adoption reconciles.
 *
 *  adopt    on sign-in/session restore the member's server state (bootstrap: profile, preferences,
 *           follows, saves, watchlist; the latest feed page; the notification inbox) is read and
 *           folded into the cache, so what screens show is real backend data.
 *
 * The store imports `mirrorAction` (one line in `dispatch`); adoption is called from AccountSync
 * (app/_layout.tsx). `import type` from './store' keeps the module graph acyclic at runtime.
 */
import { reportError } from './analytics';
import { fetchBootstrap, serverProfileToUser } from './api/bootstrap';
import { fetchComments, fetchFeed, fetchNotifications, fetchProfiles, fetchPosts, resolveActorClientIds, resolveDramaClientIds } from './api/feed';
import * as social from './api/social';
import { getBackendAccessToken, supabase } from './api/client';
import type { AppState, Action, Prefs } from './store';
import type { Comment, Post, WatchlistItem } from './model';

// ── Mirror ────────────────────────────────────────────────────────────────────────────────────

/** True while adoption is writing server rows into the cache — those writes must not mirror back. */
let adopting = false;

const sessionReady = (): boolean => Boolean(supabase && getBackendAccessToken());

const caught = (scope: string) => (e: unknown) => reportError(`sync.${scope}`, e);

/** The world a drama belongs to (posts.world is a worlds.id reference). */
function worldOf(state: AppState, dramaId?: string): string | null {
  if (!dramaId) return null;
  const format = state.importedDramas.find((d) => d.id === dramaId)?.format;
  if (!format) return null;
  if (format === 'kdrama' || format === 'cdrama' || format === 'anime') return format;
  return format.startsWith('hollywood') ? 'hollywood' : null;
}

const FOLLOW_KINDS: Record<keyof AppState['follows'], social.FollowKind> = {
  users: 'user',
  dramas: 'title',
  actors: 'person',
  collections: 'collection',
};

/**
 * Forward one store action to the backend. Called synchronously from `dispatch` (fire-and-forget);
 * anything that is purely device state (drafts, revealed spoilers, recent searches, UI caches) is
 * deliberately NOT here.
 */
export function mirrorAction(action: Action, prev: AppState, next: AppState): void {
  if (adopting || !sessionReady()) return;
  const me = next.profile.id;

  switch (action.type) {
    case 'addPost':
      void social.insertPost(action.post, action.post.authorId ?? me, worldOf(next, action.post.context.dramaId)).catch(caught('addPost'));
      return;
    case 'editPost':
      void social.updatePost(action.id, action.patch).catch(caught('editPost'));
      return;
    case 'deletePost':
      void social.deletePost(action.id).catch(caught('deletePost'));
      return;
    case 'addComment':
      void social.insertComment(action.comment).catch(caught('addComment'));
      return;
    case 'deleteComment':
      void social.deleteComment(action.id).catch(caught('deleteComment'));
      return;
    case 'react': {
      const target = action.isComment ? { commentId: action.targetId } : { postId: action.targetId };
      void social.setReaction(target, action.kind).catch(caught('react'));
      return;
    }
    case 'save': {
      const on = next.saves.includes(action.postId);
      if (on !== prev.saves.includes(action.postId)) void social.setSaved(action.postId, on).catch(caught('save'));
      return;
    }
    case 'follow': {
      const on = next.follows[action.kind].includes(action.id);
      if (on !== prev.follows[action.kind].includes(action.id)) {
        void social.setFollow(FOLLOW_KINDS[action.kind], action.id, on).catch(caught('follow'));
      }
      return;
    }
    case 'watch': {
      if (action.status === null) {
        void social.removeWatchlist(action.dramaId).catch(caught('watch.remove'));
      } else {
        const item = next.watchlist[action.dramaId];
        if (item) void social.upsertWatchlist(action.dramaId, item).catch(caught('watch.upsert'));
      }
      return;
    }
    case 'progress':
    case 'note': {
      const item = next.watchlist[action.dramaId];
      if (item) void social.upsertWatchlist(action.dramaId, item).catch(caught('watch.progress'));
      return;
    }
    case 'prefs':
      void social.mergePreferences(action.patch).catch(caught('prefs'));
      return;
    case 'profile':
      void social.updateProfile(me, action.patch).catch(caught('profile'));
      return;
    case 'onboarding':
      if ('done' in action.patch || 'step' in action.patch || 'fandoms' in action.patch || 'genres' in action.patch) {
        void social
          .completeOnboarding({ worlds: next.onboarding.fandoms, genres: next.onboarding.genres, step: next.onboarding.step })
          .catch(caught('onboarding'));
      }
      return;
    case 'readNotifications': {
      const group = action.group && action.group !== 'all' ? action.group : undefined;
      void social.markNotificationsRead(action.id ? [action.id] : undefined, group).catch(caught('readNotifications'));
      return;
    }
    case 'block': {
      const on = next.blockedUsers.includes(action.userId);
      if (on !== prev.blockedUsers.includes(action.userId)) void social.setBlock(action.userId, on).catch(caught('block'));
      return;
    }
    case 'muteUser': {
      const on = next.mutedUsers.includes(action.userId);
      if (on !== prev.mutedUsers.includes(action.userId)) void social.setMute('user', action.userId, on).catch(caught('muteUser'));
      return;
    }
    case 'muteDrama': {
      const on = next.mutedDramas.includes(action.dramaId);
      if (on !== prev.mutedDramas.includes(action.dramaId)) void social.setMute('title', action.dramaId, on).catch(caught('muteDrama'));
      return;
    }
    case 'report':
      void social.reportContent(action.targetType ?? 'post', action.id, action.reason ?? 'other', action.detail).catch(caught('report'));
      return;
    case 'upsertCollection': {
      const collection = next.collections.find((c) => c.id === action.collection.id);
      if (collection) void social.upsertCollection(collection, me).catch(caught('upsertCollection'));
      return;
    }
    case 'deleteCollection':
      void social.deleteCollection(action.id).catch(caught('deleteCollection'));
      return;
    case 'collectionItem': {
      const collection = next.collections.find((c) => c.id === action.collectionId);
      const item = collection?.items.find((i) => i.dramaId === action.dramaId);
      void social.setCollectionItem(action.collectionId, action.dramaId, action.on, item?.note).catch(caught('collectionItem'));
      return;
    }
    default:
      return;
  }
}

// ── Adoption ──────────────────────────────────────────────────────────────────────────────────

interface ServerPrefs {
  protection?: Prefs['protection'];
  autoplay?: Prefs['autoplay'];
  one_tap_reactions?: boolean;
  muted_words?: string[];
  true_black?: boolean;
  personalization?: boolean;
  reduce_motion?: boolean;
  notify_episodes?: boolean;
  notify_social?: boolean;
  notify_highlights?: boolean;
  notify_system?: boolean;
  quiet_hours?: boolean;
  language?: Prefs['language'];
  guidelines_accepted?: boolean;
  data_saver?: boolean;
  terms_version?: number;
}

/** Server preferences → client Prefs (only the keys the server actually holds). */
function adoptPrefs(server: ServerPrefs | null, current: Prefs): Prefs {
  if (!server) return current;
  return {
    protection: server.protection ?? current.protection,
    autoplay: server.autoplay ?? current.autoplay,
    oneTapReactions: server.one_tap_reactions ?? current.oneTapReactions,
    mutedWords: server.muted_words ?? current.mutedWords,
    trueBlack: server.true_black ?? current.trueBlack,
    personalization: server.personalization ?? current.personalization,
    reduceMotion: server.reduce_motion ?? current.reduceMotion,
    notifications: {
      episodes: server.notify_episodes ?? current.notifications.episodes,
      social: server.notify_social ?? current.notifications.social,
      highlights: server.notify_highlights ?? current.notifications.highlights,
      system: server.notify_system ?? current.notifications.system,
      quietHours: server.quiet_hours ?? current.notifications.quietHours,
    },
    language: server.language ?? current.language,
    guidelinesAccepted: server.guidelines_accepted ?? current.guidelinesAccepted,
    dataSaver: server.data_saver ?? current.dataSaver,
    termsVersion: server.terms_version ?? current.termsVersion,
  };
}

interface ServerWatchlistRow {
  title_id: string;
  status: WatchlistItem['status'];
  season: number;
  current_episode: number;
  note: string | null;
  added_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
}

export interface AdoptionCallbacks {
  /** The current cache, read fresh at each step (adoption is async). */
  getState: () => AppState;
  /** Merge server-owned slices into the cache (profile, prefs, follows, saves, watchlist, notifications, users). */
  apply: (patch: Partial<AppState>) => void;
  /** Server posts go in one by one so the cache keeps any local-only posts as well. */
  addPosts: (posts: Post[]) => void;
  /** Called before every cache write; true once this adoption is stale (sign-out, account switch). */
  isStale?: () => boolean;
}

/**
 * Read the member's server state and fold it into the cache. Never throws: a failure leaves the
 * cache exactly as it was and is reported as diagnostics.
 */
export async function adoptBackendState(cb: AdoptionCallbacks): Promise<void> {
  if (!sessionReady()) return;
  const stale = cb.isStale ?? (() => false);
  adopting = true;
  try {
    const boot = await fetchBootstrap();
    if (stale()) return;

    const current = cb.getState();
    const [dramaIds, actorIds] = await Promise.all([
      resolveDramaClientIds(boot.follows.titles),
      resolveActorClientIds(boot.follows.people),
    ]);
    if (stale()) return;

    const watchRows = (boot.watchlist ?? []) as ServerWatchlistRow[];
    const watchDramaIds = await resolveDramaClientIds(watchRows.map((r) => r.title_id));
    if (stale()) return;
    const watchlist: Record<string, WatchlistItem> = {};
    for (const row of watchRows) {
      const dramaId = watchDramaIds.get(row.title_id);
      if (!dramaId) continue;
      watchlist[dramaId] = {
        dramaId,
        status: row.status,
        season: row.season ?? 1,
        currentEpisode: row.current_episode ?? 0,
        note: row.note ?? undefined,
        addedAt: row.added_at ?? new Date().toISOString(),
        updatedAt: row.updated_at ?? new Date().toISOString(),
        completedAt: row.completed_at ?? undefined,
      };
    }
    if (stale()) return;

    // Union, not replace: a mirror write that failed while offline must not be silently dropped
    // by the next adoption, and server values still win for the same key (watchlist below).
    const union = <T,>(local: T[], remote: T[]): T[] => [...new Set([...local, ...remote])];
    cb.apply({
      profile: { ...current.profile, ...serverProfileToUser(boot.profile) },
      prefs: adoptPrefs((boot.prefs ?? null) as ServerPrefs | null, current.prefs),
      follows: {
        users: union(current.follows.users, boot.follows.users),
        dramas: union(
          current.follows.dramas,
          boot.follows.titles.map((id) => dramaIds.get(id)).filter((id): id is string => Boolean(id)),
        ),
        actors: union(
          current.follows.actors,
          boot.follows.people.map((id) => actorIds.get(id)).filter((id): id is string => Boolean(id)),
        ),
        collections: union(current.follows.collections, boot.follows.collections),
      },
      saves: union(current.saves, boot.saved_post_ids),
      watchlist: { ...current.watchlist, ...watchlist },
    });

    // Feed: the newest public page, cached alongside anything local.
    const feed = await fetchFeed('latest', { limit: 20 });
    if (stale()) return;
    if (feed.items.length) cb.addPosts(feed.items);

    // Saved posts (the bootstrap hands back ids only).
    if (boot.saved_post_ids.length) {
      const saved = await fetchPosts(boot.saved_post_ids.slice(0, 50));
      if (stale()) return;
      if (saved.length) cb.addPosts(saved);
    }

    // Authors of everything just adopted, so cards render names and handles.
    const authorIds = [...new Set(cb.getState().posts.slice(0, 80).map((p) => p.authorId))].filter(
      (id) => id && !cb.getState().users[id],
    );
    if (authorIds.length) {
      const profiles = await fetchProfiles(authorIds);
      if (stale()) return;
      if (profiles.length) {
        const users = { ...cb.getState().users };
        for (const user of profiles) users[user.id] = user;
        cb.apply({ users });
      }
    }

    const notifications = await fetchNotifications();
    if (stale()) return;
    cb.apply({ notifications });
  } catch (e) {
    reportError('sync.adopt', e);
  } finally {
    adopting = false;
  }
}

/** Fetch a post's comment thread from the backend and fold it into the cache. */
export async function adoptComments(postId: string, cb: Pick<AdoptionCallbacks, 'getState' | 'apply'>): Promise<Comment[]> {
  if (!sessionReady()) return [];
  const page = await fetchComments(postId);
  if (!page.items.length) return [];
  const current = cb.getState();
  const byId = new Map(current.comments.map((c) => [c.id, c]));
  for (const comment of page.items) byId.set(comment.id, comment);
  cb.apply({ comments: [...byId.values()] });
  return page.items;
}

/** True while adoption writes are in flight (used by tests/diagnostics). */
export function isAdopting(): boolean {
  return adopting;
}
