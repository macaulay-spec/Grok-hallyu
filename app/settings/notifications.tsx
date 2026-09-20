import React from 'react';
import { SettingsGroup, SettingsToggle } from '../../components/settings/Rows';
import { ScrollScreen, Screen } from '../../components/ui/Screen';
import { TopBar } from '../../components/ui/TopBar';
import { useApp } from '../../lib/hooks';

/** Notification categories + quiet hours. Per-drama alerts live on each drama page. */
export default function NotificationSettings() {
  const { state, dispatch } = useApp();
  const n = state.prefs.notifications;
  const set = (patch: Partial<typeof n>) => dispatch({ type: 'prefs', patch: { notifications: { ...n, ...patch } } });
  return (
    <Screen header={<TopBar mode="stack" title="Notifications" />}>
      <ScrollScreen>
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
