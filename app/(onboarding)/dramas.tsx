import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { DramaCard } from '../../components/drama/DramaCard';
import { OnboardingFrame } from '../../components/onboarding/OnboardingFrame';
import { SearchField } from '../../components/search/SearchField';
import { Chip, ChipRow } from '../../components/ui/Chip';
import { Skeleton } from '../../components/ui/Skeleton';
import { InlineNotice } from '../../components/ui/States';
import { Text } from '../../components/ui/Text';
import { sizes, space } from '../../constants/theme';
import { catalog } from '../../lib/catalog';
import { adoptDramas, syncSeedCatalog } from '../../lib/catalogSync';
import { haptic, useDebounced, useLayout, useLoad } from '../../lib/hooks';
import { Drama, WatchStatus } from '../../lib/model';
import { allDramas, useStore } from '../../lib/store';

const STATUS_LABEL: Record<WatchStatus, string> = { want: 'Want to watch', watching: 'Watching', completed: 'Completed', dropped: 'Dropped' };

/**
 * Step 3 — the dramas you know. The grid is the live catalog (what's trending and popular on TMDB
 * right now, plus all-time favourites) so it looks like the real K-drama world, not a demo. Each
 * pick asks a one-tap status so the spoiler system works from minute one.
 */
export default function DramasStep() {
  const router = useRouter();
  const { state, dispatch } = useStore();
  const { width, margin } = useLayout();
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 300);
  const [picked, setPicked] = useState<Record<string, WatchStatus>>(Object.fromEntries(Object.values(state.watchlist).map((w) => [w.dramaId, w.status])));
  const [pending, setPending] = useState<string | null>(null);
  const genres = useMemo(() => new Set(state.onboarding.genres), [state.onboarding.genres]);

  useEffect(() => {
    syncSeedCatalog().catch(() => {});
  }, []);

  // The wall: trending + popular (2 pages) + top rated, de-duplicated and adopted into the store.
  const wall = useLoad<Drama[]>(
    async (signal) => {
      const [trending, p1, p2, top] = await Promise.all([
        catalog.trending(signal).catch(() => [] as Drama[]),
        catalog.popular(1, signal).catch(() => [] as Drama[]),
        catalog.popular(2, signal).catch(() => [] as Drama[]),
        catalog.topRated(1, signal).catch(() => [] as Drama[]),
      ]);
      const merged = [...trending, ...p1, ...top, ...p2];
      if (!merged.length) throw new Error('network');
      return adoptDramas(merged);
    },
    [],
    catalog.available,
  );

  // Search hits the live catalog too — anything a person has watched should be findable.
  const found = useLoad<Drama[]>(async (signal) => adoptDramas(await catalog.searchDramas(dq, signal)), [dq], catalog.available && dq.length >= 2);

  const list = useMemo(() => {
    const live = wall.data ?? [];
    const base = live.length ? live : allDramas(state); // offline / provider unavailable → what's saved locally
    const rank = (d: Drama) => Number(d.genres.some((g) => genres.has(g)));
    const ranked = [...base].sort((a, b) => rank(b) - rank(a));
    if (!dq) return ranked;
    const needle = dq.toLowerCase();
    const local = ranked.filter((d) => d.title.toLowerCase().includes(needle) || d.originalTitle?.includes(dq));
    const remote = found.data ?? [];
    const seen = new Set(local.map((d) => d.id));
    return [...local, ...remote.filter((d) => !seen.has(d.id))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wall.data, found.data, dq, genres, state.importedDramas]);

  const cols = Math.max(3, Math.floor((width - margin * 2 + space.gutter) / (sizes.poster.m + space.gutter)));
  const count = Object.keys(picked).length;
  const pendingDrama = pending ? (list.find((d) => d.id === pending) ?? allDramas(state).find((d) => d.id === pending)) : undefined;

  const choose = (id: string, status: WatchStatus) => {
    haptic.select();
    setPicked((p) => ({ ...p, [id]: status }));
    dispatch({ type: 'watch', dramaId: id, status });
    // Watching a drama means you want its room: follow it so Following and Activity have a pulse from day one.
    if (status === 'watching') dispatch({ type: 'follow', kind: 'dramas', id, on: true });
    setPending(null);
  };

  const showSkeleton = wall.loading && !wall.data && list.length === 0;
  const tileW = (width - margin * 2 - space.gutter * (cols - 1)) / cols;

  return (
    <OnboardingFrame
      step={2}
      title="Which of these have you watched?"
      subtitle="Tap a poster, then say where you are. That’s how we keep spoilers away from you."
      skippable={false}
      helper={count ? `${count} added to your watchlist · anything you’re watching is followed too` : wall.loading && !wall.data ? 'Loading what’s trending…' : 'Pick a few — or none, that’s fine'}
      onContinue={() => {
        dispatch({ type: 'onboarding', patch: { step: 2 } });
        router.push('/(onboarding)/people');
      }}
      scroll={false}
    >
      <SearchField value={q} onChangeText={setQ} placeholder="Search any title" style={{ marginBottom: space.x3 }} />
      {pending && pendingDrama ? (
        <View style={{ marginBottom: space.x3 }}>
          <Text variant="label" style={{ marginBottom: space.x2 }}>
            {pendingDrama.title} — where are you?
          </Text>
          <ChipRow>
            <Chip label="Want to watch" onPress={() => choose(pending, 'want')} />
            <Chip label="Watching" onPress={() => choose(pending, 'watching')} />
            <Chip label="Completed" onPress={() => choose(pending, 'completed')} />
            <Chip label="Dropped" onPress={() => choose(pending, 'dropped')} />
            <Chip label="Cancel" onPress={() => setPending(null)} />
          </ChipRow>
        </View>
      ) : null}
      {wall.error && !wall.data ? (
        <InlineNotice
          tone="warning"
          icon="cloud-offline-outline"
          text="Couldn’t reach the catalog — showing saved titles. Search still works once you’re back online."
          style={{ marginBottom: space.x3 }}
        />
      ) : null}
      {showSkeleton ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.gutter }} accessibilityLabel="Loading dramas">
          {Array.from({ length: cols * 4 }).map((_, i) => (
            <View key={i} style={{ width: tileW, gap: space.x2 }}>
              <Skeleton width={tileW} height={tileW * 1.5} radius={12} />
              <Skeleton width={tileW * 0.8} height={12} />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={list}
          key={cols}
          numColumns={cols}
          keyExtractor={(d) => d.id}
          columnWrapperStyle={{ gap: space.gutter }}
          contentContainerStyle={{ gap: space.x4, paddingBottom: space.x6 }}
          showsVerticalScrollIndicator={false}
          initialNumToRender={cols * 4}
          ListFooterComponent={
            dq && found.loading ? (
              <Text variant="caption" tone="tertiary" align="center">
                Searching the catalog…
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <Text variant="body" tone="secondary" align="center" style={{ paddingVertical: space.x6 }}>
              {dq ? (found.loading ? 'Searching…' : `Nothing called “${dq}” yet.`) : 'No titles to show.'}
            </Text>
          }
          renderItem={({ item }) => (
            <DramaCard
              drama={item}
              size="m"
              selected={!!picked[item.id]}
              meta={picked[item.id] ? STATUS_LABEL[picked[item.id]!] : undefined}
              showProgress={false}
              onPress={() =>
                picked[item.id]
                  ? (setPicked((p) => {
                      const n = { ...p };
                      delete n[item.id];
                      return n;
                    }),
                    dispatch({ type: 'watch', dramaId: item.id, status: null }))
                  : setPending(item.id)
              }
            />
          )}
        />
      )}
    </OnboardingFrame>
  );
}
