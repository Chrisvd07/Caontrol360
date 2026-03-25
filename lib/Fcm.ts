// lib/fcm.ts
// Gestiona el token FCM del usuario y lo sincroniza con Firestore

import { getToken, onMessage } from 'firebase/messaging';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, getMessagingInstance } from './firebase';
import { createNotificationFirestore } from './firestore-service';

const VAPID_KEY = 'BNHHCBSImDEQpVXInt-KPHtnIM3OaCJUr5Ot7656GG3sEevUuDTA2-GLkV-wb2KWLtJ0CoJZJkx0duO0KRWSFHw';

// ─── Registra el service worker y obtiene el token FCM ──────────────────────
export async function initFCM(userId: string): Promise<string | null> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('[FCM] Permiso denegado');
      return null;
    }

    // Registrar SW y forzar actualización
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    await registration.update();

    const messaging = await getMessagingInstance();
    if (!messaging) {
      console.warn('[FCM] Messaging no disponible en este navegador');
      return null;
    }

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (!token) {
      console.warn('[FCM] No se pudo obtener el token');
      return null;
    }

    await setDoc(
      doc(db, 'users', userId),
      { fcmToken: token, fcmTokenUpdatedAt: serverTimestamp() },
      { merge: true }
    );

    console.log('[FCM] Token registrado:', token);
    return token;

  } catch (error) {
    console.error('[FCM] Error al inicializar:', error);
    return null;
  }
}

// ─── Escucha notificaciones mientras la app está en FOREGROUND ───────────────
export async function listenForegroundMessages(
  userId: string,
  onNotification?: (title: string, message: string) => void,
) {
  const messaging = await getMessagingInstance();
  if (!messaging) return;

  onMessage(messaging, async (payload) => {
    // ✅ Lee data primero — ahí es donde route.ts pone el título y mensaje reales
    const title   = payload.data?.title   ?? payload.notification?.title ?? 'Nueva notificación';
    const message = payload.data?.message ?? payload.notification?.body  ?? '';
    const type    = (payload.data?.type as 'info' | 'success' | 'warning' | 'error') ?? 'info';

    // Guardar en Firestore para que aparezca en el panel
    await createNotificationFirestore({ userId, title, message, type });

    // Mostrar notificación del sistema con los detalles reales
    if (Notification.permission === 'granted') {
      new Notification(title, {
        body:  message,
        icon:  '/favicon.ico',
        badge: '/favicon.ico',
      });
    }

    onNotification?.(title, message);
  });
}