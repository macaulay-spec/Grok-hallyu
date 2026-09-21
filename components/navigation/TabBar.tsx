import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, motion, radius, sizes, space } from '../../constants/theme';
import { haptic, useApp, useLayout, useReduceMotion, useRequireMember } from '../../lib/hooks';
import { springs } from '../../lib/motion';
import { Text } from '../ui/Text';
import { CreateSheet } from '../create/CreateSheet';
import { useTabBarMotion } from './TabBarMotion';

type TabKey = 'index' | 'explore' | 'create' | 'activity' | 'you';

const TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap; active: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'index', label: 'Home', icon: 'home-outline', active: 'home' },
  { key: 'explore', label: 'Explore', icon: 'compass-outline', active: 'compass' },
  { key: 'create', label: 'Create', icon: 'add', active: 'add' },
  { key: 'activity', label: 'Activity', icon: 'notifications-outline', active: 'notifications' },
  { key: 'you', label: 'You', icon: 'person-circle-outline', active: 'person-circle' },
];

/**
 * Bottom tab bar (compact) / left rail (medium+). Create is a 40dp rounded-square Rose button: a tap
 * opens the composer straight away (type is switchable inside), a long-press opens the type sheet.
 * The active tab shows a Signal dot; Activity shows unread.
 */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { unread } = useApp();
  const { wc } = useLayout();
  const require = useRequireMember();
  const [create, setCreate] = useState(false);
  const router = useRouter();
  const rail = wc !== 'compact';
  const currentKey = state.routes[state.index]?.name as TabKey;
  const { hidden, reveal } = useTabBarMotion();
  const barH = sizes.tabBar + insets.bottom;
  const translateY = hidden.interpolate({ inputRange: [0, 1], outputRange: [0, barH + 8] });

  const go = (key: TabKey) => {
    reveal();
    if (key === 'create') {
      haptic.light();
      require('create a post', () => router.push('/create/post'));
      return;
    }
    const route = state.routes.find((r) => r.name === key);
    if (!route) return;
    const focused = currentKey === key;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) navigation.navigate(key);
  };

  const items = TABS.map((t) => {
    const focused = currentKey === t.key;
    if (t.key === 'create') {
      return (
        <CreateTab
          key={t.key}
          rail={rail}
          onPress={() => go(t.key)}
          onLongPress={() => {
            haptic.medium();
            require('create a post', () => setCreate(true));
          }}
        />
      );
    }
    return (
      <TabItem key={t.key} label={t.label} icon={focused ? t.active : t.icon} focused={focused} rail={rail} unread={t.key === 'activity' ? unread : 0} onPress={() => go(t.key)} />
    );
  });

  return (
    <>
      {rail ? (
        <View style={[styles.rail, { paddingTop: insets.top + space.x4, paddingBottom: insets.bottom + space.x4 }]}>{items}</View>
      ) : (
        <Animated.View style={[styles.bar, { paddingBottom: insets.bottom, height: barH, transform: [{ translateY }] }]} accessibilityRole="tablist">
          {items}
        </Animated.View>
      )}
      <CreateSheet visible={create} onClose={() => setCreate(false)} />
    </>
  );
}

/** A tab: the icon settles in with a small spring when it becomes current; the Signal dot fades in beneath. */
function TabItem({ label, icon, focused, rail, unread, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; focused: boolean; rail: boolean; unread: number; onPress: () => void }) {
  const reduce = useReduceMotion();
  const pop = useRef(new Animated.Value(1)).current;
  const dot = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) {
      dot.setValue(focused ? 1 : 0);
      return;
    }
    Animated.timing(dot, { toValue: focused ? 1 : 0, duration: motion.short, useNativeDriver: true }).start();
    if (focused) {
      pop.setValue(0.82);
      Animated.spring(pop, { toValue: 1, ...springs.snappy }).start();
    }
  }, [focused, reduce, pop, dot]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={`${label}${unread ? `, ${unread} unread` : ''}`}
      style={[styles.item, rail ? styles.railItem : null]}
    >
      <Animated.View style={{ transform: [{ scale: pop }] }}>
        <Ionicons name={icon} size={24} color={focused ? colors.textPrimary : colors.textSecondary} />
        {unread > 0 ? <View style={styles.unread} /> : null}
      </Animated.View>
      <Text variant="tabLabel" style={{ color: focused ? colors.textPrimary : colors.textSecondary }}>
        {label}
      </Text>
      <Animated.View style={[styles.signal, { opacity: dot, transform: [{ scale: dot }] }]} />
    </Pressable>
  );
}

/** The Create button presses like a real key: 0.9 on touch, springs back on release. */
function CreateTab({ rail, onPress, onLongPress }: { rail: boolean; onPress: () => void; onLongPress: () => void }) {
  const reduce = useReduceMotion();
  const press = useRef(new Animated.Value(1)).current;
  const to = (v: number) => (reduce ? press.setValue(1) : Animated.spring(press, { toValue: v, ...springs.snappy }).start());
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => to(0.9)}
      onPressOut={() => to(1)}
      delayLongPress={280}
      accessibilityRole="button"
      accessibilityLabel="Create"
      accessibilityHint="Opens the composer. Long press to choose a post type."
      style={[styles.item, rail ? styles.railItem : null]}
    >
      <Animated.View style={[styles.create, { transform: [{ scale: press }] }]}>
        <Ionicons name="add" size={24} color={colors.onAccent} />
      </Animated.View>
      {rail ? (
        <Text variant="tabLabel" tone="secondary">
          Create
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', backgroundColor: colors.canvas },
  rail: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 80, backgroundColor: colors.canvas, borderRightWidth: 1, borderRightColor: colors.borderSubtle, alignItems: 'center', gap: space.x4 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingTop: 8 },
  railItem: { flex: 0, width: 64, height: 64, borderRadius: radius.md, paddingTop: 0 },
  create: { width: sizes.createButton, height: sizes.createButton, borderRadius: radius.full, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  signal: { position: 'absolute', top: 2, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent },
  unread: { position: 'absolute', top: -1, right: -2, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.canvas },
});
