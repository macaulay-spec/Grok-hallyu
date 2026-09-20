/**
 * Catalog provider abstraction.
 * The app never talks to "TMDB" directly — it talks to a CatalogProvider. Today that is a
 * TMDB-backed adapter layered over the local catalog; tomorrow it can be the Hallyu ingestion
 * service without touching a single screen.
 *
 * Credentials: constants/keys.ts (v4 read token preferred, sent as a Bearer header; the v3 key is the
 * `?api_key=` fallback). Both are read-only, public-by-design client credentials baked into the app.
 */
import { Platform } from 'react-native';
import { TMDB_ACCESS_TOKEN, TMDB_API_KEY } from '../constants/keys';
import { Actor, Drama, Episode } from './model';

// Credentials live in constants/keys.ts (wired into the app; env overrides only when non-empty).
export const TMDB_TOKEN = TMDB_ACCESS_TOKEN;
export const TMDB_KEY = TMDB_API_KEY;
export const TMDB_IMG = 'https://image.tmdb.org/t/p';
export const ATTRIBUTION = 'This product uses the TMDB API but is not endorsed or certified by TMDB.';

/** Korean broadcast slots are date-only in the catalog; we assume the prime-time slot when no time is known. */
const DEFAULT_AIR_TIME_KST = 'T22:00:00+09:00';

export interface ActorDetail {
  actor: Actor;
  /** thin drama records for the filmography (no episodes/cast yet) */
  credits: Drama[];
}

export interface ResolveHint {
  title: string;
  originalTitle?: string;
  year: number;
  providerId?: number;
}

export interface CatalogProvider {
  readonly name: string;
  readonly available: boolean;
  searchDramas(query: string, signal?: AbortSignal): Promise<Drama[]>;
  searchActors(query: string, signal?: AbortSignal): Promise<Actor[]>;
  /** Full record: seasons, latest-season episodes, aggregate cast. */
  getDrama(providerId: number, signal?: AbortSignal): Promise<Drama | null>;
  /** Person + TV credits (Korean titles only). */
  getActor(providerId: number, signal?: AbortSignal): Promise<ActorDetail | null>;
  /** Find the catalog record for a locally-seeded title (used to attach real art + ids). */
  resolveDrama(hint: ResolveHint, signal?: AbortSignal): Promise<Drama | null>;
  /** Find a person by name (used to attach headshots to seeded actors). */
  resolveActor(name: string, koreanName?: string, signal?: AbortSignal): Promise<Actor | null>;

  // ---- Editorial lists (Explore, onboarding, genre pages). All Korean TV, thin records. ----
  /** Most-talked-about K-dramas this week. */
  trending(signal?: AbortSignal): Promise<Drama[]>;
  /** Popular K-dramas, paged (20 per page). */
  popular(page?: number, signal?: AbortSignal): Promise<Drama[]>;
  /** Titles with an episode airing in the next `days` days. */
  airingSoon(days?: number, signal?: AbortSignal): Promise<Drama[]>;
  /** Highest-rated K-dramas with a meaningful vote count. */
  topRated(page?: number, signal?: AbortSignal): Promise<Drama[]>;
  /** Premieres from today onwards. */
  upcoming(signal?: AbortSignal): Promise<Drama[]>;
  /** Discover by one of the app's genres (mapped to TMDB genres/keywords). */
  byGenre(genre: string, page?: number, signal?: AbortSignal): Promise<Drama[]>;
  /** K-dramas on a streaming service (TMDB watch-provider id, e.g. 8 = Netflix). */
  onProvider(providerId: number, signal?: AbortSignal): Promise<Drama[]>;
  /** People trending this week who are known for Korean TV. */
  trendingPeople(signal?: AbortSignal): Promise<Actor[]>;
  /** "If you liked X" — TMDB recommendations, Korean only. */
  recommendations(providerId: number, signal?: AbortSignal): Promise<Drama[]>;
}

const GENRE_MAP: Record<number, string> = {
  10759: 'Action',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Melodrama',
  10751: 'Family',
  10762: 'Kids',
  9648: 'Mystery',
  10763: 'News',
  10764: 'Reality',
  10765: 'Fantasy',
  10766: 'Slice of life',
  10767: 'Talk',
  10768: 'Historical',
  37: 'Western',
};

const TONES = ['#2A2F3F', '#3B2F4A', '#2F3A2A', '#3A2A2A', '#2A3A3A', '#3F352A', '#2A3340'];
const toneFor = (id: number) => TONES[id % TONES.length]!;
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

export class CatalogError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'CatalogError';
  }
}

// ---- Health: the last thing the catalog said, so screens can explain "why no art" precisely. ----
export interface CatalogHealth {
  state: 'idle' | 'ok' | 'error';
  at?: number;
  latencyMs?: number;
  status?: number;
  message?: string;
}
let health: CatalogHealth = { state: 'idle' };
const healthListeners = new Set<(h: CatalogHealth) => void>();
function setHealth(next: CatalogHealth) {
  // Throttle "still fine" updates so a busy screen doesn't re-render on every request.
  if (next.state === 'ok' && health.state === 'ok' && next.at && health.at && next.at - health.at < 15_000) return;
  health = next;
  healthListeners.forEach((l) => l(health));
}
export const getCatalogHealth = () => health;
export function subscribeCatalogHealth(l: (h: CatalogHealth) => void) {
  healthListeners.add(l);
  return () => {
    healthListeners.delete(l);
  };
}

/**
 * Which credential to present. Browsers start with the v3 key as a query param — a "simple" CORS
 * request with no preflight and no custom headers to negotiate; native starts with the v4 read
 * token as a Bearer header. If one is rejected (401) and the other exists, we flip once and retry,
 * so a bad or rotated credential of either kind can't take the catalog down on its own.
 */
type AuthMode = 'key' | 'bearer';
let authMode: AuthMode = Platform.OS === 'web' && TMDB_KEY ? 'key' : TMDB_TOKEN ? 'bearer' : 'key';
const otherMode = (m: AuthMode): AuthMode | null => (m === 'key' ? (TMDB_TOKEN ? 'bearer' : null) : TMDB_KEY ? 'key' : null);

async function tmdb<T>(path: string, params: Record<string, string>, signal?: AbortSignal, retried = false): Promise<T> {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  const mode = authMode;
  if (mode === 'key') url.searchParams.set('api_key', TMDB_KEY);
  url.searchParams.set('language', 'en-US');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = {};
  if (mode === 'bearer') {
    headers.Accept = 'application/json';
    headers.Authorization = `Bearer ${TMDB_TOKEN}`;
  }
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(url.toString(), { signal, headers });
  } catch (e) {
    if ((e as Error)?.name !== 'AbortError')
      setHealth({
        state: 'error',
        at: Date.now(),
        message: Platform.OS === 'web' ? 'Network error — the browser could not reach api.themoviedb.org (offline, blocked, or CORS)' : 'Network error — api.themoviedb.org unreachable',
      });
    throw e;
  }
  if (!res.ok) {
    if (res.status === 401 && !retried && otherMode(mode)) {
      authMode = otherMode(mode)!;
      return tmdb<T>(path, params, signal, true);
    }
    const message =
      res.status === 401
        ? 'Catalog credentials rejected (401) — check the TMDB key/token'
        : res.status === 429
          ? 'Catalog rate limit reached (429)'
          : res.status === 404
            ? 'Not found'
            : `Catalog error ${res.status}`;
    if (res.status !== 404) setHealth({ state: 'error', at: Date.now(), status: res.status, message });
    throw new CatalogError(message, res.status);
  }
  setHealth({ state: 'ok', at: Date.now(), latencyMs: Date.now() - started, status: res.status });
  return (await res.json()) as T;
}

interface TmdbEpisode {
  id: number;
  episode_number: number;
  season_number: number;
  name?: string;
  overview?: string;
  air_date?: string | null;
  runtime?: number | null;
  still_path?: string | null;
}

interface TmdbTv {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  first_air_date?: string;
  last_air_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  origin_country?: string[];
  original_language?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  status?: string;
  in_production?: boolean;
  number_of_episodes?: number;
  episode_run_time?: number[];
  networks?: { name: string }[];
  seasons?: { season_number: number; episode_count: number; air_date?: string; name?: string }[];
  next_episode_to_air?: { air_date: string; episode_number: number; season_number: number } | null;
  last_episode_to_air?: { air_date: string; episode_number: number; season_number: number } | null;
  created_by?: { name: string }[];
  aggregate_credits?: { cast: { id: number; name: string; original_name: string; profile_path?: string | null; roles?: { character: string }[]; order: number; popularity?: number }[] };
  /** present when the season was appended (`append_to_response=season/N`) */
  [seasonKey: `season/${number}`]: { episodes?: TmdbEpisode[] } | undefined;
}

interface TmdbPerson {
  id: number;
  name: string;
  original_name?: string;
  also_known_as?: string[];
  profile_path?: string | null;
  known_for?: (TmdbTv & { media_type?: string })[];
  known_for_department?: string;
  popularity?: number;
  biography?: string;
  birthday?: string | null;
  tv_credits?: { cast: (TmdbTv & { character?: string; episode_count?: number })[] };
}

const isKorean = (t: Pick<TmdbTv, 'origin_country' | 'original_language'>) => !!t.origin_country?.includes('KR') || t.original_language === 'ko';

function airIso(date?: string | null): string | undefined {
  if (!date) return undefined;
  return new Date(`${date}${DEFAULT_AIR_TIME_KST}`).toISOString();
}

function mapGenre(g: string): string {
  return g === 'Drama' ? 'Melodrama' : g === 'Sci-Fi & Fantasy' ? 'Fantasy' : g === 'Action & Adventure' ? 'Action' : g === 'War & Politics' ? 'Historical' : g === 'Soap' ? 'Melodrama' : g;
}

function mapEpisode(dramaId: string, e: TmdbEpisode): Episode {
  return {
    id: `${dramaId}-s${e.season_number}e${e.episode_number}`,
    dramaId,
    season: e.season_number,
    number: e.episode_number,
    title: e.name && !/^episode \d+$/i.test(e.name) ? e.name : undefined,
    airDate: airIso(e.air_date),
    runtime: e.runtime ?? undefined,
    synopsis: e.overview || undefined,
    stillUrl: e.still_path ? `${TMDB_IMG}/w780${e.still_path}` : undefined,
  };
}

function mapTv(t: TmdbTv): Drama {
  const id = `tmdb-${t.id}`;
  const year = t.first_air_date ? Number(t.first_air_date.slice(0, 4)) : new Date().getFullYear();
  const notStarted = !t.first_air_date || new Date(t.first_air_date) > new Date();
  const status: Drama['status'] = t.status === 'In Production' || t.status === 'Planned' || notStarted ? 'upcoming' : t.in_production || t.status === 'Returning Series' ? 'airing' : 'completed';
  const genreNames = t.genres?.map((g) => g.name) ?? (t.genre_ids ?? []).map((g) => GENRE_MAP[g]).filter((x): x is string => !!x);
  const seasons = (t.seasons ?? [])
    .filter((s) => s.season_number > 0)
    .map((s) => ({ number: s.season_number, episodeCount: s.episode_count, year: s.air_date ? Number(s.air_date.slice(0, 4)) : undefined, name: s.name }));
  const cast = (t.aggregate_credits?.cast ?? []).slice(0, 16).map((c, i) => ({ actorId: `tmdb-${c.id}`, role: c.roles?.[0]?.character ?? 'Cast', order: i }));
  const episodes: Episode[] = [];
  for (const s of seasons) {
    const appended = t[`season/${s.number}`];
    for (const e of appended?.episodes ?? []) episodes.push(mapEpisode(id, e));
  }
  const runtime = t.episode_run_time?.[0];
  return {
    id,
    title: t.name,
    originalTitle: t.original_name !== t.name ? t.original_name : undefined,
    year,
    endYear: status === 'completed' && t.last_air_date ? Number(t.last_air_date.slice(0, 4)) : undefined,
    status,
    network: t.networks?.[0]?.name,
    genres: genreNames.length ? [...new Set(genreNames.map(mapGenre))] : ['Melodrama'],
    synopsis: t.overview || 'No synopsis yet.',
    posterUrl: t.poster_path ? `${TMDB_IMG}/w342${t.poster_path}` : undefined,
    backdropUrl: t.backdrop_path ? `${TMDB_IMG}/w780${t.backdrop_path}` : undefined,
    tone: toneFor(t.id),
    rating: t.vote_average && (t.vote_count ?? 0) >= 5 ? Math.round(t.vote_average * 10) / 10 : undefined,
    episodeCount: t.number_of_episodes ?? seasons.reduce((a, s) => a + s.episodeCount, 0),
    seasons: seasons.length ? seasons : [{ number: 1, episodeCount: t.number_of_episodes ?? 0, year }],
    episodes: episodes.map((e) => (e.runtime || !runtime ? e : { ...e, runtime })),
    cast,
    creators: t.created_by?.map((c) => c.name),
    nextEpisodeAt: airIso(t.next_episode_to_air?.air_date) ?? (notStarted ? airIso(t.first_air_date) : undefined),
    followerCount: Math.round((t.popularity ?? 10) * 40),
    provider: { name: 'tmdb', id: t.id },
  };
}

function mapPerson(p: TmdbPerson): Actor {
  const koreanName = p.original_name && p.original_name !== p.name ? p.original_name : p.also_known_as?.find((n) => /[\u3131-\uD79D]/.test(n));
  return {
    id: `tmdb-${p.id}`,
    name: p.name,
    koreanName,
    photoUrl: p.profile_path ? `${TMDB_IMG}/w342${p.profile_path}` : undefined,
    bio: p.biography || undefined,
    birthDate: p.birthday ?? undefined,
    knownFor: (p.known_for ?? []).filter((k) => k.media_type !== 'movie' && isKorean(k)).map((k) => `tmdb-${k.id}`),
    followerCount: Math.round((p.popularity ?? 5) * 30),
    provider: { name: 'tmdb', id: p.id },
  };
}

/** Which seasons to fetch episodes for: the latest one (airing) plus season 1 (most K-dramas have exactly one). */
function seasonsToAppend(t: TmdbTv): number[] {
  const nums = (t.seasons ?? []).filter((s) => s.season_number > 0).map((s) => s.season_number);
  if (!nums.length) return [1];
  const latest = Math.max(...nums);
  return [...new Set([latest, Math.min(...nums)])].slice(0, 2);
}

/**
 * The app's editorial genres → TMDB discover filters. TMDB's TV taxonomy has no Romance/Thriller/
 * Historical, so those lean on keywords (looked up once by name, so ids never go stale).
 */
const GENRE_QUERY: Record<string, { genres?: number[]; keywords?: string[] }> = {
  Romance: { keywords: ['romance', 'love'] },
  Thriller: { keywords: ['thriller', 'suspense'] },
  Fantasy: { genres: [10765] },
  Comedy: { genres: [35] },
  Melodrama: { genres: [18], keywords: ['melodrama'] },
  Crime: { genres: [80] },
  Historical: { keywords: ['joseon dynasty', 'historical drama', 'sageuk'] },
  'Slice of life': { keywords: ['slice of life'] },
  Mystery: { genres: [9648] },
  Action: { genres: [10759] },
  Medical: { keywords: ['hospital', 'doctor', 'medical drama'] },
  Legal: { keywords: ['lawyer', 'legal drama', 'prosecutor'] },
  Youth: { keywords: ['high school', 'coming of age', 'youth'] },
  Family: { genres: [10751] },
  Horror: { keywords: ['horror', 'zombie', 'ghost'] },
  'Sci-fi': { genres: [10765], keywords: ['science fiction', 'time travel'] },
};

const KR = { with_origin_country: 'KR', include_adult: 'false', include_null_first_air_dates: 'false' };
const isoDay = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

/** Tiny TTL memo so Explore/onboarding don't re-hit TMDB on every mount. */
const memoStore = new Map<string, { at: number; value: Promise<unknown> }>();
function memo<T>(key: string, ttlMs: number, run: () => Promise<T>): Promise<T> {
  const hit = memoStore.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = run().catch((e) => {
    memoStore.delete(key); // don't cache failures
    throw e;
  });
  memoStore.set(key, { at: Date.now(), value });
  return value;
}
const TEN_MIN = 10 * 60_000;
/** Drop memoised editorial lists (pull-to-refresh). */
export function invalidateCatalogLists() {
  memoStore.clear();
}

const keywordIds = new Map<string, Promise<number | null>>();
function keywordId(name: string, signal?: AbortSignal): Promise<number | null> {
  let p = keywordIds.get(name);
  if (!p) {
    p = tmdb<{ results: { id: number; name: string }[] }>('/search/keyword', { query: name }, signal)
      .then((r) => r.results.find((k) => k.name.toLowerCase() === name.toLowerCase())?.id ?? r.results[0]?.id ?? null)
      .catch(() => {
        keywordIds.delete(name);
        return null;
      });
    keywordIds.set(name, p);
  }
  return p;
}

async function discover(params: Record<string, string>, signal?: AbortSignal): Promise<Drama[]> {
  const data = await tmdb<{ results: TmdbTv[] }>('/discover/tv', { ...KR, ...params }, signal);
  return data.results.filter(isKorean).map(mapTv);
}

export const tmdbProvider: CatalogProvider = {
  name: 'TMDB',
  available: TMDB_TOKEN.length > 0 || TMDB_KEY.length > 0,

  async searchDramas(query, signal) {
    const data = await tmdb<{ results: TmdbTv[] }>('/search/tv', { query, include_adult: 'false' }, signal);
    return data.results
      .filter(isKorean)
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
      .slice(0, 10)
      .map(mapTv);
  },

  async searchActors(query, signal) {
    const data = await tmdb<{ results: TmdbPerson[] }>('/search/person', { query, include_adult: 'false' }, signal);
    return data.results
      .filter((p) => (p.known_for_department ?? 'Acting') === 'Acting')
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
      .slice(0, 10)
      .map(mapPerson);
  },

  async getDrama(providerId, signal) {
    const base = await tmdb<TmdbTv>(`/tv/${providerId}`, {}, signal);
    const append = ['aggregate_credits', ...seasonsToAppend(base).map((n) => `season/${n}`)].join(',');
    const full = await tmdb<TmdbTv>(`/tv/${providerId}`, { append_to_response: append }, signal);
    return mapTv(full);
  },

  async getActor(providerId, signal) {
    const p = await tmdb<TmdbPerson>(`/person/${providerId}`, { append_to_response: 'tv_credits' }, signal);
    const credits = (p.tv_credits?.cast ?? [])
      .filter((c) => isKorean(c) && (c.episode_count ?? 1) > 0 && !!c.first_air_date)
      .sort((a, b) => (b.first_air_date ?? '').localeCompare(a.first_air_date ?? ''))
      .slice(0, 40)
      .map((c) => ({ ...mapTv(c), cast: [{ actorId: `tmdb-${p.id}`, role: c.character || 'Cast', order: 0 }] }));
    const actor = mapPerson(p);
    return { actor: { ...actor, knownFor: credits.slice(0, 6).map((d) => d.id) }, credits };
  },

  async resolveDrama(hint, signal) {
    const wanted = [hint.title, hint.originalTitle].filter((x): x is string => !!x).map(norm);
    const yearOf = (t: TmdbTv) => (t.first_air_date ? Number(t.first_air_date.slice(0, 4)) : undefined);
    const yearNear = (t: TmdbTv) => yearOf(t) === undefined || Math.abs(yearOf(t)! - hint.year) <= 1;
    const exact = (t: TmdbTv) => yearNear(t) && [t.name, t.original_name].map(norm).some((n) => wanted.includes(n));
    // "The Scandal" ↔ "Scandal", "Goblin" ↔ "…도깨비": same year and one title contains the other.
    const loose = (t: TmdbTv) => yearOf(t) === hint.year && [t.name, t.original_name].map(norm).some((n) => wanted.some((w) => w.length >= 4 && (n.includes(w) || w.includes(n))));
    if (hint.providerId) {
      try {
        const t = await tmdb<TmdbTv>(`/tv/${hint.providerId}`, {}, signal);
        if (exact(t) || (isKorean(t) && yearNear(t))) return mapTv(t);
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
      }
    }
    const queries: Record<string, string>[] = [
      { query: hint.title, first_air_date_year: String(hint.year), include_adult: 'false' },
      { query: hint.title, include_adult: 'false' },
    ];
    if (hint.originalTitle) queries.push({ query: hint.originalTitle, include_adult: 'false' });
    for (const params of queries) {
      const data = await tmdb<{ results: TmdbTv[] }>('/search/tv', params, signal);
      const kr = data.results.filter(isKorean);
      const hit = kr.find(exact) ?? kr.find(loose);
      if (hit) return mapTv(hit);
    }
    return null;
  },

  async resolveActor(name, koreanName, signal) {
    const data = await tmdb<{ results: TmdbPerson[] }>('/search/person', { query: name, include_adult: 'false' }, signal);
    const acting = data.results.filter((p) => (p.known_for_department ?? 'Acting') === 'Acting');
    const byName = acting.find((p) => norm(p.name) === norm(name) || (koreanName && (p.original_name === koreanName || p.also_known_as?.includes(koreanName))));
    const pick = byName ?? acting.find((p) => (p.known_for ?? []).some((k) => isKorean(k)));
    return pick ? mapPerson(pick) : null;
  },

  trending(signal) {
    return memo('trending', TEN_MIN, async () => {
      // /trending is global; Korean titles are a slice of it, so read two pages and top up with popular.
      const pages = await Promise.all([1, 2].map((page) => tmdb<{ results: TmdbTv[] }>('/trending/tv/week', { page: String(page) }, signal).catch(() => ({ results: [] as TmdbTv[] }))));
      const kr = pages
        .flatMap((p) => p.results)
        .filter(isKorean)
        .map(mapTv);
      if (kr.length >= 10) return kr.slice(0, 20);
      const popular = await discover({ sort_by: 'popularity.desc', page: '1' }, signal);
      const seen = new Set(kr.map((d) => d.id));
      return [...kr, ...popular.filter((d) => !seen.has(d.id))].slice(0, 20);
    });
  },

  popular(page = 1, signal) {
    return memo(`popular:${page}`, TEN_MIN, () => discover({ sort_by: 'popularity.desc', page: String(page) }, signal));
  },

  airingSoon(days = 7, signal) {
    return memo(`airing:${days}`, TEN_MIN, () => discover({ 'air_date.gte': isoDay(0), 'air_date.lte': isoDay(days), sort_by: 'popularity.desc' }, signal));
  },

  topRated(page = 1, signal) {
    return memo(`top:${page}`, TEN_MIN, () => discover({ sort_by: 'vote_average.desc', 'vote_count.gte': '150', page: String(page) }, signal));
  },

  upcoming(signal) {
    return memo('upcoming', TEN_MIN, () => discover({ 'first_air_date.gte': isoDay(1), 'first_air_date.lte': isoDay(120), sort_by: 'popularity.desc' }, signal));
  },

  byGenre(genre, page = 1, signal) {
    return memo(`genre:${genre}:${page}`, TEN_MIN, async () => {
      const q = GENRE_QUERY[genre] ?? { genres: [18] };
      const params: Record<string, string> = { sort_by: 'popularity.desc', page: String(page) };
      if (q.genres?.length) params.with_genres = q.genres.join(',');
      if (q.keywords?.length) {
        const ids = (await Promise.all(q.keywords.map((k) => keywordId(k, signal)))).filter((x): x is number => !!x);
        if (ids.length) params.with_keywords = ids.join('|'); // OR across keywords
      }
      return discover(params, signal);
    });
  },

  onProvider(providerId, signal) {
    return memo(`provider:${providerId}`, TEN_MIN, () => discover({ with_watch_providers: String(providerId), watch_region: 'US', sort_by: 'popularity.desc' }, signal));
  },

  trendingPeople(signal) {
    return memo('people', TEN_MIN, async () => {
      const pages = await Promise.all([1, 2, 3].map((page) => tmdb<{ results: TmdbPerson[] }>('/trending/person/week', { page: String(page) }, signal).catch(() => ({ results: [] as TmdbPerson[] }))));
      const seen = new Set<number>();
      return pages
        .flatMap((p) => p.results)
        .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
        .filter((p) => (p.known_for_department ?? 'Acting') === 'Acting' && (p.known_for ?? []).some((k) => k.media_type !== 'movie' && isKorean(k)))
        .map(mapPerson)
        .slice(0, 16);
    });
  },

  recommendations(providerId, signal) {
    return memo(`recs:${providerId}`, TEN_MIN, async () => {
      const data = await tmdb<{ results: TmdbTv[] }>(`/tv/${providerId}/recommendations`, {}, signal);
      return data.results.filter(isKorean).map(mapTv).slice(0, 12);
    });
  },
};

export const catalog: CatalogProvider = tmdbProvider;
