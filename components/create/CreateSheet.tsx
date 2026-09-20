import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, space } from '../../constants/theme';
import { useApp } from '../../lib/hooks';
import { PostType } from '../../lib/model';
import { Sheet } from '../ui/Sheet';
import { Text } from '../ui/Text';

export const CREATE_TYPES: { type: PostType; label: string; hint: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { type: 'reaction', label: 'Reaction', hint: 'A quick feeling, 140 characters. Tied to a drama or episode.', icon: 'flash-outline' },
  { type: 'post', label: 'Post', hint: 'Text and up to 4 photos. About anything Hallyu.', icon: 'create-outline' },
  { type: 'discussion', label: 'Discussion', hint: 'A titled thread: theory, ending, character, scene, question.', icon: 'chatbubbles-outline' },
  { type: 'review', label: 'Review', hint: 'Rate 1–10, one-line verdict, then the long version.', icon: 'star-outline' },
  { type: 'recommendation', label: 'Recommendation', hint: '“If you liked X, watch Y.” The pairing is the point.', icon: 'gift-outline' },
  { type: 'short', label: 'Short', hint: 'A 3–60 second vertical video with a drama attached.', icon: 'videocam-outline' },
];

interface CreateSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Pre-attach context (from a drama/episode/actor screen). */
  context?: { dramaId?: string; season?: number; episode?: number; actorId?: string };
}

/** Create hub: six clear doors + drafts. The composer adapts to the door you choose. */
export function CreateSheet({ visible, onClose, context }: CreateSheetProps) {
  const router = useRouter();
  const { state, getDrama } = useApp();
  const drama = getDrama(context?.dramaId);
  const open = (type: PostType) => {
    onClose();
    setTimeout(() => router.push({ pathname: '/create/[type]', params: { type, ...(context?.dramaId ? { dramaId: context.dramaId } : {}), ...(context?.season ? { season: String(context.season) } : {}), ...(context?.episode ? { episode: String(context.episode) } : {}), ...(context?.actorId ? { actorId: context.actorId } : {}) } }), 180);
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Create" subtitle={drama ? `About ${drama.title}${context?.episode ? ` · Ep ${context.episode}` : ''}` : 'What kind of post is this?'}>
      <View style={styles.grid}>
        {CREATE_TYPES.map((t) => (
          <Pressable key={t.type} onPress={() => open(t.type)} style={({ pressed }) => [styles.tile, pressed ? { backgroundColor: colors.surface3 } : null]} accessibilityRole="button" accessibilityLabel={t.label} accessibilityHint={t.hint}>
            <View style={styles.icon}>
              <Ionicons name={t.icon} size={22} color={colors.textPrimary} />
            </View>
            <Text variant="titleSmall">{t.label}</Text>
            <Text variant="caption" tone="secondary" numberOfLines={3}>
              {t.hint}
            </Text>
          </Pressable>
        ))}
      </View>
      {state.drafts.length ? (
        <Pressable onPress={() => { onClose(); setTimeout(() => router.push('/drafts'), 180); }} style={styles.drafts} accessibilityRole="button" accessibilityLabel={`${state.drafts.length} drafts`}>
          <Ionicons name="document-text-outline" size={18} color={colors.textSecondary} />
          <Text variant="label" tone="secondary" style={{ flex: 1 }}>
            {state.drafts.length} {state.drafts.length === 1 ? 'draft' : 'drafts'} waiting
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </Pressable>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.x2 },
  tile: { width: '48%', flexGrow: 1, backgroundColor: colors.surface1, borderRadius: radius.md, padding: space.x3, gap: 6, minHeight: 124 },
  icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  drafts: { flexDirection: 'row', alignItems: 'center', gap: space.x2, marginTop: space.x3, padding: space.x3, backgroundColor: colors.surface1, borderRadius: radius.md },
});
