// catalog-sync — the TMDB ingest job.
//
// This function contains no business logic on purpose. It decides *what to ask TMDB for* and when,
// normalises the answer into the payload shapes the database documents, and hands each payload to
// an idempotent RPC. Whether a record is written, skipped or flagged missing is decided in SQL,
// which is what makes a retry of this function safe.
//
// Jobs it runs (body: {"job": "<name>", ...}):
//
//   trending    refresh the world trending lists, then upsert each returned title
//   refresh     upsert every title the database says is due (titles_needing_refresh)
//   detail      upsert one title's full record plus its seasons and cast
//   seasons     upsert the episode list for one airing title
//   discover    refresh the world trending lists only (no title writes)
//
// Everything is service-role only. `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` /
// `TMDB_ACCESS_TOKEN` come from the function environment; none of them is ever echoed back.

import { adminClient, requireServiceRole } from '../_shared/supabase.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import {
  TmdbError,
  normalizeCredits,
  normalizeSeason,
  normalizeTitle,
  tmdb,
  tmdbConfigured,
  type TmdbSeason,
  type TmdbTitle,
} from '../_shared/tmdb.ts';

const DEFAULT_PROVIDER = Deno.env.get('CATALOG_PROVIDER_ID') ?? 'tmdb';
const WORLD_IDS = ['kdrama', 'cdrama', 'anime', 'hollywood'];

interface PagedResult {
  page: number;
  results: TmdbTitle[];
  total_pages: number;
  total_results: number;
}

interface JobResult {
  job: string;
  provider: string;
  run_id: string;
  items_seen: number;
  items_written: number;
  items_unchanged: number;
  items_missing: number;
  provider_requests: number;
  duration_ms: number;
  error?: string;
}

/** Counts provider calls so a run's cost is auditable. */
let providerRequests = 0;

async function upsertTitle(
  supabase: ReturnType<typeof adminClient>,
  raw: TmdbTitle,
  mediaType: 'tv' | 'movie',
): Promise<boolean> {
  const payload = normalizeTitle(raw, mediaType);
  const { data, error } = await supabase.rpc('catalog_upsert_title', {
    p_provider_id: DEFAULT_PROVIDER,
    p_payload: payload,
  });
  if (error) throw new Error(`catalog_upsert_title failed: ${error.message}`);
  return Array.isArray(data) ? Boolean(data[0]?.written) : false;
}

/**
 * Pulls the current trending list for a world and upserts everything in it.
 *
 * TMDB has no per-country trending endpoint, so the world is expressed as the filters Hallyu
 * actually cares about: original language for the language-based worlds, discover region for the
 * rest, plus keyword/generre filters where they map cleanly. Whatever comes back is upserted, and
 * the world recorded on each row comes from `worldFor()`, so a US show that leaks into the K-Drama
 * list is still stored as `hollywood`.
 */
async function syncTrendingList(
  supabase: ReturnType<typeof adminClient>,
  world: string,
  limit: number,
): Promise<{ seen: number; written: number }> {
  const queryByWorld: Record<string, Record<string, string | number>> = {
    kdrama: { with_original_language: 'ko' },
    cdrama: { with_original_language: 'zh' },
    anime: { with_original_language: 'ja' },
    hollywood: { region: 'US' },
  };

  const seen = new Set<string>();
  let written = 0;

  const pages = Math.max(1, Math.ceil(limit / 20));
  for (let page = 1; page <= pages; page += 1) {
    providerRequests += 1;
    const response = await tmdb<PagedResult>({
      path: 'trending/all/week',
      query: { page, ...(queryByWorld[world] ?? {}) },
    });

    for (const raw of response.results ?? []) {
      // `trending/all` mixes movies and shows; both are stored, under their own media_type.
      const mediaType = raw.media_type === 'movie' ? 'movie' : 'tv';
      const key = `${mediaType}:${raw.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (await upsertTitle(supabase, raw, mediaType)) written += 1;
    }

    if (page >= (response.total_pages ?? 1)) break;
  }

  return { seen: seen.size, written };
}

/** Upserts the episode list for one season of one title. */
async function syncSeason(
  supabase: ReturnType<typeof adminClient>,
  titleId: string,
  seasonNumber: number,
): Promise<number> {
  // TMDB ids live in titles.external_id; ours live in titles.id. Resolve it rather than guessing.
  const { data: row, error: readError } = await supabase
    .from('titles')
    .select('external_id')
    .eq('id', titleId)
    .single();

  if (readError || !row) throw new Error(`title ${titleId} not found: ${readError?.message}`);

  providerRequests += 1;
  const season = await tmdb<TmdbSeason>({
    path: `tv/${row.external_id}/season/${seasonNumber}`,
  });

  const { data, error } = await supabase.rpc('catalog_upsert_episodes', {
    p_title_id: titleId,
    p_season: seasonNumber,
    p_episodes: normalizeSeason(season),
  });
  if (error) throw new Error(`catalog_upsert_episodes failed: ${error.message}`);
  return typeof data === 'number' ? data : 0;
}

/** Full refresh of one title: detail, every season, and the cast. */
async function syncDetail(supabase: ReturnType<typeof adminClient>, titleId: string): Promise<number> {
  const { data: title, error: readError } = await supabase
    .from('titles')
    .select('id, provider_id, external_id, media_type, season_count, status')
    .eq('id', titleId)
    .single();

  if (readError || !title) throw new Error(`title ${titleId} not found: ${readError?.message}`);

  providerRequests += 1;
  const detail = await tmdb<TmdbTitle>({
    path: title.media_type === 'tv' ? `tv/${title.external_id}` : `movie/${title.external_id}`,
    query: { append_to_response: 'credits' },
  });

  // `append_to_response` returns credits under a suffixed key; merge it so the cast upsert works.
  const withCredits = { ...detail, credits: (detail as { credits?: TmdbTitle['credits'] }).credits } as TmdbTitle;

  let written = 0;
  if (await upsertTitle(supabase, withCredits, title.media_type as 'tv' | 'movie')) written += 1;

  const { data: creditRows, error: creditError } = await supabase.rpc('catalog_upsert_title_people', {
    p_title_id: titleId,
    p_credits: normalizeCredits(withCredits.credits),
  });
  if (creditError) throw new Error(`catalog_upsert_title_people failed: ${creditError.message}`);
  written += typeof creditRows === 'number' ? creditRows : 0;

  if (title.media_type === 'tv') {
    const seasons = Math.min(title.season_count || 0, 30);
    for (let season = 1; season <= seasons; season += 1) {
      written += await syncSeason(supabase, titleId, season);
    }
  }

  return written;
}

/**
 * The due-record sweep. The database owns the queue and the ordering; this function only walks it.
 * A 404 from TMDB means the record is gone, which is recorded through `catalog_mark_missing` —
 * never deleted, because posts and watchlist entries point at it.
 */
async function syncDueRecords(
  supabase: ReturnType<typeof adminClient>,
  world: string | null,
  limit: number,
): Promise<{ seen: number; written: number; missing: number }> {
  const { data: due, error } = await supabase.rpc('titles_needing_refresh', {
    p_world: world,
    p_limit: limit,
  });

  if (error) throw new Error(`titles_needing_refresh failed: ${error.message}`);

  const rows = (due ?? []) as Array<{
    title_id: string;
    external_id: string;
    media_type: 'tv' | 'movie';
    reason: string;
  }>;

  let seen = 0;
  let written = 0;
  let missing = 0;
  const missingByType: Record<'tv' | 'movie', string[]> = { tv: [], movie: [] };

  for (const row of rows) {
    seen += 1;
    try {
      providerRequests += 1;

      const detail = await tmdb<TmdbTitle>({
        path: row.media_type === 'tv' ? `tv/${row.external_id}` : `movie/${row.external_id}`,
        query: row.media_type === 'tv' ? { append_to_response: 'credits' } : undefined,
      });

      if (await upsertTitle(supabase, detail, row.media_type)) written += 1;

      const { data: credits } = await supabase.rpc('catalog_upsert_title_people', {
        p_title_id: row.title_id,
        p_credits: normalizeCredits(detail.credits),
      });
      written += typeof credits === 'number' ? credits : 0;
    } catch (tmdbError) {
      if (tmdbError instanceof TmdbError && tmdbError.status === 404) {
        // The provider does not have it any more. Counted, not deleted.
        missingByType[row.media_type].push(row.external_id);
        missing += 1;
        continue;
      }
      // Anything else (rate limit, 5xx, network) is transient: leave the record due and stop.
      throw tmdbError;
    }
  }

  for (const mediaType of ['tv', 'movie'] as const) {
    if (missingByType[mediaType].length === 0) continue;
    const { error: markError } = await supabase.rpc('catalog_mark_missing', {
      p_provider_id: DEFAULT_PROVIDER,
      p_media_type: mediaType,
      p_external_ids: missingByType[mediaType],
    });
    if (markError) throw new Error(`catalog_mark_missing failed: ${markError.message}`);
  }

  return { seen, written, missing };
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const guard = requireServiceRole(request);
  if (!guard.ok) return guard.response;

  let body: {
    job?: string;
    world?: string;
    title_id?: string;
    season?: number;
    limit?: number;
  } = {};

  if (request.method === 'POST') {
    try {
      body = await request.json();
    } catch {
      // An empty body means "run the default job".
    }
  }

  const job = body.job ?? 'trending';
  const started = Date.now();

  // Preflight: a provider that is failing or rate limited is skipped, not retried in a loop.
  const supabase = adminClient();

  const { data: usable } = await supabase.rpc('catalog_provider_is_usable', {
    p_provider_id: DEFAULT_PROVIDER,
  });
  if (usable === false) {
    return errorResponse(`catalog provider ${DEFAULT_PROVIDER} is in backoff; skipping this run`, 429);
  }

  if (!tmdbConfigured()) {
    return errorResponse(
      'TMDB_ACCESS_TOKEN (or TMDB_API_KEY) must be set as a function secret before the catalog can be synced',
      503,
    );
  }

  // The run key is what makes this idempotent: the same job in the same hour is the same run.
  const runKey = `${job}:${new Date().toISOString().slice(0, 13)}`;

  const { data: runId, error: beginError } = await supabase.rpc('catalog_begin_run', {
    p_job: job,
    p_provider_id: DEFAULT_PROVIDER,
    p_idempotency_key: runKey,
  });
  if (beginError) return errorResponse(`could not start the run: ${beginError.message}`, 500);

  const result: JobResult = {
    job,
    provider: DEFAULT_PROVIDER,
    run_id: String(runId ?? ''),
    items_seen: 0,
    items_written: 0,
    items_unchanged: 0,
    items_missing: 0,
    provider_requests: 0,
    duration_ms: 0,
  };

  try {
    switch (job) {
      case 'trending': {
        const limit = Math.min(Math.max(body.limit ?? 20, 1), 100);
        const worlds = body.world ? [body.world] : WORLD_IDS;

        for (const world of worlds) {
          if (!WORLD_IDS.includes(world)) throw new Error(`unknown world ${world}`);
          const outcome = await syncTrendingList(supabase, world, limit);
          result.items_seen += outcome.seen;
          result.items_written += outcome.written;
        }
        break;
      }

      case 'discover': {
        const limit = Math.min(Math.max(body.limit ?? 20, 1), 100);
        for (const world of WORLD_IDS) {
          const outcome = await syncTrendingList(supabase, world, limit);
          result.items_seen += outcome.seen;
          result.items_written += outcome.written;
        }
        break;
      }

      case 'refresh': {
        const outcome = await syncDueRecords(
          supabase,
          body.world ?? null,
          Math.min(Math.max(body.limit ?? 40, 1), 100),
        );
        result.items_seen = outcome.seen;
        result.items_written = outcome.written;
        result.items_missing = outcome.missing;
        break;
      }

      case 'detail': {
        if (!body.title_id) throw new Error('detail requires a title_id');
        result.items_seen = 1;
        result.items_written = await syncDetail(supabase, body.title_id);
        break;
      }

      case 'seasons': {
        if (!body.title_id) throw new Error('seasons requires a title_id');
        result.items_seen = 1;
        result.items_written = await syncSeason(supabase, body.title_id, body.season ?? 1);
        break;
      }

      default:
        return errorResponse(`unknown job ${job}`, 400);
    }

    result.items_unchanged = Math.max(0, result.items_seen - result.items_written);
    result.provider_requests = providerRequests;
    result.duration_ms = Date.now() - started;

    await supabase.rpc('catalog_finish_run', {
      p_run_id: result.run_id,
      p_status: 'succeeded',
      p_items_seen: result.items_seen,
      p_items_written: result.items_written,
      p_items_unchanged: result.items_unchanged,
      p_items_missing: result.items_missing,
    });

    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof TmdbError ? error.status : 500;

    result.error = message.slice(0, 400);
    result.duration_ms = Date.now() - started;
    result.provider_requests = providerRequests;

    await supabase.rpc('catalog_finish_run', {
      p_run_id: result.run_id,
      p_status: 'failed',
      p_items_seen: result.items_seen,
      p_items_written: result.items_written,
      p_items_unchanged: result.items_unchanged,
      p_items_missing: result.items_missing,
      p_error: message.slice(0, 400),
    });

    // A rate limit is not a bug: report 429 so the scheduler backs off instead of retrying hard.
    return jsonResponse(result, status === 429 ? 429 : 502);
  }
});