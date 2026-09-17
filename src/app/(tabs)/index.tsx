import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Text, IconButton } from '@/components/ui';
import { PostCard } from '@/components/feed/PostCard';
import { colors, spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { DEMO_MODE, demoStore } from '@/lib/demo';
import { PostWithRelations } from '@/types/database';

type Tab = 'forYou' | 'following';

export default function HomeScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('forYou');
  const [posts, setPosts] = useState<PostWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPosts = useCallback(async () => {
    if (DEMO_MODE) {
      // Fully offline: serve the in-memory demo feed (includes user-created posts)
      setPosts(demoStore.listPosts());
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // Basic feed query – in production you would join likes/comments counts
    // and filter by follows for the "Following" tab.
    const { data: rawPosts, error } = await supabase
      .from('posts')
      .select(`
        *,
        profile:profiles(*),
        post_dramas(drama:dramas(*))
      `)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      console.warn('Feed error', error.message);
      setPosts(demoStore.listPosts()); // fallback for development
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (!rawPosts || rawPosts.length === 0) {
      setPosts(demoStore.listPosts());
    } else {
      const mapped: PostWithRelations[] = rawPosts.map((p) => ({
        ...p,
        profile: p.profile ?? null,
        dramas: (p.post_dramas ?? []).map((pd) => pd.drama),
        likes_count: 0,
        comments_count: 0,
        saves_count: 0,
        is_liked: false,
        is_saved: false,
      }));
      setPosts(mapped);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  // Refetch whenever the tab regains focus — covers returning from the
  // create-post modal, so a new post shows up immediately (fix B6).
  useFocusEffect(
    useCallback(() => {
      fetchPosts();
    }, [fetchPosts])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchPosts();
  };

  // Demo mode: make like/save interactive locally. Real wiring is backend work.
  const handleLike = useCallback((postId: string) => {
    if (DEMO_MODE) setPosts(demoStore.toggleLike(postId));
  }, []);

  const handleSave = useCallback((postId: string) => {
    if (DEMO_MODE) setPosts(demoStore.toggleSave(postId));
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text variant="h2" style={styles.logo}>
          Hallyu
        </Text>
        <IconButton
          name="notifications-outline"
          onPress={() => router.navigate('/(tabs)/notifications')}
        />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'forYou' && styles.tabActive]}
          onPress={() => setActiveTab('forYou')}
        >
          <Text
            variant="bodyMedium"
            color={activeTab === 'forYou' ? colors.textPrimary : colors.textTertiary}
          >
            For You
          </Text>
          {activeTab === 'forYou' && <View style={styles.indicator} />}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'following' && styles.tabActive]}
          onPress={() => setActiveTab('following')}
        >
          <Text
            variant="bodyMedium"
            color={activeTab === 'following' ? colors.textPrimary : colors.textTertiary}
          >
            Following
          </Text>
          {activeTab === 'following' && <View style={styles.indicator} />}
        </TouchableOpacity>
      </View>

      {/* Feed */}
      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              onLike={() => handleLike(item.id)}
              onSave={() => handleSave(item.id)}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
            />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={posts.length === 0 ? styles.emptyContainer : undefined}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text variant="h3" style={{ marginBottom: spacing.sm }}>
                No posts yet
              </Text>
              <Text variant="body" color={colors.textSecondary} style={{ textAlign: 'center' }}>
                Follow some dramas or people to fill your feed.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.md,
  },
  logo: {
    color: colors.accent,
    letterSpacing: 0.5,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing['2xl'],
  },
  tab: {
    marginRight: spacing['2xl'],
    paddingVertical: spacing.md,
    position: 'relative',
  },
  tabActive: {},
  indicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.accent,
    borderRadius: 1,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['3xl'],
  },
});
