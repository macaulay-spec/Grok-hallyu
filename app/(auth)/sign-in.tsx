import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { ScrollScreen, Screen } from '../../components/ui/Screen';
import { InlineNotice } from '../../components/ui/States';
import { Text } from '../../components/ui/Text';
import { TextField } from '../../components/ui/TextField';
import { useToast } from '../../components/ui/Toast';
import { TopBar } from '../../components/ui/TopBar';
import { space } from '../../constants/theme';
import { AuthError, useAuth } from '../../lib/auth';

export default function SignIn() {
  const router = useRouter();
  const auth = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const passRef = useRef<TextInput>(null);
  const emailOk = /.+@.+\..+/.test(email.trim());

  const submit = async () => {
    if (!emailOk || !password) return;
    setBusy(true);
    setError(null);
    try {
      await auth.signIn(email, password);
      router.replace('/');
    } catch (e) {
      setError(e as AuthError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen header={<TopBar title="Sign in" />}>
      <ScrollScreen keyboard column padded>
        <Text variant="display" style={{ marginTop: space.x4 }}>
          Welcome back.
        </Text>
        <Text variant="body" tone="secondary" style={{ marginTop: space.x2, marginBottom: space.x6 }}>
          Your watchlist, your people and tonight’s conversations are right where you left them.
        </Text>
        <View style={{ gap: space.x4 }}>
          <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" returnKeyType="next" onSubmitEditing={() => passRef.current?.focus()} leading="mail-outline" error={email.length > 3 && !emailOk ? 'That doesn’t look like an email address.' : null} />
          <TextField ref={passRef} label="Password" value={password} onChangeText={setPassword} password autoComplete="password" textContentType="password" returnKeyType="go" onSubmitEditing={submit} leading="lock-closed-outline" />
          {error ? <InlineNotice tone={error.code === 'network' ? 'warning' : 'danger'} icon={error.code === 'network' ? 'cloud-offline-outline' : 'alert-circle-outline'} text={error.message} /> : null}
          <Button label="Sign in" size="lg" block onPress={submit} loading={busy} disabled={!emailOk || !password} />
          {error?.code === 'unverified' ? <Button label="Resend verification email" variant="secondary" block onPress={() => auth.resendVerification(email).then(() => toast.show('Verification email sent')).catch((e: AuthError) => toast.show({ message: e.message, tone: 'danger' }))} /> : null}
        </View>
        <View style={{ marginTop: space.x6, gap: space.x2 }}>
          <Button label="Forgot password?" variant="ghost" onPress={() => router.push({ pathname: '/(auth)/forgot', params: { email } })} />
          <Button label="Continue with Google" icon="logo-google" variant="secondary" block onPress={() => auth.signInWithGoogle().then(() => router.replace('/')).catch((e: AuthError) => e.code !== 'cancelled' && toast.show({ message: e.message, tone: 'danger' }))} />
          <Button label="New here? Create an account" variant="ghost" onPress={() => router.replace('/(auth)/sign-up')} />
        </View>
      </ScrollScreen>
    </Screen>
  );
}
