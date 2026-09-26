import React from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

/**
 * Hallyu's last line of defence — deliberately a LEAF module.
 *
 * Top-level imports: `react` and `react-native` ONLY. Both are guaranteed to be fully
 * initialized before any app code runs, so this module's evaluation cannot fail, cannot
 * participate in a boot-time cycle, and cannot be poisoned by a partially-initialized
 * graph. No ./Button, no ./Text, no constants/theme, no lib/hooks, lib/store, lib/auth,
 * lib/analytics at module scope; design tokens are inlined below and analytics is required
 * lazily inside componentDidCatch.
 *
 * Why this matters (verified against the installed metro-runtime 0.80.12 and expo-router
 * 3.5.24 sources — this was the release-only cold-start blocker):
 *
 *  - The root layout (app/_layout.tsx) imports this boundary, and this file used to import
 *    Button → Tap → lib/hooks → {store, auth, selectors, catalog} plus theme, analytics and
 *    @expo/vector-icons. That put the boundary's availability at the mercy of the same giant
 *    boot-time evaluation graph it exists to protect.
 *  - When ANY module in a route's import chain throws during evaluation, Metro's
 *    `guardedLoadModule` reports the error to ErrorUtils (our lib/crash.ts trap → the
 *    "Hallyu hit an error" Alert), marks the module failed (`exports = undefined`) and
 *    returns `undefined` to expo-router's route loader. expo-router then runs
 *    `fromImport({ ErrorBoundary, ...component })` on that `undefined`, producing exactly
 *    "TypeError: Cannot read property 'ErrorBoundary' of undefined" and a root tree that
 *    never renders (splash/black screen forever).
 *  - As a leaf, this module's require can never return `undefined`: the boundary is always
 *    constructible, always mounts, and can do its job of isolating everything else.
 *
 * Public API is unchanged: children, scope?, onReset?, silent? — and `silent` still renders
 * null on error so background startup components can never cover the screen.
 */

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

// Inlined design tokens — literal copies of constants/theme.ts (dark-only theme) so this
// module never needs to import it. Keep in sync if the theme changes.
const palette = {
  canvas: '#0A0A0A', // colors.canvas (ink950)
  surface2: '#161618', // colors.surface2 (ink850)
  textPrimary: '#FAFAFA', // colors.textPrimary
  textSecondary: '#A1A1AA', // colors.textSecondary (ink300)
  textTertiary: '#7A7A85', // colors.textTertiary (ink400)
  accent: '#E11D48', // colors.accent (rose600)
  onAccent: '#FAFAFA', // colors.onAccent
};

// Inlined typography (type.headline / body / caption / button / label from constants/theme.ts).
// The Pretendard families fall back to the system font when they are not (yet) loaded — e.g. on
// the root layout's font-gate timeout path — which is exactly the degraded state in which this
// card is most likely to render. Specifying an unloaded family on Android never throws.
const type = {
  headline: { fontSize: 26, lineHeight: 32, fontFamily: 'Pretendard-Bold', letterSpacing: -0.3 },
  body: { fontSize: 15, lineHeight: 22, fontFamily: 'Pretendard-Regular' },
  caption: { fontSize: 12, lineHeight: 16, fontFamily: 'Pretendard-Medium' },
  button: { fontSize: 15, lineHeight: 20, fontFamily: 'Pretendard-SemiBold' },
  label: { fontSize: 13, lineHeight: 18, fontFamily: 'Pretendard-SemiBold' },
};

/**
 * A crash inside a screen shows a calm recovery card instead of a white screen; the root
 * instance keeps the app alive. Errors are reported through analytics on a best-effort basis.
 * In `silent` mode it renders nothing on error, so a failure in a background startup component
 * can never take the app down or hide the screen behind it.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Analytics is required LAZILY, inside a guard: a top-level `import { track } from
    // '../../lib/analytics'` would put this module back into the boot-time evaluation graph
    // (one of the edges implicated in the release "Cannot read property 'ErrorBoundary' of
    // undefined" failure). Reporting must never throw — if analytics cannot load, skip it.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const analytics = require('../../lib/analytics') as
        | { track?: (event: string, props?: Record<string, unknown>) => void }
        | undefined;
      analytics?.track?.('error.boundary', {
        message: error.message,
        scope: this.props.scope ?? 'screen',
        silent: !!this.props.silent,
        stack: info.componentStack?.slice(0, 600),
      });
    } catch {
      /* error reporting is best-effort — the boundary itself must never throw */
    }
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
          <Text style={[type.headline, styles.iconGlyph]}>!</Text>
        </View>
        <Text style={[type.headline, styles.primary, styles.center]}>Something went wrong</Text>
        <Text style={[type.body, styles.secondary, styles.center, styles.bodyCopy]}>
          {scope === 'Hallyu' ? 'Hallyu hit a snag it couldn’t recover from. Your watchlist and drafts are safe on this device.' : `We couldn’t draw ${scope}. Your data is safe — try again, or head back.`}
        </Text>
        {__DEV__ ? (
          <Text style={[type.caption, styles.tertiary, styles.center, styles.devMessage]} numberOfLines={4}>
            {this.state.error.message}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try again"
            onPress={this.reset}
            style={({ pressed }) => [styles.btnPrimary, pressed ? styles.pressed : null]}
          >
            <Text style={[type.button, styles.onAccent]}>Try again</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send error details"
            onPress={this.share}
            style={({ pressed }) => [styles.btnGhost, pressed ? styles.pressed : null]}
          >
            <Text style={[type.label, styles.primary]}>Send error details</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  host: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: palette.canvas },
  icon: { width: 56, height: 56, borderRadius: 28, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  iconGlyph: { color: palette.textSecondary, includeFontPadding: false },
  center: { textAlign: 'center' },
  primary: { color: palette.textPrimary },
  secondary: { color: palette.textSecondary },
  tertiary: { color: palette.textTertiary },
  onAccent: { color: palette.onAccent },
  bodyCopy: { maxWidth: 320 },
  devMessage: { maxWidth: 340, marginTop: 4 },
  actions: { alignItems: 'center', gap: 8, marginTop: 12 },
  btnPrimary: { height: 44, borderRadius: 12, paddingHorizontal: 16, minWidth: 140, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { height: 36, borderRadius: 12, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.85 },
});
