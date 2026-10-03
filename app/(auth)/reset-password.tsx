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

/** Account recovery: reached from the emailed link. Sets a new password on the recovered session. */
export default function ResetPassword() {
  const router = useRouter();
  const auth = useAuth();
  const toast = useToast();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const valid = p1.length >= 8 && p1 === p2;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await auth.updatePassword(p1);
      toast.show({ message: 'Password updated. You’re signed in.', icon: 'checkmark-circle', tone: 'success' });
      router.replace('/');
    } catch (e) {
      setError(e as AuthError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen header={<TopBar title="New password" mode="modal" onBack={() => { auth.clearRecovery(); router.replace('/'); }} />}>
      <ScrollScreen keyboard column padded>
        <Text variant="display" style={{ marginTop: space.x4 }}>
          Choose a new password.
        </Text>
        <Text variant="body" tone="secondary" style={{ marginTop: space.x2, marginBottom: space.x6 }}>
          {auth.status === 'signedIn' ? 'Your account is recovered. Set a password you’ll remember.' : 'Open the link from your email on this device to recover your account, then set a password here.'}
        </Text>
        <View style={{ gap: space.x4 }}>
          <TextField label="New password" value={p1} onChangeText={setP1} password autoComplete="new-password" leading="lock-closed-outline" hint="At least 8 characters with a number" />
          <TextField label="Repeat password" value={p2} onChangeText={setP2} password leading="lock-closed-outline" error={p2 && p1 !== p2 ? 'Passwords don’t match.' : null} returnKeyType="go" onSubmitEditing={submit} />
          {error ? <InlineNotice tone="danger" icon="alert-circle-outline" text={error.message} /> : null}
          <Button label="Save password" size="lg" block onPress={submit} loading={busy} disabled={!valid || auth.status !== 'signedIn'} />
        </View>
      </ScrollScreen>
    </Screen>
  );
}
