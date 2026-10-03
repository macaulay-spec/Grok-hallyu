import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { ScrollScreen, Screen } from '../../components/ui/Screen';
import { EmptyState } from '../../components/ui/States';
import { Text } from '../../components/ui/Text';
import { useToast } from '../../components/ui/Toast';
import { TopBar } from '../../components/ui/TopBar';
import { space } from '../../constants/theme';
import { AuthError, useAuth } from '../../lib/auth';

/** Email verification waiting room. Auto-continues when the deep link signs the user in. */
export default function Verify() {
  const router = useRouter();
  const auth = useAuth();
  const toast = useToast();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (auth.status === 'signedIn') router.replace('/');
  }, [auth.status, router]);

  useEffect(() => {
    if (!cooldown) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const resend = async () => {
    if (!email) return;
    try {
      await auth.resendVerification(email);
      toast.show({ message: 'Sent. Check spam if it hides.', icon: 'mail-outline' });
      setCooldown(45);
    } catch (e) {
      toast.show({ message: (e as AuthError).message, tone: 'danger' });
    }
  };

  return (
    <Screen header={<TopBar title="Verify your email" onBack={() => router.replace('/(auth)/welcome')} />}>
      <ScrollScreen column padded>
        <EmptyState icon="mail-unread-outline" title="One tap left" body={`We sent a verification link to ${email ?? 'your email'}. Open it on this device and you’ll land straight in Hallyu.`} actionLabel={cooldown ? `Resend in ${cooldown}s` : 'Resend email'} onAction={cooldown ? undefined : resend} />
        <View style={{ gap: space.x2, alignItems: 'center' }}>
          <Text variant="caption" tone="tertiary" align="center">
            Wrong address? Create the account again with the right one.
          </Text>
          <Button label="Use a different email" variant="ghost" onPress={() => router.replace('/(auth)/sign-up')} />
          <Button label="I’ll verify later — explore as a guest" variant="ghost" onPress={() => { auth.continueAsGuest(); router.replace('/(tabs)'); }} />
        </View>
      </ScrollScreen>
    </Screen>
  );
}
