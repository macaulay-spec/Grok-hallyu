import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef } from 'react';
import { AppState as RNAppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { MilestoneWatcher } from '../components/moments/MilestoneWatcher';
import { ToastProvider } from '../components/ui/Toast';
import { colors } from '../constants/theme';
import { reportError } from '../lib/analytics';
import { AuthProvider, useAuth } from '../lib/auth';
import { SyncProvider } from '../lib/data/sync';
import { firebaseBackend } from '../lib/data/firebaseBackend';
import { installNotificationHandler, reminderUrl, remindersSupported, syncEpisodeReminders } from '../lib/reminders';
import { setDownloadScope } from '../lib/media';
import { freshMemberState, getState, GUEST_ID, guestState, StoreProvider, useHallyu, useSlice, useStore } from '../lib/store';

SplashScreen.preventAutoHideAsync().catch(() => {});

export const unstable_settings = { initialRouteName: 'index' };

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'Pretendard-Regular': require('../assets/fonts/Pretendard-Regular.otf'),
    'Pretendard-Medium': require('../assets/fonts/Pretendard-Medium.otf'),
    'Pretendard-SemiBold': require('../assets/fonts/Pretendard-SemiBold.otf'),
    'Pretendard-Bold': require('../assets/fonts/Pretendard-Bold.otf'),
    'Pretendard-ExtraBold': require('../assets/fonts/Pretendard-ExtraBold.otf'),
  });

  // Fonts loading must never delay navigator mounting: the Stack mounts immediately
  // on first render. Native splash is dropped once fonts resolve or by Index on mount.
  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  return (
    <SafeAreaProvider>
      <StoreProvider>
        <AuthProvider>
          <ToastProvider>
            <StatusBar style="light" backgroundColor={colors.canvas} />

            <AccountSync />
            <SyncProvider />
            <ReminderSync />
            <MilestoneWatcher />

            <ErrorBoundary scope="Hallyu">
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
            </ErrorBoundary>
          </ToastProvider>
        </AuthProvider>
      </StoreProvider>
    </SafeAreaProvider>
  );
}

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
      const url = reminderUrl(res.notification);
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
