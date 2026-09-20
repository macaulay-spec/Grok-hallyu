import { now } from './format';
import { Actor, Collection, Comment, Drama, Episode, Post, ReactionKind, User, WatchlistItem } from './model';
import * as seed from './seed';
import { isVeiled, Viewer } from './spoiler';
import { AppState, allActors, allDramas } from './store';

export const ME = seed.ME_ID;

const score = (p: Post) => Object.values(p.reactions).reduce((a, b) => a + b, 0) + p.commentCount * 3 + p.saveCount * 2;
const ageHours = (iso: string) => (now().getTime() - new Date(iso).getTime()) / 3_600_000;
/** Hot ranking: engagement decays with age. */
const hot = (p: Post) => score(p) / Math.pow(ageHours(p.createdAt) + 2, 1.4);

export function getUser(s: AppState, id: string): User | undefined {
  if (id === s.profile.id || id === ME) return s.profile;
  return seed.USERS.find((u) => u.id === id);
}
export function getUserByHandle(s: AppState, handle: string): User | undefined {
  if (handle.toLowerCase() === s.profile.handle.toLowerCase()) return s.profile;
  return seed.USERS.find((u) => u.handle.toLowerCase() === handle.toLowerCase());
}
export function getDrama(s: AppState, id?: string): Drama | undefined {
  return id ? allDramas(s).find((d) => d.id === id) : undefined;
}
export function getActor(s: AppState, id?: string): Actor | undefined {
  return id ? allActors(s).find((a) => a.id === id) : undefined;
}
export function getPost(s: AppState, id?: string): Post | undefined {
  return id ? s.posts.find((p) => p.id === id) : undefined;
}
export function getCollection(s: AppState, id?: string): Collection | undefined {
  return id ? s.collections.find((c) => c.id === id) : undefined;
}
export function getEpisode(d: Drama, season: number, number: number): Episode | undefined {
  return d.episodes.find((e) => e.season === season && e.number === number);
}

export function viewer(s: AppState): Viewer {
  return { protection: s.prefs.protection, watchlist: s.watchlist, revealed: s.revealed };
}

export function isPostVeiled(s: AppState, p: Post): boolean {
  return isVeiled(p, p.context.dramaId, viewer(s), getDrama(s, p.context.dramaId), p.id);
}
export function isCommentVeiled(s: AppState, c: Comment, post?: Post): boolean {
  const dramaId = post?.context.dramaId;
  return isVeiled({ spoiler: c.spoiler, context: post?.context ?? {} }, dramaId, viewer(s), getDrama(s, dramaId), c.id);
}

/** Active for everyone; pending/failed (not yet accepted by the backend) only for their author. */
export function isLive(s: Pick<AppState, 'profile'>, p: { state?: Post['state']; authorId: string }): boolean {
  const st = p.state ?? 'active';
  return st === 'active' || ((st === 'pending' || st === 'failed') && p.authorId === s.profile.id);
}

/** Posts that should never appear for this viewer (blocked/muted/deleted/hidden). */
export function visiblePosts(s: AppState, posts: Post[] = s.posts): Post[] {
  const mutedWords = s.prefs.mutedWords.map((w) => w.toLowerCase());
  return posts.filter(
    (p) =>
      isLive(s, p) &&
      !s.blockedUsers.includes(p.authorId) &&
      !s.mutedUsers.includes(p.authorId) &&
      !(p.context.dramaId && s.mutedDramas.includes(p.context.dramaId)) &&
      !mutedWords.some((w) => `${p.title ?? ''} ${p.body}`.toLowerCase().includes(w)),
  );
}

export interface Ranked {
  post: Post;
  reason?: string;
}

export function forYou(s: AppState): Ranked[] {
  const posts = visiblePosts(s).filter((p) => p.type !== 'short');
  const genres = new Set([...s.onboarding.genres, ...s.profile.favoriteGenres]);
  return posts
    .map((post) => {
      let w = hot(post);
      let reason: string | undefined;
      const d = getDrama(s, post.context.dramaId);
      const wl = post.context.dramaId ? s.watchlist[post.context.dramaId] : undefined;
      if (post.authorId === s.profile.id) w *= 0.6;
      if (post.context.dramaId && s.follows.dramas.includes(post.context.dramaId)) {
        w *= 1.8;
        reason = `Because you follow ${d?.title}`;
      }
      if (wl?.status === 'watching') {
        w *= 2.2;
        reason = `You're watching ${d?.title}`;
      }
      if (s.follows.users.includes(post.authorId)) {
        w *= 1.6;
        reason = reason ?? `From ${getUser(s, post.authorId)?.displayName}`;
      }
      if (post.context.actorIds?.some((a) => s.follows.actors.includes(a))) {
        w *= 1.5;
        reason = reason ?? `Because you follow ${getActor(s, post.context.actorIds.find((a) => s.follows.actors.includes(a)))?.name}`;
      }
      if (d && s.prefs.personalization && d.genres.some((g) => genres.has(g))) {
        w *= 1.25;
        reason = reason ?? `Popular in ${d.genres.find((g) => genres.has(g))}`;
      }
      if (d?.status === 'airing') w *= 1.3;
      if (!reason && score(post) > 300) reason = 'Trending in the community';
      return { post, reason, w };
    })
    .sort((a, b) => b.w - a.w)
    .map(({ post, reason }) => ({ post, reason }));
}

export function following(s: AppState): Ranked[] {
  return visiblePosts(s)
    .filter((p) => p.type !== 'short')
    .filter(
      (p) =>
        s.follows.users.includes(p.authorId) ||
        (p.context.dramaId && s.follows.dramas.includes(p.context.dramaId)) ||
        p.context.actorIds?.some((a) => s.follows.actors.includes(a)),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((post) => ({
      post,
      reason: s.follows.users.includes(post.authorId)
        ? undefined
        : post.context.dramaId && s.follows.dramas.includes(post.context.dramaId)
          ? `${getDrama(s, post.context.dramaId)?.title} fandom`
          : `${getActor(s, post.context.actorIds?.find((a) => s.follows.actors.includes(a)))?.name} fandom`,
    }));
}

export function shorts(s: AppState): Post[] {
  return visiblePosts(s)
    .filter((p) => p.type === 'short')
    .sort((a, b) => hot(b) - hot(a));
}

export function postsForDrama(s: AppState, dramaId: string, sort: 'top' | 'latest' = 'top'): Post[] {
  const list = visiblePosts(s).filter((p) => p.context.dramaId === dramaId || p.context.secondaryDramaId === dramaId);
  return sort === 'top' ? list.sort((a, b) => hot(b) - hot(a)) : list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function postsForEpisode(s: AppState, dramaId: string, season: number, episode: number): Post[] {
  return visiblePosts(s)
    .filter((p) => p.context.dramaId === dramaId && (p.context.season ?? 1) === season && p.context.episode === episode)
    .sort((a, b) => hot(b) - hot(a));
}

export function postsForActor(s: AppState, actorId: string): Post[] {
  const actor = getActor(s, actorId);
  return visiblePosts(s)
    .filter((p) => p.context.actorIds?.includes(actorId) || (p.context.dramaId && actor?.knownFor.includes(p.context.dramaId) && p.body.toLowerCase().includes((actor?.name ?? '').toLowerCase().split(' ')[0]!)))
    .sort((a, b) => hot(b) - hot(a));
}

export function postsByUser(s: AppState, userId: string): Post[] {
  return s.posts.filter((p) => p.authorId === userId && isLive(s, p)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function commentsFor(s: AppState, postId: string): Comment[] {
  return s.comments.filter((c) => c.postId === postId && !s.blockedUsers.includes(c.authorId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function reactionTotal(p: { reactions: Record<ReactionKind, number> }): number {
  return Object.values(p.reactions).reduce((a, b) => a + b, 0);
}
export function topReactions(p: { reactions: Record<ReactionKind, number> }, n = 3): ReactionKind[] {
  return (Object.entries(p.reactions) as [ReactionKind, number][])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

/** Episodes airing within the given window (default: today ±). */
export function airingEpisodes(s: AppState, fromHours = -30, toHours = 30): { drama: Drama; episode: Episode }[] {
  const t = now().getTime();
  const out: { drama: Drama; episode: Episode }[] = [];
  for (const drama of allDramas(s)) {
    if (drama.status === 'completed') continue;
    for (const episode of drama.episodes) {
      if (!episode.airDate) continue;
      const dt = (new Date(episode.airDate).getTime() - t) / 3_600_000;
      if (dt >= fromHours && dt <= toHours) out.push({ drama, episode });
    }
  }
  return out.sort((a, b) => a.episode.airDate!.localeCompare(b.episode.airDate!));
}

export function scheduleByDay(s: AppState, days = 7): { day: string; items: { drama: Drama; episode: Episode }[] }[] {
  const items = airingEpisodes(s, -24, days * 24);
  const groups = new Map<string, { drama: Drama; episode: Episode }[]>();
  for (const it of items) {
    const key = new Date(it.episode.airDate!).toDateString();
    groups.set(key, [...(groups.get(key) ?? []), it]);
  }
  return [...groups.entries()].map(([day, list]) => ({ day, items: list }));
}

export function trendingDramas(s: AppState, n = 10): Drama[] {
  const activity = new Map<string, number>();
  for (const p of visiblePosts(s)) if (p.context.dramaId) activity.set(p.context.dramaId, (activity.get(p.context.dramaId) ?? 0) + hot(p));
  return allDramas(s)
    .map((d) => ({ d, w: (activity.get(d.id) ?? 0) * 1000 + d.followerCount / 10_000 + (d.status === 'airing' ? 50 : 0) }))
    .sort((a, b) => b.w - a.w)
    .slice(0, n)
    .map((x) => x.d);
}

export function trendingDiscussions(s: AppState, n = 6): Post[] {
  return visiblePosts(s)
    .filter((p) => p.type === 'discussion')
    .sort((a, b) => hot(b) - hot(a))
    .slice(0, n);
}

export function recommendedDramas(s: AppState, n = 10): { drama: Drama; reason: string }[] {
  const genres = new Set([...s.onboarding.genres, ...s.profile.favoriteGenres]);
  const seen = new Set(Object.keys(s.watchlist));
  return allDramas(s)
    .filter((d) => !seen.has(d.id))
    .map((d) => {
      const g = d.genres.find((x) => genres.has(x));
      const rec = visiblePosts(s).find((p) => p.type === 'recommendation' && p.context.dramaId === d.id && p.context.secondaryDramaId && seen.has(p.context.secondaryDramaId));
      const reason = rec ? `Because you watched ${getDrama(s, rec.context.secondaryDramaId)?.title}` : g ? `Because you like ${g}` : d.status === 'airing' ? 'Airing now' : 'Loved by the community';
      const w = (rec ? 3 : 0) + (g ? 2 : 0) + (d.rating ?? 7) / 10 + (d.status === 'airing' ? 1 : 0);
      return { drama: d, reason, w };
    })
    .sort((a, b) => b.w - a.w)
    .slice(0, n);
}

export function recommendedPeople(s: AppState, n = 6): { user: User; reason: string }[] {
  const myGenres = new Set([...s.onboarding.genres, ...s.profile.favoriteGenres]);
  const myDramas = new Set([...Object.keys(s.watchlist), ...s.follows.dramas]);
  return seed.USERS.filter((u) => u.id !== s.profile.id && !s.follows.users.includes(u.id) && !s.blockedUsers.includes(u.id) && !u.isPrivate)
    .map((u) => {
      const shared = u.favoriteDramaIds.filter((d) => myDramas.has(d));
      const g = u.favoriteGenres.find((x) => myGenres.has(x));
      const reason = shared.length ? `Also loves ${getDrama(s, shared[0])?.title}` : g ? `Into ${g} too` : 'Active this week';
      return { user: u, reason, w: shared.length * 2 + (g ? 1 : 0) + u.followers / 5000 };
    })
    .sort((a, b) => b.w - a.w)
    .slice(0, n);
}

export function relatedDramas(s: AppState, d: Drama, n = 8): Drama[] {
  return allDramas(s)
    .filter((x) => x.id !== d.id)
    .map((x) => ({ x, w: x.genres.filter((g) => d.genres.includes(g)).length * 2 + (x.tags ?? []).filter((t) => (d.tags ?? []).includes(t)).length * 3 + (x.cast.some((c) => d.cast.some((c2) => c2.actorId === c.actorId)) ? 2 : 0) + (x.network === d.network ? 0.5 : 0) }))
    .filter((r) => r.w > 0)
    .sort((a, b) => b.w - a.w)
    .slice(0, n)
    .map((r) => r.x);
}

export function relatedActors(s: AppState, a: Actor, n = 8): Actor[] {
  const co = new Map<string, number>();
  for (const dId of a.knownFor) {
    const d = getDrama(s, dId);
    d?.cast.forEach((c) => c.actorId !== a.id && co.set(c.actorId, (co.get(c.actorId) ?? 0) + 1));
  }
  return [...co.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, n)
    .map(([id]) => getActor(s, id)!)
    .filter(Boolean);
}

export function fandomSize(d: Drama): number {
  return d.followerCount;
}

export function watchlistByStatus(s: AppState, status: WatchlistItem['status']): WatchlistItem[] {
  return Object.values(s.watchlist)
    .filter((w) => w.status === status)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Next episode the viewer can watch, for "Up next". */
export function upNext(s: AppState): { item: WatchlistItem; drama: Drama; episode: Episode; airedAgo: boolean }[] {
  const t = now().getTime();
  return watchlistByStatus(s, 'watching')
    .map((item) => {
      const drama = getDrama(s, item.dramaId);
      if (!drama) return null;
      const episode = getEpisode(drama, item.season, item.currentEpisode + 1);
      if (!episode) return null;
      const aired = !!episode.airDate && new Date(episode.airDate).getTime() <= t;
      return { item, drama, episode, airedAgo: aired };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => Number(b.airedAgo) - Number(a.airedAgo));
}

export function unreadCount(s: AppState): number {
  return s.notifications.filter((n) => !n.read).length;
}

export function collectionsContaining(s: AppState, dramaId: string): Collection[] {
  return s.collections.filter((c) => c.ownerId === s.profile.id && c.items.some((i) => i.dramaId === dramaId));
}

export function myCollections(s: AppState): Collection[] {
  return s.collections.filter((c) => c.ownerId === s.profile.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function publicCollections(s: AppState): Collection[] {
  return s.collections.filter((c) => c.visibility === 'public' && !s.blockedUsers.includes(c.ownerId)).sort((a, b) => b.followerCount - a.followerCount);
}

export function currentlyWatching(s: AppState, userId: string): Drama[] {
  if (userId === s.profile.id) return watchlistByStatus(s, 'watching').map((w) => getDrama(s, w.dramaId)!).filter(Boolean);
  const u = getUser(s, userId);
  return (u?.favoriteDramaIds ?? []).slice(0, 2).map((id) => getDrama(s, id)!).filter(Boolean);
}

export interface SearchResults {
  dramas: Drama[];
  actors: Actor[];
  people: User[];
  posts: Post[];
  episodes: { drama: Drama; episode: Episode }[];
  collections: Collection[];
}

export function searchLocal(s: AppState, q: string): SearchResults {
  const needle = q.trim().toLowerCase();
  const empty: SearchResults = { dramas: [], actors: [], people: [], posts: [], episodes: [], collections: [] };
  if (!needle) return empty;
  const has = (...fields: (string | undefined)[]) => fields.some((f) => f?.toLowerCase().includes(needle));
  const tag = needle.startsWith('#') ? needle.slice(1) : undefined;
  return {
    dramas: allDramas(s).filter((d) => has(d.title, d.originalTitle, ...d.genres, ...(d.tags ?? []), d.network)).slice(0, 12),
    actors: allActors(s).filter((a) => has(a.name, a.koreanName)).slice(0, 12),
    people: seed.USERS.filter((u) => !u.isPrivate && u.id !== s.profile.id && has(u.displayName, u.handle, u.bio)).slice(0, 12),
    posts: visiblePosts(s)
      .filter((p) => (tag ? p.hashtags.some((h) => h.toLowerCase() === tag) : has(p.title, p.body, p.verdict, ...p.hashtags.map((h) => `#${h}`))))
      .slice(0, 20),
    episodes: allDramas(s)
      .flatMap((d) => d.episodes.filter((e) => e.title && has(e.title)).map((episode) => ({ drama: d, episode })))
      .slice(0, 8),
    collections: publicCollections(s).filter((c) => has(c.title, c.description)).slice(0, 8),
  };
}

export function dramasByGenre(s: AppState, genre: string): Drama[] {
  return allDramas(s).filter((d) => d.genres.some((g) => g.toLowerCase() === genre.toLowerCase())).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
}
