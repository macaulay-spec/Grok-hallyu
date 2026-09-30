import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { SectionList, View } from 'react-native';
import { EpisodeCard } from '../components/drama/EpisodeCard';
import { Chip, ChipRow } from '../components/ui/Chip';
import { Screen, useListPadding } from '../components/ui/Screen';
import { Segmented } from '../components/ui/Segmented';
import { EmptyState } from '../components/ui/States';
import { Text } from '../components/ui/Text';
import { TopBar } from '../components/ui/TopBar';
import { colors, space } from '../constants/theme';
import { FANDOMS, formatFandomOf } from '../lib/fandoms';
import { dayLabel } from '../lib/format';
import { useApp } from '../lib/hooks';
import { Drama, Episode, FandomId } from '../lib/model';
import { postsForEpisode, scheduleByDay } from '../lib/selectors';

type Scope = 'mine' | 'all';

/** "Today · Sat, 20 Sep" — relative word first, the date so you can plan the week. */
function dayTitle(day: string): { label: string; date: string } {
  const d = new Date(day);
  const label = dayLabel(d.toISOString());
  const date = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return { label, date: label === date ? '' : date };
}

/**
 * Airing schedule — the next seven days grouped by day. "Mine" is what you follow or track; "All"
 * is the full grid across K-Drama, C-Drama, Anime & Hollywood.
 */
export default function Schedule() {
  const router = useRouter();
  const params = useLocalSearchParams<{ scope?: Scope; world?: FandomId | 'all' }>();
  const { state } = useApp();
  const padding = useListPadding(false);
  const mineIds = useMemo(
    () =>
      new Set([
        ...state.follows.dramas,
        ...Object.values(state.watchlist)
          .filter((w) => w && (w.status === 'watching' || w.status === 'want'))
          .map((w) => w!.dramaId),
      ]),
    [state.follows.dramas, state.watchlist],
  );
  const [scope, setScope] = useState<Scope>(params.scope ?? (mineIds.size ? 'mine' : 'all'));
  const [worldFilter, setWorldFilter] = useState<FandomId | 'all'>((params.world as FandomId | 'all') ?? 'all');
  const all = useMemo(() => scheduleByDay(state, 7), [state]);
  const filteredDays = useMemo(
    () =>
      all.map((d) => ({
        ...d,
        items: worldFilter === 'all' ? d.items : d.items.filter((it) => formatFandomOf(it.drama) === worldFilter),
      })),
    [all, worldFilter],
  );
  const sections = useMemo(
    () => filteredDays.map((d) => ({ ...dayTitle(d.day), key: d.day, data: scope === 'all' ? d.items : d.items.filter((it) => mineIds.has(it.drama.id)) })).filter((s) => s.data.length),
    [filteredDays, scope, mineIds],
  );
  const total = sections.reduce((n, s) => n + s.data.length, 0);

  return (
    <Screen header={<TopBar mode="stack" title="This week" subtitle="Broadcast times across your worlds, in local time" />}>
      <Segmented
        variant="pill"
        items={[
          { key: 'mine', label: 'Mine', count: filteredDays.reduce((n, d) => n + d.items.filter((it) => mineIds.has(it.drama.id)).length, 0) || undefined },
          { key: 'all', label: 'Everything', count: filteredDays.reduce((n, d) => n + d.items.length, 0) || undefined },
        ]}
        value={scope}
        onChange={(k) => setScope(k as Scope)}
        style={{ marginHorizontal: space.margin, marginBottom: space.x2 }}
      />
      <ChipRow style={{ paddingHorizontal: space.margin, marginBottom: space.x2 }}>
        <Chip label="All worlds" selected={worldFilter === 'all'} onPress={() => setWorldFilter('all')} />
        {FANDOMS.map((w) => (
          <Chip key={w.id} label={`${w.flag} ${w.short}`} selected={worldFilter === w.id} onPress={() => setWorldFilter(w.id)} />
        ))}
      </ChipRow>
      <SectionList<{ drama: Drama; episode: Episode }, { label: string; date: string; key: string }>
        sections={sections}
        keyExtractor={(x) => x.episode.id}
        contentContainerStyle={[padding, total ? null : { flex: 1 }]}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.x2, paddingHorizontal: space.margin, paddingTop: space.x5, paddingBottom: space.x2, backgroundColor: colors.canvas }}>
            <Text variant="titleSmall" tone={section.label === 'Today' ? 'accent' : 'primary'}>
              {section.label}
            </Text>
            {section.date ? (
              <Text variant="caption" tone="tertiary">
                {section.date}
              </Text>
            ) : null}
            <Text variant="caption" tone="tertiary" style={{ marginLeft: 'auto' }}>
              {section.data.length} {section.data.length === 1 ? 'episode' : 'episodes'}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <EpisodeCard drama={item.drama} episode={item.episode} showDrama postCount={postsForEpisode(state, item.drama.id, item.episode.season, item.episode.number).length} />
        )}
        ListEmptyComponent={
          scope === 'mine' ? (
            <EmptyState
              icon="calendar-outline"
              title="Nothing of yours airs this week"
              body="Follow an airing drama or mark one as Watching and its episodes land here with reminders."
              actionLabel="See everything airing"
              onAction={() => setScope('all')}
            />
          ) : (
            <EmptyState
              icon="calendar-outline"
              title="Nothing scheduled"
              body="No episodes in the next seven days from the catalog. Check back on Monday."
              actionLabel="Explore dramas"
              onAction={() => router.push('/(tabs)/explore')}
            />
          )
        }
      />
    </Screen>
  );
}
