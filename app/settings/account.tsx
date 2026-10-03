import { useRouter } from 'expo-router';
import React from 'react';
import { SettingsGroup, SettingsRow } from '../../components/settings/Rows';
import { ScrollScreen, Screen } from '../../components/ui/Screen';
import { TopBar } from '../../components/ui/TopBar';
import { useAuth } from '../../lib/auth';
import { useApp } from '../../lib/hooks';

/** Account — identity and data. */
export default function AccountSettings() {
  const router = useRouter();
  const auth = useAuth();
  const { me } = useApp();
  return (
    <Screen header={<TopBar mode="stack" title="Account" />}>
      <ScrollScreen>
        <SettingsGroup title="Identity">
          <SettingsRow icon="person-outline" label="Profile" value={`@${me.handle}`} onPress={() => router.push('/edit-profile')} />
          <SettingsRow icon="mail-outline" label="Email" value={auth.user?.email ?? '—'} />
          <SettingsRow icon="phone-portrait-outline" label="Sign-in method" value="Email · stored on this device" />
        </SettingsGroup>
        <SettingsGroup title="Your data" footer="This account and everything it holds live on this device.">
          <SettingsRow icon="trash-outline" label="Delete account" tone="danger" onPress={() => router.push('/settings/delete-account')} />
        </SettingsGroup>
      </ScrollScreen>
    </Screen>
  );
}
