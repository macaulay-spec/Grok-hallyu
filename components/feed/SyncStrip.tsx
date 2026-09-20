import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, space } from '../../constants/theme';
import { discardMutation, mutationFor, retryMutation, useSyncStatus } from '../../lib/data/sync';
import { useSlice } from '../../lib/store';
import { Text } from '../ui/Text';

interface Props {
  postId?: string;
  commentId?: string;
  state?: 'active' | 'deleted' | 'hidden' | 'pending' | 'failed';
  compact?: boolean;
  /** what the content is called in copy: "post", "comment", "review"… */
  noun?: string;
}

/**
 * Delivery state for your own content: "Posting…" while the outbox is sending, and a
 * "Couldn't post · Retry · Discard" strip if the backend gave up. Renders nothing for accepted content.
 */
export function SyncStrip({ postId, commentId, state, compact, noun = 'post' }: Props) {
  const mutation = useSlice((s) => (state === 'pending' || state === 'failed' ? mutationFor(s, { postId, commentId })?.id : undefined));
  const error = useSlice((s) => (mutation ? s.outbox.find((m) => m.id === mutation)?.error : undefined));
  const { sending } = useSyncStatus();
  if (state !== 'pending' && state !== 'failed') return null;

  if (state === 'pending') {
    return (
      <View style={[styles.strip, compact && styles.compact]} accessibilityLiveRegion="polite">
        <ActivityIndicator size="small" color={colors.textTertiary} />
        <Text variant="caption" tone="tertiary">
          {sending ? `Posting your ${noun}…` : `Will post when you’re back online`}
        </Text>
      </View>
    );
  }
  return (
    <View style={[styles.strip, styles.failed, compact && styles.compact]} accessibilityLiveRegion="assertive">
      <Ionicons name="alert-circle" size={16} color={colors.danger} />
      <Text variant="caption" tone="danger" style={{ flex: 1 }} numberOfLines={2}>
        Couldn’t post your {noun}
        {error ? ` — ${error.toLowerCase()}` : ''}
      </Text>
      {mutation ? (
        <>
          <Pressable onPress={() => retryMutation(mutation)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Retry">
            <Text variant="label" tone="accent">
              Retry
            </Text>
          </Pressable>
          <Pressable onPress={() => discardMutation(mutation)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Discard">
            <Text variant="label" tone="secondary">
              Discard
            </Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center', gap: space.x2, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.sm, backgroundColor: colors.surface1 },
  failed: { backgroundColor: 'rgba(248,113,113,0.12)' },
  compact: { paddingVertical: 4, paddingHorizontal: 8 },
});
