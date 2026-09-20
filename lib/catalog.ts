/**
 * Catalog provider abstraction.
 * The app never talks to "TMDB" directly — it talks to a CatalogProvider. Today that is a
 * TMDB-backed adapter layered over the local catalog; tomorrow it can be the Hallyu ingestion
 * service without touching a single screen.
 *
 * Configuration (see .env.example):
 *   EXPO_PUBLIC_TMDB_ACCESS_TOKEN  – v4 read access token (preferred, sent as a Bearer header)
 *   EXPO_PUBLIC_TMDB_API_KEY       – v3 API key (fallback, sent as ?api_key=)
 * Both are read-only, public-by-design client credentials; they are inlined into the bundle at build time.
 */
import { Actor, Drama, Episode } from './model';

// Same convention as lib/supabase.ts: env wins, otherwise the project's public read-only client credential.
// TMDB credentials ship inside every client bundle by design (scope: api_read); rotate at themoviedb.org → Settings → API.
export const TMDB_TOKEN =
  process.env.EXPO_PUBLIC_TMDB_ACCESS_TOKEN ??
  'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJmZjAxZjI4ZmM1YzQ3NzkxZTI4MDM4MzQ5NDQ1YmY1OCIsIm5iZiI6MTc4OTAyMDA1Ny43NzksInN1YiI6IjZhYTI0Nzk5OGQ1YWFjZTczMzY2ODJkMyIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.ETon7kqWQjj7jtJJOXyRgAWme9Sh9B7OUrdAI61uuH8';
export const TMDB_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY ?? 'ff01f28fc5c47791e28038349445bf58';
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
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export class CatalogError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'CatalogError';
  }
}

async function tmdb<T>(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  if (!TMDB_TOKEN && TMDB_KEY) url.searchParams.set('api_key', TMDB_KEY);
  url.searchParams.set('language', 'en-US');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (TMDB_TOKEN) headers.Authorization = `Bearer ${TMDB_TOKEN}`;
  const res = await fetch(url.toString(), { signal, headers });
  if (!res.ok) throw new CatalogError(res.status === 401 ? 'Catalog credentials rejected' : res.status === 429 ? 'Catalog rate limit reached' : `Catalog error ${res.status}`, res.status);
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
  const seasons = (t.seasons ?? []).filter((s) => s.season_number > 0).map((s) => ({ number: s.season_number, episodeCount: s.episode_count, year: s.air_date ? Number(s.air_date.slice(0, 4)) : undefined, name: s.name }));
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
    nextEpisodeAt: airIso(t.next_episode_to_air?.air_date),
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
};

export const catalog: CatalogProvider = tmdbProvider;
