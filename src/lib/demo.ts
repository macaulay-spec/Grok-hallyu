import { Session } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { PostWithRelations, Profile } from '@/types/database';

// ------------------------------------------------------------------
// Demo mode detection.
// If the Supabase env vars are absent or still contain the placeholder
// values shipped in .env.example / supabase.ts, the app runs fully
// offline against in-memory demo data — zero network calls are made.
// ------------------------------------------------------------------
const RAW_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const RAW_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const DEMO_MODE =
  !RAW_URL ||
  !RAW_KEY ||
  /your[-_]?project/i.test(RAW_URL) ||
  /your[-_]?anon[-_]?key/i.test(RAW_KEY);

export const DEMO_USER_ID = '11111111-2222-4333-8444-555555555555';
const SESSION_KEY = 'hallyu.demo.session';

export type DemoSession = { profile: Profile };

export function makeDemoProfile(overrides?: Partial<Profile>): Profile {
  const now = new Date().toISOString();
  return {
    id: DEMO_USER_ID,
    username: 'demo_user',
    display_name: 'Demo Fan',
    bio: 'Exploring Hallyu in demo mode',
    avatar_url: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

/**
 * Fake supabase Session/User so downstream code that reads
 * `user?.id` etc. keeps working unchanged in demo mode.
 */
export function buildDemoSession(profile: Profile): Session {
  return {
    access_token: 'demo-token',
    refresh_token: 'demo-refresh',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: {
      id: profile.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'demo@hallyu.app',
      app_metadata: { provider: 'demo', providers: ['demo'] },
      user_metadata: {},
      created_at: profile.created_at,
    },
  } as unknown as Session;
}

// Demo session persistence (survives app restarts, stays on-device)
export async function loadDemoSession(): Promise<DemoSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    return raw ? (JSON.parse(raw) as DemoSession) : null;
  } catch {
    return null;
  }
}

export async function saveDemoSession(session: DemoSession): Promise<void> {
  try {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
  } catch {
    // non-fatal: demo session simply won't persist across restarts
  }
}

export async function clearDemoSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SESSION_KEY);
  } catch {
    // ignore
  }
}

// ------------------------------------------------------------------
// In-memory feed store. Posts created in demo mode live here for the
// lifetime of the app process; likes/saves toggle locally.
// ------------------------------------------------------------------
const demoPosts: PostWithRelations[] = [
  {
    id: 'demo-1',
    user_id: 'u1',
    body: 'Just finished Queen of Tears and I’m not okay 😭 The writing, the chemistry, the ending… 10/10, no notes.',
    media_urls: ['https://images.unsplash.com/photo-1485846234645-a62644f84728?w=800'],
    media_type: 'image',
    created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    updated_at: new Date().toISOString(),
    profile: {
      id: 'u1',
      username: 'kdrama.love',
      display_name: 'kdrama.love',
      bio: null,
      avatar_url: null,
      created_at: '',
      updated_at: '',
    },
    dramas: [
      {
        id: 'd1',
        title: 'Queen of Tears',
        original_title: null,
        poster_url: null,
        year: 2024,
        genres: ['Romance'],
        synopsis: null,
        cast_text: null,
        episode_count: 16,
        created_at: '',
      },
    ],
    likes_count: 1240,
    comments_count: 87,
    saves_count: 214,
    is_liked: false,
    is_saved: false,
  },
  {
    id: 'demo-2',
    user_id: 'u2',
    body: 'The way Lovely Runner plays with time and fate is just *chef’s kiss* ✨ If you love second chances and epic romance, this one’s for you.',
    media_urls: ['https://images.unsplash.com/photo-1518674660708-6f684e78f4f6?w=800'],
    media_type: 'image',
    created_at: new Date(Date.now() - 5 * 3600000).toISOString(),
    updated_at: new Date().toISOString(),
    profile: {
      id: 'u2',
      username: 'seoul.obsessed',
      display_name: 'seoul.obsessed',
      bio: null,
      avatar_url: null,
      created_at: '',
      updated_at: '',
    },
    dramas: [
      {
        id: 'd2',
        title: 'Lovely Runner',
        original_title: null,
        poster_url: null,
        year: 2024,
        genres: ['Romance', 'Time-Slip'],
        synopsis: null,
        cast_text: null,
        episode_count: 16,
        created_at: '',
      },
    ],
    likes_count: 845,
    comments_count: 63,
    saves_count: 132,
    is_liked: true,
    is_saved: false,
  },
];

export const demoStore = {
  listPosts: (): PostWithRelations[] => [...demoPosts],

  addPost: (post: PostWithRelations): void => {
    demoPosts.unshift(post);
  },

  toggleLike: (postId: string): PostWithRelations[] => {
    const i = demoPosts.findIndex((p) => p.id === postId);
    if (i >= 0) {
      const p = demoPosts[i];
      demoPosts[i] = {
        ...p,
        is_liked: !p.is_liked,
        likes_count: Math.max(0, p.likes_count + (p.is_liked ? -1 : 1)),
      };
    }
    return [...demoPosts];
  },

  toggleSave: (postId: string): PostWithRelations[] => {
    const i = demoPosts.findIndex((p) => p.id === postId);
    if (i >= 0) {
      const p = demoPosts[i];
      demoPosts[i] = {
        ...p,
        is_saved: !p.is_saved,
        saves_count: Math.max(0, p.saves_count + (p.is_saved ? -1 : 1)),
      };
    }
    return [...demoPosts];
  },
};
