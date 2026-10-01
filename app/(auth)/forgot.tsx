import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Screen } from '../../components/ui/Screen';
import { Text } from '../../components/ui/Text';
import { TextField } from '../../components/ui/TextField';
import { toast } from '../../components/ui/Toast';
import { TopBar } from '../../components/ui/TopBar';
import { space } from '../../constants/theme';
import { AuthError, useAuth } from '../../lib/auth';

/**
 * Reset password — with the recovery key.
 *
 * Hallyu's cloud has no mail server, so the key shown once at signup is the reset flow. This
 * screen says exactly that up front, then swaps the key + new password for a fresh session.
 */
export default function ForgotPassword() {
  const router = useRouter();
  const auth = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [key, setKey] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await auth.recoverPassword(email, key, password);
      toast.show({ message: 'Password reset — welcome back', tone: 'success' });
      router.replace('/');
    } catch (e) {
      const err = e as AuthError;
      toast.show({ message: err.message || 'That didn’t work — try again.', tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = email.includes('@') && key.trim().length >= 10 && password.length >= 8;

  return (
    <Screen header={<TopBar mode="stack" title="Reset password" />}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text variant="titleLarge">Use your recovery key</Text>
        <Text variant="body" tone="secondary" style={styles.sub}>
          Hallyu doesn’t send email. When you created your account you were shown a recovery key —
          enter it here with a new password and you’re back in.
        </Text>

        <View style={styles.form}>
          <TextField
            label="Email"
            leading="mail-outline"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
          />
          <TextField label="Recovery key" leading="key-outline" value={key} onChangeText={setKey} autoCapitalize="characters" placeholder="XXXX-XXXX-XXXX" />
          <TextField label="New password" leading="lock-closed-outline" value={password} onChangeText={setPassword} password placeholder="At least 8 characters" />
          <Button label="Reset password & sign in" size="lg" block loading={busy} disabled={busy || !canSubmit} onPress={submit} />
          <Button label="Back to sign in" variant="ghost" onPress={() => router.back()} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.x6, paddingTop: space.x4, gap: space.x3, maxWidth: 560, width: '100%', alignSelf: 'center' },
  sub: { marginTop: -space.x2, marginBottom: space.x2 },
  form: { gap: space.x3, marginTop: space.x2 },
});
