/**
 * Server bootstrap (migration 20, `get_bootstrap()`) — one cold-start round trip for the member's
 * profile, preferences, follows, saves and watchlist. This module is the typed seam the app calls;
 * the per-screen adoption of every field is rolled out screen by screen (docs/
 * RORK-CLOUD-CONNECTION-PROMPT.md §6.2). `serverProfileToUser` is the adapter from the database
 * row to the client `User` shape — the same idea as lib/catalogSync's adoptDramas.
 */
import type { User } from '../model';
import { supabase } from './client';

export interface BootstrapProfile {
  id: string;
  handle: string;
  display_name: string;
  avatar_path: string | null;
  bio: string | null;
  worlds: string[];
  favorite_genres: string[];
  verified: boolean;
  is_private: boolean;
  follower_count: number;
  following_count: number;
  onboarding_completed: boolean;
  onboarding_step: number;
  onboarding_genres: string[];
  account_status: string;
  created_at: string;
}

export interface BootstrapPayload {
  profile: BootstrapProfile;
  prefs: Record<string, unknown> | null;
  unread_count: number;
  follows: { users: string[]; titles: string[]; people: string[]; collections: string[] };
  saved_post_ids: string[];
  watchlist: unknown[];
}

/**
 * Fetches `get_bootstrap()` for the signed-in member. Throws the PostgREST error verbatim so the
 * caller classifies it with `classifyBackendError`.
 */
export async function fetchBootstrap(): Promise<BootstrapPayload> {
  if (!supabase) throw new Error('No backend configured — cannot fetch bootstrap.');
  const { data, error } = await supabase.rpc('get_bootstrap');
  if (error) throw error;
  if (!data) throw new Error('get_bootstrap returned no payload.');
  return data as BootstrapPayload;
}

/** Maps the server profile row onto the client `User` shape (partial patch). */
export function serverProfileToUser(p: BootstrapProfile): Partial<User> & Pick<User, 'id'> {
  return {
    id: p.id,
    handle: p.handle,
    displayName: p.display_name,
    bio: p.bio ?? undefined,
    favoriteGenres: p.favorite_genres ?? [],
    followers: p.follower_count ?? 0,
    following: p.following_count ?? 0,
    verified: p.verified,
    isPrivate: p.is_private,
    joinedAt: p.created_at,
  };
}
