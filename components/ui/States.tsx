import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius, space } from '../../constants/theme';
import { useNetwork } from '../../lib/hooks';
import { Button } from './Button';
import { Text } from './Text';

interface StateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Empty state: never blank, never a shrug. Title says what belongs here, action makes it happen. */
export function EmptyState({ icon = 'sparkles-outline', title, body, actionLabel, onAction, secondaryLabel, onSecondary, compact, style }: StateProps) {
  return (
    <View style={[styles.wrap, compact ? styles.compact : null, style]} accessibilityRole="summary">
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={compact ? 22 : 28} color={colors.textSecondary} />
      </View>
      <Text variant={compact ? 'titleSmall' : 'title'} align="center" style={{ marginTop: space.x3 }}>
        {title}
      </Text>
      {body ? (
        <Text variant="bodySmall" tone="secondary" align="center" style={styles.body}>
          {body}
        </Text>
      ) : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} size={compact ? 'sm' : 'md'} style={{ marginTop: space.x4 }} /> : null}
      {secondaryLabel && onSecondary ? <Button label={secondaryLabel} onPress={onSecondary} variant="ghost" size="sm" style={{ marginTop: space.x2 }} /> : null}
    </View>
  );
}

export type ErrorKind = 'network' | 'server' | 'notFound' | 'forbidden' | 'timeout' | 'unknown';

export const ERROR_COPY: Record<ErrorKind, { title: string; body: string; icon: keyof typeof Ionicons.glyphMap }> = {
  network: { title: 'You’re offline', body: 'We’ll show what’s saved on this device. Reconnect to load the rest.', icon: 'cloud-offline-outline' },
  server: { title: 'Hallyu hit a snag', body: 'Our side, not yours. Try again in a moment.', icon: 'warning-outline' },
  notFound: { title: 'This isn’t here anymore', body: 'It may have been removed, or the link is wrong.', icon: 'help-circle-outline' },
  forbidden: { title: 'You don’t have access to this', body: 'This content is private or limited.', icon: 'lock-closed-outline' },
  timeout: { title: 'That took too long', body: 'The connection is slow. Try again.', icon: 'time-outline' },
  unknown: { title: 'Something went wrong', body: 'Try again. If it keeps happening, tell us from Settings › Help.', icon: 'alert-circle-outline' },
};

export function classifyError(e?: Error | null): ErrorKind {
  const m = (e?.message ?? '').toLowerCase();
  if (m.includes('network') || m.includes('fetch') || m.includes('offline')) return 'network';
  if (m.includes('404') || m.includes('not found')) return 'notFound';
  if (m.includes('401') || m.includes('403') || m.includes('forbidden')) return 'forbidden';
  if (m.includes('timeout') || m.includes('abort')) return 'timeout';
  if (m.includes('5')) return 'server';
  return 'unknown';
}

export function ErrorState({ kind = 'unknown', onRetry, compact, style, title, body }: { kind?: ErrorKind; onRetry?: () => void; compact?: boolean; style?: StyleProp<ViewStyle>; title?: string; body?: string }) {
  const c = ERROR_COPY[kind];
  return <EmptyState icon={c.icon} title={title ?? c.title} body={body ?? c.body} actionLabel={onRetry ? 'Try again' : undefined} onAction={onRetry} compact={compact} style={style} />;
}

export function LoadingState({ label, style }: { label?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.wrap, style]} accessibilityRole="progressbar" accessibilityLabel={label ?? 'Loading'}>
      <ActivityIndicator color={colors.accent} />
      {label ? (
        <Text variant="caption" tone="secondary" style={{ marginTop: space.x3 }}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

/** Thin persistent banner under the top bar when the device is offline. */
export function OfflineBanner() {
  const online = useNetwork();
  if (online) return null;
  return (
    <View style={styles.offline} accessibilityLiveRegion="polite">
      <Ionicons name="cloud-offline-outline" size={14} color={colors.textPrimary} />
      <Text variant="caption" style={{ color: colors.textPrimary }}>
        Offline — showing what’s saved on this device
      </Text>
    </View>
  );
}

export function InlineNotice({ icon = 'information-circle-outline', text, tone = 'info', style }: { icon?: keyof typeof Ionicons.glyphMap; text: string; tone?: 'info' | 'warning' | 'danger' | 'success'; style?: StyleProp<ViewStyle> }) {
  const color = tone === 'warning' ? colors.warning : tone === 'danger' ? colors.danger : tone === 'success' ? colors.success : colors.info;
  return (
    <View style={[styles.notice, style]}>
      <Ionicons name={icon} size={16} color={color} />
      <Text variant="bodySmall" tone="secondary" style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.x8, paddingVertical: space.x12 },
  compact: { paddingVertical: space.x6 },
  iconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  body: { marginTop: space.x2, maxWidth: 320 },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface3, paddingHorizontal: space.margin, paddingVertical: 6 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: space.x2, backgroundColor: colors.surface1, borderRadius: radius.md, padding: space.x3 },
});
