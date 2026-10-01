import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';
import { AppleButton } from '../../components/ui/AppleButton';
import { GoogleButton } from '../../components/ui/GoogleButton';
import { Text } from '../../components/ui/Text';
import { toast } from '../../components/ui/Toast';
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
  const insets = useSafeAreaInsets();
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const [googleBusy, setGoogleBusy] = useState(false);
  const [appleBusy, setAppleBusy] = useState(false);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));
  const frame = frameFor(reason);

  /** One entry helper: spin the tapped door, land home on success, toast on real failures. */
  const enter = (door: () => Promise<void>, setBusy: (busy: boolean) => void) => async () => {
    setBusy(true);
    try {
      await door();
      router.replace('/');
    } catch (e) {
      const err = e as AuthError;
      if (err.code !== 'cancelled') toast.show({ message: err.message || 'Sign-in failed — try again.', tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

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
          <GoogleButton label="Continue with Google" size="md" onPress={enter(auth.signInWithGoogle, setGoogleBusy)} loading={googleBusy} disabled={googleBusy} />
          <AppleButton label="Continue with Apple" size="md" onPress={enter(auth.signInWithApple, setAppleBusy)} loading={appleBusy} disabled={appleBusy} />
          <Pressable onPress={() => auth.signInDemo().then(() => close())} accessibilityRole="button" accessibilityLabel="Explore the demo" hitSlop={10} style={styles.demoLink}>
            <Ionicons name="sparkles" size={13} color={colors.textSecondary} />
            <Text variant="bodySmall" tone="secondary">Just exploring? Open the demo</Text>
          </Pressable>
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
  demoLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
});
