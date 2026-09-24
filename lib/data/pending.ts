/**
 * Pure helpers for the "pending write" guard.
 *
 * A mutation that is still in the outbox (queued or sending) represents the user's most recent
 * intent. When a background pull lands, its snapshot may predate the write, so the server can
 * report the *old* value. These helpers let the reducer keep the optimistic value for any id that
 * still has an in-flight mutation, instead of reverting it (which would also make the flush send
 * the opposite value and silently drop the write).
 *
 * Kept dependency-free so it can be unit-tested outside React Native.
 */

export interface PendingMutationLike {
  status: string;
  action: { type: string; postId?: string; targetId?: string; patch?: Record<string, unknown> };
}

export interface OutboxLike {
  outbox: PendingMutationLike[];
}

/** Ids with a non-failed mutation of the given kind still waiting to reach the server. */
export function pendingIds(s: OutboxLike, type: 'save' | 'react'): Set<string> {
  const ids = new Set<string>();
  for (const m of s.outbox) {
    if (m.status === 'failed') continue;
    if (type === 'save' && m.action.type === 'save' && m.action.postId) ids.add(m.action.postId);
    if (type === 'react' && m.action.type === 'react' && m.action.targetId) ids.add(m.action.targetId);
  }
  return ids;
}

/** Merge a server id list with the local one, keeping locally-pending ids at their local value. */
export function mergePending(server: string[], local: string[], pending: Set<string>): string[] {
  if (!pending.size) return server;
  const set = new Set(server);
  const localSet = new Set(local);
  for (const id of pending) {
    if (localSet.has(id)) set.add(id);
    else set.delete(id);
  }
  return [...set];
}

/** Merge a server map with the local one, keeping locally-pending ids at their local value. */
export function mergePendingMap<T>(server: Record<string, T>, local: Record<string, T>, pending: Set<string>): Record<string, T> {
  if (!pending.size) return server;
  const out = { ...server };
  for (const id of pending) {
    if (local[id] !== undefined && local[id] !== null) out[id] = local[id];
    else delete out[id];
  }
  return out;
}

/** Pref keys with a non-failed mutation still waiting to reach the server. */
export function pendingPrefKeys(s: OutboxLike): Set<string> {
  const keys = new Set<string>();
  for (const m of s.outbox) {
    if (m.status === 'failed') continue;
    if (m.action.type === 'prefs' && m.action.patch) for (const k of Object.keys(m.action.patch)) keys.add(k);
  }
  return keys;
}

/**
 * Merge server prefs over local prefs, but keep the local value for any key that still has a
 * pending write — a stale `me` pull must not visually revert a toggle the user just flipped.
 */
export function mergePendingPrefs<T extends object>(server: Partial<T>, local: T, pending: Set<string>): T {
  const out = { ...local, ...server } as T;
  for (const k of pending) if (k in local) (out as Record<string, unknown>)[k] = (local as Record<string, unknown>)[k];
  return out;
}
