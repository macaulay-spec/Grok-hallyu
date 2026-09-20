/**
 * Attaches real catalog data (poster/backdrop art, TMDB ids, headshots, episode stills) to the
 * locally seeded titles and people. Runs in two phases so screens fill with artwork fast:
 *
 *   1. art     — one search per title (high concurrency); dispatches poster/backdrop immediately
 *   2. detail  — full record per title (episode stills, synopses, creators) at low concurrency
 *   3. faces   — headshots for seeded people
 *
 * Safe to call from anywhere, any number of times (mount, focus, connectivity regained): it only
 * touches records that still lack data, dedupes concurrent runs, and retries failures after a
 * short back-off instead of giving up for the session. Never blocks the UI.
 */
import { catalog } from './catalog';
import { Actor, Drama } from './model';
import * as seed from './seed';
import { allActors, allDramas, AppState, dispatch, getState } from './store';

/** Well-known TMDB ids for seeded titles — verified against the title/year on fetch, so a wrong id can't attach wrong art. */
const KNOWN_IDS: Record<string, number> = {
  goblin: 67915,
  'crash-landing-on-you': 94796,
  'the-glory': 135157,
  'squid-game': 93405,
  'queen-of-tears': 219246,
  vincenzo: 117376,
};

const RETRY_AFTER_MS = 45_000;
const failedAt = new Map<string, number>();
const detailed = new Set<string>();
let running: Promise<void> | null = null;

const coolingDown = (key: string) => {
  const t = failedAt.get(key);
  return t !== undefined && Date.now() - t < RETRY_AFTER_MS;
};
const isAbort = (e: unknown) => (e as Error | undefined)?.name === 'AbortError';

function needsArt(d: Drama) {
  return !d.posterUrl;
}
function needsDetail(d: Drama) {
  return !!d.provider && !detailed.has(d.id) && !d.episodes.some((e) => e.stillUrl) && !d.creators;
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

const current = (id: string) => getState().importedDramas.find((x) => x.id === id);

/** Enrich seeded dramas that still show placeholder art. Safe to call repeatedly. */
export function syncSeedCatalog(signal?: AbortSignal): Promise<void> {
  if (!catalog.available) return Promise.resolve();
  if (running) return running;
  running = (async () => {
    const state: AppState = getState();
    const imported = new Map(state.importedDramas.map((d) => [d.id, d]));
    const view = (d: Drama) => imported.get(d.id) ?? d;

    // ---- Phase 1: artwork (fast) ----
    const artTargets = seed.DRAMAS.filter((d) => needsArt(view(d)) && !coolingDown(d.id));
    await pool(artTargets, 6, async (d) => {
      if (signal?.aborted) return;
      try {
        const found = await catalog.resolveDrama({ title: d.title, originalTitle: d.originalTitle, year: d.year, providerId: KNOWN_IDS[d.id] }, signal);
        if (!found?.provider) {
          failedAt.set(d.id, Date.now());
          return;
        }
        const base = current(d.id) ?? d;
        const merged: Drama = {
          ...base,
          originalTitle: base.originalTitle ?? found.originalTitle,
          network: base.network ?? found.network,
          posterUrl: found.posterUrl ?? base.posterUrl,
          backdropUrl: found.backdropUrl ?? base.backdropUrl,
          provider: found.provider,
          rating: base.rating ?? found.rating,
          synopsis: base.synopsis || found.synopsis,
        };
        dispatch({ type: 'import', dramas: [merged] });
        failedAt.delete(d.id);
      } catch (e) {
        if (isAbort(e)) return;
        failedAt.set(d.id, Date.now());
      }
    });
    if (signal?.aborted) return;

    // ---- Phase 2: details (episode stills / titles / synopses / creators). The seeded timeline stays authoritative. ----
    const detailTargets = seed.DRAMAS.map((d) => current(d.id) ?? d).filter((d) => needsDetail(d) && !coolingDown(`detail:${d.id}`));
    await pool(detailTargets, 2, async (d) => {
      if (signal?.aborted || !d.provider) return;
      try {
        const full = await catalog.getDrama(d.provider.id, signal);
        if (!full) {
          detailed.add(d.id);
          return;
        }
        const remoteEpisodes = new Map(full.episodes.map((e) => [`${e.season}:${e.number}`, e]));
        const base = current(d.id) ?? d;
        const merged: Drama = {
          ...base,
          creators: base.creators ?? full.creators,
          rating: base.rating ?? full.rating,
          episodes: base.episodes.map((e) => {
            const r = remoteEpisodes.get(`${e.season}:${e.number}`);
            return r ? { ...e, title: e.title ?? r.title, synopsis: e.synopsis ?? r.synopsis, runtime: e.runtime ?? r.runtime, stillUrl: e.stillUrl ?? r.stillUrl } : e;
          }),
        };
        detailed.add(d.id);
        dispatch({ type: 'import', dramas: [merged] });
      } catch (e) {
        if (isAbort(e)) return;
        failedAt.set(`detail:${d.id}`, Date.now());
      }
    });
    if (signal?.aborted) return;

    // ---- Phase 3: faces ----
    const currentActors = new Map(getState().importedActors.map((a) => [a.id, a]));
    const actors = seed.ACTORS.filter((a) => !(currentActors.get(a.id) ?? a).photoUrl && !coolingDown(`actor:${a.id}`));
    await pool(actors, 4, async (a) => {
      if (signal?.aborted) return;
      try {
        const found = await catalog.resolveActor(a.name, a.koreanName, signal);
        if (!found?.photoUrl) {
          failedAt.set(`actor:${a.id}`, Date.now());
          return;
        }
        const base = getState().importedActors.find((x) => x.id === a.id) ?? a;
        const merged: Actor = { ...base, photoUrl: found.photoUrl, birthDate: base.birthDate ?? found.birthDate, provider: found.provider };
        dispatch({ type: 'import', actors: [merged] });
      } catch (e) {
        if (isAbort(e)) return;
        failedAt.set(`actor:${a.id}`, Date.now());
      }
    });
  })().finally(() => {
    running = null;
  });
  return running;
}

// ---------------------------------------------------------------------------------------------
// Adopting live catalog results into the store
// ---------------------------------------------------------------------------------------------

const providerKey = (p?: { name: string; id: number }) => (p ? `${p.name}:${p.id}` : null);

/**
 * Map live (thin) catalog records onto the app's own records so every list opens the same Drama
 * Hub: a TMDB result that matches a title we already hold (seeded or previously imported, by
 * provider id) resolves to that richer local record; anything new is imported once so
 * `/drama/[id]` can render it. Returns the de-duplicated, display-ready list.
 */
export function adoptDramas(dramas: Drama[]): Drama[] {
  const all = allDramas(getState());
  const byProvider = new Map<string, Drama>();
  const byId = new Map<string, Drama>();
  for (const d of all) {
    byId.set(d.id, d);
    const k = providerKey(d.provider);
    if (k && !byProvider.has(k)) byProvider.set(k, d);
  }
  const fresh: Drama[] = [];
  const seen = new Set<string>();
  const out: Drama[] = [];
  for (const d of dramas) {
    const k = providerKey(d.provider);
    const local = (k && byProvider.get(k)) || byId.get(d.id);
    const pick = local ?? d;
    if (seen.has(pick.id)) continue;
    seen.add(pick.id);
    if (!local) fresh.push(d);
    out.push(pick);
  }
  if (fresh.length) dispatch({ type: 'import', dramas: fresh });
  return out;
}

/** Same as {@link adoptDramas} for people. */
export function adoptActors(actors: Actor[]): Actor[] {
  const all = allActors(getState());
  const byProvider = new Map<string, Actor>();
  const byId = new Map<string, Actor>();
  for (const a of all) {
    byId.set(a.id, a);
    const k = providerKey(a.provider);
    if (k && !byProvider.has(k)) byProvider.set(k, a);
  }
  const fresh: Actor[] = [];
  const seen = new Set<string>();
  const out: Actor[] = [];
  for (const a of actors) {
    const k = providerKey(a.provider);
    const local = (k && byProvider.get(k)) || byId.get(a.id);
    const pick = local ?? a;
    if (seen.has(pick.id)) continue;
    seen.add(pick.id);
    if (!local) fresh.push(a);
    out.push(pick);
  }
  if (fresh.length) dispatch({ type: 'import', actors: fresh });
  return out;
}
