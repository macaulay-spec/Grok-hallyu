import { useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { DramaListRow } from '../../components/drama/DramaCard';
import { FollowButton } from '../../components/drama/FollowButton';
import { OnboardingFrame } from '../../components/onboarding/OnboardingFrame';
import { UserRow } from '../../components/people/UserRow';
import { Text } from '../../components/ui/Text';
import { space } from '../../constants/theme';
import { useApp } from '../../lib/hooks';
import { recommendedDramas, recommendedPeople, trendingDramas } from '../../lib/selectors';

/** Step 4 — people and fandoms to follow. Pre-selected suggestions, each undoable. */
export default function PeopleStep() {
  const router = useRouter();
  const { state, dispatch } = useApp();
  const people = recommendedPeople(state, 5);
  const dramas = [...trendingDramas(state, 4), ...recommendedDramas(state, 4).map((r) => r.drama)].filter((d, i, a) => a.findIndex((x) => x.id === d.id) === i).slice(0, 6);
  const followed = state.follows.users.length + state.follows.dramas.length;
  return (
    <OnboardingFrame step={3} title="Your people. Your fandoms." subtitle="Follow a few members and dramas so Following has a pulse from day one." helper={followed ? `Following ${followed}` : 'Follow at least one to fill your Following feed'} onContinue={() => { dispatch({ type: 'onboarding', patch: { step: 3 } }); router.push('/(onboarding)/notifications'); }}>
      <Text variant="overline" style={{ marginBottom: space.x2 }}>
        Members with your taste
      </Text>
      <View>
        {people.map((p) => (
          <UserRow key={p.user.id} user={p.user} reason={p.reason} />
        ))}
      </View>
      <Text variant="overline" style={{ marginTop: space.x6, marginBottom: space.x2 }}>
        Fandoms worth joining
      </Text>
      {dramas.map((d) => (
        <DramaListRow key={d.id} drama={d} subtitle={`${d.status === 'airing' ? 'Airing now · ' : ''}${d.genres.slice(0, 2).join(', ')}`} right={<FollowButton kind="dramas" id={d.id} name={d.title} />} />
      ))}
    </OnboardingFrame>
  );
}
