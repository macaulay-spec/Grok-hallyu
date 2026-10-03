/**
 * Followers / following lookups, without a server.
 *
 * The model has no follower edges to query — the store keeps the graph in one direction only
 * (`follows.users` is what *you* follow) — so this answers from what the device actually knows:
 *
 *   • your own Following tab is your real graph (the people you followed, in order);
 *   • anyone else's tab is a stable slice of the community, most followed first.
 *
 * It never claims an edge that does not exist on the device.
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
    if (user.id === s.profile.id) {
      return s.follows.users.map((id) => sel.getUser(s, id)).filter((u): u is User => !!u);
    }
    return [...others].sort((a, b) => b.followers - a.followers).slice(0, Math.min(6, user.following));
  }

  // No incoming edges exist locally, so show the community this account sits in, most followed first.
  return [...others].sort((a, b) => b.followers - a.followers).slice(0, Math.min(8, user.followers));
}
