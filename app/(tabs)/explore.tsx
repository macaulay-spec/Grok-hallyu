import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { CollectionCard } from '../../components/collections/CollectionCard';
import { useTabBarMotion } from '../../components/navigation/TabBarMotion';
import { ActorRail } from '../../components/drama/ActorCard';
import { DramaRail } from '../../components/drama/DramaCard';
import { PostCard } from '../../components/feed/PostCard';
import { ShortsRail } from '../../components/feed/ShortCard';
import { TonightRail } from '../../components/home/TonightRail';
import { SearchField } from '../../components/search/SearchField';
import { Poster } from '../../components/ui/Poster';
import { useRefresh } from '../../components/ui/Refresh';
import { ScrollScreen, Screen } from '../../components/ui/Screen';
import { SectionHeader } from '../../components/ui/Section';
import { Tap } from '../../components/ui/Tap';
import { Text } from '../../components/ui/Text';
import { TopBar } from '../../components/ui/TopBar';
import { colors, radius, space } from '../../constants/theme';
import { compact } from '../../lib/format';
import { useApp, useLayout } from '../../lib/hooks';
import { GENRES } from '../../lib/model';
import { airingEpisodes, publicCollections, recommendedDramas, shorts, trendingDiscussions, trendingDramas } from '../../lib/selectors';
import { TRENDING_HASHTAGS } from '../../lib/seed';
import { allActors, allDramas } from '../../lib/store';

/** Explore — editorial browsing. Search is a different job and lives one tap away. */
export default function Explore() {
  const router = useRouter();
  const tabBar = useTabBarMotion();
  const refresh = useRefresh('explore');
  const { state } = useApp();
  const { width } = useLayout();
  const trending = useMemo(() => trendingDramas(state, 10), [state]);
  const airing = useMemo(() => allDramas(state).filter((d) => d.status === 'airing'), [state]);
  const upcoming = useMemo(() => allDramas(state).filter((d) => d.status === 'upcoming'), [state]);
  const recs = useMemo(() => recommendedDramas(state, 10), [state]);
  const discussions = useMemo(() => trendingDiscussions(state, 3), [state]);
  const collections = useMemo(() => publicCollections(state).slice(0, 8), [state]);
  const shortList = useMemo(() => shorts(state), [state]);
  const week = useMemo(() => airingEpisodes(state, 0, 7 * 24).slice(0, 10), [state]);
  const actors = useMemo(() => [...allActors(state)].sort((a, b) => Number(!!b.photoUrl) - Number(!!a.photoUrl) || b.followerCount - a.followerCount).slice(0, 12), [state]);
  const lead = trending[0];
  const heroW = Math.min(width - space.margin * 2, 640);

  return (
    <Screen header={<TopBar mode="root" title="Explore" large />}>
      <ScrollScreen tabbed onScroll={tabBar.onScroll} scrollEventThrottle={16} refreshControl={refresh.control}>
        <View style={{ paddingHorizontal: space.margin, marginBottom: space.x6 }}>
          <SearchField asButton placeholder="Dramas, actors, people, posts…" onPressButton={() => router.push('/search')} />
        </View>

        {lead ? (
          <Tap
            onPress={() => router.push(`/drama/${lead.id}`)}
            style={[styles.hero, { width: heroW, backgroundColor: lead.tone }]}
            accessibilityRole="button"
            accessibilityLabel={`Trending: ${lead.title}`}
          >
            <Poster drama={lead} width={heroW} rounded={radius.lg} style={{ height: 260, opacity: 0.55, position: 'absolute' }} />
            <View style={styles.heroScrim} />
            <View style={styles.heroBody}>
              <Text variant="overline" tone="accent">
                Trending · {compact(lead.followerCount)} fans
              </Text>
              <Text variant={lead.title.length <= 22 ? 'display' : 'headline'} style={{ color: colors.onMedia, letterSpacing: -0.8 }} numberOfLines={2}>
                {lead.title}
              </Text>
              <Text variant="bodySmall" style={{ color: colors.textSecondary }} numberOfLines={2}>
                {lead.synopsis}
              </Text>
            </View>
          </Tap>
        ) : null}

        <View style={styles.section}>
          <SectionHeader eyebrow="Trending" title="Everyone’s talking about" onAction={() => router.push('/trending')} />
          <DramaRail dramas={trending.slice(1)} size="m" />
        </View>

        <TonightRail items={week} title="This week" eyebrow="Airing schedule" hero={false} onSeeAll={() => router.push('/schedule')} />

        <View style={styles.section}>
          <SectionHeader eyebrow="Browse" title="By genre" />
          <FlatList
            horizontal
            data={GENRES}
            keyExtractor={(g) => g}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: space.margin, gap: space.x2 }}
            renderItem={({ item: g }) => {
              const d = allDramas(state).find((x) => x.genres.includes(g));
              return (
                <Pressable
                  onPress={() => router.push(`/genre/${encodeURIComponent(g)}`)}
                  style={[styles.genre, { backgroundColor: d?.tone ?? colors.surface2 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`${g} dramas`}
                >
                  <Text variant="titleSmall">{g}</Text>
                  <Text variant="caption" tone="secondary">
                    {allDramas(state).filter((x) => x.genres.includes(g)).length} titles
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>

        {airing.length ? (
          <View style={styles.section}>
            <SectionHeader eyebrow="On air" title="Airing now" live onAction={() => router.push('/schedule')} actionLabel="Schedule" />
            <DramaRail dramas={airing} size="l" />
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionHeader
            eyebrow="Recommended"
            title="Picked for you"
            subtitle={state.prefs.personalization ? 'From your genres and watchlist' : 'Personalisation is off — showing community favourites'}
          />
          <DramaRail dramas={recs.map((r) => r.drama)} reasons={Object.fromEntries(recs.map((r) => [r.drama.id, r.reason]))} />
        </View>

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

        <View style={styles.section}>
          <SectionHeader eyebrow="Actors" title="Faces to follow" />
          <ActorRail actors={actors} size={80} />
        </View>

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

        {upcoming.length ? (
          <View style={styles.section}>
            <SectionHeader eyebrow="Coming soon" title="Premieres" />
            <DramaRail
              dramas={upcoming}
              size="m"
              badges={Object.fromEntries(upcoming.map((d) => [d.id, d.nextEpisodeAt ? new Date(d.nextEpisodeAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Soon']))}
            />
          </View>
        ) : null}

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

        <View style={{ paddingHorizontal: space.margin, marginTop: space.x4 }}>
          <Text variant="caption" tone="disabled">
            Catalog data by TMDB. Hallyu is not endorsed or certified by TMDB.
          </Text>
        </View>
      </ScrollScreen>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignSelf: 'center',
    height: 260,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: space.section,
    justifyContent: 'flex-end',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  heroScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,10,10,0.45)' },
  heroBody: { padding: space.x4, gap: 4 },
  section: { marginBottom: space.section },
  genre: { width: 148, height: 84, borderRadius: radius.md, padding: space.x3, justifyContent: 'flex-end' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.x2, paddingHorizontal: space.margin },
  tag: { paddingHorizontal: 12, height: 32, borderRadius: 16, backgroundColor: colors.surface1, alignItems: 'center', justifyContent: 'center' },
});
