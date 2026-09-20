import React, { useState } from 'react';
import { FlatList } from 'react-native';
import { DramaListRow } from '../../components/drama/DramaCard';
import { UserRow } from '../../components/people/UserRow';
import { Button } from '../../components/ui/Button';
import { Screen, useListPadding } from '../../components/ui/Screen';
import { Segmented } from '../../components/ui/Segmented';
import { EmptyState } from '../../components/ui/States';
import { TopBar } from '../../components/ui/TopBar';
import { useApp } from '../../lib/hooks';

/** Blocked users, muted users, muted dramas — each reversible in one tap. */
export default function BlockedSettings() {
  const { state, dispatch, getUser, getDrama } = useApp();
  const padding = useListPadding(false);
  const [tab, setTab] = useState<'blocked' | 'muted' | 'dramas'>('blocked');
  const users = (tab === 'blocked' ? state.blockedUsers : state.mutedUsers).map((id) => getUser(id)).filter(Boolean);
  const dramas = state.mutedDramas.map((id) => getDrama(id)).filter(Boolean);
  return (
    <Screen header={<TopBar mode="stack" title="Blocked & muted" />}>
      <Segmented items={[{ key: 'blocked', label: 'Blocked', count: state.blockedUsers.length || undefined }, { key: 'muted', label: 'Muted', count: state.mutedUsers.length || undefined }, { key: 'dramas', label: 'Muted dramas', count: state.mutedDramas.length || undefined }]} value={tab} onChange={setTab} />
      {tab === 'dramas' ? (
        <FlatList data={dramas} keyExtractor={(d) => d!.id} contentContainerStyle={padding} renderItem={({ item }) => <DramaListRow drama={item!} right={<Button label="Unmute" size="sm" variant="secondary" onPress={() => dispatch({ type: 'muteDrama', dramaId: item!.id, on: false })} />} />} ListEmptyComponent={<EmptyState compact icon="volume-high-outline" title="No muted dramas" body="Mute a drama from its page to hide it from your feeds." />} />
      ) : (
        <FlatList data={users} keyExtractor={(u) => u!.id} contentContainerStyle={padding} renderItem={({ item }) => <UserRow user={item!} showFollow={false} right={<Button label={tab === 'blocked' ? 'Unblock' : 'Unmute'} size="sm" variant="secondary" onPress={() => dispatch(tab === 'blocked' ? { type: 'block', userId: item!.id, on: false } : { type: 'muteUser', userId: item!.id, on: false })} />} />} ListEmptyComponent={<EmptyState compact icon="people-outline" title={tab === 'blocked' ? 'Nobody blocked' : 'Nobody muted'} body={tab === 'blocked' ? 'Blocked people can’t see your posts, follow you or reply to you.' : 'Muted people don’t know. You just stop seeing them.'} />} />
      )}
    </Screen>
  );
}
