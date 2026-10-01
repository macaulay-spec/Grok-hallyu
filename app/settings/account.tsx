import { useRouter } from 'expo-router';
import React from 'react';
import { SettingsGroup, SettingsRow } from '../../components/settings/Rows';
import { ScrollScreen, Screen } from '../../components/ui/Screen';
import { TopBar } from '../../components/ui/TopBar';
import { useAuth } from '../../lib/auth';
import { useApp } from '../../lib/hooks';

const METHOD_LABEL: Record<string, string> = { google: 'Google', apple: 'Apple', demo: 'Demo (device only)' };

/** Account — identity, sign-in method, data controls. */
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
          <SettingsRow
            icon={auth.user?.provider === 'demo' ? 'sparkles-outline' : auth.user?.provider === 'apple' ? 'logo-apple' : 'logo-google'}
            label="Sign-in method"
            value={METHOD_LABEL[auth.user?.provider ?? 'google'] ?? 'Google'}
          />
        </SettingsGroup>
        <SettingsGroup title="Your data" footer="Deleting your account wipes your posts, comments, watchlist, collections and follows from the cloud immediately.">
          <SettingsRow icon="trash-outline" label="Delete account" tone="danger" onPress={() => router.push('/settings/delete-account')} />
        </SettingsGroup>
      </ScrollScreen>
    </Screen>
  );
}
