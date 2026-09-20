import React, { useMemo } from 'react';
import { FlatList } from 'react-native';
import { UserRow } from '../components/people/UserRow';
import { Screen, useListPadding } from '../components/ui/Screen';
import { EmptyState } from '../components/ui/States';
import { Text } from '../components/ui/Text';
import { TopBar } from '../components/ui/TopBar';
import { space } from '../constants/theme';
import { useApp } from '../lib/hooks';
import { recommendedPeople } from '../lib/selectors';

/** People with your taste — suggestions with reasons. */
export default function People() {
  const { state } = useApp();
  const padding = useListPadding(false);
  const people = useMemo(() => recommendedPeople(state, 30), [state]);
  return (
    <Screen header={<TopBar mode="stack" title="People with your taste" />}>
      <FlatList data={people} keyExtractor={(p) => p.user.id} contentContainerStyle={padding} ListHeaderComponent={<Text variant="bodySmall" tone="secondary" style={{ paddingHorizontal: space.margin, paddingVertical: space.x3 }}>Matched on the dramas you’ve tracked and the genres you picked. Following is reversible and never announced.</Text>} renderItem={({ item }) => <UserRow user={item.user} reason={item.reason} />} ListEmptyComponent={<EmptyState icon="people-outline" title="No suggestions yet" body="Track a few dramas and we’ll find people who love the same ones." />} />
    </Screen>
  );
}
