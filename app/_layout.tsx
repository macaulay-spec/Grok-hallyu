import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef } from 'react';
import { AppState as RNAppState, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { ToastProvider } from '../components/ui/Toast';
import { colors } from '../constants/theme';
import { AuthProvider, useAuth } from '../lib/auth';
import { catalog } from '../lib/catalog';
import { syncSeedCatalog } from '../lib/catalogSync';
import { SyncProvider } from '../lib/data/sync';
import { useNetwork } from '../lib/hooks';
import { installNotificationHandler, reminderUrl, remindersSupported, syncEpisodeReminders } from '../lib/reminders';
import { demoState, freshMemberState, getState, GUEST_ID, guestState, StoreProvider, useHallyu, useSlice, useStore } from '../lib/store';
import { ME } from '../lib/selectors';

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

  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;

  return (
    <SafeAreaProvider>
      <StoreProvider>
        <AuthProvider>
          <ToastProvider>
            <StatusBar style="light" backgroundColor={colors.canvas} />
            <AccountSync />
            <CatalogSync />
            <SyncProvider />
            <ReminderSync />
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
 *  - a brand-new account gets a fresh (empty) member state and goes through onboarding
 *  - the demo account keeps the rich seeded state
 *  - password-recovery deep links jump to the reset screen
 */
function AccountSync() {
  const auth = useAuth();
  const { state, reset, dispatch } = useStore();
  const router = useRouter();
  const segments = useSegments();
  const applied = useRef<string | null>(null);

  // Guests and signed-out visitors see the public world without the demo member's personal layer.
  useEffect(() => {
    if (!state.hydrated) return;
    if ((auth.status === 'guest' || auth.status === 'signedOut') && state.profile.id !== GUEST_ID) reset(guestState());
    if (auth.status === 'signedIn' && auth.user?.provider === 'demo' && state.profile.id !== ME) reset(demoState());
  }, [auth.status, auth.user?.provider, state.hydrated, state.profile.id, reset]);

  useEffect(() => {
    if (!state.hydrated || auth.status !== 'signedIn' || !auth.user) return;
    const u = auth.user;
    if (applied.current === u.id) return;
    applied.current = u.id;
    if (u.provider === 'demo') return;
    const key = `hallyu.account.${u.id}`;
    AsyncStorage.getItem(key).then((seen) => {
      if (!seen) {
        AsyncStorage.setItem(key, '1').catch(() => {});
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
      } else if (state.profile.id !== u.id) {
        dispatch({
          type: 'profile',
          patch: {
            id: u.id,
            handle: u.handle,
            displayName: u.displayName,
            avatarUrl: u.avatarUrl,
          },
        });
      }
    });
  }, [auth.status, auth.user, state.hydrated, state.profile.id, reset, dispatch]);

  useEffect(() => {
    if (auth.recoveryPending && segments[1] !== 'reset-password') router.push('/(auth)/reset-password');
  }, [auth.recoveryPending, segments, router]);

  return null;
}

/** Once hydrated and online, attach real catalog art and ids to the seeded titles (no-op without a catalog key). */
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
      timer = setTimeout(() => void syncEpisodeReminders(getState()), delay);
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
      .catch(() => {});
    return () => {
      clearTimeout(timer);
      unsub();
      fg.remove();
      tapped.remove();
    };
  }, [hydrated, router]);
  return null;
}

function CatalogSync() {
  const hydrated = useSlice((s) => s.hydrated);
  const online = useNetwork();
  useEffect(() => {
    if (!hydrated || !catalog.available) return;
    // Don't gate on `online`: the request itself is the cheapest connectivity test, and a false
    // "offline" from the OS/browser must never leave the app on placeholder art. A flip back to
    // online (or the app returning to the foreground) simply schedules another pass.
    const ctrl = new AbortController();
    const kick = () => syncSeedCatalog(ctrl.signal).catch(() => {});
    const t = setTimeout(kick, online ? 300 : 4000);
    const sub = RNAppState.addEventListener('change', (st) => st === 'active' && kick());
    return () => {
      clearTimeout(t);
      sub.remove();
      ctrl.abort();
    };
  }, [hydrated, online]);
  return null;
}
