/**
 * Demo backend — the frontend-only build's `Backend`.
 *
 * There is no server. Writes are already applied optimistically by the store's reducer and persisted
 * to AsyncStorage, so `push` simply accepts; reads (`pull`) seed the social fixtures once per
 * identity so a fresh install opens onto a lived-in product instead of empty states.
 *
 * Why this stays tiny: the app was already offline-first. Every selector has a local ranking
 * fallback (see lib/selectors.ts — `localForYou`, `following`, `trendingDramas`,
 * `recommendedPeople`…), and the drama/actor catalog is fetched from TMDB straight from the client
 * (lib/catalog.ts). So there are no feed pages to synthesise here: seeding *content* is enough, and
 * the existing ranking composes the demo feed from the member's own follows, watchlist and genres.
 *
 * Re-attaching a real backend means implementing this interface again — the Supabase adapter is
 * parked under `backend/` for exactly that.
 */
import { dispatchLocal, getState } from '../store';
import { Backend, PullOptions, PullScope } from './backend';
import { DEMO_ACTORS, DEMO_DRAMAS, DEMO_USERS, demoCollections, demoComments, demoNotifications, demoPosts } from './demoSeed';

/** The identity the fixtures were last applied for. A sign-in / sign-out changes it and re-seeds. */
let seededFor: string | null = null;
let inFlight: Promise<void> | null = null;

function seed(): void {
  dispatchLocal({ type: 'import', dramas: DEMO_DRAMAS, actors: DEMO_ACTORS });
  dispatchLocal({ type: 'mergeUsers', users: DEMO_USERS });
  dispatchLocal({ type: 'mergePosts', posts: demoPosts() });
  // Threads merge per post (the reducer keeps any pending/failed comment of mine for that post).
  const byPost = new Map<string, ReturnType<typeof demoComments>>();
  for (const c of demoComments()) byPost.set(c.postId, [...(byPost.get(c.postId) ?? []), c]);
  for (const [postId, comments] of byPost) dispatchLocal({ type: 'mergeComments', postId, comments });
  dispatchLocal({ type: 'mergeCollections', collections: demoCollections() });
  dispatchLocal({ type: 'mergeNotifications', notifications: demoNotifications(), append: true });
}

/**
 * Apply the fixtures once per identity. Idempotent and safe to call from every `pull`: concurrent
 * callers share one pass, and a repeat call for the same account is a no-op.
 */
async function ensureSeeded(): Promise<void> {
  const id = getState().profile.id;
  if (seededFor === id) return;
  if (inFlight) return inFlight;
  inFlight = Promise.resolve()
    .then(() => {
      seed();
      // Mark the identity we seeded *for*; if the account changed mid-pass, the next pull re-seeds.
      seededFor = id;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export const demoBackend: Backend = {
  name: 'demo',
  // Nothing to reach, so the outbox must never wait on the radio.
  network: false,
  async push(): Promise<void> {
    /* accepted: optimistic state is the state of record, and it is already persisted */
  },
  async pull(_scope: PullScope, _opts?: PullOptions): Promise<void> {
    await ensureSeeded();
  },
};
