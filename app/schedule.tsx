import React, { useMemo } from 'react';
import { SectionList, View } from 'react-native';
import { EpisodeCard } from '../components/drama/EpisodeCard';
import { Screen, useListPadding } from '../components/ui/Screen';
import { EmptyState } from '../components/ui/States';
import { Text } from '../components/ui/Text';
import { TopBar } from '../components/ui/TopBar';
import { space } from '../constants/theme';
import { useApp } from '../lib/hooks';
import { postsForEpisode, scheduleByDay } from '../lib/selectors';

/** Airing schedule — next 7 days grouped by day, followed dramas marked. */
export default function Schedule() {
  const { state } = useApp();
  const padding = useListPadding(false);
  const sections = useMemo(() => scheduleByDay(state, 7).map((d) => ({ title: d.day, data: d.items })), [state]);
  return (
    <Screen header={<TopBar mode="stack" title="This week" subtitle="Korean broadcast times shown in your local time" />}>
      <SectionList
        sections={sections}
        keyExtractor={(x) => x.episode.id}
        contentContainerStyle={[padding, sections.length ? null : { flex: 1 }]}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text variant="overline" style={{ paddingHorizontal: space.margin, paddingTop: space.x5, paddingBottom: space.x2 }}>
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => (
          <View>
            <EpisodeCard drama={item.drama} episode={item.episode} showDrama postCount={postsForEpisode(state, item.drama.id, item.episode.season, item.episode.number).length} />
          </View>
        )}
        ListEmptyComponent={<EmptyState icon="calendar-outline" title="Nothing scheduled" body="No episodes in the next seven days from the catalog. Check back on Monday." />}
      />
    </Screen>
  );
}
