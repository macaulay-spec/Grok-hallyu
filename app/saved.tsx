import { useRouter } from 'expo-router';
import React from 'react';
import { FlatList } from 'react-native';
import { PostCard } from '../components/feed/PostCard';
import { FeedAutoplay } from '../components/media/FeedViewport';
import { Screen, useListPadding } from '../components/ui/Screen';
import { EmptyState } from '../components/ui/States';
import { TopBar } from '../components/ui/TopBar';
import { useApp } from '../lib/hooks';
import { Post } from '../lib/model';

/** Saved posts — private to you, newest save first. Reached from the "Saved" toast and from You. */
export default function Saved() {
  const router = useRouter();
  const { state, getPost } = useApp();
  const padding = useListPadding(false);
  const posts = [...state.saves]
    .reverse()
    .map((id) => getPost(id))
    .filter((p): p is NonNullable<typeof p> => !!p && !state.blockedUsers.includes(p.authorId));
  return (
    <Screen header={<TopBar mode="stack" title="Saved" subtitle={posts.length ? `${posts.length} · only you can see this` : undefined} />}>
      <FeedAutoplay<Post> getVideoId={(p) => (p.video ? p.id : null)}>
        {(vp) => (
          <FlatList
            data={posts}
            keyExtractor={(p) => p.id}
            onViewableItemsChanged={vp.onViewableItemsChanged}
            viewabilityConfig={vp.viewabilityConfig}
            contentContainerStyle={[padding, posts.length ? null : { flex: 1 }]}
            renderItem={({ item }) => <PostCard post={item} />}
            ListEmptyComponent={
              <EmptyState
                icon="bookmark-outline"
                title="Nothing saved yet"
                body="Tap the bookmark on any post to keep it here. Saves are private."
                actionLabel="Browse For You"
                onAction={() => router.replace('/(tabs)')}
              />
            }
          />
        )}
      </FeedAutoplay>
    </Screen>
  );
}