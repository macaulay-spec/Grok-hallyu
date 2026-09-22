import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { colors, radius, space } from '../../constants/theme';
import { haptic } from '../../lib/hooks';
import { Text } from '../ui/Text';

export function SettingsGroup({ title, children, footer }: { title?: string; children: React.ReactNode; footer?: string }) {
  return (
    <View style={{ marginBottom: space.x6 }}>
      {title ? (
        <Text variant="overline" style={{ paddingHorizontal: space.margin, marginBottom: space.x2 }}>
          {title}
        </Text>
      ) : null}
      <View style={styles.group}>{children}</View>
      {footer ? (
        <Text variant="caption" tone="tertiary" style={{ paddingHorizontal: space.margin, marginTop: space.x2 }}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

export function SettingsRow({ icon, label, detail, value, onPress, tone = 'default', chevron = true }: { icon?: keyof typeof Ionicons.glyphMap; label: string; detail?: string; value?: string; onPress?: () => void; tone?: 'default' | 'danger'; chevron?: boolean }) {
  const color = tone === 'danger' ? colors.danger : colors.textPrimary;
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.row, pressed ? { backgroundColor: colors.surface2 } : null]} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`${label}${value ? `, ${value}` : ''}`}>
      {icon ? <Ionicons name={icon} size={20} color={tone === 'danger' ? colors.danger : colors.textSecondary} /> : null}
      <View style={{ flex: 1 }}>
        <Text variant="body" style={{ color }}>
          {label}
        </Text>
        {detail ? (
          <Text variant="caption" tone="secondary">
            {detail}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="bodySmall" tone="secondary" numberOfLines={1} style={{ maxWidth: 140 }}>
          {value}
        </Text>
      ) : null}
      {onPress && chevron ? <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} /> : null}
    </Pressable>
  );
}

export function SettingsToggle({ icon, label, detail, value, onChange, disabled }: { icon?: keyof typeof Ionicons.glyphMap; label: string; detail?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={[styles.row, disabled ? { opacity: 0.5 } : null]} accessible accessibilityRole="switch" accessibilityState={{ checked: value, disabled }} accessibilityLabel={label}>
      {icon ? <Ionicons name={icon} size={20} color={colors.textSecondary} /> : null}
      <View style={{ flex: 1 }}>
        <Text variant="body">{label}</Text>
        {detail ? (
          <Text variant="caption" tone="secondary">
            {detail}
          </Text>
        ) : null}
      </View>
      <Switch value={value} onValueChange={(v) => { haptic.select(); onChange(v); }} disabled={disabled} trackColor={{ false: colors.surface3, true: colors.accent }} thumbColor={colors.textPrimary} ios_backgroundColor={colors.surface3} />
    </View>
  );
}

export function SettingsChoice<T extends string>({ options, value, onChange }: { options: { key: T; label: string; detail?: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <>
      {options.map((o) => (
        <Pressable key={o.key} onPress={() => { haptic.select(); onChange(o.key); }} style={({ pressed }) => [styles.row, pressed ? { backgroundColor: colors.surface2 } : null]} accessibilityRole="radio" accessibilityState={{ checked: value === o.key }}>
          <Ionicons name={value === o.key ? 'radio-button-on' : 'radio-button-off'} size={20} color={value === o.key ? colors.accentText : colors.textTertiary} />
          <View style={{ flex: 1 }}>
            <Text variant="body">{o.label}</Text>
            {o.detail ? (
              <Text variant="caption" tone="secondary">
                {o.detail}
              </Text>
            ) : null}
          </View>
        </Pressable>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  group: { marginHorizontal: space.margin, backgroundColor: colors.surface1, borderRadius: radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.x3, paddingHorizontal: space.x4, minHeight: 56, paddingVertical: space.x2 },
});
