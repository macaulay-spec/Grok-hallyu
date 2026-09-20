import { useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { FlatList } from 'react-native';
import { DramaCard } from '../../components/drama/DramaCard';
import { Screen, useListPadding } from '../../components/ui/Screen';
import { EmptyState } from '../../components/ui/States';
import { TopBar } from '../../components/ui/TopBar';
import { space } from '../../constants/theme';
import { useApp, useLayout } from '../../lib/hooks';
import { dramasByGenre } from '../../lib/selectors';

/** Genre browse — grid, rating order. */
export default function GenrePage() {
  const { genre } = useLocalSearchParams<{ genre: string }>();
  const name = decodeURIComponent(genre ?? '');
  const { state } = useApp();
  const { columns } = useLayout();
  const padding = useListPadding(false);
  const list = useMemo(() => dramasByGenre(state, name), [state, name]);
  return (
    <Screen header={<TopBar mode="stack" title={name} subtitle={`${list.length} titles`} />}>
      <FlatList key={columns} data={list} numColumns={columns} keyExtractor={(d) => d.id} columnWrapperStyle={{ gap: space.gutter, paddingHorizontal: space.margin }} contentContainerStyle={[padding, { gap: space.x4, paddingTop: space.x4 }]} renderItem={({ item }) => <DramaCard drama={item} size="m" style={{ flex: 1 / columns }} meta={item.rating ? `★ ${item.rating.toFixed(1)}` : String(item.year)} />} ListEmptyComponent={<EmptyState icon="film-outline" title={`No ${name} dramas yet`} body="The catalog grows as you search — try a title you know." />} />
    </Screen>
  );
}
