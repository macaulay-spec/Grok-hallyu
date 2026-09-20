import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { SettingsGroup, SettingsRow, SettingsToggle } from '../../components/settings/Rows';
import { ScrollScreen, Screen } from '../../components/ui/Screen';
import { TopBar } from '../../components/ui/TopBar';
import { useApp } from '../../lib/hooks';
import { ensureNotificationPermission, notificationPermission, PermissionState, plannedReminders, remindersSupported } from '../../lib/reminders';

/** Notification categories + quiet hours. Per-drama alerts live on each drama page. */
export default function NotificationSettings() {
  const { state, dispatch } = useApp();
  const n = state.prefs.notifications;
  const set = (patch: Partial<typeof n>) => dispatch({ type: 'prefs', patch: { notifications: { ...n, ...patch } } });
  const [perm, setPerm] = useState<PermissionState>(remindersSupported ? 'undetermined' : 'unsupported');
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      notificationPermission().then((p) => alive && setPerm(p));
      return () => {
        alive = false;
      };
    }, []),
  );
  const planned = plannedReminders(state);
  const next = planned[0];
  const permValue = perm === 'granted' ? 'Allowed' : perm === 'denied' ? 'Blocked' : perm === 'unsupported' ? 'Not on web' : 'Not asked yet';
  const permDetail =
    perm === 'granted'
      ? next
        ? `${planned.length} episode ${planned.length === 1 ? 'reminder' : 'reminders'} scheduled · next: ${next.title.replace(' is airing', '')}`
        : 'No upcoming episodes to remind you about yet'
      : perm === 'denied'
        ? 'Hallyu can’t show reminders until you allow notifications in system settings'
        : perm === 'unsupported'
          ? 'Reminders fire on the Android and iOS apps'
          : 'We ask the first time you set a reminder';

  return (
    <Screen header={<TopBar mode="stack" title="Notifications" />}>
      <ScrollScreen>
        <SettingsGroup title="This device" footer={Platform.OS === 'android' ? 'Reminders use the “Episode nights” channel — you can change its sound and importance in Android settings.' : undefined}>
          <SettingsRow
            icon={perm === 'granted' ? 'notifications-outline' : 'notifications-off-outline'}
            label="System permission"
            detail={permDetail}
            value={permValue}
            chevron={perm !== 'granted' && perm !== 'unsupported'}
            onPress={perm === 'denied' ? () => Linking.openSettings().catch(() => {}) : perm === 'undetermined' ? () => ensureNotificationPermission().then(setPerm) : undefined}
          />
        </SettingsGroup>
        <SettingsGroup title="Categories" footer="Per-drama episode alerts are set with the bell on each drama you follow.">
          <SettingsToggle icon="radio-outline" label="Episodes" detail="When a drama you follow airs or a room goes live" value={n.episodes} onChange={(v) => set({ episodes: v })} />
          <SettingsToggle icon="heart-outline" label="Social" detail="Reactions, comments, replies, new followers" value={n.social} onChange={(v) => set({ social: v })} />
          <SettingsToggle icon="sparkles-outline" label="Highlights" detail="Trending in your fandoms — at most one a day" value={n.highlights} onChange={(v) => set({ highlights: v })} />
          <SettingsToggle icon="information-circle-outline" label="System" detail="Security, policy and account notices (recommended)" value={n.system} onChange={(v) => set({ system: v })} />
        </SettingsGroup>
        <SettingsGroup title="Quiet hours" footer="22:00 – 08:00 local time. Episode-live alerts still arrive if you turned them on for that drama.">
          <SettingsToggle icon="moon-outline" label="Quiet hours" value={n.quietHours} onChange={(v) => set({ quietHours: v })} />
        </SettingsGroup>
      </ScrollScreen>
    </Screen>
  );
}
