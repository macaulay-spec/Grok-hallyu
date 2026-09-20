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
import { LIMITS } from '../../lib/model';

function strength(p: string): { score: 0 | 1 | 2 | 3; label: string } {
  let s = 0;
  if (p.length >= 8) s++;
  if (/[0-9]/.test(p) && /[a-zA-Z]/.test(p)) s++;
  if (/[^a-zA-Z0-9]/.test(p) || p.length >= 14) s++;
  return { score: s as 0 | 1 | 2 | 3, label: ['Too short', 'Okay', 'Good', 'Strong'][s]! };
}

export default function SignUp() {
  const router = useRouter();
  const auth = useAuth();
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const emailRef = useRef<TextInput>(null);
  const passRef = useRef<TextInput>(null);
  const emailOk = /.+@.+\..+/.test(email.trim());
  const st = strength(password);
  const valid = name.trim().length >= 2 && emailOk && st.score >= 1;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const result = await auth.signUp(email, password, name);
      if (result === 'verify') router.replace({ pathname: '/(auth)/verify', params: { email: email.trim() } });
      else router.replace('/');
    } catch (e) {
      setError(e as AuthError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen header={<TopBar title="Create account" />}>
      <ScrollScreen keyboard column padded>
        <Text variant="display" style={{ marginTop: space.x4 }}>
          Join the conversation.
        </Text>
        <Text variant="body" tone="secondary" style={{ marginTop: space.x2, marginBottom: space.x6 }}>
          Track what you watch, follow the fandoms you love, and talk about every episode without getting spoiled.
        </Text>
        <View style={{ gap: space.x4 }}>
          <TextField label="Display name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" maxLength={LIMITS.displayName} returnKeyType="next" onSubmitEditing={() => emailRef.current?.focus()} leading="person-outline" hint="How you’ll appear to others. You can change it later." />
          <TextField ref={emailRef} label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" returnKeyType="next" onSubmitEditing={() => passRef.current?.focus()} leading="mail-outline" error={email.length > 3 && !emailOk ? 'That doesn’t look like an email address.' : null} />
          <TextField ref={passRef} label="Password" value={password} onChangeText={setPassword} password autoComplete="new-password" textContentType="newPassword" returnKeyType="go" onSubmitEditing={submit} leading="lock-closed-outline" hint={password ? `${st.label} · at least 8 characters with a number` : 'At least 8 characters with a number'} />
          {error ? <InlineNotice tone={error.code === 'network' ? 'warning' : 'danger'} icon={error.code === 'network' ? 'cloud-offline-outline' : 'alert-circle-outline'} text={error.message} /> : null}
          <Button label="Create account" size="lg" block onPress={submit} loading={busy} disabled={!valid} />
          {error?.code === 'exists' ? <Button label="Sign in instead" variant="secondary" block onPress={() => router.replace('/(auth)/sign-in')} /> : null}
          {error?.code === 'network' ? <Button label="Use the demo account instead" variant="secondary" block onPress={() => auth.signInDemo().then(() => router.replace('/'))} /> : null}
        </View>
        <View style={{ marginTop: space.x6, gap: space.x2 }}>
          <Button label="Continue with Google" icon="logo-google" variant="secondary" block onPress={() => auth.signInWithGoogle().then(() => router.replace('/')).catch((e: AuthError) => e.code !== 'cancelled' && toast.show({ message: e.message, tone: 'danger' }))} />
          <Button label="Already have an account? Sign in" variant="ghost" onPress={() => router.replace('/(auth)/sign-in')} />
        </View>
        <Text variant="caption" tone="tertiary" style={{ marginTop: space.x6 }}>
          By creating an account you agree to the Terms and the Community Guidelines: mark your spoilers, no harassment, no spam. You can delete your account at any time from Settings.
        </Text>
      </ScrollScreen>
    </Screen>
  );
}
