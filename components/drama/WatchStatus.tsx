import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius, space } from '../../constants/theme';
import { haptic, useApp, useReduceMotion, useRequireMember } from '../../lib/hooks';
import { springs } from '../../lib/motion';
import { Drama, LIMITS, WatchStatus } from '../../lib/model';
import { Button, ButtonSize } from '../ui/Button';
import { Sheet, SheetRow } from '../ui/Sheet';
import { Text } from '../ui/Text';
import { TextField } from '../ui/TextField';
import { useToast } from '../ui/Toast';
import { track } from '../../lib/analytics';

export const STATUS_LABEL: Record<WatchStatus, string> = { want: 'Want to watch', watching: 'Watching', completed: 'Completed', dropped: 'Dropped' };
export const STATUS_ICON: Record<WatchStatus, keyof typeof Ionicons.glyphMap> = { want: 'add-circle-outline', watching: 'play-circle-outline', completed: 'checkmark-circle-outline', dropped: 'close-circle-outline' };

interface WatchStatusButtonProps {
  drama: Drama;
  size?: ButtonSize;
  block?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean; // icon-only chip variant on cards
}

/** The "Where are you" control: opens the WatchStatus sheet. */
export function WatchStatusButton({ drama, size = 'sm', block, style }: WatchStatusButtonProps) {
  const { watch } = useApp();
  const require = useRequireMember();
  const [open, setOpen] = useState(false);
  const item = watch(drama.id);
  const label = item ? (item.status === 'watching' ? `Watching · Ep ${item.currentEpisode}/${drama.seasons.find((s) => s.number === item.season)?.episodeCount ?? drama.episodeCount}` : STATUS_LABEL[item.status]) : 'Add to watchlist';
  return (
    <>
      <Button label={label} variant={item ? 'secondary' : 'accentSoft'} size={size} block={block} style={style} icon={item ? STATUS_ICON[item.status] : 'add'} onPress={() => require('track this drama', () => setOpen(true))} accessibilityLabel={`Watch status: ${label}`} />
      <WatchStatusSheet drama={drama} visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Sheet: status list → progress stepper (Watching) → private note. */
export function WatchStatusSheet({ drama, visible, onClose }: { drama: Drama; visible: boolean; onClose: () => void }) {
  const { watch, dispatch } = useApp();
  const toast = useToast();
  const item = watch(drama.id);
  const [season, setSeason] = useState(item?.season ?? 1);
  const [note, setNote] = useState(item?.note ?? '');
  const [editingNote, setEditingNote] = useState(false);
  useEffect(() => {
    if (visible) {
      setSeason(item?.season ?? 1);
      setNote(item?.note ?? '');
      setEditingNote(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const total = drama.seasons.find((s) => s.number === season)?.episodeCount ?? drama.episodeCount;
  const current = item?.season === season ? item.currentEpisode : 0;

  const reduce = useReduceMotion();
  const epPop = useRef(new Animated.Value(1)).current;
  const setStatus = (status: WatchStatus | null) => {
    haptic.select();
    dispatch({ type: 'watch', dramaId: drama.id, status, season });
    track('watch.set', { status });
    AccessibilityInfo.announceForAccessibility?.(status ? `${drama.title}: ${STATUS_LABEL[status]}` : `${drama.title} removed from your watchlist`);
    if (status === null) toast.show({ message: `Removed ${drama.title} from your watchlist`, actionLabel: 'Undo', onAction: () => item && dispatch({ type: 'watch', dramaId: drama.id, status: item.status, season: item.season }) });
    else if (status !== 'watching') {
      toast.show({ message: `${drama.title} · ${STATUS_LABEL[status]}`, icon: 'checkmark-circle' });
      onClose();
    }
  };
  const setProgress = (ep: number) => {
    haptic.light();
    dispatch({ type: 'progress', dramaId: drama.id, season, episode: ep, total });
    AccessibilityInfo.announceForAccessibility?.(`Episode ${ep} of ${total}`);
    if (!reduce) {
      epPop.setValue(0.86);
      Animated.spring(epPop, { toValue: 1, ...springs.snappy }).start();
    }
    if (ep >= total && total > 0) {
      toast.show({ message: `${drama.title} completed. Spoilers are now unveiled for you.`, icon: 'checkmark-circle', tone: 'success' });
      onClose();
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={drama.title} subtitle={item ? `${STATUS_LABEL[item.status]} · updated ${item.updatedAt.slice(0, 10)}` : 'Not on your watchlist yet'}>
      {(['want', 'watching', 'completed', 'dropped'] as WatchStatus[]).map((s) => (
        <SheetRow key={s} icon={STATUS_ICON[s]} label={STATUS_LABEL[s]} selected={item?.status === s} onPress={() => setStatus(s)} detail={s === 'want' ? 'Spoilers stay veiled' : s === 'watching' ? 'Veils spoilers past your episode' : s === 'completed' ? 'Everything unveiled' : 'Everything unveiled, no nudges'} />
      ))}

      {item?.status === 'watching' ? (
        <View style={styles.progress}>
          {drama.seasons.length > 1 ? (
            <View style={styles.seasonRow}>
              {drama.seasons.map((s) => (
                <Pressable key={s.number} onPress={() => setSeason(s.number)} style={[styles.seasonChip, season === s.number ? styles.seasonChipOn : null]} accessibilityRole="button" accessibilityState={{ selected: season === s.number }}>
                  <Text variant="label" style={{ color: season === s.number ? colors.accentText : colors.textSecondary }}>
                    S{s.number}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Text variant="overline" style={{ marginBottom: space.x2 }}>
            Where you are
          </Text>
          <View style={styles.stepper}>
            <Pressable onPress={() => setProgress(current - 1)} disabled={current <= 0} style={[styles.stepBtn, current <= 0 ? { opacity: 0.4 } : null]} accessibilityRole="button" accessibilityLabel="Previous episode">
              <Ionicons name="remove" size={22} color={colors.textPrimary} />
            </Pressable>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Animated.Text style={[{ transform: [{ scale: epPop }] }]} accessible={false}>
                <Text variant="headline" numeric>
                  Ep {current}
                </Text>
              </Animated.Text>
              <Text variant="caption" tone="secondary" numeric>
                of {total}
              </Text>
            </View>
            <Pressable onPress={() => setProgress(current + 1)} disabled={current >= total} style={[styles.stepBtn, current >= total ? { opacity: 0.4 } : null]} accessibilityRole="button" accessibilityLabel="Next episode">
              <Ionicons name="add" size={22} color={colors.textPrimary} />
            </Pressable>
          </View>
          <View style={styles.quick}>
            {[Math.max(0, current - 1), current + 1, current + 2, total].filter((v, i, a) => v >= 0 && v <= total && a.indexOf(v) === i && v !== current).map((v) => (
              <Pressable key={v} onPress={() => setProgress(v)} style={styles.quickChip} accessibilityRole="button" accessibilityLabel={v === total ? 'Mark all watched' : `Set episode ${v}`}>
                <Text variant="label" tone="secondary">
                  {v === total ? 'All' : `Ep ${v}`}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {item ? (
        <View style={styles.noteWrap}>
          {editingNote ? (
            <TextField label="Private note" value={note} onChangeText={setNote} counter={LIMITS.note} maxLength={LIMITS.note + 20} placeholder="Only you can see this" autoFocus onBlur={() => { dispatch({ type: 'note', dramaId: drama.id, note: note.trim() }); setEditingNote(false); }} returnKeyType="done" onSubmitEditing={() => { dispatch({ type: 'note', dramaId: drama.id, note: note.trim() }); setEditingNote(false); }} />
          ) : (
            <SheetRow icon="create-outline" label={item.note ? item.note : 'Add a private note'} detail={item.note ? 'Private note · tap to edit' : 'Only you can see it'} onPress={() => setEditingNote(true)} />
          )}
          <SheetRow icon="trash-outline" label="Remove from watchlist" tone="danger" onPress={() => setStatus(null)} />
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  progress: { backgroundColor: colors.surface1, borderRadius: radius.md, padding: space.x4, marginTop: space.x3 },
  seasonRow: { flexDirection: 'row', gap: space.x2, marginBottom: space.x3 },
  seasonChip: { paddingHorizontal: 12, height: 30, borderRadius: 15, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  seasonChipOn: { backgroundColor: colors.accentSoft },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  stepBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  quick: { flexDirection: 'row', gap: space.x2, marginTop: space.x3, justifyContent: 'center' },
  quickChip: { paddingHorizontal: 12, height: 30, borderRadius: 15, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  noteWrap: { marginTop: space.x3 },
});
