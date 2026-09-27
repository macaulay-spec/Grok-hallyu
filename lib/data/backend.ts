/**
 * Backend seam. Screens never talk to a server; they dispatch actions. The sync engine
 * (lib/data/sync.ts) replays those actions against whatever implements `Backend`, and screens
 * call `pull(scope)` to refresh cached content.
 *
 * Today: `demoBackend` (lib/data/demoBackend.ts) — the frontend-only build. It accepts every
 * mutation (state is local + persisted) and seeds the social fixtures on first pull; nothing leaves
 * the device. The Supabase adapter that used to live here is parked under `backend/` — see
 * backend/README.md — and can be re-attached by implementing this same interface.
 */
import type { Mutation } from '../store';

export class BackendError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly status?: number) {
    super(message);
    this.name = 'BackendError';
  }
}

/** A refresh request. `more` pages the same feed with its stored cursor. */
export type PullScope = string;
export interface PullOptions {
  more?: boolean;
}

export interface Backend {
  readonly name: string;
  /**
   * Does this backend reach a server? When false the sync engine skips its connectivity gate, so a
   * queue drains even with the radio off. Defaults to true.
   */
  readonly network?: boolean;
  /** Persist one mutation. Resolves when accepted; rejects with BackendError (retryable or not). */
  push(mutation: Mutation, signal?: AbortSignal): Promise<void>;
  /** Refresh remote data for a screen scope into the store cache. */
  pull(scope: PullScope, opts?: PullOptions, signal?: AbortSignal): Promise<void>;
}
