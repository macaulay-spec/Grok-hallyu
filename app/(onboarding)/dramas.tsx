import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { DramaCard } from '../../components/drama/DramaCard';
import { OnboardingFrame } from '../../components/onboarding/OnboardingFrame';
import { Chip, ChipRow } from '../../components/ui/Chip';
import { SearchField } from '../../components/search/SearchField';
import { Text } from '../../components/ui/Text';
import { sizes, space } from '../../constants/theme';
import { haptic, useLayout } from '../../lib/hooks';
import { WatchStatus } from '../../lib/model';
import { allDramas, useStore } from '../../lib/store';

/** Step 3 — the dramas you know. Each pick asks a one-tap status so the spoiler system works from minute one. */
export default function DramasStep() {
  const router = useRouter();
  const { state, dispatch } = useStore();
  const { width, margin } = useLayout();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Record<string, WatchStatus>>(Object.fromEntries(Object.values(state.watchlist).map((w) => [w.dramaId, w.status])));
  const [pending, setPending] = useState<string | null>(null);
  const genres = new Set(state.onboarding.genres);
  const list = useMemo(() => {
    const base = [...allDramas(state)].sort((a, b) => Number(b.genres.some((g) => genres.has(g))) - Number(a.genres.some((g) => genres.has(g))) || b.followerCount - a.followerCount);
    return q ? base.filter((d) => d.title.toLowerCase().includes(q.toLowerCase()) || d.originalTitle?.includes(q)) : base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, state.onboarding.genres, state.importedDramas]);
  const cols = Math.max(3, Math.floor((width - margin * 2 + space.gutter) / (sizes.poster.m + space.gutter)));
  const count = Object.keys(picked).length;

  const choose = (id: string, status: WatchStatus) => {
    haptic.select();
    setPicked((p) => ({ ...p, [id]: status }));
    dispatch({ type: 'watch', dramaId: id, status });
    // Watching a drama means you want its room: follow it so Following and Activity have a pulse from day one.
    if (status === 'watching') dispatch({ type: 'follow', kind: 'dramas', id, on: true });
    setPending(null);
  };

  return (
    <OnboardingFrame
      step={2}
      title="Which of these have you watched?"
      subtitle="Tap a poster, then say where you are. That’s how we keep spoilers away from you."
      skippable={false}
      helper={count ? `${count} added to your watchlist · anything you’re watching is followed too` : 'Pick a few — or none, that’s fine'}
      onContinue={() => {
        dispatch({ type: 'onboarding', patch: { step: 2 } });
        router.push('/(onboarding)/people');
      }}
      scroll={false}
    >
      <SearchField value={q} onChangeText={setQ} placeholder="Search a title" style={{ marginBottom: space.x3 }} />
      {pending ? (
        <View style={{ marginBottom: space.x3 }}>
          <Text variant="label" style={{ marginBottom: space.x2 }}>
            {allDramas(state).find((d) => d.id === pending)?.title} — where are you?
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
      <FlatList
        data={list}
        key={cols}
        numColumns={cols}
        keyExtractor={(d) => d.id}
        columnWrapperStyle={{ gap: space.gutter }}
        contentContainerStyle={{ gap: space.x4, paddingBottom: space.x6 }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <DramaCard
            drama={item}
            size="m"
            selected={!!picked[item.id]}
            meta={picked[item.id] ? { want: 'Want to watch', watching: 'Watching', completed: 'Completed', dropped: 'Dropped' }[picked[item.id]!] : undefined}
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
    </OnboardingFrame>
  );
}
