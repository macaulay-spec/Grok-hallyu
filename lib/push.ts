import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { reportError } from './analytics';
import { useAuth } from './auth';
import { supabase } from './supabase';
import { GUEST_ID, getState, useStore } from './store';

/**
 * Remote push (comments, replies, reactions, follows) — the client half of the pipeline:
 *
 *   DB trigger (notifications insert) → pg_net webhook → `push-notify` edge function
 *   → Expo Push API → this device → tap routes deep into the app.
 *
 * The device registers its Expo push token the moment a real (non-guest) identity exists in the
 * store, removes it on sign-out, and taps route by the ids the edge function attached. Registering
 * never blocks or crashes the app: unsupported builds (web), denied permission, and standalone
 * APKs without Expo push credentials all degrade quietly.
 */

const TOKEN_KEY = 'hallyu.push.token.v1';

interface PushData {
  postId?: string | null;
  dramaId?: string | null;
  collectionId?: string | null;
}

/** Deep-link target for a tapped notification, matching the app's real routes. */
function routeFor(data: PushData | undefined): string | undefined {
  if (data?.postId) return `/post/${data.postId}`;
  if (data?.dramaId) return `/drama/${data.dramaId}`;
  if (data?.collectionId) return `/collection/${data.collectionId}`;
  return undefined;
}

/** Ask, register, and store this device's push token for the signed-in member. */
export async function registerPush(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    const cur = await Notifications.getPermissionsAsync();
    const granted = cur.granted || (cur.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
    if (!granted) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Community',
        description: 'Comments, replies, reactions and follows.',
        importance: Notifications.AndroidImportance.DEFAULT,
        lightColor: '#E11D48',
      });
    }

    // Expo Go resolves a token without a projectId; standalone builds need Expo push
    // credentials (FCM/APNs) — without them this throws and push simply stays off.
    const { data: token } = await Notifications.getExpoPushTokenAsync();
    if (!token) return;

    const prev = await SecureStore.getItemAsync(TOKEN_KEY);
    if (prev === token) return;
    const me = getState().profile.id;
    const { error } = await supabase.from('push_tokens').upsert({ user_id: me, token, platform: Platform.OS }, { onConflict: 'token' });
    if (error) throw error;
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch (e) {
    reportError('push.register', e);
  }
}

/** Remove this device's token (sign-out / guest switch) so the server stops targeting it. */
export async function unregisterPush(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!token) return;
    await supabase.from('push_tokens').delete().eq('token', token);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch (e) {
    reportError('push.unregister', e);
  }
}

const isRealMember = (id: string | undefined): boolean =>
  !!id && id !== GUEST_ID && id !== 'demo-member';

/**
 * Non-visual startup component: registers push for real members, unregisters on sign-out/guest,
 * and routes notification taps. Mounted inside the providers with its own silent ErrorBoundary.
 */
export function PushSync(): null {
  const router = useRouter();
  const auth = useAuth();
  const { state } = useStore();

  // Tap → deep link. Fires for cold-start opens too (listener is attached before hydration).
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const url = routeFor(res.notification.request.content.data as PushData);
      if (url) router.push(url);
    });
    return () => sub.remove();
  }, [router]);

  // Identity-driven registration: the store id is the source of truth (AccountSync applies it).
  useEffect(() => {
    if (!state.hydrated) return;
    if (isRealMember(state.profile.id) && auth.status === 'signedIn') void registerPush();
    else void unregisterPush();
  }, [state.hydrated, state.profile.id, auth.status]);

  return null;
}
