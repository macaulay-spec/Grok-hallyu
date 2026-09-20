import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Dimensions, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, motion, radius, space } from '../../constants/theme';
import { springs } from '../../lib/motion';
import { Text } from './Text';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  detent?: 'content' | 'half' | 'full';
  blocking?: boolean; // scrim tap / back does not close
  children: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
  headerRight?: React.ReactNode;
}

/**
 * Bottom sheet: surface.2, top radius lg, 32×4 handle, overlay scrim.
 * Springs in (gentle), slides out in 160ms. Drag on the header to dismiss.
 */
export function Sheet({ visible, onClose, title, subtitle, detent = 'content', blocking, children, footer, scroll = true, headerRight }: SheetProps) {
  const insets = useSafeAreaInsets();
  const screenH = Dimensions.get('window').height;
  const [mounted, setMounted] = useState(visible);
  const y = useRef(new Animated.Value(screenH)).current;
  const scrim = useRef(new Animated.Value(0)).current;

  const close = useCallback(() => {
    Animated.parallel([
      Animated.timing(y, { toValue: screenH, duration: motion.short, useNativeDriver: true }),
      Animated.timing(scrim, { toValue: 0, duration: motion.short, useNativeDriver: true }),
    ]).start(() => setMounted(false));
  }, [y, scrim, screenH]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      y.setValue(screenH);
      Animated.parallel([
        Animated.spring(y, { toValue: 0, ...springs.gentle }),
        Animated.timing(scrim, { toValue: 1, duration: motion.medium, useNativeDriver: true }),
      ]).start();
    } else if (mounted) {
      close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!mounted) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!blocking) onClose();
      return true;
    });
    return () => sub.remove();
  }, [mounted, blocking, onClose]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) y.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if ((g.dy > 120 || g.vy > 1.2) && !blocking) onClose();
        else Animated.spring(y, { toValue: 0, ...springs.gentle }).start();
      },
    }),
  ).current;

  if (!mounted) return null;
  const maxH = detent === 'full' ? screenH - insets.top - 16 : detent === 'half' ? screenH * 0.5 : screenH * 0.88;
  return (
    <Modal transparent visible={mounted} animationType="none" onRequestClose={() => !blocking && onClose()} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: scrim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !blocking && onClose()} accessibilityRole="button" accessibilityLabel="Close" />
        </Animated.View>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none" style={styles.kav}>
          <Animated.View style={[styles.sheet, { maxHeight: maxH, paddingBottom: insets.bottom + space.x3, transform: [{ translateY: y }] }, detent !== 'content' ? { height: maxH } : null]} accessibilityViewIsModal>
            <View {...pan.panHandlers} style={styles.grab}>
              <View style={styles.handle} />
              {title ? (
                <View style={styles.header}>
                  <View style={{ flex: 1 }}>
                    <Text variant="title">{title}</Text>
                    {subtitle ? (
                      <Text variant="caption" tone="secondary" style={{ marginTop: 2 }}>
                        {subtitle}
                      </Text>
                    ) : null}
                  </View>
                  {headerRight ??
                    (!blocking ? (
                      <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={styles.close}>
                        <Ionicons name="close" size={22} color={colors.textSecondary} />
                      </Pressable>
                    ) : null)}
                </View>
              ) : null}
            </View>
            {scroll ? (
              <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
                {children}
              </ScrollView>
            ) : (
              <View style={[styles.body, { flex: 1 }]}>{children}</View>
            )}
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/** Simple list row for action sheets. */
export function SheetRow({ icon, label, onPress, tone = 'default', detail, selected, disabled }: { icon?: keyof typeof Ionicons.glyphMap; label: string; onPress?: () => void; tone?: 'default' | 'danger' | 'accent'; detail?: string; selected?: boolean; disabled?: boolean }) {
  const color = tone === 'danger' ? colors.danger : tone === 'accent' ? colors.accentText : colors.textPrimary;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ selected: !!selected, disabled: !!disabled }} style={({ pressed }) => [styles.row, pressed ? { backgroundColor: colors.surface3 } : null, disabled ? { opacity: 0.5 } : null]}>
      {icon ? <Ionicons name={icon} size={22} color={color} /> : null}
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
      {selected ? <Ionicons name="checkmark" size={20} color={colors.accentText} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  kav: { justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface2, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, overflow: 'hidden' },
  grab: { paddingTop: space.x2 },
  handle: { width: 32, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: 'center', marginBottom: space.x2 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.margin, paddingVertical: space.x2 },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  body: { paddingHorizontal: space.margin, paddingTop: space.x2, paddingBottom: space.x2 },
  footer: { paddingHorizontal: space.margin, paddingTop: space.x3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.x4, minHeight: 52, paddingVertical: space.x2, paddingHorizontal: space.x1, borderRadius: radius.sm },
});
