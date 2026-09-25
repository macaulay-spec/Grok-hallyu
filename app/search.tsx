import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { CollectionCard } from '../components/collections/CollectionCard';
import { ActorCard } from '../components/drama/ActorCard';
import { DramaListRow } from '../components/drama/DramaCard';
import { PostCard } from '../components/feed/PostCard';
import { UserRow } from '../components/people/UserRow';
import { SearchField } from '../components/search/SearchField';
import { Button } from '../components/ui/Button';
import { Chip, ChipRow } from '../components/ui/Chip';
import { Screen, useListPadding } from '../components/ui/Screen';
import { Segmented } from '../components/ui/Segmented';
import { ListSkeleton } from '../components/ui/Skeleton';
import { EmptyState, InlineNotice } from '../components/ui/States';
import { Text } from '../components/ui/Text';
import { TopBar } from '../components/ui/TopBar';
import { colors, space } from '../constants/theme';
import { catalog } from '../lib/catalog';
import { useApp, useDebounced, useLoad, useNetwork } from '../lib/hooks';
import { Actor, Drama } from '../lib/model';
import { searchLocal, trendingDramas, trendingHashtags } from '../lib/selectors';
import { track } from '../lib/analytics';
import { useRemote } from '../lib/data/sync';

type Scope = 'all' | 'dramas' | 'actors' | 'people' | 'posts' | 'collections';

/**
 * Search — grouped results, one query. Local catalog answers instantly; the catalog provider (TMDB)
 * extends dramas/actors beyond what we hold locally. Hashtags land here in Posts scope.
 */
export default function Search() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string; scope?: Scope }>();
  const { state, dispatch } = useApp();
  const online = useNetwork();
  const padding = useListPadding();
  const inputRef = useRef<TextInput>(null);
  const [q, setQ] = useState(params.q ?? '');
  const [scope, setScope] = useState<Scope>(params.scope ?? (params.q?.startsWith('#') ? 'posts' : 'all'));
  const debounced = useDebounced(q.trim(), 250);
  useRemote(debounced.length > 1 ? `search:${encodeURIComponent(debounced)}` : 'noop', 15_000);
  const local = useMemo(() => searchLocal(state, debounced), [state, debounced]);
  const isTag = debounced.startsWith('#');

  const remote = useLoad(
    async (signal) => {
      const [dramas, actors] = await Promise.all([catalog.searchDramas(debounced, signal), catalog.searchActors(debounced, signal)]);
      const known = new Set(local.dramas.map((d) => d.provider?.id));
      const knownA = new Set(local.actors.map((a) => a.provider?.id));
      return { dramas: dramas.filter((d) => !known.has(d.provider?.id)), actors: actors.filter((a) => !knownA.has(a.provider?.id)) };
    },
    [debounced],
    catalog.available && online && debounced.length >= 2 && !isTag && (scope === 'all' || scope === 'dramas' || scope === 'actors'),
  );

  useEffect(() => {
    if (!params.q) setTimeout(() => inputRef.current?.focus(), 80);
  }, [params.q]);

  useEffect(() => {
    if (debounced.length >= 2) {
      dispatch({ type: 'recentSearch', q: debounced });
      track('search.query', { length: debounced.length, scope, tag: debounced.startsWith('#') });
    }
  }, [debounced, dispatch, scope]);

  useEffect(() => {
    const fresh = (remote.data?.actors ?? []).filter((a) => !state.importedActors.some((x) => x.id === a.id));
    if (fresh.length) dispatch({ type: 'import', actors: fresh });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote.data]);

  const dramas: Drama[] = [...local.dramas, ...(remote.data?.dramas ?? [])];
  const actors: Actor[] = [...local.actors, ...(remote.data?.actors ?? [])];
  const total = dramas.length + actors.length + local.people.length + local.posts.length + local.collections.length + local.episodes.length;
  const openDrama = (d: Drama) => {
    if (!state.importedDramas.some((x) => x.id === d.id) && d.provider) dispatch({ type: 'import', dramas: [d] });
    router.push(`/drama/${d.id}`);
  };

  const Group = ({ title, count, scopeKey, children }: { title: string; count: number; scopeKey: Scope; children: React.ReactNode }) =>
    count ? (
      <View style={styles.group}>
        <View style={styles.groupHead}>
          <Text variant="overline">
            {title} · {count}
          </Text>
          {scope === 'all' && count > 3 ? (
            <Pressable onPress={() => setScope(scopeKey)} hitSlop={8} accessibilityRole="button">
              <Text variant="label" tone="accent">
                See all
              </Text>
            </Pressable>
          ) : null}
        </View>
        {children}
      </View>
    ) : null;

  const limit = (n: number) => (scope === 'all' ? n : 50);

  const idle = !debounced;
  return (
    <Screen
      header={
        <TopBar
          mode="stack"
          center={<SearchField ref={inputRef} value={q} onChangeText={setQ} placeholder="Dramas, actors, people, posts, #tags" style={{ flex: 1, height: 40 }} onSubmitEditing={() => Keyboard.dismiss()} />}
          right={<Button label="Cancel" variant="ghost" size="sm" onPress={() => router.back()} />}
        />
      }
    >
      {!idle ? <Segmented scrollable items={[{ key: 'all', label: 'All' }, { key: 'dramas', label: 'Dramas' }, { key: 'actors', label: 'Actors' }, { key: 'people', label: 'People' }, { key: 'posts', label: 'Posts' }, { key: 'collections', label: 'Collections' }]} value={scope} onChange={setScope} /> : null}

      {idle ? (
        <ScrollView contentContainerStyle={padding} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {state.recentSearches.length ? (
            <View style={styles.group}>
              <View style={styles.groupHead}>
                <Text variant="overline">Recent</Text>
                <Pressable onPress={() => dispatch({ type: 'recentSearch', clear: true })} hitSlop={8} accessibilityRole="button">
                  <Text variant="label" tone="secondary">
                    Clear
                  </Text>
                </Pressable>
              </View>
              {state.recentSearches.slice(0, 8).map((r) => (
                <Pressable key={r} onPress={() => setQ(r)} style={styles.recent} accessibilityRole="button" accessibilityLabel={`Search ${r}`}>
                  <Ionicons name="time-outline" size={18} color={colors.textTertiary} />
                  <Text variant="body" style={{ flex: 1 }}>
                    {r}
                  </Text>
                  <Ionicons name="arrow-up-outline" size={16} color={colors.textTertiary} style={{ transform: [{ rotate: '-45deg' }] }} />
                </Pressable>
              ))}
            </View>
          ) : null}
          <View style={styles.group}>
            <Text variant="overline" style={{ paddingHorizontal: space.margin, marginBottom: space.x2 }}>
              Trending tags
            </Text>
            <ChipRow style={{ paddingHorizontal: space.margin }}>
              {trendingHashtags(state, 12).map(({ tag: t }) => (
                <Chip key={t} label={`#${t}`} onPress={() => { setQ(`#${t}`); setScope('posts'); }} />
              ))}
            </ChipRow>
          </View>
          <View style={styles.group}>
            <Text variant="overline" style={{ paddingHorizontal: space.margin, marginBottom: space.x2 }}>
              Trending dramas
            </Text>
            {trendingDramas(state, 6).map((d) => (
              <DramaListRow key={d.id} drama={d} subtitle={`${d.year} · ${d.genres.slice(0, 2).join(', ')}`} />
            ))}
          </View>
          {!catalog.available ? (
            <View style={{ paddingHorizontal: space.margin }}>
              <InlineNotice tone="info" icon="information-circle-outline" text="Searching the local catalog. Connect a catalog key to search every Korean drama ever aired." />
            </View>
          ) : null}
        </ScrollView>
      ) : (
        <FlatList
          data={[0]}
          keyExtractor={() => 'results'}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={padding}
          renderItem={() => (
            <View>
              {!online ? (
                <View style={{ paddingHorizontal: space.margin, marginTop: space.x3 }}>
                  <InlineNotice tone="warning" icon="cloud-offline-outline" text="You’re offline — showing what’s on this device." />
                </View>
              ) : null}
              {(scope === 'all' || scope === 'dramas') && (
                <Group title="Dramas" count={dramas.length} scopeKey="dramas">
                  {dramas.slice(0, limit(4)).map((d) => (
                    <DramaListRow key={d.id} drama={d} subtitle={`${d.year}${d.network ? ` · ${d.network}` : ''} · ${d.genres.slice(0, 2).join(', ')}`} badge={d.provider && !state.importedDramas.some((x) => x.id === d.id) ? 'TMDB' : undefined} onPress={() => openDrama(d)} />
                  ))}
                  {remote.showSkeleton ? <ListSkeleton rows={2} /> : null}
                </Group>
              )}
              {(scope === 'all' || scope === 'dramas') && local.episodes.length ? (
                <Group title="Episodes" count={local.episodes.length} scopeKey="dramas">
                  {local.episodes.slice(0, limit(3)).map(({ drama, episode }) => (
                    <DramaListRow key={episode.id} drama={drama} title={`${drama.title} · Ep ${episode.number}`} subtitle={episode.title ?? ''} onPress={() => router.push(`/episode/${drama.id}/${episode.season}/${episode.number}`)} />
                  ))}
                </Group>
              ) : null}
              {(scope === 'all' || scope === 'actors') && (
                <Group title="Actors" count={actors.length} scopeKey="actors">
                  {actors.slice(0, limit(4)).map((a) => (
                    <ActorCard key={a.id} actor={a} layout="row" role={a.knownFor.length ? `Known for ${a.knownFor.length} titles` : undefined} />
                  ))}
                  {remote.showSkeleton && !dramas.length ? <ListSkeleton rows={2} /> : null}
                </Group>
              )}
              {(scope === 'all' || scope === 'people') && (
                <Group title="People" count={local.people.length} scopeKey="people">
                  {local.people.slice(0, limit(4)).map((u) => (
                    <UserRow key={u.id} user={u} />
                  ))}
                </Group>
              )}
              {(scope === 'all' || scope === 'collections') && (
                <Group title="Collections" count={local.collections.length} scopeKey="collections">
                  <View style={{ paddingHorizontal: space.margin, gap: space.x3 }}>
                    {local.collections.slice(0, limit(3)).map((c) => (
                      <CollectionCard key={c.id} collection={c} layout="row" />
                    ))}
                  </View>
                </Group>
              )}
              {(scope === 'all' || scope === 'posts') && (
                <Group title={isTag ? `Posts tagged ${debounced}` : 'Posts'} count={local.posts.length} scopeKey="posts">
                  {local.posts.slice(0, limit(3)).map((p) => (
                    <PostCard key={p.id} post={p} />
                  ))}
                </Group>
              )}
              {remote.error && online ? (
                <View style={{ paddingHorizontal: space.margin, marginTop: space.x3, gap: space.x2 }}>
                  <InlineNotice tone="warning" icon="cloud-offline-outline" text="Couldn’t reach the wider catalog. Showing local results." />
                  <Button label="Retry" variant="ghost" size="sm" onPress={remote.reload} style={{ alignSelf: 'flex-start' }} />
                </View>
              ) : null}
              {!total && !remote.loading ? (
                <EmptyState icon="search-outline" title={`Nothing for “${debounced}”`} body={isTag ? 'No posts carry this tag yet. Be the first — tag it in a post.' : 'Check the spelling, try the Korean title, or search an actor’s name.'} actionLabel={isTag ? 'Post with this tag' : 'Browse Explore'} onAction={() => (isTag ? router.push({ pathname: '/create/post', params: { tag: debounced.slice(1) } }) : router.replace('/(tabs)/explore'))} />
              ) : null}
              {debounced.length === 1 ? (
                <Text variant="caption" tone="tertiary" style={{ paddingHorizontal: space.margin, marginTop: space.x3 }}>
                  Keep typing…
                </Text>
              ) : null}
            </View>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { marginTop: space.x5 },
  groupHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.margin, marginBottom: space.x2 },
  recent: { flexDirection: 'row', alignItems: 'center', gap: space.x3, paddingHorizontal: space.margin, height: 48 },
});
