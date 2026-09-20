import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { DramaListRow } from '../components/drama/DramaCard';
import { WatchStatusSheet } from '../components/drama/WatchStatus';
import { IconButton } from '../components/ui/IconButton';
import { Screen, useListPadding } from '../components/ui/Screen';
import { ProgressBar } from '../components/ui/Section';
import { Segmented } from '../components/ui/Segmented';
import { EmptyState } from '../components/ui/States';
import { Text } from '../components/ui/Text';
import { useToast } from '../components/ui/Toast';
import { TopBar } from '../components/ui/TopBar';
import { colors, radius, space } from '../constants/theme';
import { countdown, dayLabel } from '../lib/format';
import { haptic, useApp } from '../lib/hooks';
import { Drama, WatchStatus } from '../lib/model';
import { upNext, watchlistByStatus } from '../lib/selectors';

type Sort = 'recent' | 'title' | 'progress';

/** Watchlist — four shelves, episode progress, up-next, private notes. */
export default function Watchlist() {
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ status?: WatchStatus }>();
  const { state, dispatch, getDrama } = useApp();
  const padding = useListPadding(false);
  const [status, setStatus] = useState<WatchStatus>(params.status ?? 'watching');
  const [sort, setSort] = useState<Sort>('recent');
  const [editing, setEditing] = useState<Drama | null>(null);
  const items = useMemo(() => {
    const list = watchlistByStatus(state, status).map((item) => ({ item, drama: getDrama(item.dramaId) })).filter((x) => x.drama);
    if (sort === 'title') list.sort((a, b) => a.drama!.title.localeCompare(b.drama!.title));
    if (sort === 'progress') list.sort((a, b) => b.item.currentEpisode / Math.max(1, b.drama!.episodeCount) - a.item.currentEpisode / Math.max(1, a.drama!.episodeCount));
    return list;
  }, [state, status, sort, getDrama]);
  const next = useMemo(() => upNext(state), [state]);
  const counts = { want: watchlistByStatus(state, 'want').length, watching: watchlistByStatus(state, 'watching').length, completed: watchlistByStatus(state, 'completed').length, dropped: watchlistByStatus(state, 'dropped').length };
  const hours = Math.round(Object.values(state.watchlist).reduce((a, w) => { const d = getDrama(w.dramaId); return a + (w.status === 'completed' ? (d?.episodeCount ?? 0) : w.currentEpisode) * 65; }, 0) / 60);

  const empty: Record<WatchStatus, { title: string; body: string; action?: string; go?: () => void }> = {
    want: { title: 'Nothing queued', body: 'Save dramas you mean to start. We’ll tell you when they air.', action: 'Browse Explore', go: () => router.push('/(tabs)/explore') },
    watching: { title: 'Not watching anything?', body: 'Mark a drama as Watching and track episodes here. Spoiler protection follows your progress.', action: 'Find something airing', go: () => router.push('/schedule') },
    completed: { title: 'No finished dramas yet', body: 'Completed titles unlock ending discussions and reviews.' },
    dropped: { title: 'Nothing dropped', body: 'No shame in it. Dropped titles stop veiling spoilers for you.' },
  };

  return (
    <Screen header={<TopBar mode="stack" title="Watchlist" subtitle={hours ? `≈ ${hours} hours watched` : undefined} right={<IconButton icon="swap-vertical" label={`Sort: ${sort}`} onPress={() => setSort((s) => (s === 'recent' ? 'title' : s === 'title' ? 'progress' : 'recent'))} />} />}>
      <Segmented variant="pill" scrollable items={[{ key: 'watching', label: 'Watching', count: counts.watching }, { key: 'want', label: 'Want to watch', count: counts.want }, { key: 'completed', label: 'Completed', count: counts.completed }, { key: 'dropped', label: 'Dropped', count: counts.dropped }]} value={status} onChange={setStatus} style={{ marginHorizontal: space.margin, marginVertical: space.x3 }} />
      <FlatList
        data={items}
        keyExtractor={(x) => x.item.dramaId}
        contentContainerStyle={padding}
        ListHeaderComponent={
          status === 'watching' && next.length ? (
            <View style={styles.upNext}>
              <Text variant="overline" style={{ marginBottom: space.x2 }}>
                Up next
              </Text>
              {next.slice(0, 3).map(({ drama, episode, airedAgo }) => (
                <Pressable key={episode.id} onPress={() => router.push(`/episode/${drama.id}/${episode.season}/${episode.number}`)} style={styles.upNextRow} accessibilityRole="button" accessibilityLabel={`${drama.title} episode ${episode.number}`}>
                  <Ionicons name={airedAgo ? 'play-circle' : 'time-outline'} size={20} color={airedAgo ? colors.accentText : colors.textTertiary} />
                  <Text variant="bodySmall" style={{ flex: 1 }} numberOfLines={1}>
                    {drama.title} · Ep {episode.number}
                  </Text>
                  <Text variant="caption" tone="secondary">
                    {airedAgo ? 'Ready' : episode.airDate ? `${dayLabel(episode.airDate)} · ${countdown(episode.airDate)}` : 'TBA'}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null
        }
        renderItem={({ item: { item, drama } }) => {
          const total = drama!.seasons.find((s) => s.number === item.season)?.episodeCount ?? drama!.episodeCount;
          return (
            <View>
              <DramaListRow
                drama={drama!}
                subtitle={status === 'watching' ? `Episode ${item.currentEpisode} of ${total}${drama!.seasons.length > 1 ? ` · S${item.season}` : ''}${item.note ? ` · ${item.note}` : ''}` : status === 'completed' ? `Finished ${item.completedAt ? dayLabel(item.completedAt).toLowerCase() : ''}${item.note ? ` · ${item.note}` : ''}` : item.note ?? `${drama!.year} · ${drama!.genres.slice(0, 2).join(', ')}`}
                right={
                  status === 'watching' ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <IconButton icon="remove" label="Previous episode" size={20} disabled={item.currentEpisode <= 0} onPress={() => { haptic.light(); dispatch({ type: 'progress', dramaId: drama!.id, season: item.season, episode: item.currentEpisode - 1, total }); }} />
                      <Text variant="label" numeric style={{ minWidth: 28, textAlign: 'center' }}>
                        {item.currentEpisode}
                      </Text>
                      <IconButton icon="add" label="Next episode" size={20} disabled={item.currentEpisode >= total} onPress={() => { haptic.light(); dispatch({ type: 'progress', dramaId: drama!.id, season: item.season, episode: item.currentEpisode + 1, total }); if (item.currentEpisode + 1 >= total) toast.show({ message: `${drama!.title} completed 🎉`, tone: 'success' }); }} />
                    </View>
                  ) : (
                    <IconButton icon="ellipsis-horizontal" label="Change status" onPress={() => setEditing(drama!)} />
                  )
                }
                onPress={() => router.push(`/drama/${drama!.id}`)}
                onLongPress={() => {
                  haptic.medium();
                  setEditing(drama!);
                }}
                accessibilityHint="Double tap to open. Double tap and hold to change status or add a note."
              />
              {status === 'watching' ? <ProgressBar value={item.currentEpisode} max={total} style={{ marginHorizontal: space.margin, marginTop: -4, marginBottom: space.x2 }} /> : null}
            </View>
          );
        }}
        ListEmptyComponent={<EmptyState compact icon={status === 'completed' ? 'checkmark-done-outline' : status === 'dropped' ? 'close-circle-outline' : 'tv-outline'} title={empty[status].title} body={empty[status].body} actionLabel={empty[status].action} onAction={empty[status].go} />}
        ListFooterComponent={
          items.length ? (
            <Text variant="caption" tone="tertiary" align="center" style={{ marginTop: space.x4, paddingHorizontal: space.margin }}>
              Hold a title to change its shelf or add a private note.
            </Text>
          ) : null
        }
      />
      {editing ? <WatchStatusSheet drama={editing} visible onClose={() => setEditing(null)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  upNext: { marginHorizontal: space.margin, marginBottom: space.x3, padding: space.x3, backgroundColor: colors.surface1, borderRadius: radius.md },
  upNextRow: { flexDirection: 'row', alignItems: 'center', gap: space.x2, height: 40 },
});
