import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { DramaListRow } from '../../components/drama/DramaCard';
import { SearchField } from '../../components/search/SearchField';
import { Button } from '../../components/ui/Button';
import { Screen, useListPadding } from '../../components/ui/Screen';
import { ErrorState } from '../../components/ui/States';
import { TopBar } from '../../components/ui/TopBar';
import { colors, space } from '../../constants/theme';
import { haptic, useApp } from '../../lib/hooks';
import { allDramas } from '../../lib/store';

/** Add dramas to a collection — watchlist first, then everything, multi-toggle. */
export default function AddToCollection() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch, getCollection } = useApp();
  const padding = useListPadding(false);
  const [q, setQ] = useState('');
  const col = getCollection(id);
  const list = useMemo(() => {
    const mine = new Set(Object.keys(state.watchlist));
    const all = [...allDramas(state)].sort((a, b) => Number(mine.has(b.id)) - Number(mine.has(a.id)) || b.followerCount - a.followerCount);
    const n = q.trim().toLowerCase();
    return n ? all.filter((d) => d.title.toLowerCase().includes(n) || d.originalTitle?.includes(q)) : all;
  }, [state, q]);
  if (!col || col.ownerId !== state.profile.id) {
    return (
      <Screen header={<TopBar mode="stack" title="Add dramas" />}>
        <ErrorState kind="forbidden" title="Not your collection" onRetry={() => router.back()} />
      </Screen>
    );
  }
  const has = (d: string) => col.items.some((i) => i.dramaId === d);
  return (
    <Screen header={<TopBar mode="stack" title="Add dramas" subtitle={`${col.items.length} in ${col.title}`} right={<Button label="Done" size="sm" onPress={() => router.back()} />} />}>
      <View style={{ paddingHorizontal: space.margin, paddingVertical: space.x3 }}>
        <SearchField value={q} onChangeText={setQ} placeholder="Search titles" autoFocus />
      </View>
      <FlatList
        data={list}
        keyExtractor={(d) => d.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={padding}
        renderItem={({ item: d }) => (
          <DramaListRow
            drama={d}
            onPress={() => { haptic.select(); dispatch({ type: 'collectionItem', collectionId: col.id, dramaId: d.id, on: !has(d.id) }); }}
            subtitle={state.watchlist[d.id] ? `${{ want: 'Want to watch', watching: 'Watching', completed: 'Completed', dropped: 'Dropped' }[state.watchlist[d.id]!.status]} · ${d.year}` : `${d.year} · ${d.genres.slice(0, 2).join(', ')}`}
            right={<Pressable pointerEvents="none"><Ionicons name={has(d.id) ? 'checkmark-circle' : 'add-circle-outline'} size={24} color={has(d.id) ? colors.accentText : colors.textTertiary} /></Pressable>}
          />
        )}
      />
    </Screen>
  );
}
