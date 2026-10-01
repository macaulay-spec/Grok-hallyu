/**
 * Admin console client — typed calls to the role-gated `/admin/*` cloud endpoints.
 * Every call carries the member's session token; the server re-checks the admin role
 * on every request, so these are safe to call from anywhere (403 → "Admins only").
 */
import { useEffect, useState } from 'react';
import { RORK_FUNCTIONS_URL } from '../constants/keys';
import { currentAccessToken, useAuth } from './auth';

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

/** `source: 'postgres'` = live Supabase aggregates; `'cloud'` = Durable-Object fallback. */
export interface AnalyticsPayload {
  source: 'postgres' | 'cloud';
  overview: AnalyticsOverview;
}

export interface AdminReport {
  id: string;
  reporter_id: string;
  target_id: string;
  kind: string;
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
  id: string;
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

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const token = currentAccessToken();
  if (!token) throw new AdminError('Admin sign-in required', 401);
  let res: Response;
  try {
    res = await fetch(`${RORK_FUNCTIONS_URL}${path}`, {
      method: init?.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new AdminError('No connection', 0);
  }
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new AdminError(typeof payload.error === 'string' ? payload.error : `Request failed (${res.status})`, res.status);
  }
  return payload as T;
}

export const adminApi = {
  overview: () => call<AdminOverview>('/admin/overview'),
  analytics: () => call<AnalyticsPayload>('/admin/analytics'),
  reports: (status: 'open' | 'all' = 'open') => call<{ reports: AdminReport[] }>(`/admin/reports?status=${status}`),
  resolveReport: (id: string, status: string) =>
    call<{ ok: true }>(`/admin/reports/${encodeURIComponent(id)}`, { method: 'POST', body: { status } }),
  members: (q: string) => call<{ members: AdminMember[] }>(`/admin/members?q=${encodeURIComponent(q)}`),
  setVerified: (userId: string, on: boolean) =>
    call<{ ok: true }>('/admin/verify', { method: 'POST', body: { userId, on } }),
  setBanned: (userId: string, on: boolean) => call<{ ok: true }>('/admin/ban', { method: 'POST', body: { userId, on } }),
  audit: () => call<{ actions: AuditAction[] }>('/admin/audit'),
};

/**
 * Role gate for UI entry points. Reads the server-side session (the role lives in the cloud
 * profile — the client can never grant itself admin). Demo accounts are never admins.
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
    call<{ user?: { role?: string } }>('/auth/session')
      .then((r) => {
        if (alive) setIsAdmin(r.user?.role === 'admin');
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [signedIn, userId]);
  return isAdmin;
}
