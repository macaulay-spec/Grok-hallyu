import { useRouter } from 'expo-router';
import React from 'react';
import { SettingsGroup, SettingsRow, SettingsToggle } from '../../components/settings/Rows';
import { ScrollScreen, Screen } from '../../components/ui/Screen';
import { TopBar } from '../../components/ui/TopBar';
import { useApp } from '../../lib/hooks';

/** Privacy & safety. */
export default function PrivacySettings() {
  const router = useRouter();
  const { me, dispatch, state } = useApp();
  return (
    <Screen header={<TopBar mode="stack" title="Privacy & safety" />}>
      <ScrollScreen>
        <SettingsGroup title="Profile">
          <SettingsToggle icon="lock-closed-outline" label="Private profile" detail="Only approved followers see your posts, shelves and watchlist." value={!!me.isPrivate} onChange={(v) => dispatch({ type: 'profile', patch: { isPrivate: v } })} />
        </SettingsGroup>
        <SettingsGroup title="Safety">
          <SettingsRow icon="ban-outline" label="Blocked & muted" value={`${state.blockedUsers.length} blocked`} onPress={() => router.push('/settings/blocked')} />
          <SettingsRow icon="eye-off-outline" label="Muted words" value={`${state.prefs.mutedWords.length}`} onPress={() => router.push('/settings/content')} />
          <SettingsRow icon="flag-outline" label="How reporting works" detail="Anonymous, human-reviewed, usually within 24h" onPress={() => router.push('/settings/guidelines')} />
        </SettingsGroup>
        <SettingsGroup title="Legal">
          <SettingsRow icon="document-text-outline" label="Privacy policy" onPress={() => router.push({ pathname: '/settings/legal', params: { doc: 'privacy' } })} />
          <SettingsRow icon="document-outline" label="Terms of service" onPress={() => router.push({ pathname: '/settings/legal', params: { doc: 'terms' } })} />
        </SettingsGroup>
      </ScrollScreen>
    </Screen>
  );
}
