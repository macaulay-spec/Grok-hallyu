import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';
import { Text } from '../../components/ui/Text';
import { useToast } from '../../components/ui/Toast';
import { colors, radius, space } from '../../constants/theme';
import { AuthError, useAuth } from '../../lib/auth';

type Frame = { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; body: string };

/** The reason a guest hit the gate decides the framing: it should feel like an invitation to the thing they just tried. */
function frameFor(reason: string | undefined): Frame {
  const r = (reason ?? '').toLowerCase();
  if (r.includes('follow')) return { icon: 'heart-outline', title: 'Follow it, and it follows you back', body: 'New episodes, the room on air night and the fandom’s best posts land in your feed. Free, takes a minute.' };
  if (r.includes('react')) return { icon: 'flame-outline', title: 'Your reaction counts', body: 'Loved, cried, screamed — every tap feeds the episode meter and tells the fandom how it landed. Free, takes a minute.' };
  if (r.includes('track') || r.includes('episode') || r.includes('progress')) return { icon: 'shield-checkmark-outline', title: 'Track it, and we keep spoilers away', body: 'Tell us your episode and everything past it stays veiled — across feeds, rooms and search. Free, takes a minute.' };
  if (r.includes('save') || r.includes('collection')) return { icon: 'bookmark-outline', title: 'Keep it somewhere', body: 'Save posts and shelve dramas into collections you can come back to — and share, if you like. Free, takes a minute.' };
  if (r.includes('comment') || r.includes('reply')) return { icon: 'chatbubble-ellipses-outline', title: 'Join the thread', body: 'Answer the theory, argue the ending, tag your spoilers. Your name goes on it. Free, takes a minute.' };
  if (r.includes('post') || r.includes('create')) return { icon: 'create-outline', title: 'Say it in the room', body: 'Posts, reviews and recommendations land in the drama’s community, seen by people who watch it too. Free, takes a minute.' };
  if (r.includes('remind')) return { icon: 'notifications-outline', title: 'Never miss air night', body: 'One nudge when the episode drops and the room opens. Quiet hours respected. Free, takes a minute.' };
  if (r.includes('block') || r.includes('mute')) return { icon: 'hand-left-outline', title: 'Your feed, your rules', body: 'Mute and block from your own account so it sticks everywhere you sign in. Free, takes a minute.' };
  return { icon: 'person-add-outline', title: `Join Hallyu to ${reason ?? 'do this'}`, body: 'Free, takes a minute. You keep everything you’ve browsed as a guest.' };
}

/**
 * Auth gate for guests: a sheet, not a wall. Says what the action needs, offers the three doors,
 * and "Not now" returns to exactly where they were.
 */
export default function Gate() {
  const router = useRouter();
  const auth = useAuth();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));
  const frame = frameFor(reason);
  return (
    <View style={styles.root}>
      <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Not now" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.x4 }]} accessibilityViewIsModal>
        <View style={styles.handle} />
        <View style={styles.icon}>
          <Ionicons name={frame.icon} size={22} color={colors.accentText} />
        </View>
        <Text variant="titleLarge" style={{ marginTop: space.x3 }} accessibilityRole="header">
          {frame.title}
        </Text>
        <Text variant="body" tone="secondary" style={{ marginTop: space.x2 }}>
          {frame.body}
        </Text>
        <View style={{ gap: space.x2, marginTop: space.x5 }}>
          <Button label="Continue with Google" icon="logo-google" variant="secondary" block onPress={() => auth.signInWithGoogle().then(() => close()).catch((e: AuthError) => e.code !== 'cancelled' && toast.show({ message: e.message, tone: 'danger' }))} />
          <Button label="Continue with email" icon="mail-outline" block onPress={() => router.replace('/(auth)/sign-up')} />
          <Button label="I already have an account" variant="ghost" onPress={() => router.replace('/(auth)/sign-in')} />
          <Button label="Not now" variant="ghost" onPress={close} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface2, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.x6, paddingTop: space.x2 },
  handle: { width: 32, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: 'center', marginBottom: space.x4 },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
});
