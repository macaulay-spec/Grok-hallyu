// =============================================================================
// HALLYU — LOVABLE CLOUD EDGE FUNCTION
// episode-airing-cron/index.ts
// Dispatches `episode_live` and `episode_aired` notifications when episodes air
// across K-Drama, C-Drama, Anime, and Hollywood.
// =============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

Deno.serve(async () => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const now = Date.now();
    const windowStart = new Date(now - 45 * 60 * 1000).toISOString();
    const windowEnd = new Date(now + 15 * 60 * 1000).toISOString();

    const { data: airingEpisodes, error: epErr } = await admin
      .from('episodes')
      .select('id, drama_id, season, number, title, air_date')
      .gte('air_date', windowStart)
      .lte('air_date', windowEnd);

    if (epErr) throw epErr;

    let notified = 0;
    for (const ep of airingEpisodes ?? []) {
      const { data: followers } = await admin
        .from('drama_follows')
        .select('user_id')
        .eq('drama_id', ep.drama_id)
        .eq('notify_episodes', true);

      if (!followers?.length) continue;

      const rows = followers.map((f: { user_id: string }) => ({
        recipient_id: f.user_id,
        kind: 'episode_live',
        group: 'drama',
        drama_id: ep.drama_id,
        episode: ep.number,
      }));

      await admin.from('notifications').insert(rows);
      notified += rows.length;
    }

    return new Response(JSON.stringify({ ok: true, notified }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Cron failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
