/**
 * Push notifications (native only):
 * - asks for permission and registers the Expo push token with our API,
 * - configures foreground notification display and the Android channel.
 * Everything degrades silently on web or when permissions are denied.
 */
import { Platform } from 'react-native';

import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
// AndroidImportance is not re-exported from the package root in SDK 58.
import { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';

import { api } from '@/lib/api-client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/* One registration per app run is enough; every screen calls this. */
let registering = false;
let registered = false;

export async function registerPushToken(): Promise<void> {
  if (Platform.OS === 'web') return;
  if (!Device.isDevice) return; // Expo push needs a physical device/emulator
  if (registering || registered) return;
  registering = true;

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? undefined;
    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return;

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (!token || !token.startsWith('ExponentPushToken')) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Bin updates',
        importance: AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    await api('/api/push/register', {
      method: 'POST',
      json: { token, platform: Platform.OS },
    });
    registered = true;
  } catch {
    // push registration is best-effort; the app fully works without it
  } finally {
    registering = false;
  }
}
