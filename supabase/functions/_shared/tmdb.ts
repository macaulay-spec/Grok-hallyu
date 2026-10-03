// Shared TMDB client for the Hallyu Edge Functions.
//
// TMDB stays behind the backend. Nothing in the app talks to it directly, and no credential from
// this file is ever returned to a caller: the access token is read from the function environment
// (set with `supabase secrets set`) and only ever used as an outbound Authorization header.
//
// The token is a *read-only* credential, which is why it is safe to fetch from here rather than
// hiding it in the database: it grants no write access to anything, and keeping it out of the app
// bundle means rotating it does not require shipping a new APK.

export const TMDB_BASE = Deno.env.get('TMDB_API_BASE') ?? 'https://api.themoviedb.org/3';
export const TMDB_TOKEN = Deno.env.get('TMDB_ACCESS_TOKEN') ?? '';
export const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY') ?? '';

/** TMDB image CDN. Posters and backdrops are referenced by absolute URL from the ingest payload. */
export const TMDB_IMAGE_BASE = Deno.env.get('TMDB_IMAGE_BASE') ?? 'https://image.tmdb.org/t/p';

export class TmdbError extends Error {
  readonly status: number;
  readonly retryAfterSeconds: number | null;

  constructor(message: string, status: number, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = 'TmdbError';
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function tmdbConfigured(): boolean {
  return Boolean(TMDB_TOKEN || TMDB_API_KEY);
}

interface TmdbRequest {
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

/**
 * One TMDB request.
 *
 * v4 bearer token when one is configured, v3 api_key otherwise. Rate limiting (429) surfaces as a
 * `retryAfterSeconds` so the caller can record a backoff instead of hammering the API, and a 404 is
 * a normal "this record is gone" answer rather than an error to retry.
 */
export async function tmdb<T>({ path, query, signal }: TmdbRequest): Promise<T> {
  if (!tmdbConfigured()) {
    throw new TmdbError('no TMDB credential is configured for this function', 0);
  }

  const url = new URL(`${TMDB_BASE}/${path.replace(/^\//, '')}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  // The v3 key is only appended when there is no v4 token, so a bearer-only deployment never leaks
  // the key into a URL that ends up in a log line.
  if (!TMDB_TOKEN && TMDB_API_KEY) url.searchParams.set('api_key', TMDB_API_KEY);

  const response = await fetch(url.toString(), {
    signal,
    headers: {
      accept: 'application/json',
      ...(TMDB_TOKEN ? { Authorization: `Bearer ${TMDB_TOKEN}` } : {}),
    },
  });

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('retry-after') ?? '60');
    throw new TmdbError('rate limited by TMDB', 429, Number.isFinite(retryAfter) ? retryAfter : 60);
  }

  if (response.status === 404) {
    throw new TmdbError(`not found: ${path}`, 404);
  }

  if (!response.ok) {
    throw new TmdbError(`TMDB responded ${response.status}`, response.status);
  }

  return (await response.json()) as T;
}

/** Poster/backdrop URL for a TMDB image path, at a chosen size. */
export function imageUrl(path: string | null | undefined, size: 'w185' | 'w342' | 'w500' | 'original' = 'w500'): string | null {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

// -----------------------------------------------------------------------------------------------
// Normalisation
// -----------------------------------------------------------------------------------------------
//
// TMDB is the only place these shapes exist. The payload objects below are exactly what
// `catalog_upsert_title`, `catalog_upsert_episodes` and `catalog_upsert_title_people` expect, so
// adding a field to the catalog means changing the normaliser and the SQL, never the client.

export interface TmdbTitle {
  id: number;
  media_type?: 'tv' | 'movie';
  name?: string;
  original_name?: string;
  original_title?: string;
  title?: string;
  overview?: string;
  first_air_date?: string;
  last_air_date?: string;
  release_date?: string;
  status?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  episode_run_time?: number[];
  runtime?: number | null;
  origin_country?: string[];
  genres?: Array<{ id: number; name: string }>;
  networks?: Array<{ id: number; name: string }>;
  episode_run_times?: number[];
  original_language?: string;
  number_of_seasons?: number;
  number_of_episodes?: number;
  credits?: TmdbCredits;
  external_ids?: Record<string, string | number>;
}

export interface TmdbCredits {
  cast?: Array<{
    id: number;
    name: string;
    character?: string;
    order?: number;
    profile_path?: string | null;
  }>;
  crew?: Array<{ id: number; name: string; job?: string; profile_path?: string | null }>;
}

export interface TmdbSeason {
  id: number;
  season_number: number;
  name?: string;
  air_date?: string;
  episodes?: TmdbEpisode[];
}

export interface TmdbEpisode {
  season_number: number;
  episode_number: number;
  name?: string;
  overview?: string;
  air_date?: string;
  runtime?: number | null;
  still_path?: string | null;
  episode_type?: number;
}

/** TMDB's status vocabulary → the four states Hallyu stores. */
export function mapStatus(raw: string | undefined): 'upcoming' | 'airing' | 'completed' | 'canceled' {
  switch ((raw ?? '').toLowerCase()) {
    case 'returning series':
      return 'airing';
    case 'ended':
      return 'completed';
    case 'in production':
    case 'planned':
    case 'post production':
      return 'upcoming';
    case 'canceled':
    case 'cancelled':
      return 'canceled';
    default:
      // "Unknown", or a value TMDB adds later. Airing is the least surprising fallback; the
      // database derives the real state from the air dates immediately afterwards.
      return 'airing';
  }
}

/**
 * Chooses Hallyu's world from TMDB's own signals: origin country first, then original language.
 * This is the only place the mapping lives, so "trending K-dramas" means one definition.
 */
export function worldFor(raw: {
  originCountry?: string[];
  originalLanguage?: string;
  genres?: string[];
}): string {
  const countries = (raw.originCountry ?? []).map((c) => c.toUpperCase());

  if (countries.includes('KR')) return 'kdrama';
  if (countries.includes('CN') || countries.includes('TW') || countries.includes('HK')) return 'cdrama';
  if (countries.includes('JP')) return 'anime';

  const language = (raw.originalLanguage ?? '').toLowerCase();
  if (language === 'ko') return 'kdrama';
  if (language === 'zh' || language === 'cn' || language === 'ja-tw') return 'cdrama';
  if (language === 'ja') return 'anime';

  const genres = (raw.genres ?? []).map((g) => g.toLowerCase());
  if (genres.includes('animation')) return 'anime';
  if (genres.includes('romance') && language.startsWith('ko')) return 'kdrama';

  return 'hollywood';
}

/** `2011-04-17` → 2011; a movie with no date falls back to the current year so ingest can proceed. */
export function yearFor(raw: TmdbTitle): number {
  const date = raw.first_air_date ?? raw.release_date;
  const parsed = date ? Number(date.slice(0, 4)) : NaN;
  return Number.isFinite(parsed) && parsed >= 1888 && parsed <= 2200 ? parsed : new Date().getUTCFullYear();
}

/** Normalises a TMDB detail payload into the `catalog_upsert_title` argument. */
export function normalizeTitle(raw: TmdbTitle, mediaType: 'tv' | 'movie'): Record<string, unknown> {
  const name = (mediaType === 'tv' ? raw.name : raw.title) ?? '';
  const original = (mediaType === 'tv' ? raw.original_name : raw.original_title) ?? null;

  return {
    external_id: String(raw.id),
    media_type: mediaType,
    world: worldFor({
      originCountry: raw.origin_country,
      originalLanguage: raw.original_language,
      genres: raw.genres?.map((g) => g.name),
    }),
    title: name,
    original_title: original,
    year: yearFor(raw),
    status: mapStatus(raw.status),
    popularity: raw.popularity ?? null,
    vote_average: raw.vote_average ?? null,
    vote_count: raw.vote_count ?? 0,
    overview: raw.overview ?? null,
    poster_url: imageUrl(raw.poster_path, 'w500'),
    backdrop_url: imageUrl(raw.backdrop_path, 'original'),
    runtime_minutes:
      mediaType === 'tv'
        ? (raw.episode_run_time?.[0] ?? raw.runtime ?? null)
        : (raw.runtime ?? null),
    original_language: raw.original_language ?? null,
    genres: raw.genres?.map((g) => g.name) ?? [],
    network: raw.networks?.[0]?.name ?? null,
    origin_country: raw.origin_country ?? [],
    first_air_date: raw.first_air_date ?? null,
    last_air_date: raw.last_air_date ?? null,
    episode_count: raw.number_of_episodes ?? 0,
    season_count: raw.number_of_seasons ?? 0,
    provider_data: {
      // Provider extras Hallyu does not model. Deliberately not a credential and not a trailer URL:
      // trailers are out of scope for this backend.
      tmdb_votes_average: raw.vote_average ?? null,
      tmdb_votes_count: raw.vote_count ?? null,
    },
  };
}

/** Normalises a season into the `catalog_upsert_episodes` argument. */
export function normalizeSeason(season: TmdbSeason): Array<Record<string, unknown>> {
  return (season.episodes ?? []).map((e) => ({
    season: season.season_number,
    number: e.episode_number,
    title: e.name ?? null,
    air_date: e.air_date ?? null,
    runtime_minutes: e.runtime ?? null,
    overview: e.overview ?? null,
    still_url: imageUrl(e.still_path, 'w300'),
    episode_type: e.episode_type ?? 1,
  }));
}

/** Normalises credits into the `catalog_upsert_title_people` argument. */
export function normalizeCredits(credits: TmdbCredits | undefined): Array<Record<string, unknown>> {
  if (!credits) return [];

  const crewJobs: Record<string, string> = {
    Director: 'director',
    Writer: 'writer',
    Producer: 'producer',
    Creator: 'creator',
  };

  const cast = (credits.cast ?? []).slice(0, 30).map((c) => ({
    external_id: String(c.id),
    name: c.name,
    photo_url: imageUrl(c.profile_path, 'w185'),
    job: 'actor',
    character: c.character ?? null,
    order_index: c.order ?? 0,
  }));

  const crew = (credits.crew ?? [])
    .filter((c) => crewJobs[c.job ?? ''] !== undefined)
    .slice(0, 20)
    .map((c, index) => ({
      external_id: String(c.id),
      name: c.name,
      photo_url: imageUrl(c.profile_path, 'w185'),
      job: crewJobs[c.job as string],
      order_index: 1000 + index,
    }));

  // A person can be both cast and crew on one title; the cast entry wins because it is first.
  const seen = new Set<string>();
  return [...cast, ...crew].filter((entry) => {
    const key = String(entry.external_id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}