import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { ScrollScreen, Screen } from '../../components/ui/Screen';
import { InlineNotice } from '../../components/ui/States';
import { Text } from '../../components/ui/Text';
import { TextField } from '../../components/ui/TextField';
import { useToast } from '../../components/ui/Toast';
import { TopBar } from '../../components/ui/TopBar';
import { space } from '../../constants/theme';
import { AuthError, useAuth } from '../../lib/auth';
import { useStore } from '../../lib/store';

/** Delete account — explicit, typed confirmation; wipes this device's copy of the account. */
export default function DeleteAccount() {
  const router = useRouter();
  const auth = useAuth();
  const toast = useToast();
  const { clearPersisted } = useStore();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = typed.trim().toUpperCase() === 'DELETE';
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await auth.deleteAccount();
      await clearPersisted();
      toast.show({ message: 'Account deleted. Thank you for the time you spent here.' });
      router.replace('/');
    } catch (e) {
      setError((e as AuthError).message ?? 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen header={<TopBar mode="stack" title="Delete account" />}>
      <ScrollScreen keyboard column padded>
        <Text variant="titleLarge" style={{ marginTop: space.x2 }}>
          This removes everything.
        </Text>
        <Text variant="body" tone="secondary" style={{ marginTop: space.x2 }}>
          Your profile, posts, comments, reactions, watchlist, collections and follows are removed from this device. This cannot be undone.
        </Text>
        <View style={{ marginTop: space.x5, gap: space.x4 }}>
          <InlineNotice tone="warning" icon="warning-outline" text="Prefer a break? Sign out instead — nothing is lost." />
          <TextField label="Type DELETE to confirm" value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} />
          {error ? <InlineNotice tone="danger" icon="alert-circle-outline" text={error} /> : null}
          <Button label="Delete my account" variant="danger" size="lg" block disabled={!ready} loading={busy} onPress={run} />
          <Text variant="caption" tone="tertiary">
            This account lives on this device only, so deletion is immediate.
          </Text>
        </View>
      </ScrollScreen>
    </Screen>
  );
}
