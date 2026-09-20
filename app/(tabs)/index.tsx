import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, NativeScrollEvent, NativeSyntheticEvent, Pressable, StyleSheet, View } from 'react-native';
import { DramaRail } from '../../components/drama/DramaCard';
import { PostCard } from '../../components/feed/PostCard';
import { useTabBarMotion } from '../../components/navigation/TabBarMotion';

import { ShortsRail } from '../../components/feed/ShortCard';
import { TonightRail } from '../../components/home/TonightRail';
import { UserCard } from '../../components/people/UserRow';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { useRefresh } from '../../components/ui/Refresh';
import { Screen, useListPadding } from '../../components/ui/Screen';
import { SectionHeader } from '../../components/ui/Section';
import { Segmented } from '../../components/ui/Segmented';
import { PostSkeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/States';
import { Text } from '../../components/ui/Text';
import { TopBar, Wordmark } from '../../components/ui/TopBar';
import { colors, radius, space } from '../../constants/theme';
import { useAuth } from '../../lib/auth';
import { haptic, useApp, useReduceMotion } from '../../lib/hooks';
import { Post } from '../../lib/model';
import { airingEpisodes, forYou, following, recommendedDramas, recommendedPeople, shorts, trendingDiscussions } from '../../lib/selectors';
import { getState } from '../../lib/store';

type Row = { key: string; kind: 'post'; post: Post; reason?: string } | { key: string; kind: 'shorts' } | { key: string; kind: 'dramas' } | { key: string; kind: 'people' } | { key: string; kind: 'discussions' } | { key: string; kind: 'guest' };

/**
 * Home — editorial, not a firehose. For You interleaves modules between posts;
 * Following is chronological from people/dramas/actors you follow.
 */
export default function Home() {
  const router = useRouter();
  const tabBar = useTabBarMotion();
  const auth = useAuth();
  const { state, me, unread } = useApp();
  const [tab, setTab] = useState<'forYou' | 'following'>('forYou');
  const listRef = useRef<FlatList<Row>>(null);
  const { control: refreshControl, onRefresh: pull, refreshing } = useRefresh('home');
  const reduceMotion = useReduceMotion(state.prefs.reduceMotion);
  const padding = useListPadding();
  const guest = auth.status !== 'signedIn';

  const tonight = useMemo(() => airingEpisodes(state, -30, 36).filter(({ drama }) => state.follows.dramas.includes(drama.id) || drama.status === 'airing').slice(0, 8), [state]);
  const liveFeed = useMemo(() => (tab === 'forYou' ? forYou(state) : following(state)), [state, tab]);

  // Feed stability: the list you are reading never reshuffles under your thumb. New posts that
  // arrive while you're scrolled down surface as a "New posts" pill; pulling down or tapping it
  // re-syncs the visible feed with the live ranking.
  const [feed, setFeed] = useState(liveFeed);
  const atTop = useRef(true);
  const shownHead = useRef<string | undefined>(liveFeed[0]?.post.id);
  const newCount = useMemo(() => {
    const shown = new Set(feed.map((r) => r.post.id));
    return liveFeed.filter((r) => !shown.has(r.post.id)).length;
  }, [liveFeed, feed]);
  useEffect(() => {
    // Same membership (edits, reactions, deletions) → adopt live data silently. New posts while at top → adopt too.
    if (newCount === 0 || atTop.current) {
      setFeed(liveFeed);
      shownHead.current = liveFeed[0]?.post.id;
    }
  }, [liveFeed, newCount]);
  useEffect(() => {
    setFeed(liveFeed);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  const showNew = () => {
    setFeed(liveFeed);
    setPage(1);
    listRef.current?.scrollToOffset({ offset: 0, animated: !reduceMotion });
    haptic.select();
  };

  // Pagination: render 12 posts at a time; the footer spinner appears while the next page mounts.
  const PAGE = 12;
  const [page, setPage] = useState(1);
  const [paging, setPaging] = useState(false);
  const hasMore = feed.length > page * PAGE;
  const loadMore = useCallback(() => {
    if (!hasMore || paging) return;
    setPaging(true);
    setTimeout(() => {
      setPage((p) => p + 1);
      setPaging(false);
    }, 350);
  }, [hasMore, paging]);
  const pillY = useRef(new Animated.Value(-60)).current;
  useEffect(() => {
    Animated.spring(pillY, { toValue: newCount > 0 && !atTop.current ? 0 : -60, useNativeDriver: true, damping: 18, stiffness: 220 }).start();
  }, [newCount, pillY]);
  const shortList = useMemo(() => shorts(state), [state]);
  const recs = useMemo(() => recommendedDramas(state, 10), [state]);
  const people = useMemo(() => recommendedPeople(state, 6), [state]);
  const discussions = useMemo(() => trendingDiscussions(state, 4), [state]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    if (guest) out.push({ key: 'guest', kind: 'guest' });
    feed.slice(0, page * PAGE).forEach((r, i) => {
      out.push({ key: r.post.id, kind: 'post', post: r.post, reason: r.reason });
      if (tab === 'forYou') {
        if (i === 2 && shortList.length) out.push({ key: 'shorts', kind: 'shorts' });
        if (i === 5 && recs.length) out.push({ key: 'dramas', kind: 'dramas' });
        if (i === 8 && people.length) out.push({ key: 'people', kind: 'people' });
        if (i === 11 && discussions.length) out.push({ key: 'discussions', kind: 'discussions' });
      }
    });
    if (tab === 'forYou' && feed.length && feed.length <= 5 && recs.length) out.push({ key: 'dramas', kind: 'dramas' });
    return out;
  }, [feed, page, guest, tab, shortList.length, recs.length, people.length, discussions.length]);

  const onRefresh = useCallback(async () => {
    await pull();
    const fresh = getState();
    setFeed(tab === 'forYou' ? forYou(fresh) : following(fresh));
    setPage(1);
  }, [pull, tab]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      tabBar.onScroll(e);
      const top = e.nativeEvent.contentOffset.y < 80;
      if (top !== atTop.current) {
        atTop.current = top;
        if (top && newCount) showNew();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabBar.onScroll, newCount],
  );

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      switch (item.kind) {
        case 'post':
          return <PostCard post={item.post} reason={item.reason} />;
        case 'guest':
          return (
            <View style={styles.guest}>
              <Text variant="titleSmall">You’re browsing as a guest</Text>
              <Text variant="bodySmall" tone="secondary" style={{ marginTop: 2 }}>
                Join to follow dramas, track episodes and keep spoilers away from you.
              </Text>
              <Button label="Join Hallyu" size="sm" style={{ marginTop: space.x3 }} onPress={() => router.push('/(auth)/sign-up')} />
            </View>
          );
        case 'shorts':
          return (
            <View style={styles.module}>
              <SectionHeader eyebrow="Shorts" title="Watch in a minute" onAction={() => router.push('/shorts')} />
              <ShortsRail posts={shortList} />
            </View>
          );
        case 'dramas':
          return (
            <View style={styles.module}>
              <SectionHeader eyebrow="For you" title="Your next obsession" onAction={() => router.push('/(tabs)/explore')} actionLabel="Explore" />
              <DramaRail dramas={recs.map((r) => r.drama)} reasons={Object.fromEntries(recs.map((r) => [r.drama.id, r.reason]))} />
            </View>
          );
        case 'people':
          return (
            <View style={styles.module}>
              <SectionHeader eyebrow="Community" title="People with your taste" />
              <FlatList horizontal data={people} keyExtractor={(p) => p.user.id} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.margin, gap: space.gutter }} renderItem={({ item: p }) => <UserCard user={p.user} reason={p.reason} />} />
            </View>
          );
        case 'discussions':
          return (
            <View style={styles.module}>
              <SectionHeader eyebrow="Trending" title="Conversations right now" onAction={() => router.push('/trending')} />
              {discussions.map((p) => (
                <PostCard key={p.id} post={p} />
              ))}
            </View>
          );
      }
    },
    [router, shortList, recs, people, discussions],
  );

  const header = (
    <View>
      {tab === 'forYou' ? <TonightRail items={tonight} onSeeAll={() => router.push('/schedule')} /> : null}
    </View>
  );

  const empty =
    tab === 'following' ? (
      guest ? (
        <EmptyState icon="people-outline" title="Following is yours to build" body="Sign in and follow dramas, actors and people. Their posts land here, newest first." actionLabel="Join Hallyu" onAction={() => router.push('/(auth)/sign-up')} />
      ) : (
        <EmptyState icon="people-outline" title="Nothing here yet" body="Follow a few dramas and people to fill this feed. Start with what you’re watching." actionLabel="Find fandoms" onAction={() => router.push('/(tabs)/explore')} secondaryLabel="People with your taste" onSecondary={() => router.push('/people')} />
      )
    ) : (
      <View>
        <PostSkeleton />
        <PostSkeleton />
      </View>
    );

  return (
    <Screen
      header={
        <TopBar
          mode="root"
          center={<Wordmark />}
          right={
            <>
              <IconButton icon="search-outline" label="Search" onPress={() => router.push('/search')} />
              {guest ? (
                <IconButton icon="person-circle-outline" label="Sign in" onPress={() => router.push('/(auth)/welcome')} />
              ) : (
                <Pressable onPress={() => router.push('/(tabs)/you')} accessibilityRole="button" accessibilityLabel="Your profile" style={{ padding: 8 }}>
                  <Avatar uri={me.avatarUrl} name={me.displayName} size="sm" />
                  {unread ? <View style={styles.dot} /> : null}
                </Pressable>
              )}
            </>
          }
        />
      }
    >
      <Segmented items={[{ key: 'forYou', label: 'For You' }, { key: 'following', label: 'Following', dot: tab !== 'following' && following(state).some((r) => new Date(r.post.createdAt) > new Date(state.lastSeenActivity)) && !guest }]} value={tab} onChange={(t) => { setTab(t); listRef.current?.scrollToOffset({ offset: 0, animated: false }); }} />
      <FlatList
        ref={listRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={[padding, { paddingTop: space.x4 }]}
        refreshControl={React.cloneElement(refreshControl, { onRefresh })}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        initialNumToRender={6}
        windowSize={7}
        removeClippedSubviews
        ListFooterComponent={
          hasMore || paging ? (
            <View style={styles.footer} accessibilityLabel="Loading more posts">
              <ActivityIndicator color={colors.textTertiary} />
            </View>
          ) : rows.length ? (
            <View style={styles.footer}>
              <Ionicons name="checkmark-done-outline" size={18} color={colors.textTertiary} />
              <Text variant="caption" tone="tertiary">
                You’re caught up. Explore has more.
              </Text>
              <Button label="Open Explore" variant="ghost" size="sm" onPress={() => router.push('/(tabs)/explore')} />
            </View>
          ) : null
        }
      />
      {/* New posts pill */}
      <Animated.View pointerEvents={newCount > 0 ? 'auto' : 'none'} style={[styles.pillHost, { transform: [{ translateY: pillY }] }]}>
        <Pressable onPress={showNew} style={styles.pill} accessibilityRole="button" accessibilityLabel={`${newCount} new posts, scroll to top`}>
          <Ionicons name="arrow-up" size={14} color={colors.onAccent} />
          <Text variant="label" tone="onAccent">
            {newCount === 1 ? '1 new post' : `${newCount} new posts`}
          </Text>
        </Pressable>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  guest: { margin: space.margin, marginTop: 0, padding: space.x4, backgroundColor: colors.surface1, borderRadius: radius.lg },
  module: { paddingVertical: space.x6, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  footer: { alignItems: 'center', gap: space.x2, paddingVertical: space.x8 },
  dot: { position: 'absolute', top: 8, right: 8, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.canvas },
  pillHost: { position: 'absolute', top: 108, left: 0, right: 0, alignItems: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.accent, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
});
