import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { Profile } from '@/types/database';
import {
  DEMO_MODE,
  buildDemoSession,
  clearDemoSession,
  loadDemoSession,
  makeDemoProfile,
  saveDemoSession,
} from './demo';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  /** Demo mode only: create or update the local demo session/profile. */
  startDemoSession: (overrides?: Partial<Profile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
  startDemoSession: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.warn('Could not load profile:', error.message);
      return;
    }
    if (data) setProfile(data);
  }, []);

  // Demo mode: create or update the on-device session (no backend involved)
  const startDemoSession = useCallback(
    async (overrides?: Partial<Profile>) => {
      if (!DEMO_MODE) return;
      const base = profile ?? (await loadDemoSession())?.profile ?? makeDemoProfile();
      const next: Profile = { ...base, ...overrides, updated_at: new Date().toISOString() };
      setProfile(next);
      setSession(buildDemoSession(next));
      await saveDemoSession({ profile: next });
    },
    [profile]
  );

  useEffect(() => {
    if (DEMO_MODE) {
      loadDemoSession()
        .then((saved) => {
          if (saved) {
            setProfile(saved.profile);
            setSession(buildDemoSession(saved.profile));
          }
        })
        .finally(() => setLoading(false));
      return;
    }

    // onAuthStateChange fires INITIAL_SESSION right after subscribing, so a
    // separate getSession() call would just duplicate the profile fetch.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, nextSession) => {
        setSession(nextSession);
        if (nextSession?.user) {
          await fetchProfile(nextSession.user.id);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signOut = async () => {
    if (DEMO_MODE) {
      await clearDemoSession();
      setSession(null);
      setProfile(null);
      return;
    }
    await supabase.auth.signOut();
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (DEMO_MODE) return;
    if (session?.user?.id) {
      await fetchProfile(session.user.id);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        signOut,
        refreshProfile,
        startDemoSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
