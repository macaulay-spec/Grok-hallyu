import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, motion, radius, space } from '../../constants/theme';
import { compact } from '../../lib/format';
import { haptic, useApp, useReduceMotion, useRequireMember } from '../../lib/hooks';
import { springs } from '../../lib/motion';
import { ReactionCounts, ReactionKind, REACTIONS } from '../../lib/model';
import { reactionTotal, topReactions } from '../../lib/selectors';
import { Sheet } from '../ui/Sheet';
import { Text } from '../ui/Text';

export const REACTION_COLOR: Record<ReactionKind, string> = colors.reaction;

export function ReactionGlyph({ kind, size = 16, active }: { kind: ReactionKind; size?: number; active?: boolean }) {
  const r = REACTIONS.find((x) => x.kind === kind)!;
  const icon: Record<ReactionKind, keyof typeof Ionicons.glyphMap> = { loved: active ? 'heart' : 'heart-outline', cried: active ? 'water' : 'water-outline', screamed: active ? 'flash' : 'flash-outline', swooned: active ? 'sparkles' : 'sparkles-outline', laughed: active ? 'happy' : 'happy-outline', furious: active ? 'flame' : 'flame-outline' };
  return <Ionicons name={icon[kind]} size={size} color={active ? REACTION_COLOR[kind] : colors.textSecondary} accessibilityLabel={r.label} />;
}

interface ReactionButtonProps {
  targetId: string;
  counts: ReactionCounts;
  isComment?: boolean;
  compactMode?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Tap = Loved (or your current reaction off). Long-press = picker with all six. */
export function ReactionButton({ targetId, counts, isComment, compactMode, style }: ReactionButtonProps) {
  const { myReaction, dispatch, state } = useApp();
  const require = useRequireMember();
  const mine = myReaction(targetId);
  const [picker, setPicker] = useState(false);
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const bloom = useRef(new Animated.Value(0)).current;
  const [bloomColor, setBloomColor] = useState<string>(colors.accent);
  const total = reactionTotal({ reactions: counts });

  /** Scale pop + a soft colour bloom behind the glyph in the reaction's colour. Reduced motion → just the colour change. */
  const pop = (kind: ReactionKind | null) => {
    if (reduce || !kind) return;
    setBloomColor(REACTION_COLOR[kind]);
    scale.setValue(0.7);
    bloom.setValue(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, ...springs.bouncy }),
      Animated.timing(bloom, { toValue: 1, duration: motion.long, useNativeDriver: true }),
    ]).start(() => bloom.setValue(0));
  };

  const set = (kind: ReactionKind | null) => {
    require('react to posts', () => {
      // Each reaction has its own weight in the hand: the loud ones thump, the soft ones tap.
      if (!kind) haptic.select();
      else if (kind === 'screamed' || kind === 'furious') haptic.medium();
      else haptic.light();
      dispatch({ type: 'react', targetId, kind, isComment });
      pop(kind);
      const label = kind ? REACTIONS.find((r) => r.kind === kind)?.label : null;
      AccessibilityInfo.announceForAccessibility?.(label ? `Reacted ${label}` : 'Reaction removed');
    });
  };

  const onPress = () => {
    if (!state.prefs.oneTapReactions) return setPicker(true);
    set(mine ? null : 'loved');
  };

  return (
    <>
      <Pressable onPress={onPress} onLongPress={() => { haptic.medium(); setPicker(true); }} delayLongPress={280} hitSlop={6} accessibilityRole="button" accessibilityLabel={mine ? `You reacted ${mine}. ${total} reactions. Double tap to remove, long press to change.` : `React. ${total} reactions. Long press for more reactions.`} style={[styles.btn, style]}>
        <View style={styles.glyphHost}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.bloom,
              {
                backgroundColor: bloomColor,
                opacity: bloom.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.35, 0] }),
                transform: [{ scale: bloom.interpolate({ inputRange: [0, 1], outputRange: [0.4, 2.2] }) }],
              },
            ]}
          />
          <Animated.View style={{ transform: [{ scale }] }}>
            <ReactionGlyph kind={mine ?? 'loved'} size={compactMode ? 16 : 20} active={!!mine} />
          </Animated.View>
        </View>
        {total > 0 ? (
          <Text variant={compactMode ? 'caption' : 'label'} style={{ color: mine ? REACTION_COLOR[mine] : colors.textSecondary }} numeric>
            {compact(total)}
          </Text>
        ) : null}
      </Pressable>
      <ReactionPicker visible={picker} onClose={() => setPicker(false)} current={mine} onPick={(k) => { set(k === mine ? null : k); setPicker(false); }} />
    </>
  );
}

export function ReactionPicker({ visible, onClose, current, onPick }: { visible: boolean; onClose: () => void; current?: ReactionKind; onPick: (k: ReactionKind) => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="How did it land?">
      <View style={styles.pickerRow}>
        {REACTIONS.map((r, i) => {
          const active = current === r.kind;
          return (
            <Stagger key={r.kind} index={i} visible={visible}>
              <Pressable onPress={() => onPick(r.kind)} style={[styles.pick, active ? { backgroundColor: colors.accentSoft, borderColor: REACTION_COLOR[r.kind] } : null]} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={r.label}>
                <ReactionGlyph kind={r.kind} size={26} active />
                <Text variant="caption" style={{ color: active ? colors.textPrimary : colors.textSecondary }}>
                  {r.label}
                </Text>
              </Pressable>
            </Stagger>
          );
        })}
      </View>
    </Sheet>
  );
}

/** 30ms-per-item entrance for the picker: glyphs rise into place instead of appearing. */
function Stagger({ index, visible, children }: { index: number; visible: boolean; children: React.ReactNode }) {
  const reduce = useReduceMotion();
  const a = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (!visible) return;
    if (reduce) {
      a.setValue(1);
      return;
    }
    a.setValue(0);
    Animated.spring(a, { toValue: 1, delay: 60 + index * 30, ...springs.snappy }).start();
  }, [visible, index, a, reduce]);
  return <Animated.View style={{ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }, { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }}>{children}</Animated.View>;
}

/** Stacked glyphs + total: "♥ 💧 ⚡ 412" — the summary shown on cards. */
export function ReactionSummary({ counts, style }: { counts: ReactionCounts; style?: StyleProp<ViewStyle> }) {
  const total = reactionTotal({ reactions: counts });
  if (!total) return null;
  const top = topReactions({ reactions: counts }, 3);
  return (
    <View style={[styles.summary, style]} accessibilityLabel={`${total} reactions, mostly ${top.join(', ')}`}>
      <View style={{ flexDirection: 'row' }}>
        {top.map((k, i) => (
          <View key={k} style={[styles.stack, { marginLeft: i ? -6 : 0, zIndex: 3 - i }]}>
            <ReactionGlyph kind={k} size={12} active />
          </View>
        ))}
      </View>
      <Text variant="caption" tone="secondary" numeric>
        {compact(total)}
      </Text>
    </View>
  );
}

/** Episode Reaction Meter: distribution bars of the six reactions. */
export function ReactionMeter({ counts, style }: { counts: ReactionCounts; style?: StyleProp<ViewStyle> }) {
  const total = reactionTotal({ reactions: counts });
  const widths = useRef(REACTIONS.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    Animated.stagger(
      40,
      REACTIONS.map((r, i) => Animated.timing(widths[i]!, { toValue: total ? counts[r.kind] / total : 0, duration: motion.long, useNativeDriver: false })),
    ).start();
  }, [counts, total, widths]);
  if (!total) {
    return (
      <View style={[styles.meter, style]}>
        <Text variant="bodySmall" tone="secondary">
          No reactions yet. Be the first — how did this episode land?
        </Text>
      </View>
    );
  }
  return (
    <View style={[styles.meter, style]} accessibilityLabel={`Reaction meter. ${REACTIONS.map((r) => `${r.label} ${Math.round((counts[r.kind] / total) * 100)} percent`).join(', ')}`}>
      {REACTIONS.map((r, i) => {
        const pct = Math.round((counts[r.kind] / total) * 100);
        return (
          <View key={r.kind} style={styles.meterRow}>
            <View style={styles.meterLabel}>
              <ReactionGlyph kind={r.kind} size={14} active />
              <Text variant="caption" tone="secondary">
                {r.label}
              </Text>
            </View>
            <View style={styles.meterTrack}>
              <Animated.View style={{ height: 6, borderRadius: 3, backgroundColor: REACTION_COLOR[r.kind], width: widths[i]!.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
            </View>
            <Text variant="caption" tone="tertiary" numeric style={{ width: 36, textAlign: 'right' }}>
              {pct}%
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, minWidth: 44, paddingHorizontal: 4 },
  glyphHost: { alignItems: 'center', justifyContent: 'center', width: 24, height: 24 },
  bloom: { position: 'absolute', width: 24, height: 24, borderRadius: 12 },
  pickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.x2, paddingBottom: space.x3 },
  pick: { width: '31%', flexGrow: 1, alignItems: 'center', gap: 6, paddingVertical: space.x3, borderRadius: radius.md, backgroundColor: colors.surface1, borderWidth: 1, borderColor: 'transparent' },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stack: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.canvas },
  meter: { backgroundColor: colors.surface1, borderRadius: radius.md, padding: space.x4, gap: space.x2 },
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: space.x2 },
  meterLabel: { width: 96, flexDirection: 'row', alignItems: 'center', gap: 6 },
  meterTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surface3, overflow: 'hidden' },
});
