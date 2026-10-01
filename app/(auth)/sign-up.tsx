import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppleButton } from '../../components/ui/AppleButton';
import { Button } from '../../components/ui/Button';
import { GoogleButton } from '../../components/ui/GoogleButton';
import { Screen } from '../../components/ui/Screen';
import { Text } from '../../components/ui/Text';
import { TextField } from '../../components/ui/TextField';
import { toast } from '../../components/ui/Toast';
import { TopBar } from '../../components/ui/TopBar';
import { colors, radius, space } from '../../constants/theme';
import { AuthError, useAuth } from '../../lib/auth';

/**
 * Create account — email & password, with a one-time recovery key.
 *
 * There is no email infrastructure behind Hallyu's cloud, so the recovery key IS the reset flow:
 * it is shown exactly once, and it is the only way back into an account after a forgotten password.
 * The screen makes saving it the loudest action on the page.
 */
export default function SignUp() {
  const router = useRouter();
  const auth = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);

  const fail = (e: unknown) => {
    const err = e as AuthError;
    toast.show({ message: err.message || 'That didn’t work — try again.', tone: 'danger' });
  };

  const submit = async () => {
    setBusy(true);
    try {
      const key = await auth.signUp(email, password, name);
      setRecoveryKey(key);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const enter = (door: () => Promise<void>) => async () => {
    setBusy(true);
    try {
      await door();
      router.replace('/');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  // ---- the one-time recovery key ------------------------------------------
  if (recoveryKey) {
    const copy = async () => {
      await Clipboard.setStringAsync(recoveryKey);
      toast.show({ message: 'Recovery key copied', tone: 'success' });
    };
    return (
      <Screen header={<TopBar mode="stack" title="Your recovery key" />}>
        <ScrollView contentContainerStyle={styles.body}>
          <Text variant="titleLarge">Save this key now</Text>
          <Text variant="body" tone="secondary" style={styles.sub}>
            If you ever forget your password, this key is the only way back into your account. It is shown
            once and cannot be re-sent.
          </Text>
          <Pressable onPress={copy} accessibilityRole="button" accessibilityLabel="Copy recovery key" style={styles.keyCard}>
            <Text variant="display" style={styles.keyText}>
              {recoveryKey.slice(0, 4)}–{recoveryKey.slice(5, 9)}–{recoveryKey.slice(10, 14)}
            </Text>
            <Text variant="caption" tone="secondary" style={styles.keyHint}>
              Tap to copy
            </Text>
          </Pressable>
          <Button label="I’ve saved it — continue" size="lg" block onPress={() => router.replace('/')} />
        </ScrollView>
      </Screen>
    );
  }

  // ---- the form -------------------------------------------------------------
  const canSubmit = email.includes('@') && password.length >= 8 && name.trim().length > 0;
  return (
    <Screen header={<TopBar mode="stack" title="Create account" />}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text variant="titleLarge">Join Hallyu</Text>
        <Text variant="body" tone="secondary" style={styles.sub}>
          Free, takes a minute. Your feed, watchlist and posts sync to the cloud.
        </Text>

        <View style={styles.form}>
          <TextField label="Display name" leading="person-outline" value={name} onChangeText={setName} placeholder="How should we call you?" maxLength={60} />
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
          <TextField label="Password" leading="lock-closed-outline" value={password} onChangeText={setPassword} password placeholder="At least 8 characters" hint="8+ characters" />
          <Button label="Create account" size="lg" block loading={busy} disabled={busy || !canSubmit} onPress={submit} />
        </View>

        <View style={styles.doors}>
          <GoogleButton label="Sign up with Google" size="lg" onPress={enter(auth.signInWithGoogle)} loading={busy} disabled={busy} />
          <AppleButton label="Sign up with Apple" size="lg" onPress={enter(auth.signInWithApple)} loading={busy} disabled={busy} />
          <Button label="I already have an account" variant="ghost" block onPress={() => router.push('/(auth)/sign-in')} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.x6, paddingTop: space.x4, gap: space.x3, maxWidth: 560, width: '100%', alignSelf: 'center' },
  sub: { marginTop: -space.x2, marginBottom: space.x2 },
  form: { gap: space.x3, marginTop: space.x2 },
  doors: { gap: space.x3, marginTop: space.x6 },
  keyCard: { alignItems: 'center', gap: space.x2, paddingVertical: space.x6, borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.accent },
  keyText: { letterSpacing: 6, color: colors.accentText },
  keyHint: { color: colors.textSecondary },
});
