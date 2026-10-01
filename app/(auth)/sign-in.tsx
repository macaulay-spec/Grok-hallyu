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
import { colors, space } from '../../constants/theme';
import { AuthError, useAuth } from '../../lib/auth';

/** Sign in — email & password, the two OAuth doors, or the demo. */
export default function SignIn() {
  const router = useRouter();
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const fail = (e: unknown) => {
    const err = e as AuthError;
    toast.show({ message: err.message || 'That didn’t work — try again.', tone: 'danger' });
  };

  const submit = async () => {
    setBusy(true);
    try {
      await auth.signIn(email, password);
      router.replace('/');
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

  return (
    <Screen header={<TopBar mode="stack" title="Sign in" />}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text variant="titleLarge">Welcome back</Text>
        <Text variant="body" tone="secondary" style={styles.sub}>
          Your feed, watchlist and posts are waiting in the cloud.
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
          <TextField label="Password" leading="lock-closed-outline" value={password} onChangeText={setPassword} password placeholder="Your password" />
          <Button label="Sign in" size="lg" block loading={busy} disabled={busy || !email.includes('@') || password.length < 1} onPress={submit} />
          <Button label="Forgot password?" variant="ghost" onPress={() => router.push({ pathname: '/(auth)/forgot', params: { email: email.trim() } })} />
        </View>

        <View style={styles.doors}>
          <GoogleButton label="Continue with Google" size="lg" onPress={enter(auth.signInWithGoogle)} loading={busy} disabled={busy} />
          <AppleButton label="Continue with Apple" size="lg" onPress={enter(auth.signInWithApple)} loading={busy} disabled={busy} />
          <Button label="New here? Create an account" variant="secondary" block onPress={() => router.push('/(auth)/sign-up')} />
          <Pressable onPress={() => auth.continueAsGuest()} accessibilityRole="button" accessibilityLabel="Browse as a guest" hitSlop={10} style={styles.ghostLink}>
            <Text variant="bodySmall" tone="secondary">
              Look around as a guest
            </Text>
          </Pressable>
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
  ghostLink: { alignItems: 'center', paddingVertical: 6 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: space.x3 },
  divider: { flex: 1, height: 1, backgroundColor: colors.borderSubtle },
});
