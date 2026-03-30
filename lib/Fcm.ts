// lib/fcm.ts
// ✅ TOTALMENTE CORREGIDO - Foreground + Background funcionando

import { getToken, onMessage } from 'firebase/messaging';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db, getMessagingInstance } from './firebase';
import { createNotificationFirestore } from './firestore-service';
import { initNativePush, isNativeApp, listenNativeForegroundMessages } from './native-push';

const VAPID_KEY = 'BNHHCBSImDEQpVXInt-KPHtnIM3OaCJUr5Ot7656GG3sEevUuDTA2-GLkV-wb2KWLtJ0CoJZJkx0duO0KRWSFHw';
export const IN_APP_NOTIFICATION_EVENT = 'caontrol360:in-app-notification';

export interface InAppNotificationPayload {
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  url: string;
}

let foregroundUnsubscribe: (() => void) | null = null;
const foregroundCallbacks = new Set<() => void>();

// ─── INICIALIZAR FCM ───────────────────────────────────────────────────────
export async function initFCM(userId: string): Promise<string | null> {
  try {
    if (isNativeApp()) {
      console.log('[FCM] 📱 Inicializando push nativo (Capacitor)');
      return await initNativePush(userId);
    }

    // 1️⃣ Pedir permiso
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('[FCM] ❌ Permiso denegado');
      return null;
    }
    console.log('[FCM] ✅ Permiso otorgado');

    // 2️⃣ Registrar Service Worker
    console.log('[FCM] 🔧 Registrando Service Worker...');
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    await registration.update();
    console.log('[FCM] ✅ Service Worker registrado y actualizado');

    // 3️⃣ Obtener instancia de messaging
    const messaging = await getMessagingInstance();
    if (!messaging) {
      console.warn('[FCM] ❌ Messaging no disponible en este navegador');
      return null;
    }

    // 4️⃣ Obtener token FCM
    console.log('[FCM] 🔑 Obteniendo token FCM...');
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (!token) {
      console.warn('[FCM] ❌ No se pudo obtener token');
      return null;
    }

    // 5️⃣ Guardar token en Firestore
    console.log('[FCM] 💾 Guardando token en Firestore...');
    await setDoc(
      doc(db, 'users', userId),
      {
        fcmToken: token,
        fcmTokenUpdatedAt: serverTimestamp(),
        fcmTokenUpdatedAtString: new Date().toISOString(),
        lastFCMRefresh: Date.now(),
      },
      { merge: true }
    );
    console.log('[FCM] ✅ Token guardado');

    // 6️⃣ Escuchar mensajes en FOREGROUND
    console.log('[FCM] 👂 Configurando listener de foreground...');
    listenForegroundMessages(userId);

    // 7️⃣ Escuchar mensajes POST del Service Worker
    console.log('[FCM] 📨 Configurando listener de postMessage...');
    listenServiceWorkerMessages();

    // 8️⃣ Refresh automático cada 24h
    scheduleTokenRefresh(userId);

    console.log('[FCM] 🎉 ¡FCM completamente inicializado!');
    return token;

  } catch (error) {
    console.error('[FCM] ❌ Error en inicialización:', error);
    return null;
  }
}

// ─── ESCUCHAR MENSAJES EN FOREGROUND ────────────────────────────────────────
export async function listenForegroundMessages(userId: string, onNotification?: () => void) {
  try {
    if (isNativeApp()) {
      return await listenNativeForegroundMessages(userId, onNotification);
    }

    if (onNotification) {
      foregroundCallbacks.add(onNotification);
    }

    if (foregroundUnsubscribe) {
      return () => {
        if (onNotification) foregroundCallbacks.delete(onNotification);
      };
    }

    const messaging = await getMessagingInstance();
    if (!messaging) {
      console.warn('[FCM] ❌ Messaging no disponible');
      return;
    }

    foregroundUnsubscribe = onMessage(messaging, async (payload) => {
      console.log('[FCM] 📩 Mensaje FOREGROUND recibido:', payload);

      // Extraer datos
      const title = payload.data?.title ?? payload.notification?.title ?? 'Nueva notificación';
      const message = payload.data?.message ?? payload.notification?.body ?? '';
      const type = (payload.data?.type as 'info' | 'success' | 'warning' | 'error') ?? 'info';
      const url = payload.data?.url ?? '/';

      console.log('[FCM] 📢 Mostrando notificación:', title);

      // Mostrar banner in-app dentro de la PWA
      if (typeof window !== 'undefined') {
        const detail: InAppNotificationPayload = { title, message, type, url };
        window.dispatchEvent(new CustomEvent(IN_APP_NOTIFICATION_EVENT, { detail }));
      }

      // Mostrar notificación del SO
      if (Notification.permission === 'granted') {
        const notification = new Notification(title, {
          body: message,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: `notif-${Date.now()}`, // ✅ Tag único
          requireInteraction: type === 'error' || type === 'warning',
        });

        // Clic en notificación
        notification.onclick = () => {
          console.log('[FCM] 🖱️  Clic en notificación → ' + url);
          window.location.href = url;
          notification.close();
        };

        console.log('[FCM] ✅ Notificación mostrada al usuario');
      }

      // Guardar en Firestore (no es crítico si falla)
      try {
        await createNotificationFirestore({
          userId,
          title,
          message,
          type,
        });
        console.log('[FCM] ✅ Guardada en Firestore');
      } catch (err) {
        console.error('[FCM] ⚠️  Error guardando en Firestore (pero notificación sí se mostró):', err);
      }

      foregroundCallbacks.forEach((cb) => cb());
    });

    console.log('[FCM] ✅ Listener de foreground configurado');
    return () => {
      if (onNotification) foregroundCallbacks.delete(onNotification);
    };

  } catch (error) {
    console.error('[FCM] ❌ Error en foreground listener:', error);
  }
}

// ─── ESCUCHAR POSTMESSAGE DEL SERVICE WORKER ────────────────────────────────
function listenServiceWorkerMessages() {
  if (!('serviceWorker' in navigator)) {
    console.warn('[FCM] ❌ Service Worker no disponible');
    return;
  }

  const handleMessage = (event: MessageEvent) => {
    console.log('[FCM] 📨 Mensaje recibido del SW:', event.data);

    if (event.data?.type === 'NAVIGATE') {
      const url = event.data.url;
      console.log('[FCM] 🚀 Navegando a:', url);
      window.location.href = url;
    }
  };

  navigator.serviceWorker.addEventListener('message', handleMessage);
  console.log('[FCM] ✅ Listener de postMessage configurado');
}

// ─── REFRESH AUTOMÁTICO CADA 24H ────────────────────────────────────────────
function scheduleTokenRefresh(userId: string) {
  const REFRESH_INTERVAL = 24 * 60 * 60 * 1000; // 24 horas

  console.log('[FCM] ⏰ Programando refresh automático en 24h...');

  const interval = setInterval(async () => {
    try {
      console.log('[FCM] 🔄 Refrescando token...');
      const newToken = await initFCM(userId);

      if (newToken) {
        console.log('[FCM] ✅ Token refrescado exitosamente');
      } else {
        console.warn('[FCM] ⚠️  No se pudo refrescar token');
      }
    } catch (err) {
      console.error('[FCM] ❌ Error refrescando token:', err);
    }
  }, REFRESH_INTERVAL);

  return () => clearInterval(interval);
}

// ─── VERIFICAR ESTADO DE FCM ───────────────────────────────────────────────
export async function checkFCMStatus(userId: string): Promise<{
  hasPermission: boolean;
  hasSW: boolean;
  hasToken: boolean;
  tokenValid: boolean;
}> {
  const hasPermission = Notification.permission === 'granted';

  const hasSW =
    'serviceWorker' in navigator &&
    (await navigator.serviceWorker.getRegistrations()).length > 0;

  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);

  const hasToken = !!userSnap.data()?.fcmToken;
  const tokenValid = hasToken && userSnap.data()?.fcmToken !== '';

  const status = {
    hasPermission,
    hasSW,
    hasToken,
    tokenValid,
  };

  console.log('[FCM] 📊 Status:', status);
  return status;
}

// ─── FORZAR REFRESH DE TOKEN ────────────────────────────────────────────────
export async function forceRefreshFCMToken(userId: string) {
  console.log('[FCM] 🔄 Forzando refresh manual...');

  await setDoc(
    doc(db, 'users', userId),
    { fcmToken: '' },
    { merge: true }
  );

  return await initFCM(userId);
}