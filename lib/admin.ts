/**
 * Admin console client — typed reads/writes over the cloud database, gated by Row Level Security.
 * Every call runs as the signed-in member; the database only lets `profiles.is_admin` rows pass
 * (the role lives server-side — the client can never grant itself admin). Sensitive admin writes
 * are mirrored into the `admin_audit` trail.
 */
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';

export interface AdminOverview {
  users: number;
  banned: number;
  posts: number;
  comments: number;
  reactions: number;
  openReports: number;
  eventsToday: number;
  signupsToday: number;
  topPosts: { id: string; title: string | null; heat: number }[];
}

export interface AnalyticsOverview {
  events24h: number;
  events7d: number;
  daily: { day: string; count: number }[];
  topEvents: { name: string; count: number }[];
  reports: { open: number; total: number; resolved7d: number };
  members: { total: number; verified: number; banned: number; new7d: number };
}

/** `source: 'postgres'` — live Supabase aggregates. */
export interface AnalyticsPayload {
  source: 'postgres';
  overview: AnalyticsOverview;
}

export interface AdminReport {
  id: string;
  reporter_id: string;
  target_id: string;
  target_type: string;
  reason: string | null;
  detail: string | null;
  status: string;
  created_at: string;
}

export interface AdminMember {
  id: string;
  handle: string | null;
  display_name: string;
  avatar_url: string | null;
  role: string;
  verified: boolean;
  banned: boolean;
  created_at: string;
}

export interface AuditAction {
  id: number;
  admin_id: string;
  action: string;
  target: string | null;
  detail: string | null;
  created_at: string;
}

export class AdminError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

const dayStart = (): string => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};
const daysAgo = (n: number): string => new Date(Date.now() - n * 86_400_000).toISOString();

async function count(table: string, ...filters: [string, string, unknown][]): Promise<number> {
  let q = supabase.from(table).select('*', { count: 'exact', head: true });
  for (const [col, op, val] of filters) q = q.filter(col, op, val);
  const { count: n, error } = await q;
  if (error) throw new AdminError(error.message);
  return n ?? 0;
}

async function audit(action: string, target?: string, detail?: string): Promise<void> {
  await supabase.from('admin_audit').insert({ action, target: target ?? null, detail: detail ?? null }).then(
    ({ error }) => error && console.warn('admin.audit', error.message),
    () => {},
  );
}

export const adminApi = {
  overview: async (): Promise<AdminOverview> => {
    const [users, banned, posts, comments, reactions, openReports, eventsToday, signupsToday, topRes] = await Promise.all([
      count('profiles'),
      count('profiles', ['banned', 'eq', true]),
      count('posts', ['state', 'eq', 'active']),
      count('comments', ['state', 'eq', 'active']),
      count('reactions'),
      count('reports', ['status', 'eq', 'open']),
      count('events', ['created_at', 'gte', dayStart()]),
      count('profiles', ['created_at', 'gte', dayStart()]),
      supabase.from('posts').select('id, title, total_reactions').order('total_reactions', { ascending: false }).limit(5),
    ]);
    if (topRes.error) throw new AdminError(topRes.error.message);
    return {
      users,
      banned,
      posts,
      comments,
      reactions,
      openReports,
      eventsToday,
      signupsToday,
      topPosts: ((topRes.data ?? []) as { id: string; title: string | null; total_reactions: number }[]).map((p) => ({
        id: p.id,
        title: p.title,
        heat: p.total_reactions,
      })),
    };
  },

  analytics: async (): Promise<AnalyticsPayload> => {
    const { data: events, error } = await supabase
      .from('events')
      .select('name, created_at')
      .gte('created_at', daysAgo(7))
      .order('created_at', { ascending: false })
      .limit(5000);
    if (error) throw new AdminError(error.message);
    const rows = (events ?? []) as { name: string; created_at: string }[];
    const byDay = new Map<string, number>();
    const byName = new Map<string, number>();
    let events24h = 0;
    const cutoff24 = Date.now() - 86_400_000;
    for (const e of rows) {
      const day = e.created_at.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
      byName.set(e.name, (byName.get(e.name) ?? 0) + 1);
      if (new Date(e.created_at).getTime() >= cutoff24) events24h++;
    }
    const [open, total, resolved7d, membersTotal, verified, bannedMembers, new7d] = await Promise.all([
      count('reports', ['status', 'eq', 'open']),
      count('reports'),
      count('reports', ['status', 'neq', 'open'], ['created_at', 'gte', daysAgo(7)]),
      count('profiles'),
      count('profiles', ['verified', 'eq', true]),
      count('profiles', ['banned', 'eq', true]),
      count('profiles', ['created_at', 'gte', daysAgo(7)]),
    ]);
    return {
      source: 'postgres',
      overview: {
        events24h,
        events7d: rows.length,
        daily: [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, c]) => ({ day, count: c })),
        topEvents: [...byName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, c]) => ({ name, count: c })),
        reports: { open, total, resolved7d },
        members: { total: membersTotal, verified, banned: bannedMembers, new7d },
      },
    };
  },

  reports: async (status: 'open' | 'all' = 'open'): Promise<{ reports: AdminReport[] }> => {
    let q = supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(100);
    if (status === 'open') q = q.eq('status', 'open');
    const { data, error } = await q;
    if (error) throw new AdminError(error.message);
    return { reports: (data ?? []) as AdminReport[] };
  },

  resolveReport: async (id: string, status: string): Promise<{ ok: true }> => {
    const { error } = await supabase.from('reports').update({ status }).eq('id', id);
    if (error) throw new AdminError(error.message);
    await audit('report.resolve', id, status);
    return { ok: true };
  },

  members: async (q: string): Promise<{ members: AdminMember[] }> => {
    const safe = q.trim().replace(/[,()%]/g, ' ').trim();
    let query = supabase.from('profiles').select('id, handle, display_name, avatar_url, role, verified, banned, created_at').order('created_at', { ascending: false }).limit(50);
    if (safe) query = query.or(`handle.ilike.%${safe}%,display_name.ilike.%${safe}%`);
    const { data, error } = await query;
    if (error) throw new AdminError(error.message);
    return { members: (data ?? []) as AdminMember[] };
  },

  setVerified: async (userId: string, on: boolean): Promise<{ ok: true }> => {
    const { error } = await supabase.from('profiles').update({ verified: on }).eq('id', userId);
    if (error) throw new AdminError(error.message);
    await audit('member.verify', userId, on ? 'on' : 'off');
    return { ok: true };
  },

  setBanned: async (userId: string, on: boolean): Promise<{ ok: true }> => {
    const { error } = await supabase.from('profiles').update({ banned: on }).eq('id', userId);
    if (error) throw new AdminError(error.message);
    await audit('member.ban', userId, on ? 'on' : 'off');
    return { ok: true };
  },

  audit: async (): Promise<{ actions: AuditAction[] }> => {
    const { data, error } = await supabase.from('admin_audit').select('*').order('created_at', { ascending: false }).limit(100);
    if (error) throw new AdminError(error.message);
    return { actions: (data ?? []) as AuditAction[] };
  },
};

/**
 * Role gate for UI entry points. Reads the live profile row — the role lives in the database and
 * RLS allows reading own row, so this cannot be spoofed locally.
 */
export function useIsAdmin(): boolean {
  const auth = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const userId = auth.user?.id;
  const signedIn = auth.status === 'signedIn';
  useEffect(() => {
    if (!signedIn || !userId) {
      setIsAdmin(false);
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const { data } = await supabase.from('profiles').select('is_admin').eq('id', userId).maybeSingle();
        if (alive) setIsAdmin(!!(data as { is_admin?: boolean } | null)?.is_admin);
      } catch {
        /* offline — the gate simply stays closed this round */
      }
    })();
    return () => {
      alive = false;
    };
  }, [signedIn, userId]);
  return isAdmin;
}
