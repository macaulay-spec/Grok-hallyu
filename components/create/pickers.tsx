import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, space } from '../../constants/theme';
import { useApp } from '../../lib/hooks';
import { Actor, Drama, SpoilerLevel } from '../../lib/model';
import { allActors, allDramas } from '../../lib/store';
import { SPOILER_HELP, SPOILER_LABEL } from '../../lib/spoiler';
import { ActorPortrait } from '../drama/ActorCard';
import { DramaListRow } from '../drama/DramaCard';
import { EpisodeChip } from '../drama/EpisodeCard';
import { SearchField } from '../search/SearchField';
import { Button } from '../ui/Button';
import { Chip, ChipRow } from '../ui/Chip';
import { Sheet, SheetRow } from '../ui/Sheet';
import { Text } from '../ui/Text';

/** Drama picker: your watchlist first, then everything. */
export function DramaPickerSheet({ visible, onClose, onPick, title = 'Which drama?', exclude }: { visible: boolean; onClose: () => void; onPick: (d: Drama) => void; title?: string; exclude?: string }) {
  const { state } = useApp();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const all = allDramas(state).filter((d) => d.id !== exclude);
    const mine = new Set(Object.keys(state.watchlist));
    const sorted = [...all].sort((a, b) => Number(mine.has(b.id)) - Number(mine.has(a.id)) || b.followerCount - a.followerCount);
    const n = q.trim().toLowerCase();
    return n ? sorted.filter((d) => d.title.toLowerCase().includes(n) || d.originalTitle?.includes(q)) : sorted;
  }, [state, q, exclude]);
  return (
    <Sheet visible={visible} onClose={onClose} title={title} detent="full" scroll={false}>
      <View style={{ paddingHorizontal: space.x4, paddingBottom: space.x3 }}>
        <SearchField value={q} onChangeText={setQ} placeholder="Search titles" autoFocus />
      </View>
      <FlatList data={list} keyExtractor={(d) => d.id} keyboardShouldPersistTaps="handled" renderItem={({ item }) => <DramaListRow drama={item} onPress={() => { onPick(item); onClose(); }} subtitle={state.watchlist[item.id] ? `${{ want: 'Want to watch', watching: `Watching · Ep ${state.watchlist[item.id]!.currentEpisode}`, completed: 'Completed', dropped: 'Dropped' }[state.watchlist[item.id]!.status]} · ${item.year}` : `${item.year} · ${item.genres.slice(0, 2).join(', ')}`} />} ListEmptyComponent={<Text variant="bodySmall" tone="secondary" style={{ padding: space.x4 }}>No titles match “{q}”. Try the Korean title.</Text>} contentContainerStyle={{ paddingBottom: space.x8 }} />
    </Sheet>
  );
}

/** Episode picker for a drama: season chips → episode grid. */
export function EpisodePickerSheet({ visible, onClose, drama, value, onPick }: { visible: boolean; onClose: () => void; drama: Drama; value?: { season: number; episode?: number }; onPick: (v: { season: number; episode?: number } | undefined) => void }) {
  const { watch } = useApp();
  const [season, setSeason] = useState(value?.season ?? watch(drama.id)?.season ?? 1);
  const eps = drama.episodes.filter((e) => e.season === season);
  const total = drama.seasons.find((s) => s.number === season)?.episodeCount ?? drama.episodeCount;
  const numbers = eps.length ? eps.map((e) => e.number) : Array.from({ length: total }, (_, i) => i + 1);
  const current = watch(drama.id)?.season === season ? watch(drama.id)?.currentEpisode ?? 0 : 0;
  return (
    <Sheet visible={visible} onClose={onClose} title="Which episode?" subtitle="Ties the post to the episode and sets the spoiler boundary.">
      {drama.seasons.length > 1 ? (
        <ChipRow style={{ paddingHorizontal: space.x4, paddingBottom: space.x3 }}>
          {drama.seasons.map((s) => (
            <Chip key={s.number} label={`Season ${s.number}`} selected={season === s.number} onPress={() => setSeason(s.number)} size="sm" />
          ))}
        </ChipRow>
      ) : null}
      <View style={styles.grid}>
        {numbers.map((n) => (
          <EpisodeChip key={n} label={`${n}`} selected={value?.season === season && value?.episode === n} onPress={() => { onPick({ season, episode: n }); onClose(); }} />
        ))}
      </View>
      {current ? (
        <Text variant="caption" tone="secondary" style={{ paddingHorizontal: space.x4 }}>
          You’re on episode {current}.
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: space.x2, padding: space.x4 }}>
        <Button label="Whole season" variant="secondary" size="sm" onPress={() => { onPick({ season }); onClose(); }} />
        {value ? <Button label="Remove episode" variant="ghost" size="sm" onPress={() => { onPick(undefined); onClose(); }} /> : null}
      </View>
    </Sheet>
  );
}

/** Actor picker (≤ 3). Cast of the attached drama first. */
export function ActorPickerSheet({ visible, onClose, selected, onChange, dramaId, max = 3 }: { visible: boolean; onClose: () => void; selected: string[]; onChange: (ids: string[]) => void; dramaId?: string; max?: number }) {
  const { state, getDrama } = useApp();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const cast = new Set(getDrama(dramaId)?.cast.map((c) => c.actorId) ?? []);
    const all = [...allActors(state)].sort((a, b) => Number(cast.has(b.id)) - Number(cast.has(a.id)) || b.followerCount - a.followerCount);
    const n = q.trim().toLowerCase();
    return n ? all.filter((a) => a.name.toLowerCase().includes(n) || a.koreanName?.includes(q)) : all;
  }, [state, q, dramaId, getDrama]);
  const toggle = (a: Actor) => {
    if (selected.includes(a.id)) onChange(selected.filter((x) => x !== a.id));
    else if (selected.length < max) onChange([...selected, a.id]);
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Tag actors" subtitle={`Up to ${max}. Tagged actors show the post on their page.`} detent="full" scroll={false} headerRight={<Button label="Done" size="sm" variant="ghost" onPress={onClose} />}>
      <View style={{ paddingHorizontal: space.x4, paddingBottom: space.x3 }}>
        <SearchField value={q} onChangeText={setQ} placeholder="Search actors" />
      </View>
      <FlatList
        data={list}
        keyExtractor={(a) => a.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: space.x8 }}
        renderItem={({ item: a }) => {
          const on = selected.includes(a.id);
          const full = !on && selected.length >= max;
          return (
            <Pressable onPress={() => toggle(a)} disabled={full} style={[styles.actorRow, full ? { opacity: 0.4 } : null]} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: full }} accessibilityLabel={a.name}>
              <ActorPortrait actor={a} size={40} />
              <View style={{ flex: 1 }}>
                <Text variant="titleSmall">{a.name}</Text>
                {a.koreanName ? (
                  <Text variant="caption" tone="secondary">
                    {a.koreanName}
                  </Text>
                ) : null}
              </View>
              <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? colors.accentText : colors.textTertiary} />
            </Pressable>
          );
        }}
      />
    </Sheet>
  );
}

/** Spoiler level picker with plain-language help for each level. */
export function SpoilerSheet({ visible, onClose, value, onChange, drama, episode }: { visible: boolean; onClose: () => void; value: SpoilerLevel; onChange: (l: SpoilerLevel) => void; drama?: Drama; episode?: number }) {
  const levels: SpoilerLevel[] = ['none', 'episode', 'season', 'ending'];
  return (
    <Sheet visible={visible} onClose={onClose} title="Spoiler level" subtitle={drama ? `Readers who haven’t reached this point in ${drama.title} see a veil instead of your words.` : 'Attach a drama to make spoiler levels precise.'}>
      {levels.map((l) => (
        <SheetRow key={l} icon={l === 'none' ? 'eye-outline' : l === 'ending' ? 'flag-outline' : 'eye-off-outline'} label={l === 'episode' && episode ? `Episode ${episode} spoiler` : SPOILER_LABEL[l]} detail={SPOILER_HELP[l]} selected={value === l} disabled={(l === 'episode' && !episode && !drama) || (l !== 'none' && !drama)} onPress={() => { onChange(l); onClose(); }} />
      ))}
      {!drama ? (
        <Text variant="caption" tone="secondary" style={{ padding: space.x4 }}>
          Spoiler levels need a drama attached — otherwise we can’t tell who’s safe to show it to.
        </Text>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.x2, paddingHorizontal: space.x4 },
  actorRow: { flexDirection: 'row', alignItems: 'center', gap: space.x3, paddingHorizontal: space.x4, height: 56, borderRadius: radius.sm },
});
