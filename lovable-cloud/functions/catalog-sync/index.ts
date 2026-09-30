// =============================================================================
// HALLYU — LOVABLE CLOUD EDGE FUNCTION
// catalog-sync/index.ts
// Upserts & enriches 4-world catalog records (K-Drama, C-Drama, Anime, Hollywood)
// including official trailers, streaming providers, multi-season episodes & cast.
// =============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const dramas = Array.isArray(body.dramas) ? body.dramas : body.drama ? [body.drama] : [];
    const actors = Array.isArray(body.actors) ? body.actors : body.actor ? [body.actor] : [];

    let syncedDramas = 0;
    let syncedEpisodes = 0;
    let syncedActors = 0;

    for (const a of actors) {
      if (!a?.id || !a?.name) continue;
      await admin.from('actors').upsert(
        {
          id: String(a.id),
          tmdb_id: a.provider?.id ?? null,
          name: String(a.name),
          korean_name: a.koreanName ?? null,
          photo_url: a.photoUrl ?? null,
          bio: a.bio ?? null,
          birth_date: a.birthDate ?? null,
          known_for: Array.isArray(a.knownFor) ? a.knownFor : [],
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );
      syncedActors++;
    }

    for (const d of dramas) {
      if (!d?.id || !d?.title) continue;
      const format = d.format ?? 'kdrama';
      const world =
        format === 'kdrama'
          ? 'kdrama'
          : format === 'cdrama'
            ? 'cdrama'
            : format === 'anime'
              ? 'anime'
              : 'hollywood';

      await admin.from('dramas').upsert(
        {
          id: String(d.id),
          tmdb_id: d.provider?.id ?? null,
          media_type: d.mediaType ?? 'tv',
          format,
          world,
          title: String(d.title),
          original_title: d.originalTitle ?? null,
          original_language: d.originalLanguage ?? null,
          region: d.region ?? null,
          year: Number(d.year) || 2024,
          end_year: d.endYear ?? null,
          status: d.status ?? 'completed',
          network: d.network ?? null,
          streaming_on: Array.isArray(d.streamingOn) ? d.streamingOn : [],
          genres: Array.isArray(d.genres) ? d.genres : [],
          tags: Array.isArray(d.tags) ? d.tags : [],
          synopsis: d.synopsis ?? '',
          poster_url: d.posterUrl ?? null,
          backdrop_url: d.backdropUrl ?? null,
          trailer_url: d.trailerUrl ?? null,
          tone: d.tone ?? '#2F3A46',
          rating: d.rating ?? null,
          runtime: d.runtime ?? null,
          episode_count: Number(d.episodeCount) || 0,
          seasons: Array.isArray(d.seasons) ? d.seasons : [],
          airs_on: d.airsOn ?? null,
          next_episode_at: d.nextEpisodeAt ?? null,
          creators: Array.isArray(d.creators) ? d.creators : [],
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );
      syncedDramas++;

      if (Array.isArray(d.episodes) && d.episodes.length > 0) {
        const epRows = d.episodes.map((e: Record<string, unknown>) => ({
          id: String(e.id ?? `${d.id}-s${e.season ?? 1}e${e.number ?? 1}`),
          drama_id: String(d.id),
          season: Number(e.season) || 1,
          number: Number(e.number) || 1,
          title: e.title ? String(e.title) : null,
          synopsis: e.synopsis ? String(e.synopsis) : null,
          air_date: e.airDate ? String(e.airDate) : null,
          runtime: e.runtime ? Number(e.runtime) : null,
          still_url: e.stillUrl ? String(e.stillUrl) : null,
        }));
        await admin.from('episodes').upsert(epRows, { onConflict: 'id' });
        syncedEpisodes += epRows.length;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, syncedDramas, syncedEpisodes, syncedActors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
