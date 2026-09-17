import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Text, IconButton } from '@/components/ui';
import { PostCard } from '@/components/feed/PostCard';
import { colors, spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { PostWithRelations } from '@/types/database';

type Tab = 'forYou' | 'following';

export default function HomeScreen() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('forYou');
  const [posts, setPosts] = useState<PostWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPosts = useCallback(async () => {
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
      setPosts(DEMO_POSTS); // fallback for development
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (!rawPosts || rawPosts.length === 0) {
      setPosts(DEMO_POSTS);
    } else {
      const mapped: PostWithRelations[] = rawPosts.map((p: any) => ({
        ...p,
        profile: p.profile,
        dramas: (p.post_dramas ?? []).map((pd: any) => pd.drama).filter(Boolean),
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

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts, activeTab]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPosts();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text variant="h2" style={styles.logo}>
          Hallyu
        </Text>
        <IconButton
          name="notifications-outline"
          onPress={() => router.push('/(tabs)/notifications')}
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
          renderItem={({ item }) => <PostCard post={item} />}
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

// Demo data so the feed never looks empty during development
const DEMO_POSTS: PostWithRelations[] = [
  {
    id: 'demo-1',
    user_id: 'u1',
    body: 'Just finished Queen of Tears and I’m not okay 😭 The writing, the chemistry, the ending… 10/10, no notes.',
    media_urls: ['https://images.unsplash.com/photo-1485846234645-a62644f84728?w=800'],
    media_type: 'image',
    created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    updated_at: new Date().toISOString(),
    profile: {
      id: 'u1',
      username: 'kdrama.love',
      display_name: 'kdrama.love',
      bio: null,
      avatar_url: null,
      created_at: '',
      updated_at: '',
    },
    dramas: [
      {
        id: 'd1',
        title: 'Queen of Tears',
        original_title: null,
        poster_url: null,
        year: 2024,
        genres: ['Romance'],
        synopsis: null,
        cast_text: null,
        episode_count: 16,
        created_at: '',
      },
    ],
    likes_count: 1240,
    comments_count: 87,
    saves_count: 214,
    is_liked: false,
    is_saved: false,
  },
  {
    id: 'demo-2',
    user_id: 'u2',
    body: 'The way Lovely Runner plays with time and fate is just *chef’s kiss* ✨ If you love second chances and epic romance, this one’s for you.',
    media_urls: ['https://images.unsplash.com/photo-1518674660708-6f684e78f4f6?w=800'],
    media_type: 'image',
    created_at: new Date(Date.now() - 5 * 3600000).toISOString(),
    updated_at: new Date().toISOString(),
    profile: {
      id: 'u2',
      username: 'seoul.obsessed',
      display_name: 'seoul.obsessed',
      bio: null,
      avatar_url: null,
      created_at: '',
      updated_at: '',
    },
    dramas: [
      {
        id: 'd2',
        title: 'Lovely Runner',
        original_title: null,
        poster_url: null,
        year: 2024,
        genres: ['Romance', 'Time-Slip'],
        synopsis: null,
        cast_text: null,
        episode_count: 16,
        created_at: '',
      },
    ],
    likes_count: 845,
    comments_count: 63,
    saves_count: 132,
    is_liked: true,
    is_saved: false,
  },
];

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
