/**
 * Server-side push registration: uploads the device's Expo push token via `register_push_token`
 * (migration 19) so episode alerts and notification fan-out can reach this device. Local
 * expo-notifications reminders stay in addition to this (§6.4) — they are complementary paths.
 *
 * Never prompts for permission: only registers when the member already granted notifications
 * (the local reminder flow is what asks), and every failure is a silent no-op — a missing push
 * token must never interrupt sign-in.
 */
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { reportError } from '../analytics';
import { supabase } from './client';

export async function registerDevicePushToken(): Promise<void> {
  if (!supabase || Platform.OS === 'web') return;
  try {
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) return;

    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    const push = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const token = push?.data;
    // The schema requires a non-trivial token (check constraint: length > 20).
    if (!token || token.length <= 20) return;

    const { error } = await supabase.rpc('register_push_token', {
      p_token: token,
      p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
      p_device_name: Constants.deviceName ?? undefined,
      p_app_version: Application.nativeApplicationVersion ?? undefined,
      p_locale: undefined,
    });
    if (error) reportError('pushToken.register', error);
  } catch (e) {
    reportError('pushToken.register', e);
  }
}
