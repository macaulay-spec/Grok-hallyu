import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { Animated, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, motion, radius, space } from '../../constants/theme';
import { haptic, useApp, useReduceMotion, useRequireMember } from '../../lib/hooks';
import { Drama, SpoilerLevel } from '../../lib/model';
import { veilCopy } from '../../lib/spoiler';
import { Text } from '../ui/Text';
import { useToast } from '../ui/Toast';
import { track } from '../../lib/analytics';

interface SpoilerBlockProps {
  id: string; // post or comment id (for reveal memory)
  level: SpoilerLevel;
  drama?: Drama;
  season?: number;
  episode?: number;
  veiled: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  compact?: boolean; // comments
}

/**
 * The veil. Author/context/actions stay visible around it; only the body is covered.
 * Actions: Reveal (remembered on this device) · Reveal & mark watched · Protect me.
 * Veiled content is excluded from the accessibility tree.
 */
export function SpoilerBlock({ id, level, drama, season, episode, veiled, children, style, compact }: SpoilerBlockProps) {
  const { dispatch, watch } = useApp();
  const require = useRequireMember();
  const toast = useToast();
  const [showing, setShowing] = useState(!veiled);
  const [dissolving, setDissolving] = useState(false);
  const fade = useRef(new Animated.Value(veiled ? 0 : 1)).current;
  const veilA = useRef(new Animated.Value(1)).current;
  const reduce = useReduceMotion();
  if (!veiled && !showing) setShowing(true);

  const reveal = (markWatched?: boolean) => {
    haptic.light();
    dispatch({ type: 'reveal', id });
    track('spoiler.reveal', { level });
    if (markWatched && drama && episode) {
      require('mark episodes watched', () => {
        const total = drama.seasons.find((s) => s.number === (season ?? 1))?.episodeCount ?? drama.episodeCount;
        dispatch({ type: 'progress', dramaId: drama.id, season: season ?? 1, episode, total });
        toast.show({ message: `Marked ${drama.title} Ep ${episode} watched`, icon: 'checkmark-circle' });
      });
    }
    if (reduce) {
      fade.setValue(1);
      setShowing(true);
      return;
    }
    // The unveil: the real words rise in beneath the veil while the veil itself dissolves.
    setDissolving(true);
    fade.setValue(0);
    veilA.setValue(1);
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: motion.long, useNativeDriver: true }),
      Animated.timing(veilA, { toValue: 0, duration: motion.medium, delay: 60, useNativeDriver: true }),
    ]).start(() => {
      setShowing(true);
      setDissolving(false);
    });
  };

  const veilBox = (
    <View style={[styles.veil, compact ? styles.veilCompact : null]} accessibilityRole="button" accessibilityLabel={`${veilCopy(level, drama?.title, season, episode, (drama?.seasons.length ?? 1) > 1)}. Double tap to reveal.`} accessibilityHint="Hidden spoiler">
      <View style={styles.veilHeader}>
        <Ionicons name="eye-off-outline" size={compact ? 14 : 16} color={colors.textSecondary} />
        <Text variant={compact ? 'caption' : 'label'} tone="secondary" style={{ flex: 1 }} numberOfLines={2}>
          {veilCopy(level, drama?.title, season, episode, (drama?.seasons.length ?? 1) > 1)}
        </Text>
      </View>
      <View style={styles.veilActions} importantForAccessibility="no-hide-descendants">
        <Pressable onPress={() => reveal(false)} style={styles.veilBtn} accessibilityRole="button" accessibilityLabel="Reveal">
          <Text variant="label">Reveal</Text>
        </Pressable>
        {level === 'episode' && !!drama && !!episode && watch(drama.id)?.status !== 'completed' ? (
          <Pressable onPress={() => reveal(true)} style={styles.veilBtn} accessibilityRole="button" accessibilityLabel={`Reveal and mark episode ${episode} watched`}>
            <Text variant="label" tone="accent">
              I’ve seen Ep {episode}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  if (showing || dissolving) {
    return (
      <View style={style}>
        <Animated.View style={{ opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }}>
          {children}
          {veiled ? (
            <Text variant="caption" tone="tertiary" style={{ marginTop: space.x1 }}>
              Revealed · {veilCopy(level, undefined, season, episode, (drama?.seasons.length ?? 1) > 1)}
            </Text>
          ) : null}
        </Animated.View>
        {dissolving ? (
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: veilA, transform: [{ scale: veilA.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) }] }]}>
            {veilBox}
          </Animated.View>
        ) : null}
      </View>
    );
  }

  return <View style={style}>{veilBox}</View>;
}

/** Small tag shown next to metadata when a post carries a spoiler level (even when unveiled). */
export function SpoilerTag({ level, compact }: { level: SpoilerLevel; compact?: boolean }) {
  if (level === 'none') return null;
  const label = level === 'episode' ? 'Episode spoiler' : level === 'season' ? 'Season spoiler' : 'Ending spoiler';
  return (
    <View style={[styles.tag, compact ? { height: 18 } : null]}>
      <Ionicons name="eye-off-outline" size={compact ? 10 : 12} color={colors.textSecondary} />
      <Text variant="caption" tone="secondary" style={compact ? { fontSize: 10, lineHeight: 12 } : null}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  veil: { backgroundColor: colors.veil, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radius.md, padding: space.x3, gap: space.x3 },
  veilCompact: { padding: space.x2, gap: space.x2 },
  veilHeader: { flexDirection: 'row', alignItems: 'center', gap: space.x2 },
  veilActions: { flexDirection: 'row', gap: space.x2, flexWrap: 'wrap' },
  veilBtn: { height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: colors.surface2 },
});
