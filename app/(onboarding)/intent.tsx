import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { OnboardingFrame } from '../../components/onboarding/OnboardingFrame';
import { Text } from '../../components/ui/Text';
import { colors, radius, space } from '../../constants/theme';
import { haptic } from '../../lib/hooks';
import { Intent, useStore } from '../../lib/store';

const OPTIONS: { key: Intent; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'discuss', label: 'Discuss episodes', icon: 'chatbubbles-outline' },
  { key: 'track', label: 'Track what I watch', icon: 'checkmark-done-outline' },
  { key: 'discover', label: 'Discover new dramas', icon: 'compass-outline' },
  { key: 'reactions', label: 'Share reactions', icon: 'flash-outline' },
  { key: 'people', label: 'Follow people', icon: 'people-outline' },
  { key: 'actors', label: 'Follow actors', icon: 'star-outline' },
];

/** Step 1 — intent. One choice shapes the first Home. */
export default function IntentStep() {
  const router = useRouter();
  const { state, dispatch } = useStore();
  const [value, setValue] = useState<Intent | undefined>(state.onboarding.intent);
  return (
    <OnboardingFrame step={1} eyebrow="Your dramas. Your people. Your world." title="What brings you to Hallyu?" subtitle="We’ll shape your first Home around it. You can do all of these, of course." continueDisabled={!value} onContinue={() => { dispatch({ type: 'onboarding', patch: { intent: value, step: 1 } }); router.push('/(onboarding)/genres'); }}>
      <View style={styles.grid}>
        {OPTIONS.map((o) => {
          const on = value === o.key;
          return (
            <Pressable key={o.key} onPress={() => { haptic.select(); setValue(o.key); }} style={[styles.tile, on ? styles.tileOn : null]} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={o.label}>
              <Ionicons name={o.icon} size={24} color={on ? colors.accentText : colors.textPrimary} />
              <Text variant="titleSmall" style={{ color: on ? colors.accentText : colors.textPrimary }}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.x3 },
  tile: { width: '47%', flexGrow: 1, minHeight: 104, backgroundColor: colors.surface1, borderRadius: radius.lg, padding: space.x4, gap: space.x3, justifyContent: 'flex-end', borderWidth: 1, borderColor: 'transparent' },
  tileOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
});
