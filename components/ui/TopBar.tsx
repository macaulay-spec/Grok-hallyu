import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, sizes, space } from '../../constants/theme';
import { IconButton } from './IconButton';
import { Text } from './Text';

interface TopBarProps {
  title?: string;
  subtitle?: string;
  /** 'stack' shows a back chevron; 'modal' shows a close; 'root' nothing */
  mode?: 'stack' | 'modal' | 'root';
  onBack?: () => void;
  right?: React.ReactNode;
  left?: React.ReactNode;
  transparent?: boolean; // over media (hero)
  center?: React.ReactNode; // custom center (e.g. wordmark)
  style?: StyleProp<ViewStyle>;
  large?: boolean; // titleLarge
  safeTop?: boolean;
}

export function TopBar({ title, subtitle, mode = 'stack', onBack, right, left, transparent, center, style, large, safeTop = true }: TopBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const back = () => {
    if (onBack) return onBack();
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };
  return (
    <View style={[styles.wrap, { paddingTop: safeTop ? insets.top : 0 }, transparent ? styles.transparent : null, style]}>
      <View style={styles.bar}>
        <View style={styles.side}>
          {left ?? (mode === 'stack' ? <IconButton icon="chevron-back" label="Back" onPress={back} tone={transparent ? 'onMedia' : 'default'} filled={transparent} /> : mode === 'modal' ? <IconButton icon="close" label="Close" onPress={back} tone={transparent ? 'onMedia' : 'default'} filled={transparent} /> : null)}
        </View>
        <View style={styles.center} pointerEvents="box-none">
          {center ??
            (title ? (
              <View style={{ alignItems: mode === 'root' && !left ? 'flex-start' : 'center', flex: 1 }}>
                <Text variant={large ? 'titleLarge' : 'title'} numberOfLines={1} style={transparent ? { color: colors.onMedia } : null}>
                  {title}
                </Text>
                {subtitle ? (
                  <Text variant="caption" tone="secondary" numberOfLines={1}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
            ) : null)}
        </View>
        <View style={[styles.side, { justifyContent: 'flex-end' }]}>{right}</View>
      </View>
    </View>
  );
}

/** The wordmark for Home's top bar: "Hallyu" + the Signal. */
export function Wordmark({ size = 24 }: { size?: number }) {
  return (
    <View style={styles.wordmark} accessibilityRole="header" accessibilityLabel="Hallyu">
      <Text style={{ fontFamily: 'Pretendard-ExtraBold', fontSize: size, lineHeight: size + 6, letterSpacing: -size * 0.03, color: colors.textPrimary }}>Hallyu</Text>
      <View style={{ width: size * 0.28, height: size * 0.28, borderRadius: size, backgroundColor: colors.accent, marginLeft: 2, marginTop: size * 0.42 }} />
    </View>
  );
}

export function SignalDot({ size = 8, pulse, style }: { size?: number; pulse?: boolean; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.live }, pulse ? { shadowColor: colors.live, shadowOpacity: 0.8, shadowRadius: 6 } : null, style]} />;
}

export function HeaderIcon({ name, color = colors.textSecondary }: { name: keyof typeof Ionicons.glyphMap; color?: string }) {
  return <Ionicons name={name} size={18} color={color} />;
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.canvas },
  transparent: { backgroundColor: 'transparent', position: 'absolute', left: 0, right: 0, top: 0, zIndex: 10 },
  bar: { height: sizes.topBar, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.x1 },
  side: { minWidth: sizes.touch, flexDirection: 'row', alignItems: 'center' },
  center: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.x2 },
  wordmark: { flexDirection: 'row', alignItems: 'flex-start' },
});
