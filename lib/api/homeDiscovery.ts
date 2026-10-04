/**
 * Home's server payload (§6 of the connection contract): one `get_home_discovery()` call returns
 * the backend-ranked rails (tonight / trending / upcoming / recent / continue), the member's
 * stats, and catalog health — the ranking the 15-minute scheduler keeps fresh.
 *
 * `fetchHomeDiscovery` maps the section items onto the app's Drama model and adopts them into the
 * store, so Home's editorial rails hydrate from the server's own ordering even before any browse
 * screen runs. A member-only RPC: callers gate on signed-in + connected.
 */
import { supabase } from './client';
import { hydrateSlim, type SlimTitleRow } from './serverCatalog';
import { adoptDramas } from '../catalogSync';
import type { Drama } from '../model';

export interface HomeDiscoveryStats {
  alerts: number;
  watching: number;
  completed: number;
  collections: number;
  want_to_watch: number;
  episodes_ahead: number;
  following_titles: number;
  unread_notifications: number;
}

export interface HomeDiscoverySection {
  key: string;
  kind: string;
  title: string;
  position: number;
  dramas: Drama[];
}

export interface HomeDiscovery {
  sections: HomeDiscoverySection[];
  stats: HomeDiscoveryStats | null;
  /** The member's worlds, as stored on their profile. */
  worlds: string[];
  catalogHealth: { airing: number; recent: number; upcoming: number; unavailable: number; last_synced_at: string | null } | null;
}

interface SectionPayload {
  key?: string;
  kind?: string;
  title?: string;
  position?: number;
  items?: SlimTitleRow[];
}

interface Payload {
  stats?: HomeDiscoveryStats;
  worlds?: string[];
  sections?: SectionPayload[];
  catalog_health?: HomeDiscovery['catalogHealth'];
}

/**
 * Call `get_home_discovery()` and adopt the returned titles into the store. Returns the mapped
 * sections (with hydrated Dramas) plus member stats, or null when this build has no backend.
 * Throws on backend errors — the caller decides how to surface them; Home stays editorial.
 */
export async function fetchHomeDiscovery(signal?: AbortSignal): Promise<HomeDiscovery | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('get_home_discovery', { p_limit: 8 }).abortSignal(signal!);
  if (error) throw new Error(`home discovery failed: ${error.message}`);
  const payload = (data ?? {}) as Payload;

  const sections: HomeDiscoverySection[] = [];
  for (const section of payload.sections ?? []) {
    const items = Array.isArray(section.items) ? section.items : [];
    const dramas = await hydrateSlim(items, signal);
    sections.push({
      key: section.key ?? 'section',
      kind: section.kind ?? 'titles',
      title: section.title ?? section.key ?? 'section',
      position: section.position ?? 0,
      dramas,
    });
  }

  const discovered = sections.flatMap((s) => s.dramas);
  if (discovered.length) adoptDramas(discovered);

  return {
    sections: sections.sort((a, b) => a.position - b.position),
    stats: payload.stats ?? null,
    worlds: payload.worlds ?? [],
    catalogHealth: payload.catalog_health ?? null,
  };
}
