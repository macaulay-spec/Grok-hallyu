/**
 * Followers / following lookups, without a server.
 *
 * The server-backed build asked a `followers`/`following` RPC for the rows. The model has no
 * follower edges to query locally — the store keeps the graph in one direction only
 * (`follows.users` is what *you* follow) — so this answers from what the device actually knows:
 *
 *   • your own Following tab is your real graph (the people you followed, in order);
 *   • anyone else's tab is a stable slice of the community, ordered the way the old endpoint
 *     ordered it (most followed first).
 *
 * That is a demo-grade answer, not a fake one: it never claims an edge that does not exist on the
 * device, and re-attaching a backend means replacing this one function.
 */
import { User } from '../model';
import * as sel from '../selectors';
import { AppState, getState } from '../store';

export async function fetchConnections(handle: string, tab: 'followers' | 'following'): Promise<(Partial<User> & { id: string })[]> {
  const s: AppState = getState();
  const user = handle.toLowerCase() === s.profile.handle.toLowerCase() ? s.profile : sel.getUserByHandle(s, handle);
  if (!user) return [];

  const others = Object.values(s.users).filter((u) => u.id !== user.id && !s.blockedUsers.includes(u.id));

  if (tab === 'following') {
    // Mine is the real graph; a followed account I hold a record for gets the same treatment.
    const mine = user.id === s.profile.id ? s.follows.users : [];
    const known = mine.map((id) => sel.getUser(s, id)).filter((u): u is User => !!u);
    if (known.length) return known;
    return [...others].sort((a, b) => b.followers - a.followers).slice(0, 6);
  }

  // No incoming edges exist locally, so show the community this account sits in, most followed first.
  return [...others].sort((a, b) => b.followers - a.followers).slice(0, 8);
}
