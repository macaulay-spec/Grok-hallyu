import { useRouter } from 'expo-router';
import React from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { colors, radius, space } from '../../constants/theme';
import { countdown, dayLabel, timeOfDay } from '../../lib/format';
import { useApp } from '../../lib/hooks';
import { Drama, Episode } from '../../lib/model';
import { postsForEpisode } from '../../lib/selectors';
import { hasWatched } from '../../lib/spoiler';
import { episodeState } from '../drama/EpisodeCard';
import { Poster } from '../ui/Poster';
import { SectionHeader } from '../ui/Section';
import { Tap } from '../ui/Tap';
import { Text } from '../ui/Text';

/** "Tonight / This week": episodes airing around now for followed + airing dramas. Live ones lead. */
export function TonightRail({ items, title = 'Tonight', eyebrow = 'On air', onSeeAll }: { items: { drama: Drama; episode: Episode }[]; title?: string; eyebrow?: string; onSeeAll?: () => void }) {
  const router = useRouter();
  const { state, watch } = useApp();
  if (!items.length) return null;
  return (
    <View style={{ marginBottom: space.section }}>
      <SectionHeader eyebrow={eyebrow} title={title} live onAction={onSeeAll} actionLabel="Schedule" />
      <FlatList
        horizontal
        data={items}
        keyExtractor={(i) => i.episode.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.margin, gap: space.gutter }}
        renderItem={({ item: { drama, episode } }) => {
          const st = episodeState(episode);
          const watched = hasWatched(watch(drama.id), episode.season, episode.number);
          const count = postsForEpisode(state, drama.id, episode.season, episode.number).length;
          const when = st === 'upcoming' ? `${dayLabel(episode.airDate!)} · ${timeOfDay(episode.airDate!)} · ${countdown(episode.airDate!)}` : st === 'live' ? 'Just aired · room is live' : `Aired ${dayLabel(episode.airDate!).toLowerCase()}`;
          return (
            <Tap onPress={() => router.push(`/episode/${drama.id}/${episode.season}/${episode.number}`)} accessibilityRole="button" accessibilityLabel={`${drama.title} episode ${episode.number}, ${when}`} style={styles.card}>
              <Poster drama={drama} width={64} />
              <View style={{ flex: 1, justifyContent: 'space-between' }}>
                <View>
                  <View style={styles.top}>
                    {st === 'live' ? <View style={styles.live} /> : null}
                    <Text variant="overline" tone={st === 'live' ? 'accent' : 'secondary'}>
                      {st === 'live' ? 'Live now' : st === 'upcoming' ? 'Coming up' : 'Aired'}
                    </Text>
                  </View>
                  <Text variant="titleSmall" numberOfLines={1}>
                    {drama.title}
                  </Text>
                  <Text variant="caption" tone="secondary" numberOfLines={1}>
                    {drama.seasons.length > 1 ? `S${episode.season} · ` : ''}Episode {episode.number}
                    {episode.title ? ` · ${episode.title}` : ''}
                  </Text>
                </View>
                <Text variant="caption" tone={watched ? 'success' : 'tertiary'} numberOfLines={1}>
                  {watched ? 'Watched · ' : ''}
                  {count ? `${count} talking` : when}
                </Text>
              </View>
            </Tap>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 280, flexDirection: 'row', gap: space.x3, padding: space.x3, backgroundColor: colors.surface1, borderRadius: radius.lg },
  top: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  live: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.live },
});
