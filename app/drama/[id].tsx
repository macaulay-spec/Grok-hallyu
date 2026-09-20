import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Animated, FlatList, Pressable, Share, StyleSheet, View } from 'react-native';
import { AddToCollectionSheet } from '../../components/collections/AddToCollectionSheet';
import { CollectionCard } from '../../components/collections/CollectionCard';
import { ActorCard, ActorRail } from '../../components/drama/ActorCard';
import { DramaRail } from '../../components/drama/DramaCard';
import { EpisodeCard, EpisodeChip, episodeState } from '../../components/drama/EpisodeCard';
import { FollowButton } from '../../components/drama/FollowButton';
import { WatchStatusButton } from '../../components/drama/WatchStatus';
import { CreateSheet } from '../../components/create/CreateSheet';
import { PostCard } from '../../components/feed/PostCard';
import { FeedAutoplay } from '../../components/media/FeedViewport';
import { ReactionMeter } from '../../components/feed/Reactions';
import { ShortsRail } from '../../components/feed/ShortCard';
import { Button } from '../../components/ui/Button';
import { Chip, ChipRow } from '../../components/ui/Chip';
import { IconButton } from '../../components/ui/IconButton';
import { Backdrop, Poster } from '../../components/ui/Poster';
import { useRefresh } from '../../components/ui/Refresh';
import { Screen, useListPadding } from '../../components/ui/Screen';
import { KeyValue, ProgressBar, SectionHeader } from '../../components/ui/Section';
import { Segmented } from '../../components/ui/Segmented';
import { Sheet, SheetRow } from '../../components/ui/Sheet';
import { PostSkeleton } from '../../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../../components/ui/States';
import { Text } from '../../components/ui/Text';
import { useToast } from '../../components/ui/Toast';
import { TopBar } from '../../components/ui/TopBar';
import { colors, radius, sizes, space } from '../../constants/theme';
import { catalog } from '../../lib/catalog';
import { compact, countdown, dayLabel, timeOfDay } from '../../lib/format';
import { haptic, useApp, useLayout, useLoad, useRequireMember } from '../../lib/hooks';
import { heroInterpolations, useArrive, useScrollY, withAlpha } from '../../lib/motion';
import { CastCredit, emptyReactions, Episode, Post, PostType } from '../../lib/model';
import { collectionsContaining, isPostVeiled as postVeiled, postsForDrama, relatedDramas } from '../../lib/selectors';

type Tab = 'overview' | 'episodes' | 'community' | 'cast';
/** Old deep links used six tabs; Media now lives in Overview and Activity is Community sorted by Latest. */
const LEGACY_TAB: Record<string, Tab> = {
  media: 'overview',
  activity: 'community',
};
type Filter = 'all' | PostType;

/** Drama Hub — the home of a fandom. Four tabs under a sticky bar, one header, spoiler-aware everywhere. */
export default function DramaHub() {
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ id: string; tab?: string }>();
  const { state, dispatch, getDrama, getActor, watch, isFollowing } = useApp();
  const require = useRequireMember();
  const { width } = useLayout();
  const padding = useListPadding(false);
  const refresh = useRefresh('drama');
  const drama = getDrama(params.id);
  const [tab, setTab] = useState<Tab>(() => (params.tab && params.tab in LEGACY_TAB ? LEGACY_TAB[params.tab]! : ((params.tab as Tab | undefined) ?? 'overview')));
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<'top' | 'latest'>(params.tab === 'activity' ? 'latest' : 'top');
  const [safe, setSafe] = useState(false);
  const [season, setSeason] = useState<number>(watch(params.id)?.season ?? 1);
  const [menu, setMenu] = useState(false);
  const [collect, setCollect] = useState(false);
  const [create, setCreate] = useState(false);
  const [synopsisOpen, setSynopsisOpen] = useState(false);
  const { scrollY, onScroll } = useScrollY();
  const arrivePoster = useArrive(0);
  const arriveTitle = useArrive(60);

  // Thin (search-imported) records get enriched from the catalog provider.
  const thin = !!drama?.provider && drama.episodes.length === 0 && drama.cast.length === 0;
  const enrich = useLoad(async (signal) => (drama?.provider ? catalog.getDrama(drama.provider.id, signal) : null), [drama?.id], thin && catalog.available);
  useEffect(() => {
    if (enrich.data) dispatch({ type: 'import', dramas: [{ ...enrich.data, id: drama!.id }] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrich.data]);

  const posts = useMemo(() => (drama ? postsForDrama(state, drama.id, sort) : []), [state, drama, sort]);
  const typed = useMemo(() => (filter === 'all' ? posts.filter((p) => p.type !== 'short') : posts.filter((p) => p.type === filter)), [posts, filter]);
  // "Safe for me" hides what would be veiled for this viewer, so a mid-series read isn't a wall of veils.
  const veiledCount = useMemo(() => typed.filter((p) => postVeiled(state, p)).length, [state, typed]);
  const filtered = useMemo(() => (safe && veiledCount ? typed.filter((p) => !postVeiled(state, p)) : typed), [typed, safe, veiledCount, state]);
  const shorts = useMemo(() => posts.filter((p) => p.type === 'short'), [posts]);
  const meter = useMemo(
    () =>
      posts.reduce((acc, p) => {
        for (const k of Object.keys(acc) as (keyof typeof acc)[]) acc[k] += p.reactions[k];
        return acc;
      }, emptyReactions()),
    [posts],
  );
  const related = useMemo(() => (drama ? relatedDramas(state, drama, 8) : []), [state, drama]);
  const inCollections = useMemo(() => (drama ? collectionsContaining(state, drama.id) : []), [state, drama]);
  const publicCols = useMemo(() => (drama ? state.collections.filter((c) => c.visibility === 'public' && c.items.some((i) => i.dramaId === drama.id)).slice(0, 6) : []), [state.collections, drama]);

  if (!drama) {
    return (
      <Screen header={<TopBar mode="stack" title="Drama" />}>
        <ErrorState kind="notFound" title="This drama isn’t available" body="It may have been removed from the catalog, or the link is wrong." onRetry={() => router.back()} />
      </Screen>
    );
  }

  const item = watch(drama.id);
  const following = isFollowing('dramas', drama.id);
  const notify = state.dramaNotify[drama.id] ?? true;
  const multi = drama.seasons.length > 1;
  const eps = drama.episodes.filter((e) => e.season === season).sort((a, b) => a.number - b.number);
  const next = drama.episodes.filter((e) => episodeState(e) !== 'aired').sort((a, b) => (a.airDate ?? '').localeCompare(b.airDate ?? ''))[0];
  const liveEp = drama.episodes.find((e) => episodeState(e) === 'live');
  const talking = posts.filter((p) => new Date(p.createdAt) > new Date(Date.now() - 7 * 86_400_000)).length;
  const stillH = 96;
  const stills: {
    uri: string;
    title: string;
    kind: 'backdrop' | 'poster' | 'still';
  }[] = [
    ...(drama.backdropUrl
      ? [
          {
            uri: drama.backdropUrl,
            title: drama.title,
            kind: 'backdrop' as const,
          },
        ]
      : []),
    ...(drama.posterUrl
      ? [
          {
            uri: drama.posterUrl,
            title: `${drama.title} poster`,
            kind: 'poster' as const,
          },
        ]
      : []),
    ...drama.episodes
      .filter((e) => e.stillUrl)
      .slice(0, 12)
      .map((e) => ({
        uri: e.stillUrl!,
        title: `Episode ${e.number}`,
        kind: 'still' as const,
      })),
  ];
  const heroH = Math.min(420, Math.round((width * 9) / 16));
  const total = drama.seasons.find((s) => s.number === (item?.season ?? 1))?.episodeCount ?? drama.episodeCount;
  const share = () =>
    Share.share({
      message: `${drama.title} on Hallyu — https://hallyu.app/d/${drama.id}`,
    });
  const hero = heroInterpolations(scrollY, heroH, heroH + 8);
  const editorial = drama.title.length <= 22;

  const header = (
    <View>
      {/* Poster-lit surface: the drama's own tone washes the hero block and the title area beneath it. */}
      <View pointerEvents="none" style={[styles.wash, { height: heroH + 220, backgroundColor: withAlpha(drama.tone, 0.55) }]} />
      <View
        pointerEvents="none"
        style={[
          styles.wash,
          {
            top: heroH + 220,
            height: 100,
            backgroundColor: withAlpha(drama.tone, 0.22),
          },
        ]}
      />
      <Animated.View
        style={{
          height: heroH,
          overflow: 'hidden',
          opacity: hero.heroFade,
          transform: [{ translateY: hero.parallax }, { scale: hero.stretch }],
        }}
      >
        <Backdrop uri={drama.backdropUrl ?? drama.posterUrl ?? drama.posterLocal} fallbackColor={drama.tone} width="100%" height={heroH} label={`${drama.title} backdrop`}>
          <View style={styles.heroScrim} />
        </Backdrop>
      </Animated.View>
      <View style={styles.headRow}>
        <Animated.View style={arrivePoster}>
          <Poster drama={drama} width={sizes.poster.m} style={[{ marginTop: -56 }, styles.posterEdge]} />
        </Animated.View>
        <Animated.View style={[{ flex: 1, gap: 2 }, arriveTitle]}>
          <Text variant={editorial ? 'display' : 'headline'} numberOfLines={3} accessibilityRole="header" style={editorial ? styles.editorialTitle : styles.headlineTitle}>
            {drama.title}
          </Text>
          {drama.originalTitle ? (
            <Text variant="bodySmall" tone="secondary" style={{ marginTop: 2 }}>
              {drama.originalTitle}
            </Text>
          ) : null}
          <Text variant="caption" tone="secondary">
            {drama.year}
            {drama.endYear && drama.endYear !== drama.year ? `–${drama.endYear}` : ''}
            {drama.network ? ` · ${drama.network}` : ''} · {drama.episodeCount} ep{drama.episodeCount === 1 ? '' : 's'}
            {drama.status === 'airing' ? ' · Airing' : drama.status === 'upcoming' ? ' · Upcoming' : ''}
          </Text>
          <Text variant="caption" tone="secondary">
            {drama.title} fandom · {compact(drama.followerCount + (following ? 1 : 0))} fans
            {talking ? ` · ${compact(talking)} talking this week` : ''}
            {drama.rating ? ` · ★ ${drama.rating.toFixed(1)}` : ''}
          </Text>
        </Animated.View>
      </View>
      <ChipRow style={{ paddingHorizontal: space.margin, marginTop: space.x3 }}>
        {drama.genres.map((g) => (
          <Chip key={g} label={g} size="sm" onPress={() => router.push(`/genre/${encodeURIComponent(g)}`)} />
        ))}
      </ChipRow>
      <View style={styles.actions}>
        <FollowButton kind="dramas" id={drama.id} name={drama.title} style={{ flex: 1 }} />
        <WatchStatusButton drama={drama} style={{ flex: 1.4 }} />
        <IconButton icon="albums-outline" label="Add to collection" filled onPress={() => require('save to a collection', () => setCollect(true))} />
        {following ? (
          <IconButton
            icon={notify ? 'notifications' : 'notifications-off-outline'}
            label={notify ? 'Episode alerts on' : 'Episode alerts off'}
            filled
            onPress={() => {
              dispatch({ type: 'dramaNotify', id: drama.id, on: !notify });
              toast.show({
                message: notify ? 'Episode alerts off for this drama' : 'You’ll hear when an episode airs',
              });
            }}
          />
        ) : null}
      </View>

      {liveEp || (next && drama.status !== 'completed') ? (
        <Pressable
          onPress={() => router.push(`/episode/${drama.id}/${(liveEp ?? next)!.season}/${(liveEp ?? next)!.number}`)}
          style={[styles.airing, liveEp ? { backgroundColor: colors.accentSoft } : null]}
          accessibilityRole="button"
        >
          <View style={[styles.dot, { backgroundColor: liveEp ? colors.live : colors.textTertiary }]} />
          <Text variant="label" style={{ flex: 1 }}>
            {liveEp
              ? `Episode ${liveEp.number} just aired — the room is live`
              : `Next: Episode ${next!.number}${next!.airDate ? ` · ${dayLabel(next!.airDate)} ${timeOfDay(next!.airDate)} · ${countdown(next!.airDate)}` : ''}`}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </Pressable>
      ) : null}
    </View>
  );

  const tabsBar = (
    <View style={styles.tabsBar}>
      <Segmented
        scrollable
        items={[
          { key: 'overview', label: 'Overview' },
          {
            key: 'episodes',
            label: 'Episodes',
            count: drama.episodes.length || undefined,
          },
          {
            key: 'community',
            label: 'Community',
            count: posts.length || undefined,
          },
          { key: 'cast', label: 'Cast' },
        ]}
        value={tab}
        onChange={(t) => {
          setTab(t);
          if (t === 'community' && params.tab === 'activity') setSort('latest');
        }}
      />
    </View>
  );

  const overview = (
    <View>
      <View style={styles.section}>
        <Pressable onPress={() => setSynopsisOpen((v) => !v)} accessibilityRole="button" accessibilityLabel={synopsisOpen ? 'Collapse synopsis' : 'Expand synopsis'}>
          <Text variant="body" numberOfLines={synopsisOpen ? undefined : 4}>
            {drama.synopsis}
          </Text>
          {drama.synopsis.length > 180 ? (
            <Text variant="label" tone="accent" style={{ marginTop: 6 }}>
              {synopsisOpen ? 'Less' : 'More'}
            </Text>
          ) : null}
        </Pressable>
      </View>
      {item?.status === 'watching' ? (
        <Pressable onPress={() => setTab('episodes')} style={styles.progressCard} accessibilityRole="button">
          <View style={{ flex: 1 }}>
            <Text variant="titleSmall">Your progress</Text>
            <Text variant="caption" tone="secondary">
              Episode {item.currentEpisode} of {total}
              {multi ? ` · Season ${item.season}` : ''}
              {item.currentEpisode < total ? ` · ${total - item.currentEpisode} to go` : ' · All caught up'}
            </Text>
            <ProgressBar value={item.currentEpisode} max={total} style={{ marginTop: space.x2 }} />
          </View>
          {item.currentEpisode < total ? (
            <Button
              label={`Mark Ep ${item.currentEpisode + 1}`}
              size="sm"
              variant="secondary"
              onPress={() => {
                dispatch({
                  type: 'progress',
                  dramaId: drama.id,
                  season: item.season,
                  episode: item.currentEpisode + 1,
                  total,
                });
                toast.show({
                  message: `Episode ${item.currentEpisode + 1} marked watched`,
                });
              }}
            />
          ) : null}
        </Pressable>
      ) : null}
      {item?.note ? (
        <View style={[styles.section, { paddingTop: 0 }]}>
          <Text variant="overline" style={{ marginBottom: 4 }}>
            Your private note
          </Text>
          <Text variant="bodySmall" tone="secondary">
            {item.note}
          </Text>
        </View>
      ) : null}
      <View style={styles.section}>
        <SectionHeader eyebrow="Reaction meter" title="How the fandom feels" style={{ paddingHorizontal: 0 }} />
        <ReactionMeter counts={meter} />
      </View>
      <View style={styles.section}>
        {drama.streamingOn?.length ? <KeyValue label="Watch on" value={drama.streamingOn.join(', ')} /> : null}
        {drama.airsOn ? <KeyValue label="Airs" value={drama.airsOn} /> : null}
        {drama.creators?.length ? <KeyValue label="Written / directed" value={drama.creators.join(', ')} /> : null}
        {drama.tags?.length ? <KeyValue label="Tags" value={drama.tags.join(' · ')} /> : null}
      </View>
      {drama.cast.length ? (
        <View style={{ paddingVertical: space.x4 }}>
          <SectionHeader eyebrow="Cast" title="Who’s in it" onAction={() => setTab('cast')} />
          <ActorRail
            actors={drama.cast.map((c) => getActor(c.actorId)).filter(Boolean) as NonNullable<ReturnType<typeof getActor>>[]}
            roles={Object.fromEntries(drama.cast.map((c) => [c.actorId, c.role]))}
          />
        </View>
      ) : null}
      {stills.length ? (
        <View style={styles.moduleRail}>
          <SectionHeader eyebrow="Media" title="Stills & art" />
          <FlatList
            horizontal
            data={stills}
            keyExtractor={(m) => m.uri}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: space.margin,
              gap: space.gutter,
            }}
            renderItem={({ item: m }) => (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/media',
                    params: { uri: m.uri, title: m.title },
                  })
                }
                accessibilityRole="imagebutton"
                accessibilityLabel={m.title}
              >
                <Backdrop
                  uri={m.uri}
                  fallbackColor={drama.tone}
                  width={m.kind === 'poster' ? Math.round((stillH * 2) / 3) : Math.round((stillH * 16) / 9)}
                  height={stillH}
                  style={{ borderRadius: radius.sm, overflow: 'hidden' }}
                />
              </Pressable>
            )}
          />
        </View>
      ) : null}
      {posts.length ? (
        <View style={{ paddingVertical: space.x4 }}>
          <SectionHeader eyebrow="Community" title="Top conversations" onAction={() => setTab('community')} />
          {posts
            .filter((p) => p.type === 'discussion' || p.type === 'review')
            .slice(0, 2)
            .map((p) => (
              <PostCard key={p.id} post={p} hideContext />
            ))}
        </View>
      ) : null}
      {shorts.length ? (
        <View style={{ paddingVertical: space.x4 }}>
          <SectionHeader
            eyebrow="Shorts"
            title={`${drama.title} in sixty seconds`}
            onAction={() =>
              router.push({
                pathname: '/shorts',
                params: { id: shorts[0]!.id, dramaId: drama.id },
              })
            }
          />
          <ShortsRail posts={shorts} />
        </View>
      ) : null}
      {related.length ? (
        <View style={{ paddingVertical: space.x4 }}>
          <SectionHeader eyebrow="If you liked this" title="Related dramas" />
          <DramaRail dramas={related} size="m" />
        </View>
      ) : null}
      {publicCols.length ? (
        <View style={{ paddingVertical: space.x4 }}>
          <SectionHeader eyebrow="Collections" title="Shelves it’s on" />
          <FlatList
            horizontal
            data={publicCols}
            keyExtractor={(c) => c.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: space.margin,
              gap: space.gutter,
            }}
            renderItem={({ item: c }) => <CollectionCard collection={c} />}
          />
        </View>
      ) : null}
      {inCollections.length ? (
        <Text variant="caption" tone="secondary" style={{ paddingHorizontal: space.margin, paddingBottom: space.x4 }}>
          In your collections: {inCollections.map((c) => c.title).join(', ')}
        </Text>
      ) : null}
    </View>
  );

  const sub = (
    <View>
      {tab === 'community' ? (
        <View>
          <ChipRow
            style={{
              paddingHorizontal: space.margin,
              paddingVertical: space.x3,
            }}
          >
            {(['all', 'discussion', 'review', 'reaction', 'recommendation', 'post'] as Filter[]).map((f) => (
              <Chip key={f} label={f === 'all' ? 'All' : f === 'post' ? 'Posts' : f[0]!.toUpperCase() + f.slice(1) + 's'} size="sm" selected={filter === f} onPress={() => setFilter(f)} />
            ))}
          </ChipRow>
          <View style={styles.sortRow}>
            <Text variant="caption" tone="secondary" style={{ flex: 1 }} numberOfLines={1}>
              {filtered.length} {filtered.length === 1 ? 'post' : 'posts'}
              {veiledCount && !safe ? ` · ${veiledCount} veiled for you` : safe && veiledCount ? ` · ${veiledCount} hidden` : ''}
            </Text>
            {veiledCount ? (
              <Pressable
                onPress={() => {
                  haptic.select();
                  setSafe((v) => !v);
                }}
                accessibilityRole="switch"
                accessibilityState={{ checked: safe }}
                accessibilityLabel="Safe for me: hide posts that would be veiled"
                style={[styles.safeToggle, safe ? styles.safeOn : null]}
              >
                <Ionicons name={safe ? 'eye-off' : 'eye-off-outline'} size={13} color={safe ? colors.accentText : colors.textSecondary} />
                <Text variant="label" tone={safe ? 'accent' : 'secondary'}>
                  Safe for me
                </Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => setSort((s) => (s === 'top' ? 'latest' : 'top'))} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="swap-vertical" size={14} color={colors.textSecondary} />
              <Text variant="label" tone="secondary">
                {sort === 'top' ? 'Top' : 'Latest'}
              </Text>
            </Pressable>
          </View>
          {enrich.showSkeleton ? <PostSkeleton /> : null}
        </View>
      ) : null}

      {tab === 'episodes' ? (
        <View>
          {multi ? (
            <ChipRow
              style={{
                paddingHorizontal: space.margin,
                paddingVertical: space.x3,
              }}
            >
              {drama.seasons.map((s) => (
                <EpisodeChip
                  key={s.number}
                  label={`Season ${s.number}`}
                  selected={season === s.number}
                  onPress={() => setSeason(s.number)}
                  live={drama.episodes.some((e) => e.season === s.number && episodeState(e) === 'live')}
                />
              ))}
            </ChipRow>
          ) : null}
          <View style={styles.sortRow}>
            <Text variant="caption" tone="secondary">
              {eps.length ? `${eps.length} episodes${item ? ` · ${item.season === season ? item.currentEpisode : 0} watched` : ''}` : 'Episode list not available yet'}
            </Text>
            {item && eps.length ? (
              <Button
                label="Mark all watched"
                variant="ghost"
                size="sm"
                onPress={() => {
                  dispatch({
                    type: 'progress',
                    dramaId: drama.id,
                    season,
                    episode: eps.length,
                    total: eps.length,
                  });
                  toast.show({
                    message: `All ${eps.length} episodes marked watched`,
                  });
                }}
              />
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );

  type Row =
    | { key: string; k: 'tabs' }
    | { key: string; k: 'sub' }
    | { key: string; k: 'overview' }
    | { key: string; k: 'ep'; e: Episode }
    | { key: string; k: 'cast'; c: CastCredit }
    | { key: string; k: 'post'; p: Post }
    | { key: string; k: 'empty' }
    | { key: string; k: 'footer' };
  const rows: Row[] = [{ key: 'tabs', k: 'tabs' }];
  if (tab === 'overview') rows.push({ key: 'overview', k: 'overview' });
  else {
    rows.push({ key: 'sub', k: 'sub' });
    if (tab === 'episodes') eps.forEach((e) => rows.push({ key: e.id, k: 'ep', e }));
    if (tab === 'cast') drama.cast.forEach((c) => rows.push({ key: c.actorId, k: 'cast', c }));
    if (tab === 'community') filtered.forEach((p) => rows.push({ key: p.id, k: 'post', p }));
    if (rows.length === 2) rows.push({ key: 'empty', k: 'empty' });
    else if (tab === 'community') rows.push({ key: 'footer', k: 'footer' });
  }
  const renderRow = ({ item: row }: { item: Row }) => {
    switch (row.k) {
      case 'tabs':
        return tabsBar;
      case 'sub':
        return sub;
      case 'overview':
        return overview;
      case 'ep':
        return <EpisodeCard drama={drama} episode={row.e} postCount={posts.filter((p) => p.context.season === row.e.season && p.context.episode === row.e.number).length} />;
      case 'cast': {
        const a = getActor(row.c.actorId);
        return a ? <ActorCard actor={a} role={row.c.role} layout="row" right={<FollowButton kind="actors" id={a.id} name={a.name} />} /> : null;
      }
      case 'post':
        return <PostCard post={row.p} hideContext />;
      case 'empty':
        return tab === 'episodes' ? (
          <EmptyState
            compact
            icon="film-outline"
            title="No episodes listed"
            body={drama.status === 'upcoming' ? 'The schedule lands closer to the premiere.' : 'We don’t have the episode list for this title yet.'}
          />
        ) : tab === 'cast' ? (
          <EmptyState compact icon="people-outline" title="Cast not available" body="We’re missing the credits for this title." />
        ) : (
          <EmptyState
            compact
            icon="chatbubbles-outline"
            title={filter === 'all' ? 'Be the first voice' : `No ${filter}s yet`}
            body={`Nobody’s posted ${filter === 'all' ? 'about' : `a ${filter} for`} ${drama.title} yet. Your take could start the room.`}
            actionLabel="Post in this fandom"
            onAction={() => require('post', () => setCreate(true))}
          />
        );
      case 'footer':
        return (
          <View style={{ padding: space.margin }}>
            <Button label={`Post in the ${drama.title} fandom`} variant="secondary" block icon="create-outline" onPress={() => require('post', () => setCreate(true))} />
          </View>
        );
    }
  };

  return (
    <Screen
      header={
        <TopBar
          mode="stack"
          transparent
          title={drama.title}
          backgroundOpacity={hero.barOpacity}
          titleOpacity={hero.titleOpacity}
          titleRise={hero.titleRise}
          right={
            <>
              <IconButton icon="share-social-outline" label="Share" onPress={share} />
              <IconButton icon="ellipsis-horizontal" label="More" onPress={() => setMenu(true)} />
            </>
          }
        />
      }
    >
      <FeedAutoplay<Row> getVideoId={(r) => (r.k === 'post' && r.p.video ? r.p.id : null)}>
        {(vp) => (
          <Animated.FlatList
            data={rows}
            keyExtractor={(r) => r.key}
            renderItem={renderRow}
            onScroll={onScroll}
            scrollEventThrottle={16}
            onViewableItemsChanged={vp.onViewableItemsChanged}
            viewabilityConfig={vp.viewabilityConfig}
            refreshControl={refresh.control}
            ListHeaderComponent={header}
            stickyHeaderIndices={[1]}
            contentContainerStyle={padding}
            initialNumToRender={8}
            windowSize={7}
          />
        )}
      </FeedAutoplay>

      <Sheet visible={menu} onClose={() => setMenu(false)} title={drama.title}>
        <SheetRow
          icon="share-social-outline"
          label="Share"
          onPress={() => {
            setMenu(false);
            share();
          }}
        />
        <SheetRow
          icon="albums-outline"
          label="Add to collection"
          onPress={() => {
            setMenu(false);
            require('save to a collection', () => setCollect(true));
          }}
        />
        <SheetRow
          icon="create-outline"
          label="Post about this drama"
          onPress={() => {
            setMenu(false);
            require('post', () => setCreate(true));
          }}
        />
        <SheetRow
          icon={state.mutedDramas.includes(drama.id) ? 'volume-high-outline' : 'volume-mute-outline'}
          label={state.mutedDramas.includes(drama.id) ? 'Unmute this drama' : 'Mute this drama in feeds'}
          onPress={() => {
            setMenu(false);
            dispatch({
              type: 'muteDrama',
              dramaId: drama.id,
              on: !state.mutedDramas.includes(drama.id),
            });
            toast.show({
              message: state.mutedDramas.includes(drama.id) ? `${drama.title} unmuted` : `Muted. ${drama.title} won’t appear in your feeds.`,
            });
          }}
        />
        <SheetRow
          icon="flag-outline"
          label="Report a problem with this page"
          tone="danger"
          onPress={() => {
            setMenu(false);
            router.push({
              pathname: '/report',
              params: { targetId: drama.id, kind: 'drama' },
            });
          }}
        />
      </Sheet>
      <AddToCollectionSheet dramaId={drama.id} visible={collect} onClose={() => setCollect(false)} />
      <CreateSheet
        visible={create}
        onClose={() => setCreate(false)}
        context={{
          dramaId: drama.id,
          season: item?.season,
          episode: item?.currentEpisode || undefined,
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabsBar: {
    backgroundColor: colors.canvas,
    paddingTop: space.x4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  moduleRail: { paddingVertical: space.x4 },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,10,10,0.35)',
  },
  wash: { position: 'absolute', top: 0, left: 0, right: 0 },
  posterEdge: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  editorialTitle: { letterSpacing: -0.8 },
  headlineTitle: { letterSpacing: -0.4 },
  headRow: {
    flexDirection: 'row',
    gap: space.x4,
    paddingHorizontal: space.margin,
    alignItems: 'flex-end',
  },
  actions: {
    flexDirection: 'row',
    gap: space.x2,
    paddingHorizontal: space.margin,
    marginTop: space.x4,
    alignItems: 'center',
  },
  airing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x2,
    marginHorizontal: space.margin,
    marginTop: space.x3,
    paddingHorizontal: space.x3,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface1,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  section: { paddingHorizontal: space.margin, paddingVertical: space.x4 },
  progressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    marginHorizontal: space.margin,
    padding: space.x4,
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
  },
  safeToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.borderSubtle, marginRight: space.x2 },
  safeOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.margin,
    paddingVertical: space.x2,
    minHeight: 40,
  },
});
