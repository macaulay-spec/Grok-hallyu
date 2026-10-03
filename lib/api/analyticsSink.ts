/**
 * Product analytics over the backend: `track()` (lib/analytics.ts) is forwarded to the
 * `record_event` RPC (migration 21). Install once at boot — until the backend exists the
 * in-memory buffer behaves exactly as before, so nothing regresses in a local build.
 *
 * Nothing personal is sent: opaque install/session ids, validated event names, and a property bag
 * the database caps at 2 kB. A failing send is swallowed — analytics must never break a caller.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { setAnalyticsSink, type AnalyticsEvent } from '../analytics';
import { supabase } from './client';

const INSTALL_KEY = 'hallyu.analytics.install.v1';

/** One id per app run (the session dimension of record_event). */
const sessionId = Crypto.randomUUID();

let cachedInstallId: string | null = null;

/** Stable install-scoped anonymous id — the guest dimension of record_event. */
async function installId(): Promise<string> {
  if (cachedInstallId) return cachedInstallId;
  const stored = await AsyncStorage.getItem(INSTALL_KEY).catch(() => null);
  cachedInstallId = stored ?? Crypto.randomUUID();
  if (!stored) await AsyncStorage.setItem(INSTALL_KEY, cachedInstallId).catch(() => {});
  return cachedInstallId;
}

export function installBackendAnalyticsSink(): void {
  if (!supabase) return;
  setAnalyticsSink({
    track(event: AnalyticsEvent, props?: Record<string, unknown>): void {
      void (async () => {
        if (!supabase) return;
        // Property bags are capped server-side at 2 kB; drop oversized bags instead of failing.
        let properties: Record<string, unknown> = props ?? {};
        try {
          if (JSON.stringify(properties).length > 1900) properties = {};
        } catch {
          properties = {};
        }
        await supabase.rpc('record_event', {
          p_name: event,
          p_properties: properties,
          p_anonymous_id: await installId(),
          p_session_id: sessionId,
          p_platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : null,
          p_app_version: Application.nativeApplicationVersion ?? undefined,
        });
      })().catch(() => {});
    },
  });
}
