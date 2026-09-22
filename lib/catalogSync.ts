/**
 * Adopting live catalog results (TMDB-backed) into the store so every list opens the same Drama Hub.
 *
 * A TMDB result that matches a title already held on the device (from a previous import or from the
 * backend's post cards) resolves to that richer local record; anything new is imported once so
 * `/drama/[id]` can render it. Returns the de-duplicated, display-ready list.
 */
import { Actor, Drama } from './model';
import { allActors, allDramas, dispatch, getState } from './store';

const providerKey = (p?: { name: string; id: number }) => (p ? `${p.name}:${p.id}` : null);

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
