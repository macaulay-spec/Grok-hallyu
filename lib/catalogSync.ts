/**
 * Adopting live catalog results (TMDB-backed) into the store so every list opens the same Drama Hub.
 *
 * A TMDB result that matches a title already held on the device (from a previous import or a post
 * card) resolves to that richer local record; anything new is imported once so
 * `/drama/[id]` can render it. Returns the de-duplicated, display-ready list.
 */
import { Actor, Drama, MediaType } from './model';
import { allActors, allDramas, dispatch, getState } from './store';

const providerKey = (p?: { name: string; id: number; mediaType?: MediaType }, mediaType?: MediaType) =>
  p ? `${p.name}:${p.mediaType ?? mediaType ?? 'tv'}:${p.id}` : null;
const normName = (n?: string) => (n ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').trim();

export function adoptDramas(dramas: Drama[]): Drama[] {
  const all = allDramas(getState());
  const byProvider = new Map<string, Drama>();
  const byId = new Map<string, Drama>();
  for (const d of all) {
    byId.set(d.id, d);
    const k = providerKey(d.provider, d.mediaType);
    if (k && !byProvider.has(k)) byProvider.set(k, d);
  }
  const fresh: Drama[] = [];
  const seen = new Set<string>();
  const pickedIds: string[] = [];
  for (const d of dramas) {
    const k = providerKey(d.provider, d.mediaType);
    const local = (k && byProvider.get(k)) || byId.get(d.id);
    const pick = local ?? d;
    if (seen.has(pick.id)) continue;
    seen.add(pick.id);
    pickedIds.push(pick.id);
    if (
      !local ||
      (!local.posterUrl && d.posterUrl) ||
      (!local.backdropUrl && d.backdropUrl) ||
      (!local.trailerUrl && d.trailerUrl) ||
      (!local.streamingOn?.length && d.streamingOn?.length) ||
      local.cast.length < d.cast.length ||
      !!d.castActors?.length ||
      local.episodes.length < d.episodes.length
    ) {
      fresh.push(local ? { ...d, id: local.id } : d);
    }
  }
  if (fresh.length) dispatch({ type: 'import', dramas: fresh });
  const updatedById = new Map(allDramas(getState()).map((d) => [d.id, d]));
  return pickedIds.map((id) => updatedById.get(id)!).filter(Boolean);
}

/** Same as {@link adoptDramas} for people. */
export function adoptActors(actors: Actor[]): Actor[] {
  const all = allActors(getState());
  const byProvider = new Map<string, Actor>();
  const byId = new Map<string, Actor>();
  const byName = new Map<string, Actor>();
  for (const a of all) {
    byId.set(a.id, a);
    const k = providerKey(a.provider);
    if (k && !byProvider.has(k)) byProvider.set(k, a);
    const nn = normName(a.name);
    if (nn && !byName.has(nn)) byName.set(nn, a);
  }
  const fresh: Actor[] = [];
  const seen = new Set<string>();
  const pickedIds: string[] = [];
  for (const a of actors) {
    const k = providerKey(a.provider);
    const local = (k && byProvider.get(k)) || byId.get(a.id) || byName.get(normName(a.name));
    const pick = local ?? a;
    if (seen.has(pick.id)) continue;
    seen.add(pick.id);
    pickedIds.push(pick.id);
    if (
      !local ||
      (!local.photoUrl && a.photoUrl) ||
      (!local.bio && a.bio) ||
      local.knownFor.length < a.knownFor.length ||
      !!a.knownForDramas?.length
    ) {
      fresh.push(local ? { ...a, id: local.id } : a);
    }
  }
  if (fresh.length) dispatch({ type: 'import', actors: fresh });
  const updatedById = new Map(allActors(getState()).map((a) => [a.id, a]));
  return pickedIds.map((id) => updatedById.get(id)!).filter(Boolean);
}
