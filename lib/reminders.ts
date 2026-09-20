import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { allDramas, AppState, getState } from './store';

/**
 * Episode reminders that actually fire. "Remind me" (and the Drama Hub bell) is follow + per-drama
 * alerts; this module turns that state into local notifications scheduled at air time and keeps the
 * OS queue in step: anything you unfollowed, muted or already aired is cancelled, anything new is
 * scheduled. Idempotent — identifiers encode drama, episode and air time, so a rescheduled episode
 * simply replaces the old entry. Web has no local scheduling; everything here is a no-op there.
 */

export const remindersSupported = Platform.OS !== 'web';

const PREFIX = 'ep:';
const CHANNEL = 'episodes';
const HORIZON_MS = 14 * 86_400_000;

export interface PlannedReminder {
  id: string;
  dramaId: string;
  title: string;
  body: string;
  at: Date;
  url: string;
}

let handlerInstalled = false;
/** Foreground presentation: an episode reminder should still surface while you're in the app. */
export function installNotificationHandler() {
  if (!remindersSupported || handlerInstalled) return;
  handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export async function notificationPermission(): Promise<PermissionState> {
  if (!remindersSupported) return 'unsupported';
  try {
    const p = await Notifications.getPermissionsAsync();
    return p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'denied';
  }
}

/** Ask only when the person just asked us for a reminder — never on launch. */
export async function ensureNotificationPermission(): Promise<PermissionState> {
  if (!remindersSupported) return 'unsupported';
  try {
    const cur = await Notifications.getPermissionsAsync();
    if (cur.granted) return 'granted';
    if (!cur.canAskAgain) return 'denied';
    const req = await Notifications.requestPermissionsAsync();
    return req.granted ? 'granted' : req.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'denied';
  }
}

/** Pure: what should be scheduled for this state, within the horizon. */
export function plannedReminders(s: AppState, from = Date.now()): PlannedReminder[] {
  if (!s.prefs.notifications.episodes) return [];
  const out: PlannedReminder[] = [];
  for (const drama of allDramas(s)) {
    if (!s.follows.dramas.includes(drama.id)) continue;
    if (s.dramaNotify[drama.id] === false) continue;
    for (const e of drama.episodes) {
      if (!e.airDate) continue;
      const at = new Date(e.airDate).getTime();
      if (!Number.isFinite(at) || at <= from + 30_000 || at > from + HORIZON_MS) continue;
      const multi = drama.seasons.length > 1;
      out.push({
        id: `${PREFIX}${drama.id}:${e.season}:${e.number}:${Math.floor(at / 60_000)}`,
        dramaId: drama.id,
        title: `${drama.title} · ${multi ? `S${e.season} ` : ''}Episode ${e.number} is airing`,
        body: e.title ? `“${e.title}” — the room is open. Join while it’s live.` : 'The room is open — join while it’s live.',
        at: new Date(at),
        url: `/episode/${drama.id}/${e.season}/${e.number}`,
      });
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

let inflight: Promise<void> | null = null;
let again = false;

/** Reconcile the OS queue with `plannedReminders(state)`. Safe to call often; runs one at a time. */
export function syncEpisodeReminders(s: AppState = getState()): Promise<void> {
  if (!remindersSupported) return Promise.resolve();
  if (inflight) {
    again = true;
    return inflight;
  }
  inflight = (async () => {
    try {
      const perm = await Notifications.getPermissionsAsync();
      if (!perm.granted) return; // permission is requested at the moment someone asks for a reminder
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(CHANNEL, {
          name: 'Episode nights',
          description: 'When an episode of a drama you follow starts airing.',
          importance: Notifications.AndroidImportance.HIGH,
          lightColor: '#E11D48',
        });
      }
      const want = plannedReminders(s);
      const wantIds = new Set(want.map((w) => w.id));
      const have = new Set<string>();
      for (const n of await Notifications.getAllScheduledNotificationsAsync()) {
        if (!n.identifier.startsWith(PREFIX)) continue;
        if (wantIds.has(n.identifier)) have.add(n.identifier);
        else await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
      }
      for (const w of want) {
        if (have.has(w.id)) continue;
        await Notifications.scheduleNotificationAsync({
          identifier: w.id,
          content: { title: w.title, body: w.body, data: { url: w.url, dramaId: w.dramaId }, sound: 'default' },
          trigger: Platform.OS === 'android' ? { date: w.at, channelId: CHANNEL } : w.at,
        });
      }
    } catch (e) {
      if (__DEV__) console.warn('[reminders] sync failed', e);
    }
  })().finally(() => {
    inflight = null;
    if (again) {
      again = false;
      void syncEpisodeReminders(getState());
    }
  });
  return inflight;
}

/** Deep-link target carried by a reminder, if any. */
export function reminderUrl(response: Notifications.NotificationResponse | null | undefined): string | undefined {
  const url = response?.notification.request.content.data?.url;
  return typeof url === 'string' && url.startsWith('/') ? url : undefined;
}
