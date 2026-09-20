import { useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList } from 'react-native';
import { UserRow } from '../../../components/people/UserRow';
import { Screen, useListPadding } from '../../../components/ui/Screen';
import { Segmented } from '../../../components/ui/Segmented';
import { EmptyState } from '../../../components/ui/States';
import { TopBar } from '../../../components/ui/TopBar';
import { useApp } from '../../../lib/hooks';
import { USERS } from '../../../lib/seed';

/** Followers / following lists. For other members we show a representative sample from the community graph. */
export default function Connections() {
  const { handle, tab: initial } = useLocalSearchParams<{ handle: string; tab?: 'followers' | 'following' }>();
  const { state, getUserByHandle, me } = useApp();
  const padding = useListPadding(false);
  const [tab, setTab] = useState<'followers' | 'following'>(initial ?? 'followers');
  const user = handle?.toLowerCase() === me.handle.toLowerCase() ? me : getUserByHandle(handle ?? '');
  const isMe = user?.id === me.id;
  const list = useMemo(() => {
    if (!user) return [];
    const others = USERS.filter((u) => u.id !== user.id && u.id !== me.id && !state.blockedUsers.includes(u.id));
    if (isMe) return tab === 'following' ? others.filter((u) => state.follows.users.includes(u.id)) : others.filter((u, i) => i % 2 === 0);
    // Deterministic sample for other people's graphs.
    const seed = user.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return others.filter((_, i) => (i + seed) % (tab === 'following' ? 3 : 2) === 0);
  }, [user, isMe, tab, state.follows.users, state.blockedUsers, me.id]);
  return (
    <Screen header={<TopBar mode="stack" title={user ? `@${user.handle}` : 'Connections'} />}>
      <Segmented items={[{ key: 'followers', label: 'Followers', count: isMe ? me.followers : user?.followers }, { key: 'following', label: 'Following', count: isMe ? state.follows.users.length : user?.following }]} value={tab} onChange={setTab} />
      <FlatList data={list} keyExtractor={(u) => u.id} contentContainerStyle={padding} renderItem={({ item }) => <UserRow user={item} />} ListEmptyComponent={<EmptyState compact icon="people-outline" title={tab === 'following' ? 'Not following anyone yet' : 'No followers yet'} body={isMe && tab === 'following' ? 'Follow people whose taste you trust — their posts fill your Following feed.' : 'Good posts travel. Keep going.'} />} />
    </Screen>
  );
}
