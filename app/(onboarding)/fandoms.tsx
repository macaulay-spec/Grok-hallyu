import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { OnboardingFrame } from '../../components/onboarding/OnboardingFrame';
import { Text } from '../../components/ui/Text';
import { colors, radius, space } from '../../constants/theme';
import { FANDOMS } from '../../lib/fandoms';
import { haptic } from '../../lib/hooks';
import { FandomId } from '../../lib/model';
import { useStore } from '../../lib/store';

/**
 * Step 1 — the worlds you belong to.
 *
 * This is the question Hallyu is built on: you are not choosing an app, you are choosing fandoms,
 * and you may choose all four. The answer seeds personalisation (it lifts your worlds in the feed)
 * and it is the identity printed on your profile — never a filter that hides the rest of Hallyu.
 */
export default function FandomsStep() {
  const router = useRouter();
  const { dispatch } = useStore();
  const [picked, setPicked] = useState<FandomId[]>([]);

  const toggle = (id: FandomId) => {
    haptic.select();
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  return (
    <OnboardingFrame
      step={1}
      eyebrow="Where fandoms meet"
      title="What are you into?"
      subtitle="Pick as many as you like. Hallyu is one community with four worlds inside it — you can love all of them, and you can discover something new later."
      skippable={false}
      continueLabel={picked.length ? `Continue with ${picked.length} world${picked.length === 1 ? '' : 's'}` : 'Pick at least one'}
      continueDisabled={!picked.length}
      helper={picked.length ? 'Your worlds lead your feed. Everything else is still one tap away.' : 'Nothing is hidden if you pick one — it just means we lead with it.'}
      onContinue={() => {
        dispatch({ type: 'profile', patch: { fandoms: picked } });
        dispatch({ type: 'onboarding', patch: { fandoms: picked, step: 1 } });
        router.push('/(onboarding)/genres');
      }}
    >
      <View style={{ gap: space.x3 }}>
        {FANDOMS.map((f) => {
          const on = picked.includes(f.id);
          return (
            <Pressable
              key={f.id}
              onPress={() => toggle(f.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${f.label}. ${f.tagline}`}
              style={[styles.tile, on ? { borderColor: colors.accent, backgroundColor: colors.accentSoft } : null]}
            >
              <Text variant="display" accessibilityElementsHidden>
                {f.flag}
              </Text>
              <View style={{ flex: 1 }}>
                <Text variant="title" style={on ? { color: colors.accentText } : undefined}>
                  {f.label}
                </Text>
                <Text variant="caption" tone="secondary" style={{ marginTop: 2 }}>
                  {f.tagline}
                </Text>
                <Text variant="overline" tone="tertiary" style={{ marginTop: space.x2 }}>
                  {f.home} · {f.hints.slice(0, 3).join(' · ')}
                </Text>
              </View>
              <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? colors.accent : colors.textTertiary} />
            </Pressable>
          );
        })}
      </View>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  tile: { flexDirection: 'row', alignItems: 'flex-start', gap: space.x3, padding: space.x4, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surface1 },
});
