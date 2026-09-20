import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, space } from '../../constants/theme';
import { haptic, useApp } from '../../lib/hooks';
import { Drama, Episode, WatchlistItem } from '../../lib/model';
import { postsForEpisode } from '../../lib/selectors';
import { Poster } from '../ui/Poster';
import { ProgressBar } from '../ui/Section';
import { SectionHeader } from '../ui/Section';
import { Tap } from '../ui/Tap';
import { Text } from '../ui/Text';
import { useToast } from '../ui/Toast';

export interface UpNextItem {
  item: WatchlistItem;
  drama: Drama;
  episode: Episode;
}

/**
 * "Keep watching": the next available episode of everything you're mid-way through. One tap opens
 * the room; the check marks it watched without leaving Home — the Track loop, surfaced where you
 * start your day rather than buried in the Watchlist.
 */
export function UpNextRail({ items, onSeeAll }: { items: UpNextItem[]; onSeeAll?: () => void }) {
  const router = useRouter();
  const { state, dispatch } = useApp();
  const toast = useToast();
  if (!items.length) return null;
  return (
    <View style={{ marginBottom: space.section }}>
      <SectionHeader eyebrow="Keep watching" title="Up next" onAction={onSeeAll} actionLabel="Watchlist" />
      <FlatList
        horizontal
        data={items}
        keyExtractor={(x) => x.episode.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.margin, gap: space.gutter }}
        renderItem={({ item: { item, drama, episode } }) => {
          const total = drama.seasons.find((s) => s.number === episode.season)?.episodeCount ?? drama.episodeCount;
          const multi = drama.seasons.length > 1;
          const talking = postsForEpisode(state, drama.id, episode.season, episode.number).length;
          const markWatched = () => {
            haptic.success();
            dispatch({ type: 'progress', dramaId: drama.id, season: episode.season, episode: episode.number, total });
            toast.show({
              message: episode.number >= total ? `${drama.title} completed 🎉` : `Episode ${episode.number} marked watched`,
              tone: 'success',
              icon: 'checkmark-circle',
              actionLabel: 'Undo',
              onAction: () => dispatch({ type: 'progress', dramaId: drama.id, season: episode.season, episode: episode.number - 1, total }),
            });
          };
          return (
            <Tap
              onPress={() => router.push(`/episode/${drama.id}/${episode.season}/${episode.number}`)}
              accessibilityRole="button"
              accessibilityLabel={`${drama.title}, up next ${multi ? `season ${episode.season} ` : ''}episode ${episode.number} of ${total}`}
              style={styles.card}
            >
              <Poster drama={drama} width={56} />
              <View style={{ flex: 1, justifyContent: 'space-between' }}>
                <View>
                  <Text variant="titleSmall" numberOfLines={1}>
                    {drama.title}
                  </Text>
                  <Text variant="caption" tone="secondary" numberOfLines={1}>
                    {multi ? `S${episode.season} · ` : ''}Episode {episode.number} of {total}
                    {episode.title ? ` · ${episode.title}` : ''}
                  </Text>
                </View>
                <View>
                  <Text variant="caption" tone="tertiary" numberOfLines={1} style={{ marginBottom: 6 }}>
                    {talking ? `${talking} talking in the room` : 'Open the room'}
                  </Text>
                  <ProgressBar value={item.currentEpisode} max={total} />
                </View>
              </View>
              <Pressable
                onPress={markWatched}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`Mark episode ${episode.number} watched`}
                style={({ pressed }) => [styles.check, pressed ? { backgroundColor: colors.surface3 } : null]}
              >
                <Ionicons name="checkmark" size={18} color={colors.textPrimary} />
              </Pressable>
            </Tap>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 300, flexDirection: 'row', gap: space.x3, padding: space.x3, backgroundColor: colors.surface1, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  check: { alignSelf: 'center', width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
});
