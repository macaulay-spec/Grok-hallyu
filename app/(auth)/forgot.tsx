import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { ScrollScreen, Screen } from '../../components/ui/Screen';
import { EmptyState, InlineNotice } from '../../components/ui/States';
import { Text } from '../../components/ui/Text';
import { TextField } from '../../components/ui/TextField';
import { TopBar } from '../../components/ui/TopBar';
import { space } from '../../constants/theme';
import { AuthError, useAuth } from '../../lib/auth';

export default function Forgot() {
  const router = useRouter();
  const auth = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const emailOk = /.+@.+\..+/.test(email.trim());

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await auth.sendReset(email);
      setSent(true);
    } catch (e) {
      setError(e as AuthError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen header={<TopBar title="Reset password" />}>
      <ScrollScreen keyboard column padded>
        {sent ? (
          <EmptyState icon="mail-open-outline" title="Check your inbox" body={`If an account exists for ${email.trim()}, we’ve sent a link to set a new password. It expires in one hour.`} actionLabel="Back to sign in" onAction={() => router.replace('/(auth)/sign-in')} secondaryLabel="Didn’t get it? Send again" onSecondary={submit} />
        ) : (
          <>
            <Text variant="display" style={{ marginTop: space.x4 }}>
              Forgot your password?
            </Text>
            <Text variant="body" tone="secondary" style={{ marginTop: space.x2, marginBottom: space.x6 }}>
              Enter your email and we’ll send a link to choose a new one.
            </Text>
            <View style={{ gap: space.x4 }}>
              <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" returnKeyType="send" onSubmitEditing={submit} leading="mail-outline" autoFocus />
              {error ? <InlineNotice tone="danger" icon="alert-circle-outline" text={error.message} /> : null}
              <Button label="Send reset link" size="lg" block onPress={submit} loading={busy} disabled={!emailOk} />
              <Button label="Back" variant="ghost" onPress={() => router.back()} />
            </View>
          </>
        )}
      </ScrollScreen>
    </Screen>
  );
}
