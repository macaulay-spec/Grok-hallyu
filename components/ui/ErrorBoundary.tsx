import React from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { colors, space } from '../../constants/theme';
import { track } from '../../lib/analytics';

interface Props {
  children: React.ReactNode;
  /** What broke, for the copy: "this screen" (default) or "Hallyu" at the root. */
  scope?: string;
  onReset?: () => void;
  silent?: boolean;
}

interface State {
  error: Error | null;
}

/**
 * Lightweight, dependency-free ErrorBoundary.
 * Owns render-time exception recovery without importing heavy UI components,
 * icons, hooks, or navigation to ensure zero circular dependencies during cold boot.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    track('error.boundary', {
      message: error.message,
      scope: this.props.scope ?? 'screen',
      silent: !!this.props.silent,
      stack: info.componentStack?.slice(0, 600),
    });
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  share = async () => {
    const e = this.state.error;
    if (!e) return;
    await Share.share({
      message: `Hallyu error report\n${e.name}: ${e.message}\n${(e.stack ?? '').slice(0, 1200)}`,
    }).catch(() => {});
  };

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.silent) return null;
    const scope = this.props.scope ?? 'this screen';
    const body =
      scope === 'Hallyu'
        ? 'Hallyu hit a snag it couldn’t recover from. Your watchlist and drafts are safe on this device.'
        : `We couldn’t draw ${scope}. Your data is safe — try again, or head back.`;

    return (
      <View style={styles.host} accessibilityRole="alert">
        <View style={styles.icon}>
          <Text style={styles.iconGlyph}>!</Text>
        </View>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>{body}</Text>
        {typeof __DEV__ !== 'undefined' && __DEV__ ? (
          <Text style={styles.dev} numberOfLines={4}>
            {this.state.error.message}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Pressable onPress={this.reset} style={styles.primaryBtn} accessibilityRole="button" accessibilityLabel="Try again">
            <Text style={styles.primaryLabel}>Try again</Text>
          </Pressable>
          <Pressable onPress={this.share} style={styles.ghostBtn} accessibilityRole="button" accessibilityLabel="Send error details">
            <Text style={styles.ghostLabel}>Send error details</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.x3,
    padding: space.x6,
    backgroundColor: colors.canvas,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.x2,
  },
  iconGlyph: {
    color: colors.textSecondary,
    fontSize: 24,
    fontWeight: '700',
  },
  title: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 320,
  },
  dev: {
    color: colors.textTertiary,
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 340,
  },
  actions: {
    alignItems: 'center',
    gap: space.x2,
    marginTop: space.x3,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: space.x5,
    paddingVertical: space.x3,
    borderRadius: 12,
    minWidth: 160,
    alignItems: 'center',
  },
  primaryLabel: {
    color: colors.onAccent,
    fontSize: 15,
    fontWeight: '600',
  },
  ghostBtn: {
    paddingHorizontal: space.x4,
    paddingVertical: space.x2,
  },
  ghostLabel: {
    color: colors.textSecondary,
    fontSize: 14,
  },
});
