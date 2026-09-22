import React, { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { DramaListRow } from '../components/drama/DramaCard';
import { PostCard } from '../components/feed/PostCard';
import { Screen, useListPadding } from '../components/ui/Screen';
import { Segmented } from '../components/ui/Segmented';
import { ListSkeleton } from '../components/ui/Skeleton';
import { ErrorState, classifyError } from '../components/ui/States';
import { Text } from '../components/ui/Text';
import { TopBar } from '../components/ui/TopBar';
import { space } from '../constants/theme';
import { catalog } from '../lib/catalog';
import { adoptDramas } from '../lib/catalogSync';
import { useApp, useLoad } from '../lib/hooks';
import { Drama } from '../lib/model';
import { trendingDiscussions, trendingDramas } from '../lib/selectors';
import { useRemote } from '../lib/data/sync';

/** Trending — dramas with momentum this week (live from TMDB) and the conversations around them. */
export default function Trending() {
  const { state } = useApp();
  useRemote('trending');
  const padding = useListPadding(false);
  const [tab, setTab] = useState<'dramas' | 'posts'>('dramas');
  const live = useLoad<Drama[]>(async (signal) => adoptDramas(await catalog.trending(signal)), [], catalog.available);
  const saved = useMemo(() => trendingDramas(state, 20), [state]);
  const dramas = live.data?.length ? live.data : live.error ? saved : [];
  const posts = useMemo(() => trendingDiscussions(state, 30), [state]);
  return (
    <Screen header={<TopBar mode="stack" title="Trending" subtitle={tab === 'dramas' ? (live.data ? 'This week on TMDB' : undefined) : undefined} />}>
      <Segmented
        items={[
          { key: 'dramas', label: 'Dramas' },
          { key: 'posts', label: 'Conversations' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'dramas' ? (
        live.loading && !dramas.length ? (
          <ListSkeleton rows={8} />
        ) : (
          <FlatList
            data={dramas}
            keyExtractor={(d) => d.id}
            contentContainerStyle={padding}
            ListHeaderComponent={
              live.error && !live.data ? (
                <Text variant="caption" tone="tertiary" style={{ paddingHorizontal: space.margin, paddingVertical: space.x2 }}>
                  Couldn’t reach the catalog — showing what’s saved on this device.
                </Text>
              ) : null
            }
            ListEmptyComponent={
              <View style={{ paddingTop: space.x6 }}>
                <ErrorState kind={classifyError(live.error)} onRetry={live.reload} />
              </View>
            }
            renderItem={({ item, index }) => (
              <DramaListRow
                drama={item}
                subtitle={[item.rating ? `★ ${item.rating.toFixed(1)}` : null, item.status === 'airing' ? 'Airing' : String(item.year), item.network ?? null].filter(Boolean).join(' · ')}
                right={
                  <Text variant="titleSmall" tone="tertiary" numeric>
                    {index + 1}
                  </Text>
                }
              />
            )}
          />
        )
      ) : (
        <FlatList data={posts} keyExtractor={(p) => p.id} contentContainerStyle={padding} renderItem={({ item }) => <PostCard post={item} />} />
      )}
    </Screen>
  );
}
