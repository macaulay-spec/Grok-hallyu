// Must be the first import in the app: the global error trap has to be in place before any
// other module can evaluate, so a release-mode JS exception can never silently kill the process
// ("opens then instantly exits"). See lib/crash.ts. (index.js also installs it at the entry —
// installGlobalErrorTrap is idempotent — so the trap is live before any route module loads.)
import '../lib/crash';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { AppState as RNAppState, StyleSheet, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { MilestoneWatcher } from '../components/moments/MilestoneWatcher';
import { ToastProvider } from '../components/ui/Toast';
import { colors } from '../constants/theme';
import { reportError } from '../lib/analytics';
import { AuthProvider, useAuth } from '../lib/auth';
import { markBoot } from '../lib/boot';
import { SyncProvider } from '../lib/data/sync';
import { firebaseBackend } from '../lib/data/firebaseBackend';
import { installNotificationHandler, reminderUrl, remindersSupported, syncEpisodeReminders } from '../lib/reminders';
import { setDownloadScope } from '../lib/media';
import { freshMemberState, GUEST_ID, guestState, StoreProvider, useSlice, useStore } from '../lib/store';

SplashScreen.preventAutoHideAsync().catch(() => {});

export const unstable_settings = { initialRouteName: 'index' };

/**
 * Hard ceiling on the font gate. Fonts normally resolve in well under a second from the APK's
 * bundled assets, but a wedged font load must never hold the whole tree hostage (that is the
 * release-only "splash forever" symptom). After this timeout we proceed on system fonts and drop
 * the native splash ourselves.
 *
 * IMPORTANT: the gate must NOT early-return a non-navigator view — expo-router's contract is
 * that the Root Layout renders a navigator on the FIRST render (returning a bare <View/> here
 * produces the release cold-start error "Attempted to navigate before mounting the Root Layout
 * component"). The tree (and its <Stack/>) always renders; while fonts are pending we simply
 * cover it with a canvas-coloured overlay.
 */
const FONT_GATE_MS = 1200;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'Pretendard-Regular': require('../assets/fonts/Pretendard-Regular.otf'),
    'Pretendard-Medium': require('../assets/fonts/Pretendard-Medium.otf'),
    'Pretendard-SemiBold': require('../assets/fonts/Pretendard-SemiBold.otf'),
    'Pretendard-Bold': require('../assets/fonts/Pretendard-Bold.otf'),
    'Pretendard-ExtraBold': require('../assets/fonts/Pretendard-ExtraBold.otf'),
  });

  const [gateTimedOut, setGateTimedOut] = useState(false);
  const fontsSettled = fontsLoaded || !!fontError;

  useEffect(() => {
    const t = setTimeout(() => setGateTimedOut(true), FONT_GATE_MS);
    return () => clearTimeout(t);
  }, []);

  // Hide the native splash as soon as fonts settle OR the gate times out — whichever comes first.
  // The root layout is the SOLE splash-hider on the normal path (Index mounts behind the font-gate
  // overlay; it only calls hideAsync itself as part of its bailout failsafe, after navigating).
  useEffect(() => {
    if (fontsSettled || gateTimedOut) {
      markBoot(gateTimedOut && !fontsSettled ? 'layout:font-gate-timeout' : 'layout:fonts-settled');
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsSettled, gateTimedOut]);

  const gateOpen = fontsSettled || gateTimedOut;

  return (
    <SafeAreaProvider>
      <StoreProvider>
        <AuthProvider>
          <ToastProvider>
            {/*
              Crash isolation. The root boundary protects the whole application tree (the Stack and
              every screen). The non-visual startup components each get their own `silent` boundary,
              so an exception in AccountSync / SyncProvider / ReminderSync / MilestoneWatcher is
              logged and swallowed instead of taking the app down — previously those components sat
              ABOVE the only ErrorBoundary, so a crash in one of them bypassed it entirely. The
              boundary component itself (components/ui/ErrorBoundary) is a leaf module — react +
              react-native only — so it can never arrive uninitialized.
            */}
            <ErrorBoundary scope="Hallyu">
              <StatusBar style="light" backgroundColor={colors.canvas} />
              <ErrorBoundary scope="AccountSync" silent>
                <AccountSync />
              </ErrorBoundary>
              <ErrorBoundary scope="SyncProvider" silent>
                <SyncProvider />
              </ErrorBoundary>
              <ErrorBoundary scope="ReminderSync" silent>
                <ReminderSync />
              </ErrorBoundary>
              <ErrorBoundary scope="MilestoneWatcher" silent>
                <MilestoneWatcher />
              </ErrorBoundary>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.canvas },
                  animation: 'slide_from_right',
                  animationDuration: 260,
                }}
              >
                <Stack.Screen name="index" options={{ animation: 'fade' }} />
                <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
                <Stack.Screen name="(onboarding)" options={{ animation: 'fade' }} />
                <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
                <Stack.Screen
                  name="create/[type]"
                  options={{
                    presentation: 'modal',
                    animation: 'slide_from_bottom',
                  }}
                />
                <Stack.Screen
                  name="shorts"
                  options={{
                    presentation: 'fullScreenModal',
                    animation: 'fade',
                  }}
                />
                <Stack.Screen
                  name="media"
                  options={{
                    presentation: 'transparentModal',
                    animation: 'fade',
                  }}
                />
                <Stack.Screen
                  name="report"
                  options={{
                    presentation: 'modal',
                    animation: 'slide_from_bottom',
                  }}
                />
                <Stack.Screen
                  name="collection/new"
                  options={{
                    presentation: 'modal',
                    animation: 'slide_from_bottom',
                  }}
                />
                <Stack.Screen
                  name="collection/add"
                  options={{
                    presentation: 'modal',
                    animation: 'slide_from_bottom',
                  }}
                />
                <Stack.Screen
                  name="settings"
                  options={{
                    presentation: 'card',
                    animation: 'slide_from_right',
                  }}
                />
              </Stack>
              {/* Font gate overlay: covers the tree until fonts settle or the 1.2s ceiling fires.
                  The navigator above is ALWAYS mounted (see FONT_GATE_MS note) so expo-router's
                  first-render contract holds and redirects can never race container readiness. */}
              {!gateOpen ? <View pointerEvents="none" style={styles.fontGate} /> : null}
            </ErrorBoundary>
          </ToastProvider>
        </AuthProvider>
      </StoreProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fontGate: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.canvas },
});

/**
 * Account sync coordinator:
 * Watches the auth identity and keeps the local store in lockstep.
 */
function AccountSync() {
  const auth = useAuth();
  const { state, dispatch, reset } = useStore();
  const router = useRouter();
  const segments = useSegments();
  const inFlight = useRef<string | null>(null);
  const applied = useRef<string | null>(null);
  const gen = useRef(0);
  const navReady = useRootNavigationState()?.key != null;

  useEffect(() => {
    if (!state.hydrated) return;

    if (auth.status !== 'signedIn' || !auth.user) {
      gen.current++;
      inFlight.current = null;
      applied.current = null;
      if ((auth.status === 'guest' || auth.status === 'signedOut') && state.profile.id !== GUEST_ID) {
        const device = { reduceMotion: state.prefs.reduceMotion, trueBlack: state.prefs.trueBlack };
        setDownloadScope(null);
        reset(guestState());
        dispatch({ type: 'prefs', patch: device });
      }
      return;
    }

    const u = auth.user;
    if (applied.current === u.id && state.profile.id === u.id) return;
    if (inFlight.current === u.id) return;

    inFlight.current = u.id;
    const myGen = ++gen.current;
    const stale = () => myGen !== gen.current || auth.user?.id !== u.id || auth.status !== 'signedIn';
    setDownloadScope(u.id);
    const device = { reduceMotion: state.prefs.reduceMotion, trueBlack: state.prefs.trueBlack };
    const key = `hallyu.account.${u.id}`;

    void (async () => {
      try {
        const seen = await AsyncStorage.getItem(key);
        if (stale()) return;
        if (!seen) AsyncStorage.setItem(key, '1').catch((e) => reportError('AccountSync.markSeen', e));
        reset(
          freshMemberState({
            id: u.id,
            handle: u.handle,
            displayName: u.displayName,
            avatarUrl: u.avatarUrl,
            favoriteGenres: [],
            favoriteDramaIds: [],
            followers: 0,
            following: 0,
            joinedAt: new Date().toISOString(),
          }),
        );
        dispatch({ type: 'prefs', patch: device });
        
        // Pull account snapshot and feeds from Firebase first
        await firebaseBackend.pull('me').catch(() => {});
        if (stale()) return;
        await firebaseBackend.pull('home').catch(() => {});
        if (stale()) return;
        applied.current = u.id;
      } catch (e) {
        reportError('AccountSync.sync', e, { account: u.id });
      } finally {
        if (myGen === gen.current) inFlight.current = null;
      }
    })();
  }, [auth.status, auth.user, state.hydrated, state.profile.id, reset, state.prefs.reduceMotion, state.prefs.trueBlack, dispatch]);

  useEffect(() => {
    if (!navReady) return;
    if (auth.recoveryPending && segments[1] !== 'reset-password') router.push('/(auth)/reset-password');
  }, [navReady, auth.recoveryPending, segments, router]);

  return null;
}

function ReminderSync() {
  const hydrated = useSlice((s) => s.hydrated);
  const router = useRouter();
  const navReady = useRootNavigationState()?.key != null;
  const navReadyRef = useRef(navReady);
  navReadyRef.current = navReady;

  useEffect(() => {
    if (!hydrated || !remindersSupported) return;
    installNotificationHandler();
    void syncEpisodeReminders();
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const url = reminderUrl(res);
      if (url && navReadyRef.current) router.push(url as any);
    });
    return () => sub.remove();
  }, [hydrated, router]);

  useEffect(() => {
    if (!hydrated || !remindersSupported) return;
    const sub = RNAppState.addEventListener('change', (next) => {
      if (next === 'active') void syncEpisodeReminders();
    });
    return () => sub.remove();
  }, [hydrated]);

  return null;
}
