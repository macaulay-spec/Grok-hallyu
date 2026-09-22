// Server-side TMDB access + the exact mapping the app uses in lib/catalog.ts (ids `tmdb-<id>`, 22:00 KST default slot,
// genre renames, status buckets), so rows written by ensure-catalog match what the client already renders.
import { HttpError } from './http.ts';

const API = 'https://api.themoviedb.org/3';
const TOKEN = Deno.env.get('TMDB_TOKEN') ?? '';
const KEY = Deno.env.get('TMDB_KEY') ?? '';
const DEFAULT_AIR_TIME_KST = 'T22:00:00+09:00';

export interface TmdbEpisode {
  season_number: number;
  episode_number: number;
  name?: string;
  air_date?: string | null;
  runtime?: number | null;
  overview?: string;
  still_path?: string | null;
}
export interface TmdbTv {
  id: number;
  name: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  first_air_date?: string | null;
  last_air_date?: string | null;
  status?: string;
  in_production?: boolean;
  number_of_episodes?: number;
  number_of_seasons?: number;
  episode_run_time?: number[];
  popularity?: number;
  vote_average?: number;
  vote_count?: number;
  origin_country?: string[];
  original_language?: string;
  genres?: { id: number; name: string }[];
  networks?: { name: string }[];
  created_by?: { name: string }[];
  seasons?: { season_number: number; episode_count: number; air_date?: string | null; name?: string }[];
  next_episode_to_air?: TmdbEpisode | null;
  last_episode_to_air?: TmdbEpisode | null;
  aggregate_credits?: { cast: { id: number; name: string; original_name?: string; profile_path?: string | null; roles?: { character: string }[]; order: number }[] };
  [season: `season/${number}`]: { episodes?: TmdbEpisode[] } | undefined;
}
export interface TmdbPerson {
  id: number;
  name: string;
  original_name?: string;
  profile_path?: string | null;
  biography?: string;
  birthday?: string | null;
  popularity?: number;
}

export async function tmdb<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const u = new URL(API + path);
  u.searchParams.set('language', 'en-US');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  else if (KEY) u.searchParams.set('api_key', KEY);
  else throw new HttpError(500, 'TMDB credentials are not configured (TMDB_TOKEN)');
  const res = await fetch(u, { headers, signal: AbortSignal.timeout(12_000) });
  if (res.status === 404) throw new HttpError(404, 'Not found on TMDB', false);
  if (res.status === 429) throw new HttpError(429, 'The catalog is busy — try again in a moment');
  if (!res.ok) throw new HttpError(502, `Catalog error ${res.status}`);
  return (await res.json()) as T;
}

export const mapGenre = (g: string): string =>
  g === 'Drama' ? 'Melodrama' : g === 'Sci-Fi & Fantasy' ? 'Fantasy' : g === 'Action & Adventure' ? 'Action' : g === 'War & Politics' ? 'Historical' : g === 'Soap' ? 'Melodrama' : g;

export const airIso = (date?: string | null): string | null => (date ? new Date(`${date}${DEFAULT_AIR_TIME_KST}`).toISOString() : null);

export function statusOf(t: TmdbTv): 'upcoming' | 'airing' | 'completed' {
  const notStarted = !t.first_air_date || new Date(t.first_air_date) > new Date();
  return t.status === 'In Production' || t.status === 'Planned' || notStarted ? 'upcoming' : t.in_production || t.status === 'Returning Series' ? 'airing' : 'completed';
}

/** Which seasons to fetch episodes for: the latest one plus the first (most K-dramas have exactly one). */
export function seasonsToAppend(t: TmdbTv): number[] {
  const nums = (t.seasons ?? []).filter((s) => s.season_number > 0).map((s) => s.season_number);
  if (!nums.length) return [1];
  const latest = Math.max(...nums);
  return [...new Set([latest, Math.min(...nums)])].slice(0, 2);
}

export interface CatalogPayload {
  drama: Record<string, unknown>;
  actors: Record<string, unknown>[];
  cast: Record<string, unknown>[];
  episodes: Record<string, unknown>[];
}

export function toCatalogPayload(t: TmdbTv, withEpisodes: boolean): CatalogPayload {
  const id = `tmdb-${t.id}`;
  const status = statusOf(t);
  const seasons = (t.seasons ?? [])
    .filter((s) => s.season_number > 0)
    .map((s) => ({ number: s.season_number, episodeCount: s.episode_count, year: s.air_date ? Number(s.air_date.slice(0, 4)) : undefined, name: s.name }));
  const runtime = t.episode_run_time?.[0];
  const cast = (t.aggregate_credits?.cast ?? []).slice(0, 16);
  const genres = t.genres?.length ? [...new Set(t.genres.map((g) => mapGenre(g.name)))] : ['Melodrama'];

  const episodes: Record<string, unknown>[] = [];
  if (withEpisodes) {
    for (const s of seasons) {
      for (const e of t[`season/${s.number}`]?.episodes ?? []) {
        episodes.push({
          season: e.season_number,
          number: e.episode_number,
          title: e.name && !/^episode \d+$/i.test(e.name) ? e.name : null,
          airAt: airIso(e.air_date),
          runtime: e.runtime ?? runtime ?? null,
          overview: e.overview || null,
        });
      }
    }
  }
  // make sure the next scheduled episode is present even when its season wasn't appended
  const nx = t.next_episode_to_air;
  if (nx && !episodes.some((e) => e.season === nx.season_number && e.number === nx.episode_number)) {
    episodes.push({ season: nx.season_number, number: nx.episode_number, title: nx.name && !/^episode \d+$/i.test(nx.name) ? nx.name : null, airAt: airIso(nx.air_date), runtime: nx.runtime ?? runtime ?? null, overview: nx.overview || null });
  }

  return {
    drama: {
      id,
      tmdbId: t.id,
      title: t.name,
      originalTitle: t.original_name && t.original_name !== t.name ? t.original_name : null,
      posterPath: t.poster_path ?? null,
      backdropPath: t.backdrop_path ?? null,
      genres,
      status,
      firstAirDate: t.first_air_date || null,
      network: t.networks?.[0]?.name ?? null,
      overview: t.overview || null,
      seasonCount: seasons.length || 1,
      episodeCount: t.number_of_episodes ?? seasons.reduce((a, s) => a + s.episodeCount, 0),
      payload: {
        seasons: seasons.length ? seasons : [{ number: 1, episodeCount: t.number_of_episodes ?? 0 }],
        runtime: runtime ?? null,
        creators: t.created_by?.map((c) => c.name) ?? [],
        rating: t.vote_average && (t.vote_count ?? 0) >= 5 ? Math.round(t.vote_average * 10) / 10 : null,
        popularity: t.popularity ?? null,
        lastAirDate: t.last_air_date ?? null,
        nextEpisodeAt: airIso(t.next_episode_to_air?.air_date) ?? (status === 'upcoming' ? airIso(t.first_air_date) : null),
        isKorean: !!t.origin_country?.includes('KR') || t.original_language === 'ko',
      },
    },
    actors: cast.map((c) => ({ id: `tmdb-${c.id}`, tmdbId: c.id, name: c.name, profilePath: c.profile_path ?? null })),
    cast: cast.map((c, i) => ({ actorId: `tmdb-${c.id}`, character: c.roles?.[0]?.character ?? 'Cast', ord: i })),
    episodes,
  };
}

export const toActorPayload = (p: TmdbPerson) => ({ actor: { id: `tmdb-${p.id}`, tmdbId: p.id, name: p.name, profilePath: p.profile_path ?? null } });
