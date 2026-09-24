import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { colors, space } from '../../constants/theme';
import { track } from '../../lib/analytics';
import { Button } from './Button';
import { Text } from './Text';

interface Props {
  children: React.ReactNode;
  /** What broke, for the copy: "this screen" (default) or "Hallyu" at the root. */
  scope?: string;
  onReset?: () => void;
  /**
   * Non-visual isolation. Startup components (AccountSync, SyncProvider, ReminderSync, MilestoneWatcher)
   * render nothing; if one of them throws we must keep the rest of the app alive without covering the
   * screen with a recovery card. In silent mode the boundary logs the error and renders nothing.
   */
  silent?: boolean;
}
interface State {
  error: Error | null;
}

/**
 * Last line of defence. A crash inside a screen shows a calm recovery card instead of a white
 * screen; the root instance keeps the app alive. Errors are reported through analytics (no-op today).
 * In `silent` mode it renders nothing on error, so a failure in a background startup component can
 * never take the app down or hide the screen behind it.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    track('error.boundary', { message: error.message, scope: this.props.scope ?? 'screen', silent: !!this.props.silent, stack: info.componentStack?.slice(0, 600) });
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  share = async () => {
    const e = this.state.error;
    if (!e) return;
    await Share.share({ message: `Hallyu error report\n${e.name}: ${e.message}\n${(e.stack ?? '').slice(0, 1200)}` }).catch(() => {});
  };

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.silent) return null;
    const scope = this.props.scope ?? 'this screen';
    return (
      <View style={styles.host} accessibilityRole="alert">
        <View style={styles.icon}>
          <Ionicons name="bandage-outline" size={28} color={colors.textSecondary} />
        </View>
        <Text variant="headline" align="center">
          Something went wrong
        </Text>
        <Text variant="body" tone="secondary" align="center" style={{ maxWidth: 320 }}>
          {scope === 'Hallyu' ? 'Hallyu hit a snag it couldn’t recover from. Your watchlist and drafts are safe on this device.' : `We couldn’t draw ${scope}. Your data is safe — try again, or head back.`}
        </Text>
        {__DEV__ ? (
          <Text variant="caption" tone="tertiary" align="center" numberOfLines={4} style={{ maxWidth: 340 }}>
            {this.state.error.message}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Button label="Try again" onPress={this.reset} />
          <Button label="Send error details" variant="ghost" size="sm" onPress={this.share} />
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  host: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.x3, padding: space.x6, backgroundColor: colors.canvas },
  icon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', marginBottom: space.x2 },
  actions: { alignItems: 'center', gap: space.x2, marginTop: space.x3 },
});
