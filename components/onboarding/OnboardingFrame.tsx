import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space } from '../../constants/theme';
import { useLayout } from '../../lib/hooks';
import { useStore } from '../../lib/store';
import { Button } from '../ui/Button';
import { ScrollScreen, Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { TopBar } from '../ui/TopBar';

interface FrameProps {
  step: 1 | 2 | 3 | 4 | 5;
  title: string;
  subtitle?: string;
  eyebrow?: string;
  children: React.ReactNode;
  onContinue: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  skippable?: boolean;
  onSkip?: () => void;
  helper?: string; // text above the button, e.g. "Pick at least 3"
  scroll?: boolean;
}

const TOTAL = 5;

/** Shared onboarding chassis: back, skip, 5 progress dots, display title, sticky Continue. Each step persists as you go. */
export function OnboardingFrame({ step, title, subtitle, eyebrow, children, onContinue, continueLabel = 'Continue', continueDisabled, skippable = true, onSkip, helper, scroll = true }: FrameProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { dispatch } = useStore();
  const { margin } = useLayout();
  const skipAll = () => {
    dispatch({ type: 'onboarding', patch: { done: true } });
    router.replace('/(tabs)');
  };
  const body = (
    <>
      {eyebrow ? (
        <Text variant="overline" tone="accent" style={{ marginBottom: space.x2 }}>
          {eyebrow}
        </Text>
      ) : null}
      <Text variant="display" accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? (
        <Text variant="body" tone="secondary" style={{ marginTop: space.x2 }}>
          {subtitle}
        </Text>
      ) : null}
      <View style={{ marginTop: space.x6, flex: 1 }}>{children}</View>
    </>
  );
  return (
    <Screen
      offlineBanner={false}
      header={
        <TopBar
          mode={step === 1 ? 'root' : 'stack'}
          center={
            <View style={styles.dots} accessibilityLabel={`Step ${step} of ${TOTAL}`}>
              {Array.from({ length: TOTAL }).map((_, i) => (
                <View key={i} style={[styles.dot, i + 1 === step ? styles.dotOn : i + 1 < step ? styles.dotDone : null]} />
              ))}
            </View>
          }
          right={skippable ? <Button label="Skip" variant="ghost" size="sm" onPress={onSkip ?? skipAll} /> : null}
        />
      }
    >
      {scroll ? (
        <ScrollScreen contentContainerStyle={{ paddingHorizontal: margin, paddingBottom: space.x4 }} column>
          {body}
        </ScrollScreen>
      ) : (
        <View style={{ flex: 1, paddingHorizontal: margin, maxWidth: 640, width: '100%', alignSelf: 'center' }}>{body}</View>
      )}
      <View style={[styles.footer, { paddingBottom: insets.bottom + space.x4, paddingHorizontal: margin }]}>
        {helper ? (
          <Text variant="caption" tone="secondary" align="center" style={{ marginBottom: space.x2 }}>
            {helper}
          </Text>
        ) : null}
        <Button label={continueLabel} size="lg" block onPress={onContinue} disabled={continueDisabled} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', gap: 6, flex: 1, justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.surface3 },
  dotOn: { backgroundColor: colors.accent, width: 18 },
  dotDone: { backgroundColor: colors.borderStrong },
  footer: { paddingTop: space.x3, backgroundColor: colors.canvas, borderTopWidth: 1, borderTopColor: colors.borderSubtle, maxWidth: 640, width: '100%', alignSelf: 'center' },
});
