/**
 * The store ↔ backend bridge.
 *
 * Two directions, both no-ops unless a connected build has a real session:
 *
 *  mirror   every write the app performs as a store action is forwarded to the Hallyu backend
 *           (lib/api/social.ts). The store is the optimistic cache, NOT the source of truth: when
 *           the backend rejects a write the cache is rolled back to the value it held before, and
 *           the failure is published so the screen can say so. A member must never keep looking at
 *           a like, save, follow or post that the server refused — that was the previous
 *           behaviour (fire-and-forget, logged to analytics, cache left showing "done").
 *
 *  adopt    on sign-in/session restore the member's server state (bootstrap: profile, preferences,
 *           follows, saves, watchlist; the latest feed page; the notification inbox) is read and
 *           folded into the cache, so what screens show is real backend data.
 *
 * The store imports `mirrorAction` (one line in `dispatch`); adoption is called from AccountSync
 * (app/_layout.tsx). `import type` from './store' keeps the module graph acyclic at runtime — the
 * one value sync needs back from the store (dispatch) arrives through `setRestoreDispatcher`.
 */
import { reportError } from './analytics';
import { fetchBootstrap, serverProfileToUser } from './api/bootstrap';
import { fetchComments, fetchFeed, fetchNotifications, fetchProfiles, fetchPosts, resolveActorClientIds, resolveDramaClientIds } from './api/feed';
import * as social from './api/social';
import { getBackendAccessToken, supabase } from './api/client';
import type { AppState, Action, Prefs } from './store';
import type { Comment, Post, WatchlistItem } from './model';

// ── Failed writes ──────────────────────────────────────────────────────────────────────────────

/**
 * A write the backend refused. Screens subscribe through `subscribeSyncFailures` (the app shell
 * turns each one into a toast) so the member is told the truth instead of silently losing the
 * change at the next adoption.
 */
export interface SyncFailure {
  /** The store action type that failed, e.g. 'save'. */
  scope: string;
  /** What the member was trying to do, phrased for them. */
  message: string;
  /** Always true today: the optimistic cache change was put back. */
  rolledBack: boolean;
  error: unknown;
}

let failures: readonly SyncFailure[] = [];
const failureListeners = new Set<() => void>();

export function getSyncFailures(): readonly SyncFailure[] {
  return failures;
}

export function subscribeSyncFailures(fn: () => void): () => void {
  failureListeners.add(fn);
  return () => {
    failureListeners.delete(fn);
  };
}

function publishFailure(failure: SyncFailure): void {
  // Bounded: this is a live signal for "that did not save", not an archive.
  failures = [...failures, failure].slice(-20);
  for (const fn of Array.from(failureListeners)) fn();
}

/** Human wording per action, so the toast names what failed rather than an internal scope. */
const FAILURE_COPY: Record<string, string> = {
  addPost: 'Your post was not saved',
  editPost: 'Your edit was not saved',
  deletePost: 'That post was not deleted',
  addComment: 'Your comment was not saved',
  deleteComment: 'That comment was not deleted',
  react: 'That reaction was not saved',
  save: 'That save was not saved',
  follow: 'That follow was not saved',
  'watch.remove': 'Removing that title was not saved',
  'watch.upsert': 'Updating your watchlist was not saved',
  'watch.progress': 'Updating your progress was not saved',
  prefs: 'Your preferences were not saved',
  profile: 'Your profile was not saved',
  onboarding: 'Finishing setup was not saved',
  readNotifications: 'That was not marked as read',
  block: 'That block was not saved',
  muteUser: 'That mute was not saved',
  muteDrama: 'That mute was not saved',
  report: 'Your report was not sent',
  upsertCollection: 'That collection was not saved',
  deleteCollection: 'That collection was not deleted',
  collectionItem: 'That change to the collection was not saved',
};

// ── Mirror ────────────────────────────────────────────────────────────────────────────────────

/** True while adoption is writing server rows into the cache — those writes must not mirror back. */
let adopting = false;

const sessionReady = (): boolean => Boolean(supabase && getBackendAccessToken());

/**
 * The slices each mirrored action can change. A rejected write must put exactly these back, and
 * nothing else: reverting more would throw away unrelated edits the member made in the meantime.
 */
const MIRRORED_SLICES: Record<string, (keyof AppState)[]> = {
  addPost: ['posts'],
  editPost: ['posts'],
  deletePost: ['posts'],
  addComment: ['comments', 'posts'],
  deleteComment: ['comments', 'posts'],
  react: ['reactions', 'posts', 'comments'],
  save: ['saves', 'posts'],
  follow: ['follows'],
  watch: ['watchlist', 'follows'],
  progress: ['watchlist', 'follows'],
  note: ['watchlist'],
  prefs: ['prefs'],
  profile: ['profile'],
  onboarding: ['onboarding'],
  readNotifications: ['notifications'],
  block: ['blockedUsers', 'follows'],
  muteUser: ['mutedUsers'],
  muteDrama: ['mutedDramas'],
  report: ['reported'],
  upsertCollection: ['collections'],
  deleteCollection: ['collections'],
  collectionItem: ['collections'],
};

/** Installed by lib/store.tsx (see the note there): the rollback needs dispatch, sync cannot import it. */
let applyWithoutMirror: ((action: Action) => void) | null = null;

export function setApplyDispatcher(fn: (action: Action) => void): void {
  applyWithoutMirror = fn;
}

/**
 * Apply a cache action WITHOUT mirroring it to the backend.
 *
 * Two callers need this and both have already written to the server themselves:
 *  - the rollback below, whose undo must not be sent back;
 *  - the media composer, which awaits `insertPost` + `complete_media_upload` itself before adding
 *    the post to the cache, because it has to know the server accepted the upload before the cache
 *    is allowed to show it as posted.
 */
function applyLocal(action: Action): void {
  if (!applyWithoutMirror) return;
  adopting = true;
  try {
    applyWithoutMirror(action);
  } finally {
    adopting = false;
  }
}

/** Put the slices `action` touched back to the value they held before the failed write. */
function revert(action: Action, prev: AppState): void {
  const keys = MIRRORED_SLICES[action.type];
  if (!keys) return;
  const patch: Partial<AppState> = {};
  for (const key of keys) (patch as Record<string, unknown>)[key] = prev[key];
  applyLocal({ type: 'restore', patch });
}

/**
 * Adopt a server-owned write into the cache without mirroring it back. The media composer uses this
 * after it has itself created the post and attached the uploads, so the cache only ever shows a
 * post the server actually accepted.
 */
export function adoptLocal(action: Action): void {
  applyLocal(action);
}

/**
 * Attach the rollback + the visible failure to one mirrored write. `work` is the backend promise;
 * a rejection means the server did NOT accept the change, so the optimistic cache must not keep
 * pretending it did.
 */
function write(action: Action, prev: AppState, scope: string, work: Promise<unknown>): void {
  void work.catch((e) => {
    revert(action, prev);
    reportError(`sync.${scope}`, e);
    publishFailure({ scope, message: FAILURE_COPY[scope] ?? 'That change was not saved', rolledBack: true, error: e });
  });
}

/** The world a drama belongs to (posts.world is a worlds.id reference). */
export function worldOf(state: AppState, dramaId?: string): string | null {
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
      write(action, prev, 'addPost', social.insertPost(action.post, action.post.authorId ?? me, worldOf(next, action.post.context.dramaId)));
      return;
    case 'editPost':
      write(action, prev, 'editPost', social.updatePost(action.id, action.patch));
      return;
    case 'deletePost':
      write(action, prev, 'deletePost', social.deletePost(action.id));
      return;
    case 'addComment':
      write(action, prev, 'addComment', social.insertComment(action.comment, action.comment.authorId || me));
      return;
    case 'deleteComment':
      write(action, prev, 'deleteComment', social.deleteComment(action.id));
      return;
    case 'react': {
      const target = action.isComment ? { commentId: action.targetId } : { postId: action.targetId };
      write(action, prev, 'react', social.setReaction(me, target, action.kind));
      return;
    }
    case 'save': {
      const on = next.saves.includes(action.postId);
      if (on !== prev.saves.includes(action.postId)) write(action, prev, 'save', social.setSaved(me, action.postId, on));
      return;
    }
    case 'follow': {
      const on = next.follows[action.kind].includes(action.id);
      if (on !== prev.follows[action.kind].includes(action.id)) {
        write(action, prev, 'follow', social.setFollow(FOLLOW_KINDS[action.kind], action.id, on));
      }
      return;
    }
    case 'watch': {
      if (action.status === null) {
        write(action, prev, 'watch.remove', social.removeWatchlist(action.dramaId));
      } else {
        const item = next.watchlist[action.dramaId];
        if (item) write(action, prev, 'watch.upsert', social.upsertWatchlist(action.dramaId, item));
      }
      return;
    }
    case 'progress':
    case 'note': {
      const item = next.watchlist[action.dramaId];
      if (item) write(action, prev, 'watch.progress', social.upsertWatchlist(action.dramaId, item));
      return;
    }
    case 'prefs':
      write(action, prev, 'prefs', social.mergePreferences(action.patch));
      return;
    case 'profile':
      write(action, prev, 'profile', social.updateProfile(me, action.patch));
      return;
    case 'onboarding':
      if ('done' in action.patch || 'step' in action.patch || 'fandoms' in action.patch || 'genres' in action.patch) {
        write(
          action,
          prev,
          'onboarding',
          social.completeOnboarding({ worlds: next.onboarding.fandoms, genres: next.onboarding.genres, step: next.onboarding.step }),
        );
      }
      return;
    case 'readNotifications': {
      const group = action.group && action.group !== 'all' ? action.group : undefined;
      write(action, prev, 'readNotifications', social.markNotificationsRead(action.id ? [action.id] : undefined, group));
      return;
    }
    case 'block': {
      const on = next.blockedUsers.includes(action.userId);
      if (on !== prev.blockedUsers.includes(action.userId)) write(action, prev, 'block', social.setBlock(action.userId, on));
      return;
    }
    case 'muteUser': {
      const on = next.mutedUsers.includes(action.userId);
      if (on !== prev.mutedUsers.includes(action.userId)) write(action, prev, 'muteUser', social.setMute('user', action.userId, on));
      return;
    }
    case 'muteDrama': {
      const on = next.mutedDramas.includes(action.dramaId);
      if (on !== prev.mutedDramas.includes(action.dramaId)) write(action, prev, 'muteDrama', social.setMute('title', action.dramaId, on));
      return;
    }
    case 'report':
      write(action, prev, 'report', social.reportContent(action.targetType ?? 'post', action.id, action.reason ?? 'other', action.detail));
      return;
    case 'upsertCollection': {
      const collection = next.collections.find((c) => c.id === action.collection.id);
      if (collection) write(action, prev, 'upsertCollection', social.upsertCollection(collection, me));
      return;
    }
    case 'deleteCollection':
      write(action, prev, 'deleteCollection', social.deleteCollection(action.id));
      return;
    case 'collectionItem': {
      const collection = next.collections.find((c) => c.id === action.collectionId);
      const item = collection?.items.find((i) => i.dramaId === action.dramaId);
      write(action, prev, 'collectionItem', social.setCollectionItem(action.collectionId, action.dramaId, action.on, item?.note));
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
