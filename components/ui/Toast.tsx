import { Ionicons } from '@expo/vector-icons';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, motion, radius, sizes, space } from '../../constants/theme';
import { Text } from './Text';

export interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: 'default' | 'success' | 'danger';
  duration?: number;
  /** Lift above the tab bar (default true) */
  aboveTabBar?: boolean;
}

interface ToastValue {
  show: (o: ToastOptions | string) => void;
}

const Ctx = createContext<ToastValue>({ show: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastOptions | null>(null);
  const y = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(y, { toValue: 80, duration: motion.short, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: motion.short, useNativeDriver: true }),
    ]).start(() => setToast(null));
  }, [y, opacity]);

  const show = useCallback(
    (o: ToastOptions | string) => {
      const opts = typeof o === 'string' ? { message: o } : o;
      if (timer.current) clearTimeout(timer.current);
      setToast(opts);
      y.setValue(80);
      opacity.setValue(0);
      Animated.parallel([
        Animated.spring(y, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 220 }),
        Animated.timing(opacity, { toValue: 1, duration: motion.short, useNativeDriver: true }),
      ]).start();
      timer.current = setTimeout(hide, opts.duration ?? (opts.actionLabel ? 5000 : 2800));
    },
    [hide, y, opacity],
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const value = useMemo(() => ({ show }), [show]);
  const bottom = (toast?.aboveTabBar === false ? 0 : sizes.tabBar) + insets.bottom + space.x3;
  const iconColor = toast?.tone === 'success' ? colors.success : toast?.tone === 'danger' ? colors.danger : colors.textPrimary;
  return (
    <Ctx.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View pointerEvents="box-none" style={[styles.host, { bottom, transform: [{ translateY: y }], opacity }]} accessibilityLiveRegion="polite">
          <View style={styles.toast}>
            {toast.icon ? <Ionicons name={toast.icon} size={18} color={iconColor} /> : null}
            <Text variant="bodySmall" style={{ flex: 1 }} numberOfLines={2}>
              {toast.message}
            </Text>
            {toast.actionLabel ? (
              <Pressable
                onPress={() => {
                  toast.onAction?.();
                  hide();
                }}
                hitSlop={10}
                accessibilityRole="button"
              >
                <Text variant="label" tone="accent">
                  {toast.actionLabel}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

const styles = StyleSheet.create({
  host: { position: 'absolute', left: space.margin, right: space.margin, alignItems: 'center' },
  toast: { flexDirection: 'row', alignItems: 'center', gap: space.x3, backgroundColor: colors.surface3, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.x4, paddingVertical: space.x3, maxWidth: 560, width: '100%' },
});
