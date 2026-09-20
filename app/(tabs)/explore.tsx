import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { CollectionCard } from '../../components/collections/CollectionCard';
import { ActorRail } from '../../components/drama/ActorCard';
import { DramaRail } from '../../components/drama/DramaCard';
import { PostCard } from '../../components/feed/PostCard';
import { ShortsRail } from '../../components/feed/ShortCard';
import { useTabBarMotion } from '../../components/navigation/TabBarMotion';
import { SearchField } from '../../components/search/SearchField';
import { Backdrop, Poster } from '../../components/ui/Poster';
import { useRefresh } from '../../components/ui/Refresh';
import { ScrollScreen, Screen } from '../../components/ui/Screen';
import { SectionHeader } from '../../components/ui/Section';
import { PosterRowSkeleton, Skeleton } from '../../components/ui/Skeleton';
import { InlineNotice } from '../../components/ui/States';
import { Tap } from '../../components/ui/Tap';
import { Text } from '../../components/ui/Text';
import { TopBar } from '../../components/ui/TopBar';
import { colors, radius, space } from '../../constants/theme';
import { catalog, invalidateCatalogLists } from '../../lib/catalog';
import { adoptActors, adoptDramas } from '../../lib/catalogSync';
import { Loadable, useApp, useCatalogHealth, useLayout, useLoad, useNetwork } from '../../lib/hooks';
import { Actor, Drama, GENRES } from '../../lib/model';
import { publicCollections, shorts, trendingDiscussions } from '../../lib/selectors';
import { TRENDING_HASHTAGS } from '../../lib/seed';

const NETFLIX = 8; // TMDB watch-provider id

/** Live TMDB list → app records (adopted into the store so every poster opens a full Drama Hub). */
function useDramas(run: (signal: AbortSignal) => Promise<Drama[]>, deps: unknown[] = []): Loadable<Drama[]> {
  return useLoad(async (signal) => adoptDramas(await run(signal)), deps, catalog.available);
}

/**
 * Explore — editorial browsing of the real K-drama world. Every drama on this screen comes live
 * from TMDB (trending, airing, top rated, premieres, by genre, on Netflix, trending faces); the
 * community sections (shorts, threads, shelves, tags) are Hallyu's own. Search is a different job
 * and lives one tap away.
 */
export default function Explore() {
  const router = useRouter();
  const tabBar = useTabBarMotion();
  const refresh = useRefresh('explore');
  const online = useNetwork();
  const health = useCatalogHealth();
  const { state } = useApp();
  const { width } = useLayout();

  const trending = useDramas((s) => catalog.trending(s));
  const airing = useDramas((s) => catalog.airingSoon(7, s));
  const topRated = useDramas((s) => catalog.topRated(1, s));
  const upcoming = useDramas((s) => catalog.upcoming(s));
  const netflix = useDramas((s) => catalog.onProvider(NETFLIX, s));
  const faces = useLoad<Actor[]>(async (s) => adoptActors(await catalog.trendingPeople(s)), [], catalog.available);

  // Pull-to-refresh re-runs every live section.
  useEffect(() => {
    if (!refresh.refreshing) return;
    invalidateCatalogLists();
    trending.reload();
    airing.reload();
    topRated.reload();
    upcoming.reload();
    netflix.reload();
    faces.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh.refreshing]);

  const discussions = useMemo(() => trendingDiscussions(state, 3), [state]);
  const collections = useMemo(() => publicCollections(state).slice(0, 8), [state]);
  const shortList = useMemo(() => shorts(state), [state]);

  const lead = trending.data?.[0];
  const heroW = Math.min(width - space.margin * 2, 640);
  const heroH = Math.round(Math.min(300, heroW * 0.58));
  const catalogDown = !!trending.error && !trending.data;

  return (
    <Screen header={<TopBar mode="root" title="Explore" large />}>
      <ScrollScreen tabbed onScroll={tabBar.onScroll} scrollEventThrottle={16} refreshControl={refresh.control}>
        <View style={{ paddingHorizontal: space.margin, marginBottom: space.x6 }}>
          <SearchField asButton placeholder="Dramas, actors, people, posts…" onPressButton={() => router.push('/search')} />
        </View>

        {!catalog.available ? (
          <InlineNotice
            tone="warning"
            icon="key-outline"
            text="The catalog isn’t configured in this build, so live titles can’t load."
            style={{ marginHorizontal: space.margin, marginBottom: space.x6 }}
          />
        ) : catalogDown ? (
          <Pressable onPress={trending.reload} accessibilityRole="button" accessibilityLabel="Retry loading the catalog" style={{ marginHorizontal: space.margin, marginBottom: space.x6 }}>
            <InlineNotice
              tone="warning"
              icon={online ? 'cloud-offline-outline' : 'wifi-outline'}
              text={
                online ? `Couldn’t load the live catalog — ${health.message ?? 'no answer from TMDB'}. Tap to try again.` : 'You’re offline. Live titles come back with your connection — tap to retry.'
              }
            />
          </Pressable>
        ) : null}

        {/* Hero — #1 trending K-drama this week */}
        {lead ? (
          <Tap
            onPress={() => router.push(`/drama/${lead.id}`)}
            style={[styles.hero, { width: heroW, height: heroH, backgroundColor: lead.tone }]}
            accessibilityRole="button"
            accessibilityLabel={`Trending now: ${lead.title}`}
          >
            <Backdrop uri={lead.backdropUrl ?? lead.posterUrl} fallbackColor={lead.tone} width={heroW} height={heroH} style={StyleSheet.absoluteFill} />
            <View style={styles.heroScrim} />
            <View style={styles.heroBody}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x2 }}>
                <View style={styles.signal} />
                <Text variant="overline" tone="accent">
                  #1 this week
                </Text>
                {lead.rating ? (
                  <Text variant="overline" tone="secondary">
                    · ★ {lead.rating.toFixed(1)}
                  </Text>
                ) : null}
                {lead.network ? (
                  <Text variant="overline" tone="secondary" numberOfLines={1}>
                    · {lead.network}
                  </Text>
                ) : null}
              </View>
              <Text variant={lead.title.length <= 22 ? 'display' : 'headline'} style={{ color: colors.onMedia, letterSpacing: -0.8 }} numberOfLines={2}>
                {lead.title}
              </Text>
              <Text variant="bodySmall" style={{ color: colors.textSecondary }} numberOfLines={2}>
                {lead.synopsis}
              </Text>
            </View>
          </Tap>
        ) : trending.showSkeleton || (trending.loading && !trending.data) ? (
          <Skeleton width={heroW} height={heroH} radius={radius.lg} style={{ alignSelf: 'center', marginBottom: space.section }} />
        ) : null}

        <LiveRail eyebrow="Trending" title="Everyone’s talking about" state={trending} slice={[1]} size="m" onAction={() => router.push('/trending')} />

        <LiveRail eyebrow="This week" title="New episodes airing" live state={airing} size="l" onAction={() => router.push('/schedule')} actionLabel="Schedule" />

        {/* Genres — each tile carries the current #1 of that genre from the live catalog */}
        <View style={styles.section}>
          <SectionHeader eyebrow="Browse" title="By genre" />
          <FlatList
            horizontal
            data={GENRES}
            keyExtractor={(g) => g}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: space.margin, gap: space.x2 }}
            initialNumToRender={6}
            renderItem={({ item: g }) => <GenreTile genre={g} onPress={() => router.push(`/genre/${encodeURIComponent(g)}`)} />}
          />
        </View>

        <LiveRail eyebrow="All time" title="Highest rated" state={topRated} size="m" badges={(d) => (d.rating ? `★ ${d.rating.toFixed(1)}` : undefined)} />

        <LiveRail eyebrow="Streaming" title="On Netflix" state={netflix} size="m" />

        {shortList.length ? (
          <View style={styles.section}>
            <SectionHeader eyebrow="Shorts" title="Sixty seconds or less" onAction={() => router.push('/shorts')} />
            <ShortsRail posts={shortList} />
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionHeader eyebrow="Discussions" title="Threads worth your time" onAction={() => router.push('/trending')} />
          {discussions.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </View>

        {faces.data?.length ? (
          <View style={styles.section}>
            <SectionHeader eyebrow="Actors" title="Faces of the week" subtitle="Trending on TMDB right now" />
            <ActorRail actors={faces.data} size={80} />
          </View>
        ) : faces.showSkeleton ? (
          <View style={[styles.section, { flexDirection: 'row', gap: space.x3, paddingHorizontal: space.margin }]}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} width={80} height={80} circle />
            ))}
          </View>
        ) : null}

        <LiveRail
          eyebrow="Coming soon"
          title="Premieres"
          state={upcoming}
          size="m"
          badges={(d) => (d.nextEpisodeAt ? new Date(d.nextEpisodeAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Soon')}
        />

        <View style={styles.section}>
          <SectionHeader eyebrow="Collections" title="Shelves from the community" onAction={() => router.push('/collections')} />
          <FlatList
            horizontal
            data={collections}
            keyExtractor={(c) => c.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: space.margin, gap: space.gutter }}
            renderItem={({ item }) => <CollectionCard collection={item} />}
          />
        </View>

        <View style={styles.section}>
          <SectionHeader eyebrow="Hashtags" title="Trending tags" />
          <View style={styles.tags}>
            {TRENDING_HASHTAGS.map((t) => (
              <Pressable key={t} onPress={() => router.push({ pathname: '/search', params: { q: `#${t}` } })} style={styles.tag} accessibilityRole="button" accessibilityLabel={`#${t}`}>
                <Text variant="label" tone="accent">
                  #{t}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ paddingHorizontal: space.margin, marginTop: space.x4, flexDirection: 'row', alignItems: 'center', gap: space.x2 }}>
          <Ionicons name="film-outline" size={14} color={colors.textDisabled} />
          <Text variant="caption" tone="disabled" style={{ flex: 1 }}>
            Titles, art and ratings by TMDB. Hallyu is not endorsed or certified by TMDB.
          </Text>
        </View>
      </ScrollScreen>
    </Screen>
  );
}

/** A rail bound to a live list: skeleton while loading, hidden when empty, quiet retry on failure. */
function LiveRail({
  eyebrow,
  title,
  subtitle,
  live,
  state,
  size,
  slice,
  badges,
  onAction,
  actionLabel,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  live?: boolean;
  state: Loadable<Drama[]>;
  size: 's' | 'm' | 'l' | 'xl';
  slice?: [number, number?];
  badges?: (d: Drama) => string | undefined;
  onAction?: () => void;
  actionLabel?: string;
}) {
  const items = useMemo(() => {
    const all = state.data ?? [];
    return slice ? all.slice(slice[0], slice[1]) : all;
  }, [state.data, slice]);
  if (!state.data && !state.loading && state.error) {
    return (
      <View style={styles.section}>
        <SectionHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />
        <Pressable onPress={state.reload} style={styles.retry} accessibilityRole="button" accessibilityLabel={`Retry ${title}`}>
          <Ionicons name="refresh-outline" size={16} color={colors.textSecondary} />
          <Text variant="bodySmall" tone="secondary">
            Couldn’t load this row · Tap to retry
          </Text>
        </Pressable>
      </View>
    );
  }
  if (!state.data) {
    if (!state.loading) return null;
    return (
      <View style={styles.section}>
        <SectionHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />
        <PosterRowSkeleton count={4} width={size === 'l' ? 140 : 104} />
      </View>
    );
  }
  if (!items.length) return null;
  const badgeMap = badges ? Object.fromEntries(items.map((d) => [d.id, badges(d)]).filter(([, v]) => !!v) as [string, string][]) : undefined;
  return (
    <View style={styles.section}>
      <SectionHeader eyebrow={eyebrow} title={title} subtitle={subtitle} live={live} onAction={onAction} actionLabel={actionLabel} />
      <DramaRail dramas={items} size={size} badges={badgeMap} />
    </View>
  );
}

/** Genre tile backed by the genre's current most popular title. */
function GenreTile({ genre, onPress }: { genre: string; onPress: () => void }) {
  const top = useDramas((s) => catalog.byGenre(genre, 1, s), [genre]);
  const lead = top.data?.[0];
  return (
    <Pressable onPress={onPress} style={[styles.genre, { backgroundColor: lead?.tone ?? colors.surface2 }]} accessibilityRole="button" accessibilityLabel={`${genre} dramas`}>
      {lead ? <Poster drama={lead} width={148} rounded={radius.md} style={{ position: 'absolute', top: -60, opacity: 0.45 }} /> : null}
      <View style={styles.genreScrim} />
      <View style={{ gap: 2 }}>
        <Text variant="titleSmall" style={{ color: colors.onMedia }}>
          {genre}
        </Text>
        <Text variant="caption" tone="secondary" numberOfLines={1}>
          {lead ? lead.title : top.loading ? ' ' : 'Browse'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignSelf: 'center',
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: space.section,
    justifyContent: 'flex-end',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  heroScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,10,10,0.42)' },
  heroBody: { padding: space.x4, gap: 4 },
  signal: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  section: { marginBottom: space.section },
  genre: { width: 148, height: 96, borderRadius: radius.md, padding: space.x3, justifyContent: 'flex-end', overflow: 'hidden' },
  genreScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,10,10,0.35)' },
  retry: {
    marginHorizontal: space.margin,
    height: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.x2,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.x2, paddingHorizontal: space.margin },
  tag: { paddingHorizontal: 12, height: 32, borderRadius: 16, backgroundColor: colors.surface1, alignItems: 'center', justifyContent: 'center' },
});
