/**
 * Backend seam. Screens never talk to a server; they dispatch actions. The sync engine
 * (lib/data/sync.ts) replays those actions against whatever implements `Backend`, and screens
 * call `pull(scope)` to refresh cached content.
 *
 * Today: `supabaseBackend` (lib/data/supabaseBackend.ts) — every read is an `api.*` RPC and
 * every write an `api.*` function on the project wired in constants/keys.ts. Tests inject fakes.
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
  /** Persist one mutation. Resolves when accepted; rejects with BackendError (retryable or not). */
  push(mutation: Mutation, signal?: AbortSignal): Promise<void>;
  /** Refresh remote data for a screen scope into the store cache. */
  pull(scope: PullScope, opts?: PullOptions, signal?: AbortSignal): Promise<void>;
}
