'use client';

import { Capacitor } from '@capacitor/core';
import { PushNotifications, type Token, type ActionPerformed, type PushNotificationSchema } from '@capacitor/push-notifications';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { IN_APP_NOTIFICATION_EVENT, type InAppNotificationPayload } from './Fcm';
import { createNotificationFirestore } from './firestore-service';

const PUSH_CHANNEL_ID = 'caontrol360_alerts';
let nativeListenersReady = false;
const nativeCallbacks = new Set<() => void>();

function normalizePayload(notification: PushNotificationSchema): InAppNotificationPayload {
  const data = (notification.data ?? {}) as Record<string, string | undefined>;
  const type = (data.type as InAppNotificationPayload['type']) ?? 'info';
  return {
    title: notification.title ?? data.title ?? 'Nueva notificación',
    message: notification.body ?? data.message ?? '',
    type,
    url: data.url ?? '/',
  };
}

async function ensureAndroidChannel() {
  if (Capacitor.getPlatform() !== 'android') return;
  await PushNotifications.createChannel({
    id: PUSH_CHANNEL_ID,
    name: 'Caontrol360 Alertas',
    description: 'Canal principal de alertas y cambios de estado',
    importance: 5,
    visibility: 1,
    sound: 'control360',
    vibration: true,
    lights: true,
  });
}

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export async function initNativePush(userId: string): Promise<string | null> {
  if (!isNativeApp()) return null;

  if (!nativeListenersReady) {
    PushNotifications.addListener('registration', async (token: Token) => {
      await setDoc(
        doc(db, 'users', userId),
        {
          fcmToken: token.value,
          fcmTokenUpdatedAt: serverTimestamp(),
          fcmTokenUpdatedAtString: new Date().toISOString(),
          lastFCMRefresh: Date.now(),
        },
        { merge: true }
      );
    });

    PushNotifications.addListener('pushNotificationReceived', async (notification: PushNotificationSchema) => {
      const detail = normalizePayload(notification);
      window.dispatchEvent(new CustomEvent(IN_APP_NOTIFICATION_EVENT, { detail }));
      try {
        await createNotificationFirestore({
          userId,
          title: detail.title,
          message: detail.message,
          type: detail.type,
        });
      } catch (err) {
        console.error('[NativePush] Error guardando notificación:', err);
      }
      nativeCallbacks.forEach((cb) => cb());
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
      const data = (action.notification.data ?? {}) as Record<string, string | undefined>;
      if (data.url) window.location.href = data.url;
    });

    nativeListenersReady = true;
  }

  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') return null;

  await ensureAndroidChannel();
  await PushNotifications.register();
  return 'native-token-pending-registration-event';
}

export async function listenNativeForegroundMessages(userId: string, onNotification?: () => void) {
  if (!isNativeApp()) return;
  if (onNotification) nativeCallbacks.add(onNotification);
  await initNativePush(userId);
  return () => {
    if (onNotification) nativeCallbacks.delete(onNotification);
  };
}

export const NATIVE_PUSH_CHANNEL_ID = PUSH_CHANNEL_ID;
