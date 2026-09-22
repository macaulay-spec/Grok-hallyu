// POST /functions/v1/ensure-catalog  { tmdbId: number, kind?: 'drama' | 'actor', withEpisodes?: boolean, force?: boolean }
// Makes sure a TMDB title/person exists in catalog_* so posts, follows, watchlist rows and episode rooms can reference it.
// Re-fetches TMDB server-side and upserts through api.catalog_upsert (service role). Idempotent; cheap when fresh.
import { fail, json, limiter, readJson, serve, HttpError } from '../_shared/http.ts';
import { admin, requireUser, rpc } from '../_shared/supabase.ts';
import { seasonsToAppend, tmdb, toActorPayload, toCatalogPayload, type TmdbPerson, type TmdbTv } from '../_shared/tmdb.ts';

interface Body {
  tmdbId?: number | string;
  kind?: 'drama' | 'actor';
  withEpisodes?: boolean;
  force?: boolean;
}

const perUser = limiter(60, 60 * 60 * 1000);
const FRESH_AIRING_MS = 6 * 60 * 60 * 1000; // airing/upcoming titles: refresh every 6 h
const FRESH_DONE_MS = 7 * 24 * 60 * 60 * 1000; // completed titles: weekly

serve(async (req) => {
  const user = await requireUser(req);
  perUser(user.id);
  const body = await readJson<Body>(req);
  const tmdbId = Number(body.tmdbId);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return fail(422, 'tmdbId must be a positive integer');
  const kind = body.kind === 'actor' ? 'actor' : 'drama';
  const db = admin();

  if (kind === 'actor') {
    const id = `tmdb-${tmdbId}`;
    if (!body.force) {
      const { data } = await db.from('catalog_actors').select('id, updated_at').eq('id', id).maybeSingle();
      if (data && Date.now() - new Date(data.updated_at).getTime() < FRESH_DONE_MS) return json({ id, fresh: true });
    }
    const p = await tmdb<TmdbPerson>(`/person/${tmdbId}`);
    await rpc(db, 'catalog_upsert', { p: toActorPayload(p) });
    return json({ id, name: p.name });
  }

  const id = `tmdb-${tmdbId}`;
  if (!body.force) {
    const { data } = await db.from('catalog_dramas').select('id, status, updated_at, episode_count').eq('id', id).maybeSingle();
    if (data) {
      const age = Date.now() - new Date(data.updated_at).getTime();
      const wantEpisodes = body.withEpisodes === true;
      const { count } = wantEpisodes ? await db.from('catalog_episodes').select('drama_id', { count: 'exact', head: true }).eq('drama_id', id) : { count: 1 };
      const fresh = age < (data.status === 'completed' ? FRESH_DONE_MS : FRESH_AIRING_MS);
      if (fresh && (!wantEpisodes || (count ?? 0) > 0)) return json({ id, status: data.status, episodeCount: data.episode_count, fresh: true });
    }
  }

  const base = await tmdb<TmdbTv>(`/tv/${tmdbId}`);
  const withEpisodes = body.withEpisodes !== false; // default: include episodes (needed for rooms + reminders)
  const append = ['aggregate_credits', ...(withEpisodes ? seasonsToAppend(base).map((n) => `season/${n}`) : [])].join(',');
  const full = await tmdb<TmdbTv>(`/tv/${tmdbId}`, { append_to_response: append });
  const payload = toCatalogPayload(full, withEpisodes);
  try {
    const out = await rpc<{ id: string; episodes: number }>(db, 'catalog_upsert', { p: payload });
    return json({ id: out.id, title: full.name, status: payload.drama.status, episodeCount: payload.drama.episodeCount, episodesWritten: out.episodes });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(500, 'Could not save the title');
  }
});
