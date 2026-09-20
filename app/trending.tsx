import React, { useMemo, useState } from 'react';
import { FlatList } from 'react-native';
import { DramaListRow } from '../components/drama/DramaCard';
import { PostCard } from '../components/feed/PostCard';
import { Screen, useListPadding } from '../components/ui/Screen';
import { Segmented } from '../components/ui/Segmented';
import { Text } from '../components/ui/Text';
import { TopBar } from '../components/ui/TopBar';
import { compact } from '../lib/format';
import { useApp } from '../lib/hooks';
import { trendingDiscussions, trendingDramas } from '../lib/selectors';

/** Trending — dramas and conversations with momentum right now. */
export default function Trending() {
  const { state } = useApp();
  const padding = useListPadding(false);
  const [tab, setTab] = useState<'dramas' | 'posts'>('posts');
  const dramas = useMemo(() => trendingDramas(state, 20), [state]);
  const posts = useMemo(() => trendingDiscussions(state, 30), [state]);
  return (
    <Screen header={<TopBar mode="stack" title="Trending" />}>
      <Segmented items={[{ key: 'posts', label: 'Conversations' }, { key: 'dramas', label: 'Dramas' }]} value={tab} onChange={setTab} />
      {tab === 'dramas' ? (
        <FlatList data={dramas} keyExtractor={(d) => d.id} contentContainerStyle={padding} renderItem={({ item, index }) => <DramaListRow drama={item} subtitle={`${compact(item.followerCount)} fans · ${item.status === 'airing' ? 'Airing' : item.year}`} right={<Text variant="titleSmall" tone="tertiary" numeric>{index + 1}</Text>} />} />
      ) : (
        <FlatList data={posts} keyExtractor={(p) => p.id} contentContainerStyle={padding} renderItem={({ item }) => <PostCard post={item} />} />
      )}
    </Screen>
  );
}
