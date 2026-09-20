import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { OnboardingFrame } from '../../components/onboarding/OnboardingFrame';
import { Chip, ChipRow } from '../../components/ui/Chip';
import { GENRES } from '../../lib/model';
import { useStore } from '../../lib/store';

/** Step 2 — genres (pick ≥ 3). */
export default function GenresStep() {
  const router = useRouter();
  const { state, dispatch } = useStore();
  const [picked, setPicked] = useState<string[]>(state.onboarding.genres);
  const toggle = (g: string) => setPicked((p) => (p.includes(g) ? p.filter((x) => x !== g) : [...p, g]));
  return (
    <OnboardingFrame step={1} eyebrow="Your dramas. Your people. Your world." title="What do you love watching?" subtitle="Pick at least three. This seeds your recommendations — it never limits what you can see." helper={picked.length < 3 ? `Pick ${3 - picked.length} more` : `${picked.length} picked`} continueDisabled={picked.length < 3} onContinue={() => { dispatch({ type: 'onboarding', patch: { genres: picked, step: 1 } }); dispatch({ type: 'profile', patch: { favoriteGenres: picked } }); router.push('/(onboarding)/dramas'); }}>
      <ChipRow>
        {GENRES.map((g) => (
          <Chip key={g} label={g} selected={picked.includes(g)} onPress={() => toggle(g)} />
        ))}
      </ChipRow>
    </OnboardingFrame>
  );
}
