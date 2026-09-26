import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { FlatList } from 'react-native';
import { UserRow } from '../../../components/people/UserRow';
import { Screen, useListPadding } from '../../../components/ui/Screen';
import { Segmented } from '../../../components/ui/Segmented';
import { EmptyState } from '../../../components/ui/States';
import { TopBar } from '../../../components/ui/TopBar';
import { fetchConnections } from '../../../lib/data/firebaseBackend';
import { useApp, useLoad } from '../../../lib/hooks';
import { User } from '../../../lib/model';

/** Real followers / following lists, straight from the social graph. */
export default function Connections() {
  const { handle, tab: initial } = useLocalSearchParams<{ handle: string; tab?: 'followers' | 'following' }>();
  const { state, getUserByHandle, me } = useApp();
  const padding = useListPadding(false);
  const [tab, setTab] = useState<'followers' | 'following'>(initial ?? 'followers');
  const user = handle?.toLowerCase() === me.handle.toLowerCase() ? me : getUserByHandle(handle ?? '');
  const isMe = user?.id === me.id;
  const list = useLoad(async (signal) => (handle ? (await fetchConnections(handle, tab)).filter((u) => !state.blockedUsers.includes(u.id)) : []), [handle, tab], !!handle && !!user);
  const rows = (list.data ?? []) as User[];
  return (
    <Screen header={<TopBar mode="stack" title={user ? `@${user.handle}` : 'Connections'} />}>
      <Segmented items={[{ key: 'followers', label: 'Followers', count: isMe ? me.followers : user?.followers }, { key: 'following', label: 'Following', count: isMe ? me.following : user?.following }]} value={tab} onChange={setTab} />
      <FlatList
        data={rows}
        keyExtractor={(u) => u.id}
        contentContainerStyle={padding}
        refreshing={list.loading && !rows.length}
        onRefresh={() => list.reload()}
        renderItem={({ item }) => <UserRow user={item} />}
        ListEmptyComponent={list.loading ? <EmptyState compact icon="people-outline" title="Loading…" /> : <EmptyState compact icon="people-outline" title={tab === 'following' ? 'Not following anyone yet' : 'No followers yet'} body={isMe && tab === 'following' ? 'Follow people whose taste you trust — their posts fill your Following feed.' : 'Good posts travel. Keep going.'} />}
      />
    </Screen>
  );
}
