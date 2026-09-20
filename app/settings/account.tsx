import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { SettingsGroup, SettingsRow } from '../../components/settings/Rows';
import { Button } from '../../components/ui/Button';
import { ScrollScreen, Screen } from '../../components/ui/Screen';
import { TextField } from '../../components/ui/TextField';
import { useToast } from '../../components/ui/Toast';
import { TopBar } from '../../components/ui/TopBar';
import { space } from '../../constants/theme';
import { AuthError, useAuth } from '../../lib/auth';
import { useApp } from '../../lib/hooks';

/** Account — identity, password, data export. */
export default function AccountSettings() {
  const router = useRouter();
  const auth = useAuth();
  const toast = useToast();
  const { me } = useApp();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const changePw = async () => {
    setBusy(true);
    try {
      await auth.updatePassword(pw);
      setPw('');
      toast.show({ message: 'Password changed', tone: 'success' });
    } catch (e) {
      toast.show({ message: (e as AuthError).message, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen header={<TopBar mode="stack" title="Account" />}>
      <ScrollScreen>
        <SettingsGroup title="Identity">
          <SettingsRow icon="person-outline" label="Profile" value={`@${me.handle}`} onPress={() => router.push('/edit-profile')} />
          <SettingsRow icon="mail-outline" label="Email" value={auth.user?.email ?? '—'} />
          <SettingsRow icon="logo-google" label="Sign-in method" value={auth.user?.provider === 'google' ? 'Google' : auth.isDemo ? 'Demo' : 'Email & password'} />
        </SettingsGroup>
        {auth.user?.provider !== 'google' && !auth.isDemo ? (
          <SettingsGroup title="Password" footer="At least 8 characters with a number. Changing it signs out other devices.">
            <TextField value={pw} onChangeText={setPw} password placeholder="New password" containerStyle={{ padding: space.x4 }} autoComplete="new-password" />
            <Button label="Change password" variant="secondary" size="sm" disabled={pw.length < 8} loading={busy} onPress={changePw} style={{ marginHorizontal: space.x4, marginBottom: space.x4, alignSelf: 'flex-start' }} />
          </SettingsGroup>
        ) : null}
        <SettingsGroup title="Your data" footer="Exports include posts, comments, watchlist, collections and follows as JSON.">
          <SettingsRow icon="download-outline" label="Request a copy of your data" detail="Emailed within 48 hours" onPress={() => toast.show({ message: 'Request received. Check your email within 48 hours.' })} />
          <SettingsRow icon="trash-outline" label="Delete account" tone="danger" onPress={() => router.push('/settings/delete-account')} />
        </SettingsGroup>
      </ScrollScreen>
    </Screen>
  );
}
