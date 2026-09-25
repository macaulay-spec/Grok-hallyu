// Must be the first import in the app: the global error trap has to be in place before any
// other module can evaluate, so a release-mode JS exception can never silently kill the process
// ("opens then instantly exits"). See lib/crash.ts.
import '../lib/crash';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { AppState as RNAppState, View } from 'react-native';
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
import { supabaseBackend } from '../lib/data/supabaseBackend';
import { installNotificationHandler, reminderUrl, remindersSupported, syncEpisodeReminders } from '../lib/reminders';
import { setDownloadScope } from '../lib/media';
import { freshMemberState, getState, GUEST_ID, guestState, StoreProvider, useHallyu, useSlice, useStore } from '../lib/store';

SplashScreen.preventAutoHideAsync().catch(() => {});

export const unstable_settings = { initialRouteName: 'index' };

/**
 * Hard ceiling on the font gate. Fonts normally resolve in well under a second from the APK's
 * bundled assets, but a wedged font load must never hold the whole tree hostage behind an empty
 * View (that is the release-only "splash forever" symptom: Index — the only splash-hider — never
 * mounts). After this timeout we proceed on system fonts and drop the native splash ourselves.
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
  // Index keeps its own hideAsync call as a safety net, but we no longer depend on Index mounting.
  useEffect(() => {
    if (fontsSettled || gateTimedOut) {
      markBoot(gateTimedOut && !fontsSettled ? 'layout:font-gate-timeout' : 'layout:fonts-settled');
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsSettled, gateTimedOut]);

  if (!fontsSettled && !gateTimedOut) return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;

  return (
    <SafeAreaProvider>
      <StoreProvider>
        <AuthProvider>
          <ToastProvider>
            {/*
              Crash isolation. The root boundary sits high enough to protect the whole application
              tree (the Stack and every screen). The non-visual startup components each get their own
              `silent` boundary, so an exception in AccountSync / SyncProvider / ReminderSync /
              MilestoneWatcher is logged and swallowed instead of taking the app down — previously
              those components sat ABOVE the only ErrorBoundary, so a crash in one of them bypassed
              it entirely. Startup components also catch their own async failures (see reportError).
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
                  name="edit-profile"
                  options={{
                    presentation: 'modal',
                    animation: 'slide_from_bottom',
                  }}
                />
              </Stack>
            </ErrorBoundary>
          </ToastProvider>
        </AuthProvider>
      </StoreProvider>
    </SafeAreaProvider>
  );
}

/**
 * Keeps the local store in step with the signed-in account:
 *  - every account (new or returning) starts from a fresh member state, then pulls its real
 *    snapshot from the backend — there is no seeded/demo state in production
 *  - guests/signed-out visitors get the empty guest state; device-only prefs are carried over
 *  - password-recovery deep links jump to the reset screen
 */
function AccountSync() {
  const auth = useAuth();
  const { state, reset, dispatch } = useStore();
  const router = useRouter();
  const segments = useSegments();
  // `applied` = the account whose sync has COMPLETED (not merely started). `inFlight` = the account
  // currently syncing (prevents re-entrancy while the first sync is still running). `gen` is bumped on
  // every identity change (sign-in, sign-out, account switch) so any in-flight continuation from a
  // previous account can detect it is stale and bail before touching the store.
  const applied = useRef<string | null>(null);
  const inFlight = useRef<string | null>(null);
  const gen = useRef(0);

  // Guests and signed-out visitors browse the public world with no personal layer. Device-only
  // prefs (reduceMotion / trueBlack) are the viewer's, not the account's — carry them over.
  useEffect(() => {
    if (!state.hydrated) return;

    // Any non-signed-in state invalidates pending account work: a late response from the previous
    // account must never be applied after a sign-out (or while the app is at the guest gate).
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
    // Already fully synced for this account and the store holds it.
    if (applied.current === u.id && state.profile.id === u.id) return;
    // A sync for this account is already running — don't start a second one.
    if (inFlight.current === u.id) return;

    inFlight.current = u.id;
    const myGen = ++gen.current;
    // A continuation is stale if a newer identity change happened, or the signed-in account is no
    // longer this one. Checked before every store write below.
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
        // Pull the real account snapshot (profile, graph, watchlist…) and the feeds. The backend
        // drops any response whose account changed mid-flight, and we re-check here between steps.
        await supabaseBackend.pull('me');
        if (stale()) return;
        await supabaseBackend.pull('home');
        if (stale()) return;
        applied.current = u.id; // mark COMPLETE only after the snapshot and feeds are in
      } catch (e) {
        // Expected async failures (offline, transient 5xx): log diagnostics, keep the app usable.
        reportError('AccountSync.sync', e, { account: u.id });
      } finally {
        if (myGen === gen.current) inFlight.current = null;
      }
    })();
  }, [auth.status, auth.user, state.hydrated, state.profile.id, reset, state.prefs.reduceMotion, state.prefs.trueBlack, dispatch]);

  useEffect(() => {
    if (auth.recoveryPending && segments[1] !== 'reset-password') router.push('/(auth)/reset-password');
  }, [auth.recoveryPending, segments, router]);

  return null;
}

/**
 * Keeps the OS notification queue in step with follows + per-drama alerts, and opens the episode
 * room when a reminder is tapped (warm or cold start).
 */
function ReminderSync() {
  const hydrated = useSlice((s) => s.hydrated);
  const router = useRouter();
  useEffect(() => {
    if (!hydrated || !remindersSupported) return;
    installNotificationHandler();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (delay = 1500) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        // Local notification scheduling must never crash the app if the OS rejects it.
        void syncEpisodeReminders(getState()).catch((e) => reportError('ReminderSync.schedule', e));
      }, delay);
    };
    schedule(2500);
    const unsub = useHallyu.subscribe((s, prev) => {
      if (s.follows.dramas !== prev.follows.dramas || s.dramaNotify !== prev.dramaNotify || s.prefs.notifications !== prev.prefs.notifications || s.importedDramas !== prev.importedDramas) schedule();
    });
    const fg = RNAppState.addEventListener('change', (st) => st === 'active' && schedule(800));
    const open = (url: string | undefined) => url && setTimeout(() => router.push(url as never), 400);
    const tapped = Notifications.addNotificationResponseReceivedListener((r) => open(reminderUrl(r)));
    Notifications.getLastNotificationResponseAsync()
      .then((r) => open(reminderUrl(r)))
      .catch((e) => reportError('ReminderSync.lastResponse', e));
    return () => {
      clearTimeout(timer);
      unsub();
      fg.remove();
      tapped.remove();
    };
  }, [hydrated, router]);
  return null;
}

