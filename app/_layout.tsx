import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { ToastProvider } from "../components/ui/Toast";
import { colors } from "../constants/theme";
import { AuthProvider, useAuth } from "../lib/auth";
import { catalog } from "../lib/catalog";
import { syncSeedCatalog } from "../lib/catalogSync";
import { SyncProvider } from "../lib/data/sync";
import { useNetwork } from "../lib/hooks";
import {
  demoState,
  freshMemberState,
  GUEST_ID,
  guestState,
  StoreProvider,
  useSlice,
  useStore,
} from "../lib/store";
import { ME } from "../lib/selectors";

SplashScreen.preventAutoHideAsync().catch(() => {});

export const unstable_settings = { initialRouteName: "index" };

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    "Pretendard-Regular": require("../assets/fonts/Pretendard-Regular.otf"),
    "Pretendard-Medium": require("../assets/fonts/Pretendard-Medium.otf"),
    "Pretendard-SemiBold": require("../assets/fonts/Pretendard-SemiBold.otf"),
    "Pretendard-Bold": require("../assets/fonts/Pretendard-Bold.otf"),
    "Pretendard-ExtraBold": require("../assets/fonts/Pretendard-ExtraBold.otf"),
  });

  if (!fontsLoaded && !fontError)
    return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;

  return (
    <SafeAreaProvider>
      <StoreProvider>
        <AuthProvider>
          <ToastProvider>
            <StatusBar style="light" backgroundColor={colors.canvas} />
            <AccountSync />
            <CatalogSync />
            <SyncProvider />
            <ErrorBoundary scope="Hallyu">
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.canvas },
                  animation: "slide_from_right",
                  animationDuration: 260,
                }}
              >
                <Stack.Screen name="index" options={{ animation: "fade" }} />
                <Stack.Screen name="(auth)" options={{ animation: "fade" }} />
                <Stack.Screen
                  name="(onboarding)"
                  options={{ animation: "fade" }}
                />
                <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
                <Stack.Screen
                  name="create/[type]"
                  options={{
                    presentation: "modal",
                    animation: "slide_from_bottom",
                  }}
                />
                <Stack.Screen
                  name="shorts"
                  options={{
                    presentation: "fullScreenModal",
                    animation: "fade",
                  }}
                />
                <Stack.Screen
                  name="media"
                  options={{
                    presentation: "transparentModal",
                    animation: "fade",
                  }}
                />
                <Stack.Screen
                  name="report"
                  options={{
                    presentation: "modal",
                    animation: "slide_from_bottom",
                  }}
                />
                <Stack.Screen
                  name="collection/new"
                  options={{
                    presentation: "modal",
                    animation: "slide_from_bottom",
                  }}
                />
                <Stack.Screen
                  name="edit-profile"
                  options={{
                    presentation: "modal",
                    animation: "slide_from_bottom",
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
    if (
      (auth.status === "guest" || auth.status === "signedOut") &&
      state.profile.id !== GUEST_ID
    )
      reset(guestState());
    if (
      auth.status === "signedIn" &&
      auth.user?.provider === "demo" &&
      state.profile.id !== ME
    )
      reset(demoState());
  }, [
    auth.status,
    auth.user?.provider,
    state.hydrated,
    state.profile.id,
    reset,
  ]);

  useEffect(() => {
    if (!state.hydrated || auth.status !== "signedIn" || !auth.user) return;
    const u = auth.user;
    if (applied.current === u.id) return;
    applied.current = u.id;
    if (u.provider === "demo") return;
    const key = `hallyu.account.${u.id}`;
    AsyncStorage.getItem(key).then((seen) => {
      if (!seen) {
        AsyncStorage.setItem(key, "1").catch(() => {});
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
          type: "profile",
          patch: {
            id: u.id,
            handle: u.handle,
            displayName: u.displayName,
            avatarUrl: u.avatarUrl,
          },
        });
      }
    });
  }, [
    auth.status,
    auth.user,
    state.hydrated,
    state.profile.id,
    reset,
    dispatch,
  ]);

  useEffect(() => {
    if (auth.recoveryPending && segments[1] !== "reset-password")
      router.push("/(auth)/reset-password");
  }, [auth.recoveryPending, segments, router]);

  return null;
}

/** Once hydrated and online, attach real catalog art and ids to the seeded titles (no-op without a catalog key). */
function CatalogSync() {
  const hydrated = useSlice((s) => s.hydrated);
  const online = useNetwork();
  useEffect(() => {
    if (!hydrated || !online || !catalog.available) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      syncSeedCatalog(ctrl.signal).catch(() => {});
    }, 1200); // let the first screen settle first
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [hydrated, online]);
  return null;
}
