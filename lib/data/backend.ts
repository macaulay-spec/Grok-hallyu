/**
 * Backend seam. Screens never talk to a server; they dispatch actions. The sync engine
 * (lib/data/sync.ts) replays those actions against whatever implements `Backend`.
 *
 * Today: `localBackend` — accepts everything after a simulated round-trip whose latency and
 * failure profile follow `prefs.devNetwork` (Settings → Data & storage → Simulate network).
 * Next: a Supabase-backed implementation with the same shape; nothing above this file changes.
 */
import type { Mutation, Prefs } from '../store';

export class BackendError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly status?: number) {
    super(message);
    this.name = 'BackendError';
  }
}

export type PullScope = 'home' | 'explore' | 'activity' | 'drama' | 'profile';

export interface Backend {
  readonly name: string;
  /** Persist one mutation. Resolves when accepted; rejects with BackendError (retryable or not). */
  push(mutation: Mutation, signal?: AbortSignal): Promise<void>;
  /** Refresh remote data for a screen. The local backend has nothing newer, so it just round-trips. */
  pull(scope: PullScope, signal?: AbortSignal): Promise<void>;
}

const PROFILE: Record<Prefs['devNetwork'], { min: number; max: number; transientFailure: number; rejectRate: number }> = {
  fast: { min: 120, max: 380, transientFailure: 0, rejectRate: 0 },
  slow: { min: 1800, max: 3200, transientFailure: 0, rejectRate: 0 },
  flaky: { min: 400, max: 1400, transientFailure: 0.45, rejectRate: 0.05 },
  offline: { min: 0, max: 0, transientFailure: 1, rejectRate: 0 },
};

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new BackendError('Aborted', true));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new BackendError('Aborted', true));
    });
  });
}

export function createLocalBackend(getProfile: () => Prefs['devNetwork'], random: () => number = Math.random): Backend {
  const roundTrip = async (signal?: AbortSignal) => {
    const mode = getProfile();
    const p = PROFILE[mode];
    if (mode === 'offline') throw new BackendError('You’re offline', true);
    await wait(p.min + random() * (p.max - p.min), signal);
    if (random() < p.rejectRate) throw new BackendError('Rejected by the server', false, 422);
    if (random() < p.transientFailure) throw new BackendError('Network request failed', true);
  };
  return {
    name: 'local',
    push: (_m, signal) => roundTrip(signal),
    pull: (_scope, signal) => roundTrip(signal),
  };
}
