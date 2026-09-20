/**
 * Catalog provider abstraction.
 * The app never talks to "TMDB" directly — it talks to a CatalogProvider. Today that is a
 * TMDB-backed adapter (when EXPO_PUBLIC_TMDB_API_KEY is configured) layered over the local catalog;
 * tomorrow it can be the Hallyu ingestion service without touching a single screen.
 */
import { Actor, Drama } from './model';

export const TMDB_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY ?? '';
export const TMDB_IMG = 'https://image.tmdb.org/t/p';
export const ATTRIBUTION = 'This product uses the TMDB API but is not endorsed or certified by TMDB.';

export interface CatalogProvider {
  readonly name: string;
  readonly available: boolean;
  searchDramas(query: string, signal?: AbortSignal): Promise<Drama[]>;
  searchActors(query: string, signal?: AbortSignal): Promise<Actor[]>;
  getDrama(providerId: number, signal?: AbortSignal): Promise<Drama | null>;
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
const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');

async function tmdb<T>(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set('api_key', TMDB_KEY);
  url.searchParams.set('language', 'en-US');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`Catalog error ${res.status}`);
  return (await res.json()) as T;
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
  popularity?: number;
  status?: string;
  in_production?: boolean;
  number_of_episodes?: number;
  networks?: { name: string }[];
  seasons?: { season_number: number; episode_count: number; air_date?: string; name?: string }[];
  next_episode_to_air?: { air_date: string; episode_number: number; season_number: number } | null;
  created_by?: { name: string }[];
  aggregate_credits?: { cast: { id: number; name: string; original_name: string; profile_path?: string | null; roles?: { character: string }[]; order: number }[] };
}

function mapTv(t: TmdbTv): Drama {
  const year = t.first_air_date ? Number(t.first_air_date.slice(0, 4)) : new Date().getFullYear();
  const airing = t.in_production || t.status === 'Returning Series';
  const status: Drama['status'] = t.status === 'In Production' || (t.first_air_date && new Date(t.first_air_date) > new Date()) ? 'upcoming' : airing ? 'airing' : 'completed';
  const genreNames = t.genres?.map((g) => g.name) ?? (t.genre_ids ?? []).map((g) => GENRE_MAP[g]).filter((x): x is string => !!x);
  const seasons = (t.seasons ?? []).filter((s) => s.season_number > 0).map((s) => ({ number: s.season_number, episodeCount: s.episode_count, year: s.air_date ? Number(s.air_date.slice(0, 4)) : undefined, name: s.name }));
  const cast = (t.aggregate_credits?.cast ?? []).slice(0, 12).map((c, i) => ({ actorId: `tmdb-${c.id}`, role: c.roles?.[0]?.character ?? 'Cast', order: i }));
  return {
    id: `tmdb-${t.id}`,
    title: t.name,
    originalTitle: t.original_name !== t.name ? t.original_name : undefined,
    year,
    endYear: status === 'completed' && t.last_air_date ? Number(t.last_air_date.slice(0, 4)) : undefined,
    status,
    network: t.networks?.[0]?.name,
    genres: genreNames.length ? genreNames.map((g) => (g === 'Drama' ? 'Melodrama' : g === 'Sci-Fi & Fantasy' ? 'Fantasy' : g === 'Action & Adventure' ? 'Action' : g === 'War & Politics' ? 'Historical' : g === 'Soap' ? 'Melodrama' : g)) : ['Melodrama'],
    synopsis: t.overview || 'No synopsis yet.',
    posterUrl: t.poster_path ? `${TMDB_IMG}/w342${t.poster_path}` : undefined,
    backdropUrl: t.backdrop_path ? `${TMDB_IMG}/w780${t.backdrop_path}` : undefined,
    tone: toneFor(t.id),
    rating: t.vote_average ? Math.round(t.vote_average * 10) / 10 : undefined,
    episodeCount: t.number_of_episodes ?? seasons.reduce((a, s) => a + s.episodeCount, 0),
    seasons: seasons.length ? seasons : [{ number: 1, episodeCount: t.number_of_episodes ?? 0, year }],
    episodes: [],
    cast,
    creators: t.created_by?.map((c) => c.name),
    nextEpisodeAt: t.next_episode_to_air?.air_date ? new Date(t.next_episode_to_air.air_date).toISOString() : undefined,
    followerCount: Math.round((t.popularity ?? 10) * 40),
    provider: { name: 'tmdb', id: t.id },
  };
}

function mapPerson(p: { id: number; name: string; original_name?: string; profile_path?: string | null; known_for?: TmdbTv[]; popularity?: number; biography?: string; birthday?: string }): Actor {
  return {
    id: `tmdb-${p.id}`,
    name: p.name,
    koreanName: p.original_name && p.original_name !== p.name ? p.original_name : undefined,
    photoUrl: p.profile_path ? `${TMDB_IMG}/w342${p.profile_path}` : undefined,
    bio: p.biography,
    birthDate: p.birthday,
    knownFor: (p.known_for ?? []).map((k) => `tmdb-${k.id}`),
    followerCount: Math.round((p.popularity ?? 5) * 30),
    provider: { name: 'tmdb', id: p.id },
  };
}

export const tmdbProvider: CatalogProvider = {
  name: 'TMDB',
  available: TMDB_KEY.length > 0,
  async searchDramas(query, signal) {
    const data = await tmdb<{ results: TmdbTv[] }>('/search/tv', { query, include_adult: 'false' }, signal);
    return data.results.filter((r) => r.origin_country?.includes('KR') || r.original_language === 'ko').slice(0, 10).map(mapTv);
  },
  async searchActors(query, signal) {
    const data = await tmdb<{ results: Parameters<typeof mapPerson>[0][] }>('/search/person', { query, include_adult: 'false' }, signal);
    return data.results.slice(0, 10).map(mapPerson);
  },
  async getDrama(providerId, signal) {
    const t = await tmdb<TmdbTv>(`/tv/${providerId}`, { append_to_response: 'aggregate_credits' }, signal);
    return mapTv(t);
  },
};

export const catalog: CatalogProvider = tmdbProvider;
