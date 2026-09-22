import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, space } from '../../constants/theme';
import { Button, ButtonVariant } from './Button';
import { Text } from './Text';

interface DialogProps {
  visible: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  confirmVariant?: ButtonVariant;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel: () => void;
  loading?: boolean;
  children?: React.ReactNode;
  confirmDisabled?: boolean;
}

/** Centered dialog for destructive or blocking decisions only. Everything else is a sheet. */
export function Dialog({ visible, title, body, confirmLabel = 'Confirm', confirmVariant = 'primary', cancelLabel = 'Cancel', onConfirm, onCancel, loading, children, confirmDisabled }: DialogProps) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Dismiss" />
        <View style={styles.card} accessibilityViewIsModal>
          <Text variant="titleLarge">{title}</Text>
          {body ? (
            <Text variant="body" tone="secondary" style={{ marginTop: space.x2 }}>
              {body}
            </Text>
          ) : null}
          {children ? <View style={{ marginTop: space.x4 }}>{children}</View> : null}
          <View style={styles.actions}>
            <Button label={cancelLabel} variant="ghost" onPress={onCancel} />
            {onConfirm ? <Button label={confirmLabel} variant={confirmVariant} onPress={onConfirm} loading={loading} disabled={confirmDisabled} /> : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: space.x6 },
  card: { width: '100%', maxWidth: 420, backgroundColor: colors.surface2, borderRadius: radius.lg, padding: space.x6, borderWidth: 1, borderColor: colors.borderSubtle },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.x2, marginTop: space.x6 },
});
