import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, Share, StyleSheet, View } from 'react-native';
import { CreateSheet } from '../../../../components/create/CreateSheet';
import { episodeState } from '../../../../components/drama/EpisodeCard';
import { PostCard } from '../../../../components/feed/PostCard';
import { ReactionMeter } from '../../../../components/feed/Reactions';
import { Button } from '../../../../components/ui/Button';
import { Chip, ChipRow } from '../../../../components/ui/Chip';
import { IconButton } from '../../../../components/ui/IconButton';
import { Backdrop, Poster } from '../../../../components/ui/Poster';
import { Screen, useListPadding } from '../../../../components/ui/Screen';
import { SectionHeader } from '../../../../components/ui/Section';
import { EmptyState, ErrorState, InlineNotice } from '../../../../components/ui/States';
import { Text } from '../../../../components/ui/Text';
import { useToast } from '../../../../components/ui/Toast';
import { TopBar } from '../../../../components/ui/TopBar';
import { colors, radius, space } from '../../../../constants/theme';
import { countdown, dayLabel, runtimeLabel, shortDate, timeOfDay } from '../../../../lib/format';
import { haptic, useApp, useLayout, useRequireMember } from '../../../../lib/hooks';
import { emptyReactions, Post } from '../../../../lib/model';
import { getEpisode, postsForEpisode } from '../../../../lib/selectors';
import { hasWatched } from '../../../../lib/spoiler';

type Filter = 'all' | 'discussion' | 'reaction' | 'short' | 'post';

/**
 * Episode room — the unit of conversation. Watched gate first, then the meter, then the thread.
 * Everything posted from here carries drama + season + episode context.
 */
export default function EpisodeRoom() {
  const router = useRouter();
  const toast = useToast();
  const { dramaId, season: seasonParam, number: numberParam } = useLocalSearchParams<{ dramaId: string; season: string; number: string }>();
  const season = Number(seasonParam) || 1;
  const number = Number(numberParam) || 1;
  const { state, dispatch, getDrama, watch } = useApp();
  const require = useRequireMember();
  const { width } = useLayout();
  const padding = useListPadding(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [create, setCreate] = useState(false);
  const [gateDismissed, setGateDismissed] = useState(false);

  const drama = getDrama(dramaId);
  const episode = drama ? getEpisode(drama, season, number) : undefined;
  const posts = useMemo(() => (drama ? postsForEpisode(state, drama.id, season, number) : []), [state, drama, season, number]);
  const filtered = useMemo(() => (filter === 'all' ? posts : posts.filter((p) => p.type === filter)), [posts, filter]);
  const meter = useMemo(() => posts.reduce((acc, p) => { for (const k of Object.keys(acc) as (keyof typeof acc)[]) acc[k] += p.reactions[k]; return acc; }, emptyReactions()), [posts]);

  if (!drama || !episode) {
    return (
      <Screen header={<TopBar mode="stack" title="Episode" />}>
        <ErrorState kind="notFound" title="Episode not found" body="This episode isn’t in the schedule yet, or the link is wrong." onRetry={() => (drama ? router.replace(`/drama/${drama.id}`) : router.back())} />
      </Screen>
    );
  }

  const item = watch(drama.id);
  const watched = hasWatched(item, season, number);
  const st = episodeState(episode);
  const total = drama.seasons.find((s) => s.number === season)?.episodeCount ?? drama.episodeCount;
  const prev = getEpisode(drama, season, number - 1);
  const next = getEpisode(drama, season, number + 1);
  const multi = drama.seasons.length > 1;
  const showGate = st !== 'upcoming' && !watched && !gateDismissed && state.prefs.protection !== 'off' && item?.status !== 'completed';
  const veiledCount = posts.filter((p) => p.spoiler !== 'none').length;

  const markWatched = () =>
    require('mark episodes watched', () => {
      haptic.success();
      dispatch({ type: 'progress', dramaId: drama.id, season, episode: number, total });
      toast.show({ message: number >= total ? `${drama.title} completed 🎉` : `Episode ${number} marked watched`, tone: 'success', icon: 'checkmark-circle' });
    });

  const header = (
    <View>
      <Backdrop uri={episode.stillUrl ?? drama.backdropUrl ?? drama.posterUrl ?? drama.posterLocal} fallbackColor={drama.tone} width="100%" height={Math.min(300, Math.round(width * 9 / 16))} label={`Episode ${number} still`}>
        <View style={styles.scrim} />
        <View style={styles.heroText}>
          <Pressable onPress={() => router.push(`/drama/${drama.id}`)} accessibilityRole="link" style={{ flexDirection: 'row', alignItems: 'center', gap: space.x2 }}>
            <Poster drama={drama} width={28} rounded={4} />
            <Text variant="label" style={{ color: colors.onMedia }} numberOfLines={1}>
              {drama.title}
            </Text>
            <Ionicons name="chevron-forward" size={12} color={colors.onMedia} />
          </Pressable>
          <Text variant="headline" style={{ color: colors.onMedia }}>
            {multi ? `S${season} · ` : ''}Episode {number}
            {episode.title ? ` — ${episode.title}` : ''}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {st === 'live' ? <View style={styles.live} /> : null}
            <Text variant="caption" style={{ color: colors.textSecondary }}>
              {st === 'live' ? 'Just aired · room is live' : st === 'upcoming' && episode.airDate ? `Airs ${dayLabel(episode.airDate)} · ${timeOfDay(episode.airDate)} · ${countdown(episode.airDate)}` : [episode.airDate ? shortDate(episode.airDate) : 'TBA', runtimeLabel(episode.runtime)].filter(Boolean).join(' · ')}
              {' · '}
              {posts.length} {posts.length === 1 ? 'post' : 'posts'}
            </Text>
          </View>
        </View>
      </Backdrop>

      <View style={styles.nav}>
        <Button label={prev ? `Ep ${prev.number}` : 'First'} icon="chevron-back" variant="ghost" size="sm" disabled={!prev} onPress={() => prev && router.replace(`/episode/${drama.id}/${season}/${prev.number}`)} />
        <Pressable onPress={() => router.push({ pathname: '/drama/[id]', params: { id: drama.id, tab: 'episodes' } })} accessibilityRole="button" accessibilityLabel="All episodes">
          <Text variant="label" tone="secondary">
            {number} / {total}
          </Text>
        </Pressable>
        <Button label={next ? `Ep ${next.number}` : 'Last'} iconRight="chevron-forward" variant="ghost" size="sm" disabled={!next} onPress={() => next && router.replace(`/episode/${drama.id}/${season}/${next.number}`)} />
      </View>

      {st === 'upcoming' ? (
        <View style={{ paddingHorizontal: space.margin }}>
          <InlineNotice tone="info" icon="time-outline" text={`Not aired yet. Predictions and hype are welcome — spoilers from previews still need a spoiler level.`} />
        </View>
      ) : showGate ? (
        <View style={styles.gate}>
          <Ionicons name="eye-off-outline" size={22} color={colors.textPrimary} />
          <Text variant="titleSmall" style={{ marginTop: space.x2 }}>
            Have you watched Episode {number}?
          </Text>
          <Text variant="bodySmall" tone="secondary" align="center" style={{ marginTop: 4 }}>
            {veiledCount ? `${veiledCount} of ${posts.length} posts here are marked as spoilers. ` : ''}Say yes and we unveil this room; say not yet and spoilers stay covered.
          </Text>
          <View style={{ flexDirection: 'row', gap: space.x2, marginTop: space.x4 }}>
            <Button label="Yes, mark watched" size="sm" onPress={markWatched} />
            <Button label="Not yet — protect me" size="sm" variant="secondary" onPress={() => setGateDismissed(true)} />
          </View>
        </View>
      ) : (
        <Pressable onPress={watched ? () => require('change progress', () => { dispatch({ type: 'progress', dramaId: drama.id, season, episode: number - 1, total }); toast.show({ message: `Episode ${number} marked unwatched` }); }) : markWatched} style={[styles.watchedRow, watched ? styles.watchedOn : null]} accessibilityRole="checkbox" accessibilityState={{ checked: watched }}>
          <Ionicons name={watched ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={watched ? colors.success : colors.textSecondary} />
          <Text variant="label" style={{ flex: 1 }}>
            {watched ? 'Watched' : 'Mark as watched'}
          </Text>
          {watched && next && !hasWatched(item, season, next.number) ? (
            <Text variant="caption" tone="secondary">
              Up next: Ep {next.number}
            </Text>
          ) : null}
        </Pressable>
      )}

      {episode.synopsis ? (
        <View style={{ paddingHorizontal: space.margin, paddingTop: space.x4 }}>
          <Text variant="body" tone="secondary" numberOfLines={watched ? undefined : 2}>
            {episode.synopsis}
          </Text>
        </View>
      ) : null}

      {posts.length ? (
        <View style={{ paddingHorizontal: space.margin, paddingTop: space.x5 }}>
          <SectionHeader eyebrow="Reaction meter" title="How this episode landed" style={{ paddingHorizontal: 0 }} />
          <ReactionMeter counts={meter} />
        </View>
      ) : null}

      <ChipRow style={{ paddingHorizontal: space.margin, paddingTop: space.x5, paddingBottom: space.x2 }}>
        {(['all', 'discussion', 'reaction', 'post', 'short'] as Filter[]).map((f) => (
          <Chip key={f} label={f === 'all' ? `All · ${posts.length}` : f === 'post' ? 'Posts' : f[0]!.toUpperCase() + f.slice(1) + 's'} size="sm" selected={filter === f} onPress={() => setFilter(f)} />
        ))}
      </ChipRow>
    </View>
  );

  return (
    <Screen header={<TopBar mode="stack" transparent title={`Ep ${number}`} subtitle={drama.title} right={<IconButton icon="share-social-outline" label="Share" onPress={() => Share.share({ message: `${drama.title} Ep ${number} on Hallyu — https://hallyu.app/d/${drama.id}/e/${season}/${number}` })} />} />}>
      <FlatList<Post>
        data={filtered}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        contentContainerStyle={padding}
        renderItem={({ item: p }) => <PostCard post={p} hideContext />}
        ListEmptyComponent={<EmptyState compact icon="chatbubbles-outline" title={st === 'upcoming' ? 'The room opens when it airs' : filter === 'all' ? 'Quiet room, so far' : `No ${filter}s for this episode`} body={st === 'upcoming' ? 'Follow the drama with alerts on and we’ll bring you back the moment it airs.' : 'Reactions, theories, that one scene — post first and set the tone.'} actionLabel={st === 'upcoming' ? undefined : 'Post about this episode'} onAction={() => require('post', () => setCreate(true))} />}
        ListFooterComponent={filtered.length ? <View style={{ padding: space.margin }}><Button label={`Post about Episode ${number}`} variant="secondary" icon="create-outline" block onPress={() => require('post', () => setCreate(true))} /></View> : null}
      />
      <CreateSheet visible={create} onClose={() => setCreate(false)} context={{ dramaId: drama.id, season, episode: number }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,10,10,0.5)' },
  heroText: { position: 'absolute', left: space.margin, right: space.margin, bottom: space.x4, gap: 6 },
  live: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.live },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.x2, paddingVertical: space.x2 },
  gate: { marginHorizontal: space.margin, padding: space.x5, alignItems: 'center', backgroundColor: colors.surface1, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSubtle },
  watchedRow: { flexDirection: 'row', alignItems: 'center', gap: space.x3, marginHorizontal: space.margin, paddingHorizontal: space.x4, height: 48, borderRadius: radius.md, backgroundColor: colors.surface1 },
  watchedOn: { borderWidth: 1, borderColor: colors.borderSubtle },
});
