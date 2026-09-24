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
  action: { type: string; postId?: string; targetId?: string };
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
