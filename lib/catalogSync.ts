/**
 * Attaches real catalog data (poster/backdrop art, TMDB ids, headshots) to the locally seeded titles
 * and people. Runs once per session when the provider is configured and the device is online,
 * imports results as overrides (see allDramas/allActors), and never blocks the UI.
 */
import { catalog } from './catalog';
import { Actor, Drama } from './model';
import * as seed from './seed';
import { AppState, dispatch, getState } from './store';

/** Well-known TMDB ids for seeded titles — verified against the title/year on fetch, so a wrong id can't attach wrong art. */
const KNOWN_IDS: Record<string, number> = {
  goblin: 67915,
  'crash-landing-on-you': 94796,
  'the-glory': 135157,
  'squid-game': 93405,
  'queen-of-tears': 219246,
  vincenzo: 117376,
};

const attempted = new Set<string>();
let running: Promise<void> | null = null;

function needsArt(d: Drama) {
  return !d.posterUrl;
}

async function pool<T>(items: T[], size: number, run: (item: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++]!;
      await run(item);
    }
  });
  await Promise.all(workers);
}

/** Enrich seeded dramas that still show placeholder art. Safe to call repeatedly. */
export function syncSeedCatalog(signal?: AbortSignal): Promise<void> {
  if (!catalog.available) return Promise.resolve();
  if (running) return running;
  running = (async () => {
    const state: AppState = getState();
    const currentDramas = new Map(state.importedDramas.map((d) => [d.id, d]));
    const dramas = seed.DRAMAS.filter((d) => needsArt(currentDramas.get(d.id) ?? d) && !attempted.has(d.id));
    await pool(dramas, 3, async (d) => {
      if (signal?.aborted) return;
      attempted.add(d.id);
      try {
        const found = await catalog.resolveDrama({ title: d.title, originalTitle: d.originalTitle, year: d.year, providerId: KNOWN_IDS[d.id] }, signal);
        if (!found?.provider) return;
        // Episode stills / titles / synopses come from the full record; the seeded timeline (air dates) stays authoritative.
        const full = await catalog.getDrama(found.provider.id, signal).catch(() => null);
        const remoteEpisodes = new Map((full?.episodes ?? []).map((e) => [`${e.season}:${e.number}`, e]));
        const base = getState().importedDramas.find((x) => x.id === d.id) ?? d;
        const merged: Drama = {
          ...base,
          originalTitle: base.originalTitle ?? found.originalTitle,
          network: base.network ?? found.network,
          creators: base.creators ?? full?.creators,
          posterUrl: found.posterUrl ?? base.posterUrl,
          backdropUrl: found.backdropUrl ?? base.backdropUrl,
          provider: found.provider,
          rating: base.rating ?? found.rating,
          synopsis: base.synopsis || found.synopsis,
          episodes: base.episodes.map((e) => {
            const r = remoteEpisodes.get(`${e.season}:${e.number}`);
            return r ? { ...e, title: e.title ?? r.title, synopsis: e.synopsis ?? r.synopsis, runtime: e.runtime ?? r.runtime, stillUrl: e.stillUrl ?? r.stillUrl } : e;
          }),
        };
        dispatch({ type: 'import', dramas: [merged] });
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        // Leave the placeholder; we'll try again next session.
      }
    });

    const currentActors = new Map(getState().importedActors.map((a) => [a.id, a]));
    const actors = seed.ACTORS.filter((a) => !(currentActors.get(a.id) ?? a).photoUrl && !attempted.has(`actor:${a.id}`));
    await pool(actors, 3, async (a) => {
      if (signal?.aborted) return;
      attempted.add(`actor:${a.id}`);
      try {
        const found = await catalog.resolveActor(a.name, a.koreanName, signal);
        if (!found?.photoUrl) return;
        const base = getState().importedActors.find((x) => x.id === a.id) ?? a;
        const merged: Actor = { ...base, photoUrl: found.photoUrl, birthDate: base.birthDate ?? found.birthDate, provider: found.provider };
        dispatch({ type: 'import', actors: [merged] });
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    });
  })().finally(() => {
    running = null;
  });
  return running;
}
