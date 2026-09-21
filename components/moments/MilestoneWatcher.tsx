import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { useAuth } from '../../lib/auth';
import { haptic, useApp } from '../../lib/hooks';
import { useToast } from '../ui/Toast';

/**
 * Light brand moments — a warm line at the right second, never a modal, never twice.
 * Watches the store for firsts (first follow, first post, first drama completed, first ten
 * episodes) and marks each as seen device-locally so a reinstall can celebrate again but a
 * session never nags. Signed-in members only: guests get invitations, not confetti.
 */
export function MilestoneWatcher() {
  const { state, dispatch } = useApp();
  const auth = useAuth();
  const toast = useToast();
  // Don't celebrate what already existed before hydration (or before this device saw the account).
  const baseline = useRef<{ follows: number; posts: number; completed: number; episodes: number } | null>(null);

  const followCount = state.follows.dramas.length + state.follows.users.length + state.follows.actors.length + state.follows.collections.length;
  const myPosts = state.posts.filter((p) => p.authorId === state.profile.id && p.type !== 'reaction').length;
  const completed = Object.values(state.watchlist).filter((w) => w.status === 'completed').length;
  const episodes = Object.values(state.watchlist).reduce((n, w) => n + (w.status === 'watching' || w.status === 'completed' ? w.currentEpisode : 0), 0);

  useEffect(() => {
    if (!state.hydrated) return;
    if (!baseline.current) {
      baseline.current = { follows: followCount, posts: myPosts, completed, episodes };
      return;
    }
    if (auth.status !== 'signedIn' || !state.onboarding.done) return;
    const b = baseline.current;
    const fire = (id: string, message: string, icon: keyof typeof Ionicons.glyphMap) => {
      if (state.seen[`moment:${id}`]) return;
      dispatch({ type: 'seen', id: `moment:${id}` });
      haptic.success();
      toast.show({ message, icon, tone: 'success', duration: 4200 });
    };
    if (followCount > b.follows && followCount === 1) fire('first-follow', 'First follow. Your Home just became yours — new episodes and the room will find you.', 'heart');
    if (followCount > b.follows && followCount === 5) fire('five-follows', 'Five follows in. Tonight and Up Next now know your taste.', 'sparkles-outline');
    if (myPosts > b.posts && myPosts === 1) fire('first-post', 'First post, out in the room. Reactions and replies land in Activity.', 'chatbubbles-outline');
    if (completed > b.completed && completed === 1) fire('first-completed', 'First drama finished. Every spoiler about it is unveiled for you now — go read the ending threads.', 'checkmark-done-outline');
    if (completed > b.completed && completed === 10) fire('ten-completed', 'Ten dramas completed. That is a fandom résumé.', 'trophy-outline');
    if (episodes > b.episodes && b.episodes < 10 && episodes >= 10) fire('ten-episodes', 'Ten episodes tracked. Spoiler protection has been following you the whole way.', 'shield-checkmark-outline');
    baseline.current = { follows: followCount, posts: myPosts, completed, episodes };
  }, [state.hydrated, state.onboarding.done, state.seen, auth.status, followCount, myPosts, completed, episodes, dispatch, toast]);

  return null;
}
